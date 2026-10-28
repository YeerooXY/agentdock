'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { execFile, execFileSync } = require('node:child_process');
const { TaskLoop, implementerLaunch, checkLaunch } = require('../electron/task-loop.cjs');
const { collectChanges } = require('../electron/delegation.cjs');

const codex = { id: 'codex:default', provider: 'codex', label: 'Codex', executable: '/fake/codex.exe' };
const claude = { id: 'claude:default', provider: 'claude', label: 'Claude Code', executable: '/fake/claude.exe' };
const kiro = { id: 'kiro:default', provider: 'kiro', label: 'Kiro', executable: '/fake/kiro-cli.exe' };
const approve = 'VERDICT: approve\nFINDINGS:\n- none';
const requested = 'VERDICT: changes-requested\nFINDINGS:\n- app.js:2 — high — wrong result — return 2';
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
function initRepo(repo) {
  fs.mkdirSync(repo, { recursive: true }); git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Task tests'); git(repo, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(repo, 'app.js'), 'const a = 1;\nconst b = 1;\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
}
function fixture(t, script = [], overrides = {}) {
  const temp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-tasks-'))), repo = path.join(temp, 'repo'), root = path.join(temp, 'data');
  initRepo(repo);
  const spawned = [], saved = [], calls = [], errors = [], repositories = [{ path: repo, label: 'Test repository' }];
  const spawnProcess = (executable, args, options) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.killed = false;
    child.kill = () => { child.killed = true; child.emit('close', null); };
    const invocation = { executable, args, options, child, prompt: '' }; spawned.push(invocation);
    child.stdin = { on() {}, end(text) {
      invocation.prompt = text;
      queueMicrotask(() => {
        const action = script.shift();
        if (!action || action.hold) return;
        try {
          action.inspect?.(invocation); action.edit?.(options.cwd);
          if (action.error) { child.emit('error', new Error('mock launch failure')); return; }
          if (action.stderr) child.stderr.emit('data', action.stderr);
          if (action.type === 'review') {
            if (executable === codex.executable) fs.writeFileSync(args[args.indexOf('-o') + 1], action.reply || approve);
            else child.stdout.emit('data', JSON.stringify({ type: 'result', result: action.reply || approve, usage: { input_tokens: 15, output_tokens: 7 }, is_error: !!action.providerError }) + '\n');
          } else if (action.type === 'implement') {
            if (executable === claude.executable) child.stdout.emit('data', JSON.stringify({ type: 'result', result: 'Updated app.js.', usage: { input_tokens: 10, output_tokens: 5 }, is_error: !!action.providerError }) + '\n');
            else child.stdout.emit('data', [JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Updated app.js.' } }), JSON.stringify({ type: action.providerError ? 'turn.failed' : 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 } })].join('\n') + '\n');
          } else if (action.output) child.stdout.emit('data', action.output);
          child.emit('close', action.code ?? 0);
        } catch (error) { errors.push(error); child.emit('error', error); }
      });
    } };
    return child;
  };
  const options = { candidates: () => [codex, claude, kiro], repositories: () => repositories, getLimits: () => [],
    environment: (id, provider) => ({ ACCOUNT_ID: id, PROVIDER_NAME: provider }), spawnProcess,
    run: (program, args, options, callback) => { calls.push(args); return execFile(program, args, options, callback); },
    saveResult: async raw => { saved.push(raw); return { id: 'report-1' }; }, killProcess: child => child.kill(), ...overrides };
  const loop = new TaskLoop(root, options);
  t.after(async () => { loop.interruptAll(); await Promise.all([...loop.pending.values(), ...loop.cancellations.values(), ...loop.refreshing.values()]); fs.rmSync(temp, { recursive: true, force: true }); });
  const start = extra => loop.start({ repo, title: 'Fix the result', criteria: 'b must be 2.', implementer: { accountId: codex.id, model: 'test-model' }, reviewer: { accountId: claude.id }, checks: 'user-check-command', ...extra });
  const done = async job => { await loop.pending.get(job.id); assert.deepEqual(errors, []); return loop.jobs.get(job.id); };
  return { loop, start, done, root, repo, temp, options, spawned, saved, calls, repositories, script };
}
const edit = cwd => fs.writeFileSync(path.join(cwd, 'app.js'), 'const a = 1;\nconst b = 2;\n');
async function until(check) {
  const deadline = Date.now() + 10000;
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), 'The mocked process did not start.');
}

test('one round passes only after checks and independent review; saves report and usage', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', output: 'All tests passed' }, { type: 'review' }]);
  const job = await f.done(await f.start());
  assert.equal(job.state, 'passed'); assert.equal(job.rounds.length, 1);
  assert.equal(job.rounds[0].check.exitCode, 0); assert.equal(job.rounds[0].review.verdict, 'approve');
  assert.deepEqual(job.rounds[0].implement.usage, { inputTokens: 100, outputTokens: 10, cachedInputTokens: 20 });
  assert.equal(job.rounds[0].review.usage.outputTokens, 7);
  assert.ok(job.rounds[0].implement.elapsedMs >= 0); assert.ok(job.rounds[0].elapsedMs >= 0);
  assert.match(f.spawned[0].prompt, /b must be 2/); assert.match(f.spawned[0].prompt, /Do not commit/);
  assert.ok(!f.spawned[0].prompt.includes('user-check-command'), 'only the user chooses the checks');
  assert.deepEqual(f.spawned[0].options.env, { ACCOUNT_ID: codex.id, PROVIDER_NAME: 'codex' });
  assert.match(f.spawned[2].prompt, /Acceptance criteria/); assert.match(f.spawned[2].prompt, /const b = 2/);
  assert.match(f.saved[0].text, /## Final diff/); assert.match(f.saved[0].text, /100 input, 10 output tokens/);
  assert.match(job.finalDiff, /\+const b = 2/); assert.equal(job.resultId, 'report-1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'))).state, 'passed');
  assert.equal((await f.loop.accept(job.id)).state, 'accepted');
});

