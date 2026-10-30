'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { execFile, execFileSync } = require('node:child_process');
const { TaskLoop, implementerLaunch, openCodeEvents, checkLaunch } = require('../electron/task-loop.cjs');
const { collectChanges } = require('../electron/delegation.cjs');

const codex = { id: 'codex:default', provider: 'codex', label: 'Codex', executable: '/fake/codex.exe' };
const claude = { id: 'claude:default', provider: 'claude', label: 'Claude Code', executable: '/fake/claude.exe' };
const kiro = { id: 'kiro:default', provider: 'kiro', label: 'Kiro', executable: '/fake/kiro-cli.exe' };
const opencode = { id: 'opencode:default', provider: 'opencode', label: 'OpenCode', executable: '/fake/opencode.exe' };
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
test('OpenCode uses a temporary prompt and permission config, and reads events', async t => {
  const events = [
    { type: 'text', part: { text: 'First' } },
    { type: 'step_finish', part: { reason: 'stop', tokens: { input: 10, output: 2, cache: { read: 3 } }, cost: 0.01 } },
    { type: 'text', part: { text: 'Updated app.js.' } },
    { type: 'step_finish', part: { reason: 'stop', tokens: { input: 4, output: 1 }, cost: 0.02 } }
  ].map(JSON.stringify).join('\n') + '\n';
  const f = fixture(t, [{ output: events, edit, inspect: invocation => {
    assert.deepEqual(invocation.args.slice(0, 5), ['run', '-m', 'opencode-go/test', '--dir', f.repo]);
    const file = invocation.args[invocation.args.indexOf('-f') + 1];
    assert.ok(file.startsWith(f.root)); assert.ok(!file.startsWith(f.repo));
    assert.match(fs.readFileSync(file, 'utf8'), /b must be 2/);
    assert.ok(!invocation.args.some(arg => arg.includes('b must be 2')));
    assert.deepEqual(JSON.parse(fs.readFileSync(invocation.options.env.OPENCODE_CONFIG, 'utf8')).permission, { edit: 'allow', bash: 'deny', webfetch: 'deny', websearch: 'deny', external_directory: 'deny' });
    assert.deepEqual(JSON.parse(invocation.options.env.OPENCODE_PERMISSION), JSON.parse(fs.readFileSync(invocation.options.env.OPENCODE_CONFIG, 'utf8')).permission);
    assert.deepEqual(Object.keys(invocation.options.env).filter(key => /^opencode_/i.test(key)).sort(), ['OPENCODE_CONFIG', 'OPENCODE_PERMISSION']);
  } }], { candidates: () => [opencode, claude], environment: () => ({ OPENCODE_CONFIG_CONTENT: 'unsafe', OPENCODE_PERMISSION: 'unsafe', opencode_other: 'unsafe', OTHER: 'kept' }) });
  const job = await f.done(await f.start({ implementer: { accountId: opencode.id, model: 'opencode-go/test' }, reviewer: null, checks: '' }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds[0].implement.summary, 'Updated app.js.');
  assert.equal(job.rounds[0].implement.usage.inputTokens, 14); assert.equal(job.rounds[0].implement.usage.outputTokens, 3);
  assert.equal(job.rounds[0].implement.usage.cachedInputTokens, 3); assert.ok(Math.abs(job.rounds[0].implement.usage.reportedCost - 0.03) < 1e-9);
  assert.equal(openCodeEvents(events).text, 'Updated app.js.');
});
test('OpenCode output limit without edits fails the task', async t => {
  const f = fixture(t, [{ output: JSON.stringify({ type: 'step_finish', part: { reason: 'length' } }) + '\n' }], { candidates: () => [opencode] });
  const job = await f.done(await f.start({ implementer: { accountId: opencode.id, model: 'opencode/test-free' }, reviewer: null, checks: '' }));
  assert.equal(job.state, 'failed'); assert.equal(job.error, 'The model hit its output limit.');
});
test('OpenCode reviewer receives edit deny', async t => {
  const f = fixture(t, [{ type: 'implement', edit }, { output: JSON.stringify({ type: 'text', part: { text: approve } }) + '\n', inspect: invocation => {
    assert.equal(JSON.parse(fs.readFileSync(invocation.options.env.OPENCODE_CONFIG, 'utf8')).permission.edit, 'deny');
  } }], { candidates: () => [codex, opencode] });
  const job = await f.done(await f.start({ reviewer: { accountId: opencode.id, model: 'opencode/test-free' }, checks: '' }));
  assert.equal(job.state, 'passed'); assert.equal(job.rounds[0].review.verdict, 'approve');
});
test('OpenCode accumulates usage beyond the retained output tail', async t => {
  const event = JSON.stringify({ type: 'step_finish', part: { tokens: { input: 9, output: 4 }, cost: 0.1 } }) + '\n';
  const filler = (JSON.stringify({ type: 'other', data: 'x'.repeat(1000) }) + '\n').repeat(2100);
  const reply = JSON.stringify({ type: 'text', part: { text: 'Done.' } }) + '\n';
  const f = fixture(t, [{ output: event + filler + reply, edit }], { candidates: () => [opencode] });
  const job = await f.done(await f.start({ implementer: { accountId: opencode.id, model: 'opencode-go/test' }, reviewer: null, checks: '' }));
  assert.equal(job.rounds[0].implement.usage.inputTokens, 9); assert.equal(job.rounds[0].implement.usage.reportedCost, 0.1);
});
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
  assert.deepEqual(job.rounds.map(round => round.attemptId), [`${job.id}-attempt-1`, `${job.id}-attempt-2`]);
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
  for (const job of restored.snapshot()) {
    assert.equal(job.state, 'interrupted'); assert.equal(job.rounds[0].implement.state, 'interrupted');
    const stored = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', `${job.id}.json`)));
    assert.equal(stored.state, 'interrupted'); assert.equal(stored.rounds[0].implement.state, 'interrupted');
    assert.equal(stored.rounds[0].attemptId, `${job.id}-attempt-1`); assert.equal(stored.schemaVersion, 1);
  }
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

test('the task documentation explains starting tasks through dock/start_task', () => {
  const intro = fs.readFileSync(path.join(__dirname, '..', 'docs', 'task-loop.md'), 'utf8').split(/\r?\n\r?\n/)[1];
  assert.match(intro, /dock\/start_task/); assert.match(intro, /\*\*Tasks\*\* shows live progress/);
});

const splitPlan = (dependent = false) => ({ contracts: 'Store durations in milliseconds. Use the label Classes.', subtasks: [
  { id: 'first', title: 'First module', criteria: 'Create first.js.', owns: ['first.js'], dependsOn: [], size: 'small' },
  { id: 'second', title: 'Second module', criteria: 'Create second.js.', owns: ['second.js'], dependsOn: dependent ? ['first'] : [], size: 'small' }
] });
const planned = value => ({ type: 'review', reply: '```json\n' + JSON.stringify(value) + '\n```' });
async function readyPlan(f, extra = {}) {
  const started = await f.start({ split: true, reviewer: null, checks: '', ...extra });
  const job = await f.done(started); assert.equal(job.state, 'plan-ready'); return job;
}
const approvePlan = (f, job, extra = {}) => f.loop.approvePlan({ id: job.id, parallelLimit: 1, ...extra });

test('split planning is read-only, repairs exact errors once and never builds before approval', async t => {
  const invalid = splitPlan(); invalid.subtasks[0].dependsOn = ['missing'];
  const f = fixture(t, [planned(invalid), { ...planned(splitPlan()), inspect: invocation => assert.match(invocation.prompt, /first: unknown dependency missing/) }]);
  const job = await readyPlan(f);
  assert.equal(f.spawned.length, 2); assert.equal(job.rounds.length, 0); assert.equal(job.planRepairUsed, true);
  assert.ok(f.spawned.every(invocation => invocation.args.includes('read-only')));
  assert.ok(job.subtasks.every(sub => !sub.workFolder)); assert.equal(job.workflow, 'worktree');
  assert.equal(job.planReview.state, 'not-set'); assert.match(f.loop.report(job), /Plan not reviewed/);
  const failed = fixture(t, [planned(invalid), planned(invalid)]);
  const stopped = await failed.done(await failed.start({ split: true, reviewer: null, checks: '' }));
  assert.equal(stopped.state, 'needs-you'); assert.equal(failed.spawned.length, 2); assert.match(stopped.error, /unknown dependency/);
});
test('plan review feeds findings to the planner and stops after two plan rounds', async t => {
  for (const reply of [approve, requested]) {
    const f = fixture(t, [planned(splitPlan()), { type: 'review', reply: requested }, { ...planned(splitPlan()), inspect: invocation => assert.match(invocation.prompt, /wrong result/) }, { type: 'review', reply }]);
    const job = await f.done(await f.start({ split: true, checks: '' }));
    assert.equal(job.planRounds.length, 2); assert.equal(f.spawned.length, 4);
    assert.equal(job.state, reply === approve ? 'plan-ready' : 'needs-you');
    assert.match(f.spawned[1].prompt, /Review only the task criteria/); assert.doesNotMatch(f.spawned[1].prompt, /Diff against/);
    assert.ok(f.spawned.every(invocation => !invocation.args.includes('workspace-write')));
  }
});
test('approval validates all overrides before applying them and selects the main implementer', async t => {
  const f = fixture(t, [planned(splitPlan()), { hold: true }]); const job = await readyPlan(f);
  for (const override of [{ parallelLimit: 0 }, { parallelLimit: 5 }, { assignments: { missing: { accountId: codex.id } } }, { assignments: { first: { accountId: 'codex:absent' } } }, { assignments: { first: { accountId: codex.id, model: '-bad' } } }]) await assert.rejects(approvePlan(f, job, override));
  assert.equal(job.state, 'plan-ready'); assert.equal(f.spawned.length, 1);
  await approvePlan(f, job, { assignments: { first: { accountId: claude.id, model: 'override-model' } }, implementer: { accountId: kiro.id, model: 'main-model' } });
  await until(() => f.spawned.length === 2);
  assert.equal(job.subtasks[0].implementer.accountId, claude.id); assert.equal(job.subtasks[0].implementer.model, 'override-model');
  assert.equal(job.implementer.accountId, kiro.id); assert.equal(job.subtasks[0].assignmentReason, 'Selected by you.');
  await assert.rejects(approvePlan(f, job), /ready plan/);
  await f.loop.stop(job.id); await f.done(job);
});
test('dependent worktrees include merged dependency work; final checks and review see the combined diff', async t => {
  const f = fixture(t, [planned(splitPlan(true)), { type: 'review' },
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first module\n') }, { type: 'check' }, { type: 'review' },
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'second.js'), 'second module\n'), inspect: invocation => assert.equal(fs.readFileSync(path.join(invocation.options.cwd, 'first.js'), 'utf8').replace(/\r\n/g, '\n'), 'first module\n') }, { type: 'check' }, { type: 'review' },
    { type: 'check', inspect: invocation => { assert.ok(fs.existsSync(path.join(invocation.options.cwd, 'first.js'))); assert.ok(fs.existsSync(path.join(invocation.options.cwd, 'second.js'))); } },
    { type: 'review', inspect: invocation => { assert.match(invocation.prompt, /first module/); assert.match(invocation.prompt, /second module/); assert.match(invocation.prompt, /milliseconds/); assert.match(invocation.prompt, /Approved plan/); } }
  ]);
  const originalHead = git(f.repo, 'rev-parse', 'HEAD');
  const job = await readyPlan(f, { reviewer: { accountId: claude.id }, checks: 'mock-check' });
  await approvePlan(f, job); await f.done(job);
  assert.equal(job.state, 'passed'); assert.ok(job.subtasks.every(sub => sub.state === 'merged'));
  assert.equal(job.rounds.length, 1); assert.equal(job.rounds[0].implement, null);
  const attemptIds = [job, ...job.subtasks].flatMap(owner => owner.rounds.map(round => {
    assert.equal(round.attemptId, `${owner.id}-attempt-${round.number}`); return round.attemptId;
  }));
  assert.equal(new Set(attemptIds).size, attemptIds.length);
  for (const step of [job.rounds[0].check, job.rounds[0].review]) assert.equal(step.head, git(job.workFolder, 'rev-parse', 'HEAD').trim());
  assert.match(git(job.workFolder, 'log', '--format=%s'), /Subtask first: First module/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), originalHead);
  const report = f.loop.report(job); assert.match(report, /## Plan/); assert.match(report, /## Usage by account/); assert.match(report, /first round 1 Implement: 100 input/); assert.doesNotMatch(report, /\d+%/);
  await f.loop.git(job.workFolder, ['-c', 'user.name=Task tests', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'Later head']);
  await f.loop.refresh(job.id); assert.equal(job.state, 'needs-you'); assert.equal(job.rounds[0].check.state, 'stale'); assert.match(job.unresolved.join(' '), /Checks are out of date/);
});
test('integration findings use the remaining rounds with the main implementer', async t => {
  const f = fixture(t, [planned(splitPlan()), { type: 'review' },
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first\n') }, { type: 'review' },
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'second.js'), 'second\n') }, { type: 'review' },
    { type: 'review', reply: requested }, { type: 'implement', inspect: invocation => { assert.equal(invocation.executable, kiro.executable); assert.match(invocation.prompt, /wrong result/); assert.match(invocation.prompt, /milliseconds/); } }, { type: 'review' }
  ]);
  const job = await readyPlan(f, { reviewer: { accountId: claude.id } });
  await approvePlan(f, job, { implementer: { accountId: kiro.id } }); await f.done(job);
  assert.equal(job.state, 'passed'); assert.equal(job.rounds.length, 2);
});
test('ownership violations become fix findings and then needs-you without a merge', async t => {
  const f = fixture(t, [planned(splitPlan()), { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'second.js'), 'wrong owner\n') }, { type: 'implement', inspect: invocation => assert.match(invocation.prompt, /You changed second.js, which belongs to second/) }]);
  const job = await readyPlan(f, { maxRounds: 2 }); await approvePlan(f, job); await f.done(job);
  assert.equal(job.state, 'needs-you'); assert.equal(job.subtasks[0].state, 'needs-you'); assert.equal(job.subtasks[0].rounds.length, 2);
  assert.ok(!fs.existsSync(path.join(job.workFolder, 'second.js'))); assert.equal(job.subtasks[1].state, 'queued');
});
test('parallel scheduling respects the limit and dependencies', async t => {
  const value = splitPlan(); value.subtasks.push({ id: 'third', title: 'Third module', criteria: 'Use first.js.', owns: ['third.js'], dependsOn: ['first'], size: 'small' });
  const f = fixture(t, [planned(value), { hold: true }, { hold: true }, { hold: true }]); const job = await readyPlan(f);
  await approvePlan(f, job, { parallelLimit: 2 }); await until(() => f.spawned.length === 3);
  assert.equal(job.subtasks[2].state, 'queued');
  const finish = (invocation, file) => { fs.writeFileSync(path.join(invocation.options.cwd, file), file + '\n'); invocation.child.emit('close', 0); };
  const first = f.spawned.find(invocation => invocation.options.cwd.endsWith('-first'));
  const second = f.spawned.find(invocation => invocation.options.cwd.endsWith('-second'));
  finish(first, 'first.js'); await until(() => f.spawned.length === 4);
  assert.equal(fs.readFileSync(path.join(f.spawned[3].options.cwd, 'first.js'), 'utf8').replace(/\r\n/g, '\n'), 'first.js\n');
  assert.equal(second.child.killed, false); finish(second, 'second.js'); finish(f.spawned[3], 'third.js');
  await f.done(job); assert.equal(job.state, 'passed'); assert.ok(job.subtasks.every(sub => sub.state === 'merged'));
});
test('merge conflicts are aborted and leave the integration HEAD and working tree unchanged', async t => {
  const f = fixture(t, [planned(splitPlan()), { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'subtask\n') }]);
  const job = await readyPlan(f), base = job.integrationHead;
  // Simulate a competing integration edit after subtask creation, just before merge.
  const merge = f.loop.split.merge.bind(f.loop.split); let before;
  f.loop.split.merge = async (parent, sub) => {
    fs.writeFileSync(path.join(parent.workFolder, 'first.js'), 'integration\n'); git(parent.workFolder, 'add', '.'); git(parent.workFolder, 'commit', '-qm', 'competing integration');
    parent.integrationHead = before = git(parent.workFolder, 'rev-parse', 'HEAD').trim();
    return merge(parent, sub);
  };
  await approvePlan(f, job); await f.done(job);
  assert.notEqual(before, base); assert.equal(job.state, 'needs-you'); assert.match(job.subtasks[0].error, /Merge conflict: first.js/);
  assert.equal(git(job.workFolder, 'rev-parse', 'HEAD').trim(), before); assert.equal(git(job.workFolder, 'status', '--porcelain'), '');
  assert.throws(() => git(job.workFolder, 'rev-parse', '--verify', 'MERGE_HEAD'));
});
test('Stop keeps split worktrees; startup interrupts children and Resume skips merged work', async t => {
  const f = fixture(t, [planned(splitPlan(true)), { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first\n') }, { hold: true }]);
  const job = await readyPlan(f); await approvePlan(f, job); await until(() => f.spawned.length === 3);
  assert.equal(job.subtasks[0].state, 'merged');
  f.loop.interruptAll(); await f.done(job); assert.equal(f.spawned[2].child.killed, true);
  const restored = new TaskLoop(f.root, f.options); t.after(() => restored.interruptAll()); await Promise.all(restored.pending.values());
  const recovered = restored.jobs.get(job.id); assert.equal(recovered.state, 'interrupted'); assert.equal(recovered.subtasks[1].state, 'interrupted'); assert.equal(f.spawned.length, 3);
  const folder = recovered.subtasks[1].workFolder;
  f.script.push({ hold: true }); const resumed = await restored.resume(job.id); await until(() => f.spawned.length === 4);
  assert.equal(f.spawned[3].options.cwd, folder); assert.match(f.spawned[3].prompt, /Previous unresolved items/);
  await assert.rejects(restored.resume(job.id), /Resume a split task/);
  await restored.stop(resumed.id); await restored.pending.get(resumed.id);
  assert.ok(recovered.subtasks.every(sub => fs.existsSync(sub.workFolder)));
  assert.equal(recovered.subtasks[0].state, 'merged'); assert.equal(f.spawned[3].child.killed, true);
});
test('four provider slots are shared across tasks and cancelled queued work never starts', async t => {
  const f = fixture(t); const releases = [];
  for (let i = 0; i < 4; i++) releases.push(await f.loop.acquireProvider({ id: `slot-${i}` }));
  assert.equal(f.loop.providerSlots, 4);
  let entered = false; const waiting = f.loop.acquireProvider({ id: 'queued', parentId: 'parent' }).then(release => { entered = true; release(); });
  await Promise.resolve(); assert.equal(entered, false); f.loop.cancelProviderQueue({ id: 'parent' }); await waiting;
  assert.equal(f.loop.providerSlots, 4); releases.forEach(release => release()); assert.equal(f.loop.providerSlots, 0); assert.equal(f.spawned.length, 0);
});

test('OpenCode planners retain full plans with read-only permissions and reported costs', async t => {
  const value = splitPlan(); value.contracts = 'x'.repeat(8000);
  const output = [{ type: 'text', part: { text: '```json\n' + JSON.stringify(value) + '\n```' } }, { type: 'step_finish', part: { reason: 'stop', tokens: { input: 25, output: 12 }, cost: 0.02 } }].map(JSON.stringify).join('\n') + '\n';
  const f = fixture(t, [{ output, inspect: invocation => assert.equal(JSON.parse(invocation.options.env.OPENCODE_PERMISSION).edit, 'deny') }], { candidates: () => [codex, opencode] });
  const job = await readyPlan(f, { implementer: { accountId: opencode.id, model: 'opencode-go/test' } });
  assert.equal(job.plan.contracts.length, 8000); assert.equal(job.planRounds[0].planner.usage.reportedCost, 0.02);
  assert.match(f.loop.report(job), /OpenCode reported cost \$0.02/); assert.match(f.loop.report(job), /usage: not reported|not reported input/);
});
test('Stop kills every parallel subtask and keeps every worktree', async t => {
  const f = fixture(t, [planned(splitPlan()), { hold: true }, { hold: true }]); const job = await readyPlan(f);
  await approvePlan(f, job, { parallelLimit: 2 }); await until(() => f.spawned.length === 3);
  await f.loop.stop(job.id); await f.done(job);
  assert.equal(job.state, 'stopped'); assert.ok(f.spawned.slice(1).every(invocation => invocation.child.killed));
  assert.ok(job.subtasks.every(sub => fs.existsSync(sub.workFolder))); assert.ok(fs.existsSync(job.workFolder));
});
test('subtask commits use fallback identity without changing repository configuration', async t => {
  const f = fixture(t, [planned(splitPlan()), { type: 'implement' }, { type: 'implement' }]);
  const job = await readyPlan(f), original = git(f.repo, 'config', '--get', 'user.name');
  f.loop.run = (program, args, options, callback) => {
    if (args.includes('config') && args.includes('--get')) { queueMicrotask(() => callback(Object.assign(new Error('not configured'), { code: 1 }), '')); return; }
    return f.options.run(program, args, options, callback);
  };
  await approvePlan(f, job); await f.done(job); assert.equal(job.state, 'passed');
  assert.equal(git(f.repo, 'config', '--get', 'user.name'), original);
  assert.match(git(job.subtasks[0].workFolder, 'log', '-1', '--format=%an <%ae>'), /Paddock <paddock@localhost>/);
});
test('recovery recognizes a finished merge that was not saved before interruption', async t => {
  const f = fixture(t, [planned(splitPlan(true)), { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first\n') }, { hold: true }]);
  const job = await readyPlan(f); await approvePlan(f, job); await until(() => f.spawned.length === 3);
  await f.loop.stop(job.id); await f.done(job);
  const first = job.subtasks[0]; first.state = 'interrupted'; delete first.mergedAt; delete first.committed; job.integrationHead = job.sourceRevision;
  await f.loop.split.recoverMerges(job);
  assert.equal(first.state, 'merged'); assert.equal(first.committed, first.commit); assert.equal(job.integrationHead, git(job.workFolder, 'rev-parse', 'HEAD').trim()); assert.equal(f.spawned.length, 3);
});

test('Stop during a subtask commit preserves the commit and Resume merges without another implement round', async t => {
  const f = fixture(t, [planned(splitPlan(true)),
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first\n') },
    { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'second.js'), 'second\n') }]);
  const job = await readyPlan(f); let commitReady = false, releaseCommit;
  f.loop.run = (program, args, options, callback) => {
    if (!releaseCommit && args.includes('commit') && args.includes('--allow-empty') && options.cwd.endsWith('-first')) {
      return f.options.run(program, args, options, (error, stdout, stderr) => {
        releaseCommit = () => callback(error, stdout, stderr); commitReady = true;
      });
    }
    return f.options.run(program, args, options, callback);
  };
  await approvePlan(f, job); await until(() => commitReady);
  const stopping = f.loop.stop(job.id); assert.equal(job.state, 'stopped');
  releaseCommit(); await stopping; await f.done(job);
  const first = job.subtasks[0], saved = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8'));
  assert.match(first.committed, /^[a-f0-9]{40,64}$/); assert.equal(saved.subtasks[0].committed, first.committed);
  assert.equal(first.rounds.length, 1); assert.equal(f.spawned.length, 2);
  assert.equal(path.basename(first.workFolder), `${job.id.slice(0, 8)}-first`);
  await f.loop.resume(job.id); await f.done(job);
  assert.equal(job.state, 'passed'); assert.equal(first.state, 'merged'); assert.equal(first.rounds.length, 1); assert.deepEqual(first.unresolved, []);
  assert.equal(f.spawned.length, 3, 'Only the dependent implementer starts after Resume');
  assert.equal(fs.readFileSync(path.join(job.workFolder, 'first.js'), 'utf8').replace(/\r\n/g, '\n'), 'first\n');
});

test('Stop after staging prevents the subtask commit from starting', async t => {
  const f = fixture(t, [planned(splitPlan()), { type: 'implement', edit: cwd => fs.writeFileSync(path.join(cwd, 'first.js'), 'first\n') }]);
  const job = await readyPlan(f); let staged = false, releaseAdd, commits = 0;
  f.loop.run = (program, args, options, callback) => {
    if (args.includes('commit') && args.includes('--allow-empty')) commits++;
    if (!releaseAdd && args.includes('add') && args.includes('--all') && options.cwd.endsWith('-first')) {
      return f.options.run(program, args, options, (error, stdout, stderr) => {
        releaseAdd = () => callback(error, stdout, stderr); staged = true;
      });
    }
    return f.options.run(program, args, options, callback);
  };
  await approvePlan(f, job); await until(() => staged);
  const stopping = f.loop.stop(job.id); releaseAdd(); await stopping; await f.done(job);
  assert.equal(job.state, 'stopped'); assert.equal(commits, 0); assert.equal(job.subtasks[0].committed, undefined);
  assert.equal(git(job.subtasks[0].workFolder, 'rev-parse', 'HEAD').trim(), job.subtasks[0].baseline);
});

test('Resume ignores PIDs recorded before app start and still blocks a live process from this run', async t => {
  const checked = []; let alive = true;
  const f = fixture(t, [planned(splitPlan())], { now: () => 2000, processStartedAt: 1000, isProcessAlive: pid => { checked.push(pid); return alive; } });
  const job = await readyPlan(f); await f.loop.stop(job.id);
  job.processPid = 101; job.processRecordedAt = 999;
  job.subtasks[0].processPid = 102; job.subtasks[0].processRecordedAt = 999; f.loop.changed(job);
  await f.loop.resume(job.id); assert.equal(job.state, 'plan-ready'); assert.deepEqual(checked, []);
  let saved = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8'));
  assert.equal(saved.processPid, undefined); assert.equal(saved.subtasks[0].processPid, undefined);
  await f.loop.stop(job.id); job.processPid = 103; job.processRecordedAt = 1500; f.loop.changed(job);
  await assert.rejects(f.loop.resume(job.id), /still active/); assert.deepEqual(checked, [103]);
  alive = false; await f.loop.resume(job.id); assert.equal(job.state, 'plan-ready'); assert.deepEqual(checked, [103, 103]);
  saved = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8')); assert.equal(saved.processPid, undefined);
});

test('legacy saved PIDs without recording times are treated as predating the app', async t => {
  const checked = [], f = fixture(t, [planned(splitPlan())], { now: () => 2000, processStartedAt: 1000, isProcessAlive: pid => { checked.push(pid); return true; } });
  const job = await readyPlan(f); await f.loop.stop(job.id);
  job.subtasks[0].processPid = 104; delete job.subtasks[0].processRecordedAt; f.loop.changed(job);
  const restored = new TaskLoop(f.root, f.options); t.after(() => restored.interruptAll());
  await restored.resume(job.id); assert.equal(restored.jobs.get(job.id).state, 'plan-ready'); assert.deepEqual(checked, []);
  const saved = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', job.id + '.json'), 'utf8')); assert.equal(saved.subtasks[0].processPid, undefined);
});

test('a late child close persists the cleared PID on both tasks and subtasks', async t => {
  for (const split of [false, true]) {
    const script = split ? [planned(splitPlan()), { hold: true }] : [{ hold: true }];
    const f = fixture(t, script, { stopTimeoutMs: 5, killProcess: child => { child.killed = true; } });
    const job = split ? await readyPlan(f) : null;
    const originalSpawn = f.loop.spawnProcess;
    f.loop.spawnProcess = (...args) => { const child = originalSpawn(...args); child.pid = 123456; return child; };
    const running = split ? await approvePlan(f, job) : await f.start({ reviewer: null, checks: '' });
    await until(() => f.spawned.length === (split ? 2 : 1));
    const item = f.loop.jobs.get(running.id), child = f.spawned.at(-1).child, file = path.join(f.root, 'tasks', running.id + '.json');
    await f.loop.stop(running.id); await f.done(running);
    const savedItem = () => { const value = JSON.parse(fs.readFileSync(file, 'utf8')); return split ? value.subtasks[0] : value; };
    assert.equal(savedItem().processPid, 123456); assert.ok(Number.isFinite(savedItem().processRecordedAt));
    child.emit('close', null);
    assert.equal(savedItem().processPid, undefined); assert.equal(savedItem().processRecordedAt, undefined);
    assert.equal(item.state, 'stopped');
  }
});