test('failed checks are handed to the next round with a bounded output tail', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', code: 1, output: 'x'.repeat(10000) + '\nexpected 2, received 1' }, { type: 'review' },
    { type: 'implement', inspect: invocation => { assert.match(invocation.prompt, /expected 2, received 1/); assert.ok(invocation.prompt.length < 6000); } }, { type: 'check' }, { type: 'review' }]);
  const job = await f.done(await f.start());
  assert.equal(job.state, 'passed'); assert.equal(job.rounds.length, 2);
  assert.equal(job.rounds[0].check.state, 'failed'); assert.ok(job.rounds[0].check.output.length <= 8000);
});

test('confirmed review findings trigger a fix round', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', reply: requested },
    { type: 'implement', inspect: invocation => assert.match(invocation.prompt, /app\.js:2 — high — wrong result/) }, { type: 'review' }]);
  const job = await f.done(await f.start({ checks: '' }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds.length, 2);
  assert.equal(job.rounds[0].review.findings.length, 1); assert.equal(job.rounds[0].check.state, 'not-set');
});

test('max rounds leaves the unsuccessful solution as needs-you', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', code: 2, output: 'Still failing' }, { type: 'review', reply: requested }]);
  const job = await f.done(await f.start({ maxRounds: 1 }));
  assert.equal(job.state, 'needs-you'); assert.equal(job.rounds.length, 1);
  assert.match(job.unresolved.join('\n'), /Checks failed/); assert.match(job.unresolved.join('\n'), /wrong result/);
  assert.equal((await f.loop.accept(job.id)).state, 'accepted');
});

test('provider errors are failed, including errors with exit code zero', async t => {
  for (const code of [0, 1]) {
    const f = fixture(t, [{ type: 'implement', providerError: true, code, stderr: 'Please sign in' }]);
    const job = await f.done(await f.start());
    assert.equal(job.state, 'failed'); assert.match(job.error, /Sign in to Codex/);
    assert.equal(f.spawned.length, 1); assert.equal(job.rounds[0].check, null);
  }
});

test('stop kills the child and keeps edits and the branch', async t => {
  const f = fixture(t, [{ hold: true }]);
  const head = git(f.repo, 'rev-parse', 'HEAD'), branch = git(f.repo, 'branch', '--show-current');
  const started = await f.start();
  await until(() => f.spawned.length > 0);
  edit(f.repo); await f.loop.stop(started.id); const job = await f.done(started);
  assert.equal(job.state, 'stopped'); assert.equal(f.spawned[0].child.killed, true);
  assert.match(fs.readFileSync(path.join(f.repo, 'app.js'), 'utf8'), /b = 2/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head); assert.equal(git(f.repo, 'branch', '--show-current'), branch);
});

test('restart interrupts every active step and never spawns a provider', async t => {
  const f = fixture(t);
  for (const state of ['implementing', 'checking', 'reviewing']) {
    const id = `restart-${state}`;
    fs.writeFileSync(path.join(f.root, 'tasks', `${id}.json`), JSON.stringify({ id, state, title: 'Interrupted task', repo: f.repo, workFolder: f.repo, baseline: git(f.repo, 'rev-parse', 'HEAD').trim(), baselineUntracked: [], rounds: [{ number: 1, startedAt: 1, implement: { state: 'running', startedAt: 1 } }], startedAt: 1, unresolved: [] }));
  }
  const restored = new TaskLoop(f.root, { ...f.options, saveResult: null });
  assert.equal(restored.snapshot().length, 3);
  for (const job of restored.snapshot()) { assert.equal(job.state, 'interrupted'); assert.equal(job.rounds[0].implement.state, 'interrupted'); }
  await Promise.all([...restored.pending.values()]);
  assert.equal(f.spawned.length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', 'restart-checking.json'))).state, 'interrupted');
});

test('current workflow excludes pre-existing tracked, staged and untracked work', async t => {
  const f = fixture(t, [{ type: 'implement', edit: cwd => {
    fs.writeFileSync(path.join(cwd, 'app.js'), 'const a = 8;\nconst b = 2;\n');
    fs.writeFileSync(path.join(cwd, 'existing.js'), 'modified existing untracked file\n');
    fs.writeFileSync(path.join(cwd, 'new.js'), 'task created this\n');
  } }, { type: 'review', inspect: invocation => { assert.match(invocation.prompt, /Previously untracked file modified: existing\.js/); assert.match(invocation.prompt, /new\.js/); } }]);
  fs.writeFileSync(path.join(f.repo, 'app.js'), 'const a = 7;\nconst b = 1;\n'); git(f.repo, 'add', 'app.js');
  fs.writeFileSync(path.join(f.repo, 'app.js'), 'const a = 8;\nconst b = 1;\n');
  fs.writeFileSync(path.join(f.repo, 'existing.js'), 'user work\n');
  const index = git(f.repo, 'diff', '--cached'), head = git(f.repo, 'rev-parse', 'HEAD');
  const job = await f.done(await f.start({ checks: '' }));
  assert.equal(job.state, 'passed'); assert.notEqual(job.baseline, job.sourceRevision);
  assert.deepEqual(job.baselineUntracked, ['existing.js']);
  assert.match(job.finalDiff, /\+const b = 2/); assert.doesNotMatch(job.finalDiff, /\+const a = [78]/); assert.doesNotMatch(job.finalDiff, /user work/);
  assert.match(job.finalDiff, /Previously untracked file modified: existing\.js/); assert.match(job.diffStat, /existing\.js: previously untracked, modified/);
  assert.match(job.finalDiff, /task created this/); assert.equal(git(f.repo, 'diff', '--cached'), index); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.ok(!f.calls.some(args => args.includes('checkout') || args.includes('reset') || args.includes('commit')));
});

test('later edits to new files mark checks and review stale on snapshot refresh', async t => {
  const f = fixture(t, [{ type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'new.js'), 'first\n') }, { type: 'check' }, { type: 'review' }]);
  const job = await f.done(await f.start());
  fs.writeFileSync(path.join(f.repo, 'new.js'), 'second\n');
  f.loop.refreshedAt.clear(); f.loop.snapshot(); await f.loop.refresh(job.id);
  assert.equal(job.state, 'needs-you'); assert.equal(job.rounds[0].check.state, 'stale'); assert.equal(job.rounds[0].review.state, 'stale');
  assert.match(job.finalDiff, /second/); assert.match(job.unresolved.join('\n'), /stale/);
  fs.writeFileSync(path.join(f.repo, 'new.js'), 'third\n'); await f.loop.refresh(job.id);
  assert.match(job.finalDiff, /third/);
});

test('rejects identical accounts, invalid limits, and folders outside the picker', async t => {
  const f = fixture(t);
  await assert.rejects(f.start({ reviewer: { accountId: codex.id } }), /different from the implementer/);
  for (const maxRounds of [0, 6, 1.5, '3']) await assert.rejects(f.start({ maxRounds }), /1 to 5/);
  for (const timeLimitMinutes of [4, 121]) await assert.rejects(f.start({ timeLimitMinutes }), /5 to 120/);
  await assert.rejects(f.start({ repo: f.temp }), /project folder/);
  await assert.rejects(f.start({ implementer: { accountId: 'missing' } }), /signed-in/);
  assert.equal(f.spawned.length, 0);
});

test('one task per repository and two total, including concurrent starts', async t => {
  const f = fixture(t);
  const simultaneous = await Promise.allSettled([f.start({ reviewer: null }), f.start({ reviewer: null })]);
  assert.equal(simultaneous.filter(item => item.status === 'fulfilled').length, 1);
  assert.match(simultaneous.find(item => item.status === 'rejected').reason.message, /already running/);
  const secondRepo = path.join(f.temp, 'second'), thirdRepo = path.join(f.temp, 'third'); initRepo(secondRepo); initRepo(thirdRepo);
  f.repositories.push({ path: secondRepo, label: 'Second' }, { path: thirdRepo, label: 'Third' });
  await f.start({ repo: secondRepo });
  await assert.rejects(f.start({ repo: thirdRepo }), /Two tasks/);
});

test('worktrees and branches are created only on request and are kept after stop', async t => {
  const f = fixture(t, [{ type: 'implement', edit }]);
  const current = await f.done(await f.start({ reviewer: null, checks: '' }));
  assert.equal(current.workFolder, f.repo); assert.equal(current.baseline, current.sourceRevision);
  assert.ok(!f.calls.some(args => args.includes('worktree')));
  const branch = git(f.repo, 'branch', '--show-current');
  const started = await f.start({ workflow: 'worktree', reviewer: null, checks: '' });
  await until(() => f.spawned.length >= 2);
  assert.match(started.branch, /^paddock\/task-/); assert.equal(f.spawned[1].options.cwd, started.workFolder);
  assert.equal(git(f.repo, 'branch', '--show-current'), branch);
  const job = await f.loop.stop(started.id); await f.done(job);
  assert.ok(fs.existsSync(job.workFolder)); assert.ok(git(f.repo, 'branch', '--list', job.branch).includes(job.branch));
});

test('launches use bounded permissions and never put prompts in arguments', () => {
  const x = implementerLaunch('codex', codex.executable, { model: 'example', effort: 'high', platform: 'win32' });
  assert.ok(x.args.includes('workspace-write')); assert.ok(x.args.includes('windows.sandbox=unelevated')); assert.equal(x.args.at(-1), '-');
  assert.ok(x.args.includes('model_reasoning_effort="high"'));
  const c = implementerLaunch('claude', claude.executable).args;
  assert.ok(c.includes('acceptEdits')); assert.ok(c.includes('Read,Grep,Glob,Edit,Write')); assert.ok(c.includes('--strict-mcp-config'));
  assert.ok(!c.some(arg => /bypass|skip-permissions/.test(arg)));
  assert.ok(implementerLaunch('kiro', kiro.executable).args.includes('--trust-tools=fs_read,fs_write'));
  assert.ok(!checkLaunch('user checks', 'linux').args.includes('-NoExit'));
  assert.match(Buffer.from(checkLaunch('user checks', 'win32').args.at(-1), 'base64').toString('utf16le'), /LASTEXITCODE/);
});

test('reviewer suggestion excludes implementer and preserves unknown usage', async t => {
  const f = fixture(t);
  const choices = f.loop.choices(codex.id);
  assert.ok(!choices.reviewers.some(choice => choice.id === codex.id));
  assert.ok(choices.suggestion); assert.match(choices.why, /usage unknown/);
  assert.ok(!JSON.stringify(choices).includes('/fake/'));
});

test('review provider failures stop the loop as failed', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', code: 1, providerError: true }]);
  const job = await f.done(await f.start({ checks: '' }));
  assert.equal(job.state, 'failed'); assert.match(job.error, /Claude Code/); assert.equal(job.rounds.length, 1);
});

test('no-review mode and unreported usage remain explicit', async t => {
  const f = fixture(t, [{ output: 'Finished writing files.\n', edit }]);
  const job = await f.done(await f.start({ implementer: { accountId: kiro.id }, reviewer: null, checks: '' }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds[0].implement.usage, null);
  assert.equal(job.rounds[0].review.state, 'not-set'); assert.match(f.saved[0].text, /usage: not reported/);
});

test('a summary cannot approve a review, and contradictory findings block approval', async t => {
  for (const reply of ['Implementation done.', requested.replace('changes-requested', 'approve')]) {
    const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', reply }]);
    const job = await f.done(await f.start({ checks: '', maxRounds: 1 }));
    assert.equal(job.state, 'needs-you'); assert.notEqual(job.rounds[0].review.verdict, 'approve');
  }
});

test('edits during verification make successful checks stale', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', edit: cwd => fs.writeFileSync(path.join(cwd, 'app.js'), 'changed during checks\n') }, { type: 'review' }]);
  const job = await f.done(await f.start({ maxRounds: 1 }));
  assert.equal(job.state, 'needs-you'); assert.equal(job.rounds[0].check.state, 'stale'); assert.equal(job.rounds[0].check.outcome, 'passed');
});

test('a reached deadline prevents another round', async t => {
  let at = 1_800_000_000_000;
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', code: 1, inspect: () => { at += 6 * 60_000; } }], { now: () => at });
  const job = await f.done(await f.start({ reviewer: null, timeLimitMinutes: 5 }));
  assert.equal(job.state, 'needs-you'); assert.match(job.error, /time limit/); assert.equal(job.rounds.length, 1); assert.equal(f.spawned.length, 2);
});

test('provider and check tails never persist raw credential values', async t => {
  const secret = 'sk-task-test-secret-value-123';
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check', code: 1, output: `failed API_KEY=${secret}` }]);
  const job = await f.done(await f.start({ reviewer: null, maxRounds: 1 }));
  const persisted = fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8');
  assert.ok(!persisted.includes(secret)); assert.ok(!f.saved[0].text.includes(secret)); assert.match(job.rounds[0].check.output, /redacted/);
});

test('reports update the existing markdown Result after acceptance', async t => {
  const { Results } = require('../electron/results.cjs');
  const f = fixture(t, [{ type: 'implement', edit }]);
  const results = new Results(f.root);
  f.loop.saveResult = raw => raw.resultId ? results.updateText(raw.resultId, raw) : results.add(raw);
  const job = await f.done(await f.start({ checks: '', reviewer: null })), id = job.resultId;
  await f.loop.accept(job.id);
  assert.equal(results.list().length, 1); assert.equal(job.resultId, id);
  assert.match(fs.readFileSync(results.path(id), 'utf8'), /Status: accepted/); assert.equal(results.list()[0].status, 'passed');
});

test('stopping a fix round preserves findings that have not been reviewed again', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', reply: requested }, { hold: true }]);
  const started = await f.start({ checks: '' });
  await until(() => f.spawned.length === 3);
  const job = await f.loop.stop(started.id); await f.done(job);
  assert.equal(job.state, 'stopped'); assert.match(job.unresolved.join('\n'), /wrong result/);
});

test('accepted, stopped, failed and recovered interrupted tasks freeze their artifacts', async t => {
  for (const state of ['accepted', 'stopped', 'failed', 'interrupted']) {
    const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }, { type: 'review', reply: state === 'accepted' ? approve : requested }, state === 'failed' ? { type: 'implement', code: 1 } : { hold: true }]);
    const started = await f.start(); let loop = f.loop, job;
    if (state === 'accepted') { job = await f.done(started); await loop.accept(job.id); }
    else {
      await until(() => f.spawned.length >= 4);
      if (state === 'stopped') await loop.stop(started.id);
      if (state === 'interrupted') loop.interruptAll();
      job = await f.done(started);
      if (state === 'interrupted') { loop = new TaskLoop(f.root, f.options); await Promise.all([...loop.pending.values()]); job = loop.jobs.get(job.id); }
    }
    assert.equal(job.state, state); assert.ok(job.fingerprint);
    const file = path.join(f.root, 'tasks', job.id + '.json'), saved = JSON.stringify(f.saved), persisted = fs.readFileSync(file, 'utf8'), diff = job.finalDiff, count = f.calls.length;
    fs.writeFileSync(path.join(f.repo, 'unrelated.js'), 'later work\n'); edit(f.repo);
    loop.refreshedAt.clear(); loop.snapshot(); await loop.refresh(); await loop.refresh(job.id); await Promise.all([...loop.refreshing.values()]);
    assert.equal(await loop.capture(job), false);
    assert.equal(f.calls.length, count, `${state} task ran Git during refresh`);
    assert.equal(job.finalDiff, diff); assert.equal(fs.readFileSync(file, 'utf8'), persisted); assert.equal(JSON.stringify(f.saved), saved);
    assert.deepEqual(loop.snapshot().find(item => item.id === job.id).log, []);
    if (loop !== f.loop) loop.interruptAll();
  }
});

test('automatic verification refresh is capped at two tasks per cycle', async t => {
  const f = fixture(t, [{ type: 'implement', edit }]);
  const job = await f.done(await f.start({ checks: '', reviewer: null }));
  for (let index = 0; index < 6; index++) f.loop.jobs.set(`copy-${index}`, { ...structuredClone(job), id: `copy-${index}` });
  f.loop.refreshedAt.clear();
  let release; const waiting = new Promise(resolve => { release = resolve; }), reads = [];
  f.loop.fingerprint = async item => { reads.push(item.id); await waiting; return item.fingerprint; };
  const first = f.loop.refresh(); f.loop.snapshot(); const concurrent = f.loop.refresh();
  assert.equal(reads.length, 2); release(); await Promise.all([first, concurrent]);
  assert.equal(reads.length, 2);
  await f.loop.refresh(); assert.equal(reads.length, 4);
});

test('modified and deleted baseline untracked files reach review, fix prompts and reports', async t => {
  const f = fixture(t, [{ type: 'implement', edit: cwd => {
    fs.writeFileSync(path.join(cwd, 'existing.js'), 'changed by task\n'); fs.unlinkSync(path.join(cwd, 'deleted.js'));
    fs.writeFileSync(path.join(cwd, '.env'), 'API_KEY=changed-private-value\n');
  } }, { type: 'review', reply: requested, inspect: invocation => {
    assert.match(invocation.prompt, /Previously untracked file modified: existing\.js/);
    assert.match(invocation.prompt, /Previously untracked file deleted: deleted\.js/);
    assert.doesNotMatch(invocation.prompt, /untouched\.js|changed-private-value/);
  } }, { type: 'implement', inspect: invocation => { assert.match(invocation.prompt, /existing\.js/); assert.match(invocation.prompt, /deleted\.js/); } }, { type: 'review' }]);
  for (const file of ['existing.js', 'deleted.js', 'untouched.js']) fs.writeFileSync(path.join(f.repo, file), 'pre-existing content\n');
  fs.writeFileSync(path.join(f.repo, '.env'), 'API_KEY=original-private-value\n');
  const job = await f.done(await f.start({ checks: '' }));
  assert.equal(job.state, 'passed'); assert.match(job.baselineUntrackedState['existing.js'].hash, /^[a-f0-9]{64}$/);
  assert.ok(!('hash' in job.baselineUntrackedState['.env'])); assert.ok(Number.isFinite(job.baselineUntrackedState['.env'].mtimeMs));
  assert.match(job.finalDiff, /Previously untracked file deleted: deleted\.js/); assert.match(job.finalDiff, /changed by task/);
  assert.match(job.diffStat, /existing\.js: previously untracked, modified/); assert.match(job.diffStat, /deleted\.js: previously untracked, deleted/);
  assert.doesNotMatch(job.finalDiff, /untouched\.js|original-private-value|changed-private-value/);
  assert.ok(!('baselineUntrackedState' in f.loop.snapshot()[0]));
});

test('unstructured review findings reach the fix round as a redacted tail', async t => {
  const reply = 'VERDICT: changes-requested\nFINDINGS:\n* app.js has a wrong result. API_KEY=do-not-persist\nUse 2.';
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', reply }, { type: 'implement', inspect: invocation => {
    assert.match(invocation.prompt, /app\.js has a wrong result/); assert.match(invocation.prompt, /Use 2/); assert.doesNotMatch(invocation.prompt, /do-not-persist/);
  } }, { type: 'review' }]);
  const job = await f.done(await f.start({ checks: '' }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds.length, 2); assert.match(job.rounds[0].review.findings[0], /wrong result/);
});

test('Git maxBuffer and missing-baseline errors require user review instead of provider failure', async t => {
  for (const kind of ['large', 'baseline']) {
    const f = fixture(t);
    f.loop.run = (program, args, options, callback) => {
      if ((kind === 'large' && args.includes('--name-only')) || (kind === 'baseline' && args.includes('--verify'))) {
        const error = new Error(kind === 'large' ? 'stdout maxBuffer length exceeded' : 'bad object'); error.code = kind === 'large' ? 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' : 128;
        queueMicrotask(() => callback(error, '')); return;
      }
      return f.options.run(program, args, options, callback);
    };
    const job = await f.done(await f.start());
    assert.equal(job.state, 'needs-you'); assert.match(job.error, kind === 'large' ? /too large/ : /baseline.*unavailable/); assert.equal(f.spawned.length, 0);
  }
});

test('fingerprint and capture filesystem errors also remain needs-you', async t => {
  for (const method of ['fingerprint', 'capture']) {
    const f = fixture(t, [{ type: 'implement', edit }]);
    f.loop[method] = async () => { throw new Error('file could not be read'); };
    const job = await f.done(await f.start({ checks: '', reviewer: null }));
    assert.equal(job.state, 'needs-you'); assert.match(job.unresolved.join('\n'), /repository changes could not be read/);
  }
});

test('verification expires before an unreferenced baseline can age out, without Git reads', async t => {
  let at = 1_800_000_000_000;
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }, { type: 'review' }], { now: () => at });
  fs.writeFileSync(path.join(f.repo, 'app.js'), 'pre-existing tracked edit\n');
  const job = await f.done(await f.start()), diff = job.finalDiff, count = f.calls.length;
  assert.notEqual(job.baseline, job.sourceRevision);
  at += 8 * 24 * 60 * 60_000; await f.loop.refresh(job.id);
  assert.equal(f.calls.length, count); assert.equal(job.state, 'needs-you'); assert.equal(job.verificationExpired, true); assert.match(job.error, /expired/);
  assert.equal(job.finalDiff, diff); const saved = f.saved.length;
  at += 40 * 24 * 60 * 60_000; await f.loop.refresh(job.id); assert.equal(f.saved.length, saved); assert.equal(f.calls.length, count);
  assert.ok(!f.calls.some(args => args.includes('update-ref')));
});

test('Windows checks encode quotes and Unicode and use process-only script execution policy', () => {
  const command = 'npm test -- --grep "a b" --title "árvíz"';
  const launch = checkLaunch(command, 'win32');
  assert.ok(launch.args.includes('-EncodedCommand')); assert.ok(!launch.args.includes('-Command'));
  const wrapper = Buffer.from(launch.args.at(-1), 'base64').toString('utf16le');
  assert.ok(wrapper.includes(command)); assert.match(wrapper, /\$paddockChecksOK = \$\?/); assert.match(wrapper, /exit \$LASTEXITCODE/);
  assert.equal(launch.args[launch.args.indexOf('-ExecutionPolicy') + 1], 'Bypass'); assert.doesNotMatch(wrapper, /Set-ExecutionPolicy/);
});

test('repository subfolders cannot silently widen the implementer write scope', async t => {
  const f = fixture(t), subfolder = path.join(f.repo, 'nested'); fs.mkdirSync(subfolder); f.repositories.push({ path: subfolder, label: 'Nested' });
  await assert.rejects(f.start({ repo: subfolder }), /Git repository root/);
  assert.equal(f.spawned.length, 0); assert.ok(!f.calls.some(args => args.includes('stash') || args.includes('worktree')));
});

test('model and provider-specific effort validation happens before launch', async t => {
  const f = fixture(t);
  for (const model of ['-help', '--model=x', 'x; env', 'x$(env)', 'x"y', 'x\ny', 'x y']) {
    await assert.rejects(f.start({ implementer: { accountId: codex.id, model } }), /model name/);
    await assert.rejects(f.start({ reviewer: { accountId: claude.id, model } }), /model name/);
  }
  for (const [accountId, effort] of [[codex.id, 'max'], [claude.id, 'high'], [kiro.id, 'medium']]) await assert.rejects(f.start({ implementer: { accountId, effort } }), /supported Codex reasoning effort/);
  assert.equal(f.spawned.length, 0); assert.equal(f.calls.length, 0);
});

test('a Claude implementation without a result uses a factual missing-summary label', async t => {
  const f = fixture(t, [{ output: 'No result event\n', edit }, { type: 'check' }, { type: 'review' }]);
  const job = await f.done(await f.start({ implementer: { accountId: claude.id }, reviewer: { accountId: codex.id } }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds[0].implement.summary, 'No summary reported.'); assert.doesNotMatch(job.error, /reviewer returned/);
});

test('quit kills and persists synchronously, deferring Git and Results until startup', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'review', reply: requested }, { hold: true }]);
  const started = await f.start({ checks: '' }); await until(() => f.spawned.length === 3);
  const count = f.calls.length, saved = f.saved.length;
  assert.equal(f.loop.interruptAll(), undefined); assert.equal(f.spawned[2].child.killed, true); assert.equal(f.calls.length, count); assert.equal(f.saved.length, saved);
  const file = path.join(f.root, 'tasks', started.id + '.json'), persisted = JSON.parse(fs.readFileSync(file));
  assert.equal(persisted.state, 'interrupted'); assert.equal(persisted.rebuildReport, true);
  await f.done(started);
  const restored = new TaskLoop(f.root, f.options); await Promise.all([...restored.pending.values()]);
  assert.equal(f.spawned.length, 3); assert.equal(f.saved.length, saved + 1);
  const recovered = JSON.parse(fs.readFileSync(file)); assert.equal(recovered.rebuildReport, false); assert.equal(recovered.finishedAt, persisted.finishedAt);
  assert.match(f.saved.at(-1).text, /Status: interrupted/); restored.interruptAll();
});

test('a file disappearing after ls-files does not expire or change verification', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }]);
  const job = await f.done(await f.start({ reviewer: null })), saved = f.saved.length, fingerprint = job.fingerprint, diff = job.finalDiff;
  const target = path.join(f.repo, 'vanishing.js'); fs.writeFileSync(target, 'temporary\n');
  let vanished = false;
  f.loop.run = (program, args, options, callback) => f.options.run(program, args, options, (error, stdout) => {
    if (!error && !vanished && args.includes('ls-files') && String(stdout).includes('vanishing.js')) { fs.unlinkSync(target); vanished = true; }
    callback(error, stdout);
  });
  assert.equal(await f.loop.refresh(job.id), true); assert.equal(vanished, true);
  assert.equal(job.state, 'passed'); assert.equal(job.verificationExpired, undefined); assert.equal(job.fingerprint, fingerprint); assert.equal(job.finalDiff, diff); assert.equal(f.saved.length, saved);
});

test('capture skips files that disappear after changes are collected', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }]);
  const job = await f.done(await f.start({ reviewer: null }));
  fs.writeFileSync(path.join(f.repo, 'vanishing.js'), 'temporary\n');
  const changes = f.loop.changes.bind(f.loop); let vanished = false;
  f.loop.changes = async (...args) => {
    const result = await changes(...args);
    if (!vanished && result.untracked.includes('vanishing.js')) { fs.unlinkSync(path.join(f.repo, 'vanishing.js')); vanished = true; }
    return result;
  };
  assert.equal(await f.loop.refresh(job.id), true); assert.equal(vanished, true);
  assert.equal(job.verificationExpired, undefined); assert.equal(job.error, '');
  assert.ok(!job.changedFiles.includes('vanishing.js')); assert.doesNotMatch(job.diffStat + job.finalDiff, /vanishing\.js/);
  assert.equal(await f.loop.refresh(job.id), true);
});

test('temporary fingerprint and capture failures preserve state and retry on the next cycle', async t => {
  for (const phase of ['fingerprint', 'capture']) for (const kind of ['lock', 'timeout', 'read']) {
    let at = 1_800_000_000_000;
    const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }], { now: () => at });
    const job = await f.done(await f.start({ reviewer: null })), before = structuredClone(job), saved = f.saved.length;
    const file = path.join(f.root, 'tasks', job.id + '.json'), persisted = fs.readFileSync(file, 'utf8');
    if (phase === 'capture') fs.writeFileSync(path.join(f.repo, 'app.js'), 'later edit\n');
    const original = f.loop[phase].bind(f.loop); let attempts = 0;
    f.loop[phase] = async (...args) => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error(kind === 'lock' ? 'index.lock conflict' : kind === 'timeout' ? 'git timed out' : 'temporary file read failure'), kind === 'timeout' ? { killed: true, signal: 'SIGTERM' } : { code: 'EACCES' });
      return original(...args);
    };
    assert.equal(await f.loop.refresh(job.id), false); assert.deepEqual(job, before);
    assert.equal(fs.readFileSync(file, 'utf8'), persisted); assert.equal(f.saved.length, saved);
    at += 6000; await f.loop.refresh();
    assert.equal(attempts, 2); assert.equal(job.verificationExpired, undefined); assert.equal(job.state, phase === 'capture' ? 'needs-you' : 'passed');
  }
});

test('Accept waits for a successful verification refresh after a temporary failure', async t => {
  const f = fixture(t, [{ type: 'implement', edit }]);
  const job = await f.done(await f.start({ checks: '', reviewer: null })), original = f.loop.fingerprint.bind(f.loop);
  f.loop.fingerprint = async () => { throw Object.assign(new Error('git timed out'), { killed: true }); };
  await assert.rejects(f.loop.accept(job.id), /Try Accept again/); assert.equal(job.state, 'passed');
  f.loop.fingerprint = original; await f.loop.accept(job.id); assert.equal(job.state, 'accepted');
});

test('missing baselines and oversized diffs permanently suspend background refresh', async t => {
  for (const code of ['PADDOCK_BASELINE_MISSING', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']) {
    const f = fixture(t, [{ type: 'implement', edit }, { type: 'check' }]);
    const job = await f.done(await f.start({ reviewer: null })), diff = job.finalDiff; let attempts = 0;
    f.loop.fingerprint = async () => { attempts++; throw Object.assign(new Error('Cannot verify'), { code, ...(code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? { killed: true, signal: 'SIGTERM' } : {}) }); };
    await f.loop.refresh(job.id); assert.equal(job.state, 'needs-you'); assert.equal(job.verificationExpired, true); assert.equal(job.finalDiff, diff);
    await f.loop.refresh(job.id); assert.equal(attempts, 1);
  }
});

test('hashes for baseline and new untracked files are reused until file stats change', async t => {
  const f = fixture(t, [{ type: 'implement', edit: cwd => { edit(cwd); fs.writeFileSync(path.join(cwd, 'new-dataset.bin'), Buffer.alloc(2 * 1024 * 1024, 2)); } }, { type: 'check' }]);
  const target = path.join(f.repo, 'dataset.bin'), contents = Buffer.alloc(2 * 1024 * 1024, 1), reads = new Map(), createReadStream = fs.createReadStream;
  fs.writeFileSync(target, contents);
  t.mock.method(fs, 'createReadStream', function(file, ...args) { const name = path.basename(String(file)); reads.set(name, (reads.get(name) || 0) + 1); return createReadStream.call(fs, file, ...args); });
  const job = await f.done(await f.start({ reviewer: null }));
  assert.equal(reads.get('dataset.bin'), 1); assert.equal(reads.get('new-dataset.bin'), 1);
  for (let index = 0; index < 3; index++) { await f.loop.refresh(job.id); await f.loop.changes(job); }
  assert.equal(reads.get('dataset.bin'), 1); assert.equal(reads.get('new-dataset.bin'), 1);
  const entry = [...f.loop.fileCache].find(([file]) => path.basename(file) === 'dataset.bin')[1];
  for (const key of ['size', 'mtimeMs', 'ctimeMs']) assert.ok(Number.isFinite(entry[key]));
  fs.writeFileSync(target, Buffer.alloc(contents.length, 3)); fs.utimesSync(target, new Date(), new Date(entry.mtimeMs + 2000));
  const changes = await f.loop.changes(job); assert.ok(changes.baselineChanges.some(change => change.file === 'dataset.bin'));
  await f.loop.fingerprint(job); await f.loop.changes(job);
  assert.equal(reads.get('dataset.bin'), 2); assert.equal(reads.get('new-dataset.bin'), 1);
  const lstat = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', function(file, ...args) { const stat = lstat.call(fs, file, ...args); if (path.basename(String(file)) === 'dataset.bin') stat.ctimeMs += 1000; return stat; });
  await f.loop.changes(job); await f.loop.fingerprint(job);
  assert.equal(reads.get('dataset.bin'), 3, 'A ctime-only change invalidates the cached hash'); assert.equal(reads.get('new-dataset.bin'), 1);
});

test('published task history stays bounded and omits baseline file lists', async t => {
  const f = fixture(t, [{ type: 'implement', edit }]);
  const job = await f.done(await f.start({ checks: '', reviewer: null }));
  job.state = 'accepted'; job.finalDiff = 'x'.repeat(60 * 1024); job.baselineUntracked = Array.from({ length: 1000 }, (_, index) => `pre-existing-${index}.js`);
  for (let index = 0; index < 60; index++) f.loop.jobs.set(`history-${index}`, { ...structuredClone(job), id: `history-${index}`, startedAt: job.startedAt + index + 1 });
  for (let index = 0; index < 2; index++) f.loop.jobs.set(`running-${index}`, { ...structuredClone(job), id: `running-${index}`, state: 'implementing', startedAt: 1 });
  const snapshot = f.loop.snapshot(); assert.equal(snapshot.length, 22);
  assert.ok(snapshot.some(item => item.id === 'running-0') && snapshot.some(item => item.id === 'running-1'));
  assert.ok(!snapshot.some(item => item.id === 'history-0'));
  assert.ok(snapshot.every(item => !('baselineUntracked' in item) && !('baselineUntrackedState' in item)));
  assert.ok(JSON.stringify(snapshot).length < 22 * 80000); assert.equal(f.loop.jobs.size, 63, 'History stays on disk/in memory for Results');
});

test('Stop and time-limit cancellation wait for close before capturing final writes', async t => {
  for (const state of ['stopped', 'needs-you']) {
    const events = []; let release;
    const f = fixture(t, [{ hold: true }], { stopTimeoutMs: 10000, killProcess: child => { events.push('kill'); release = () => { events.push('write'); fs.writeFileSync(path.join(f.repo, 'app.js'), 'last agent write\n'); events.push('close'); child.emit('close', null); }; } });
    const started = await f.start({ checks: '', reviewer: null }); await until(() => f.spawned.length === 1);
    const capture = f.loop.capture.bind(f.loop), count = f.calls.length;
    f.loop.capture = async (...args) => { events.push('capture'); return capture(...args); };
    const stopped = state === 'stopped' ? f.loop.stop(started.id) : f.loop.cancel(f.loop.jobs.get(started.id), state, 'The task reached its time limit.');
    await until(() => events.includes('kill')); assert.deepEqual(events, ['kill']); assert.equal(f.calls.length, count); assert.equal(f.saved.length, 0);
    await assert.rejects(f.start({ reviewer: null }), /already running/);
    release(); await stopped; const job = await f.done(started);
    assert.deepEqual(events, ['kill', 'write', 'close', 'capture']); assert.equal(job.state, state); assert.match(job.finalDiff, /last agent write/); assert.match(f.saved[0].text, /last agent write/);
  }
});

test('Stop has a bounded close wait and reports an unconfirmed exit', async t => {
  const f = fixture(t, [{ hold: true }], { stopTimeoutMs: 10, killProcess: child => { child.killed = true; } });
  const started = await f.start({ reviewer: null, checks: '' }); await until(() => f.spawned.length === 1);
  const job = await f.loop.stop(started.id); await f.done(started);
  assert.equal(job.state, 'stopped'); assert.match(job.error, /Process exit was not confirmed/); assert.equal(f.spawned[0].child.killed, true);
});

test('a checks timeout retains output through close and cannot pass on a zero exit', async t => {
  const f = fixture(t, [{ hold: true }], { killProcess: child => { child.killed = true; } });
  const job = { id: 'check-timeout', workFolder: f.repo, state: 'checking', log: [] }, step = { startedAt: Date.now() };
  const pending = f.loop.process(job, { executable: '/fake/checks', args: [] }, { environment: {}, check: true, step, timeoutMs: 5 });
  const child = f.spawned[0].child;
  try {
    await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(child.killed, true);
    child.stdout.emit('data', 'Last check output before exit\n'); child.emit('close', 0);
    const result = await pending; assert.equal(result.timedOut, true); assert.equal(result.exitConfirmed, true); assert.match(result.output, /Last check output/);
  } finally { child.emit('close', null); await pending; }
});

test('shared change collection disables configured fsmonitor and textconv commands', async t => {
  const f = fixture(t), seen = [];
  git(f.repo, 'config', 'core.fsmonitor', 'paddock-test-command-must-not-run');
  git(f.repo, 'config', 'diff.paddock.textconv', 'paddock-test-command-must-not-run');
  fs.writeFileSync(path.join(f.repo, '.gitattributes'), '*.js diff=paddock\n'); edit(f.repo);
  const run = (program, args, options, callback) => {
    seen.push(args); assert.deepEqual(args.slice(0, 2), ['-c', 'core.fsmonitor=false']);
    if (args.includes('diff')) { assert.ok(args.includes('--no-textconv')); assert.ok(args.includes('--no-ext-diff')); }
    return f.options.run(program, args, options, callback);
  };
  const changes = await collectChanges(f.repo, {}, run); assert.match(changes.diff, /const b = 2/); assert.ok(seen.length >= 4);
  f.loop.run = run; await f.loop.git(f.repo, ['diff', '--stat', 'HEAD']);
  assert.equal(git(f.repo, 'config', '--get', 'core.fsmonitor').trim(), 'paddock-test-command-must-not-run');
});

test('baseline verification preserves transient Git failures instead of declaring a missing commit', async t => {
  const f = fixture(t);
  for (const failure of [Object.assign(new Error('git timed out'), { code: 1, killed: true, signal: 'SIGTERM' }), Object.assign(new Error('index.lock conflict'), { code: 128 })]) {
    const run = (program, args, options, callback) => { queueMicrotask(() => callback(failure, '')); };
    await assert.rejects(collectChanges(f.repo, {}, run), error => error === failure);
  }
});

test('a checks shell spawn error is a failed check requiring user attention', async t => {
  for (const synchronous of [false, true]) {
    const f = fixture(t, [{ type: 'implement', edit }, { error: true }]);
    if (synchronous) {
      const spawnProcess = f.loop.spawnProcess;
      f.loop.spawnProcess = (executable, ...args) => { if (executable !== codex.executable) throw new Error('shell missing'); return spawnProcess(executable, ...args); };
    }
    const job = await f.done(await f.start({ reviewer: null }));
    assert.equal(job.state, 'needs-you'); assert.equal(job.error, 'The checks command could not start.');
    assert.equal(job.rounds[0].check.state, 'failed'); assert.equal(job.rounds[0].check.outcome, 'failed'); assert.equal(job.rounds[0].check.output, job.error); assert.equal(job.rounds[0].check.exitCode, null);
    assert.equal(job.rounds.length, 1); assert.equal(job.rounds[0].review, null);
  }
});

test('Kiro implementations report a redacted tail of their plain stdout summary', async t => {
  const f = fixture(t, [{ edit, output: 'x'.repeat(5000) + '\n\x1b[32mChanged app.js.\x1b[0m\nAPI_KEY=never-store-this\nFinished.\n' }]);
  const job = await f.done(await f.start({ implementer: { accountId: kiro.id }, reviewer: null, checks: '' }));
  assert.equal(job.state, 'passed'); assert.match(job.rounds[0].implement.summary, /Changed app\.js/); assert.match(job.rounds[0].implement.summary, /Finished\.$/);
  assert.doesNotMatch(job.rounds[0].implement.summary, /never-store-this|\x1b/); assert.ok(job.rounds[0].implement.summary.length <= 4000); assert.equal(job.rounds[0].implement.usage, null);
  assert.match(f.saved[0].text, /Changed app\.js/); assert.doesNotMatch(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8'), /never-store-this/);
});

test('the task form documentation advertises the available model fields', () => {
  const intro = fs.readFileSync(path.join(__dirname, '..', 'docs', 'task-loop.md'), 'utf8').split(/\r?\n\r?\n/)[1];
  assert.match(intro, /Model fields accept model identifiers\./); assert.doesNotMatch(intro, /reasoning effort/i);
});
