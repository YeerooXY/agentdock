'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { Delegation, collectChanges, reviewerLaunch, cleanFiles, reviewBrief, parseReply } = require('../electron/delegation.cjs');
const { Workbench } = require('../electron/workbench.cjs');

const now = 1_800_000_000_000;
const claude = { id: 'claude:default', provider: 'claude', label: 'Claude Code', executable: 'C:\\bin\\claude.exe' };
const codex = { id: 'codex:default', provider: 'codex', label: 'Codex', executable: 'C:\\bin\\codex.exe' };
const window = (usedPercent, hoursLeft = 3) => ({ minutes: 300, usedPercent, resetsAt: now + hoursLeft * 3_600_000 });

test('reviewers start read-only, without Paddock tools, and read the brief from stdin', () => {
  const c = reviewerLaunch('claude', '/usr/bin/claude.exe', { outFile: 'x' }).args;
  assert.deepEqual(c.slice(c.indexOf('--tools'), c.indexOf('--tools') + 2), ['--tools', 'Read,Grep,Glob']);
  assert.ok(c.includes('--strict-mcp-config') && c.includes('--no-session-persistence') && c.includes('-p'));
  assert.ok(!c.some(arg => /skip-permissions|bypass|yolo|add-dir/i.test(arg)));
  const x = reviewerLaunch('codex', '/usr/bin/codex.exe', { outFile: '/tmp/out.md', model: 'gpt-6.1-sol', platform: 'win32' }).args;
  assert.deepEqual(x.slice(0, 3), ['exec', '--sandbox', 'read-only']);
  assert.ok(x.includes('windows.sandbox=unelevated'), 'Windows needs the unelevated sandbox to run read commands');
  assert.ok(x.includes('--ephemeral') && x.at(-1) === '-' && x.includes('gpt-6.1-sol'));
  assert.ok(!reviewerLaunch('codex', '/usr/bin/codex.exe', { outFile: 'o', platform: 'linux' }).args.includes('windows.sandbox=unelevated'));
  const k = reviewerLaunch('kiro', '/usr/bin/kiro-cli.exe', { outFile: 'o' }).args;
  assert.deepEqual(k, ['chat', '--no-interactive', '--trust-tools=fs_read']);
  assert.ok(!k.some(arg => /trust-all|-a$/.test(arg)));
});

test('a Kiro reply keeps only its last verdict block', () => {
  const esc = String.fromCharCode(27);
  const noisy = ['Looking at the diff... VERDICT: changes-requested is possible', `${esc}[32mstill thinking${esc}[0m`, 'VERDICT: approve', 'FINDINGS:', '- none', ''].join('\n');
  const reply = parseReply('kiro', noisy, '');
  assert.equal(reply.verdict, 'approve'); assert.equal(reply.text, ['VERDICT: approve', 'FINDINGS:', '- none'].join('\n'));
});

test('file filters stay inside the project', () => {
  assert.deepEqual(cleanFiles(['src/a.js', 'b\\c.js']), ['src/a.js', 'b/c.js']);
  for (const bad of [['../x'], ['/etc/passwd'], ['C:/x'], ['--output=x'], Array(51).fill('a')]) assert.throws(() => cleanFiles(bad));
});

test('the diff leaves out private files and lists new files for the reviewer to read', async t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-delegation-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  run('init', '-q'); run('config', 'user.email', 't@example.com'); run('config', 'user.name', 'T');
  fs.writeFileSync(path.join(repo, 'app.js'), 'one\n'); fs.writeFileSync(path.join(repo, '.env'), 'A=1\n');
  run('add', '.'); run('commit', '-qm', 'base');
  await assert.rejects(collectChanges(repo), /no changes/);
  fs.writeFileSync(path.join(repo, 'app.js'), 'two\n'); fs.writeFileSync(path.join(repo, '.env'), 'SECRET=hidden\n'); fs.writeFileSync(path.join(repo, 'new.js'), 'x\n');
  const changes = await collectChanges(repo);
  assert.deepEqual(changes.files, ['app.js']); assert.deepEqual(changes.untracked, ['new.js']); assert.equal(changes.omitted, 1);
  assert.match(changes.diff, /\+two/); assert.doesNotMatch(changes.diff, /SECRET/);
  const brief = reviewBrief({ focus: 'Check the counter', changes });
  assert.match(brief, /VERDICT: approve \| changes-requested/); assert.match(brief, /new\.js/); assert.doesNotMatch(brief, /hidden/);
  await assert.rejects(collectChanges(repo, { base: '--output=x' }), /branch, tag or commit/);
  await assert.rejects(collectChanges(repo, { base: 'missing-branch' }), /not a commit/);
  assert.deepEqual((await collectChanges(repo, { files: ['new.js'] })).files, []);
});

function fakeCli() {
  const spawned = [];
  const spawnProcess = (executable, args, options) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.killed = false;
    child.stdin = { written: '', on() {}, end(text) { this.written += text; } };
    child.kill = () => { child.killed = true; child.emit('close', null); };
    spawned.push({ executable, args, options, child }); return child;
  };
  return { spawned, spawnProcess };
}

test('a review runs once per console and retains its verdict internally without a Results card', async t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-delegation-run-')), root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-delegation-root-'));
  t.after(() => { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true }); });
  const run = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  run('init', '-q'); run('config', 'user.email', 't@example.com'); run('config', 'user.name', 'T');
  fs.writeFileSync(path.join(repo, 'a.js'), '1\n'); run('add', '.'); run('commit', '-qm', 'base'); fs.writeFileSync(path.join(repo, 'a.js'), '2\n');
  const settings = { delegationEnabled: false }, saved = [], limits = [], cli = fakeCli();
  const delegation = new Delegation(root, { getSettings: () => settings, candidates: () => [claude, codex], getLimits: () => limits, environment: (id, provider) => ({ ACCOUNT: id, PROVIDER: provider }),
    saveResult: async raw => { saved.push(raw); return { id: 'r1' }; }, spawnProcess: cli.spawnProcess, now: () => now });
  const caller = { sessionId: 's1', provider: 'claude', cwd: repo, consoleName: 'Builder', context: { project: repo } };
  await assert.rejects(delegation.start({}, caller), /turned? on|are off/);
  settings.delegationEnabled = true;
  await assert.rejects(delegation.start({}, caller), /Choose an allowed/);
  await assert.rejects(delegation.start({ reviewer: 'codex' }, caller), /Choose an allowed/);
  limits.push({ accountId: codex.id, observedAt: now, windows: [window(100)] });
  await assert.rejects(delegation.start({ reviewer: codex.id }, caller), /account limit/);
  limits.length = 0;
  assert.equal(cli.spawned.length, 0);
  const started = await delegation.start({ reviewer: codex.id, focus: 'Off-by-one?' }, caller);
  assert.equal(started.state, 'running'); assert.equal(started.reviewer, 'Codex');
  assert.deepEqual(cli.spawned[0].options.env, { ACCOUNT: 'codex:default', PROVIDER: 'codex' });
  assert.match(cli.spawned[0].child.stdin.written, /Off-by-one\?/); assert.match(cli.spawned[0].child.stdin.written, /VERDICT: approve \| changes-requested/);
  await assert.rejects(delegation.start({}, caller), /already has a review/);
  await assert.rejects(delegation.status(started.id, { sessionId: 'other' }), /No review/);
  // Codex writes its last message to the -o file.
  const args = cli.spawned[0].args, outFile = args[args.indexOf('-o') + 1];
  fs.writeFileSync(outFile, 'VERDICT: changes-requested\nFINDINGS:\n- a.js:1 — high — wrong value — use 1\n');
  const waiting = delegation.status(started.id, { waitSeconds: 30, sessionId: 's1' });
  cli.spawned[0].child.emit('close', 0);
  const done = await waiting;
  assert.equal(done.state, 'done'); assert.equal(done.verdict, 'changes-requested'); assert.match(done.review, /a\.js:1/); assert.equal(done.resultId, undefined);
  assert.equal(saved.length, 0); assert.match(delegation.executionHistory.get('review', done.id).report, /Requested by Builder/);
  assert.equal(fs.existsSync(path.dirname(outFile)), false, 'the brief folder is removed');
  // Claude replies as JSON; a stop ends the run and is reported as stopped.
  const second = await delegation.start({ reviewer: claude.id }, caller);
  delegation.stop(second.id);
  assert.equal((await delegation.status(second.id)).state, 'stopped');
  assert.equal(cli.spawned[1].child.killed || process.platform === 'win32', true);
  const third = await delegation.start({ reviewer: claude.id }, caller);
  cli.spawned[2].child.stdout.emit('data', JSON.stringify({ result: 'VERDICT: approve\nFINDINGS:\n- none', usage: { input_tokens: 900, output_tokens: 40 }, num_turns: 2 }) + '\n');
  cli.spawned[2].child.emit('close', 0);
  const approved = await delegation.status(third.id, { waitSeconds: 5 });
  assert.equal(approved.verdict, 'approve'); assert.equal(approved.usage.outputTokens, 40);
  // A signed-out reviewer reports how to fix it.
  const fourth = await delegation.start({ reviewer: claude.id }, caller);
  cli.spawned[3].child.stderr.emit('data', 'Please run /login to sign in');
  cli.spawned[3].child.emit('close', 1);
  const failed = await delegation.status(fourth.id, { waitSeconds: 5 });
  assert.equal(failed.state, 'failed'); assert.match(failed.error, /Sign in to Claude Code/);
});

test('review tools are listed only while the user has them turned on', () => {
  const wb = Object.create(Workbench.prototype);
  wb.delegation = { getSettings: () => ({ delegationEnabled: false }) };
  assert.ok(!wb.tools().some(tool => tool.name === 'dock/delegate_review'));
  wb.delegation = { getSettings: () => ({ delegationEnabled: true }) };
  assert.ok(wb.tools().some(tool => tool.name === 'dock/delegate_review') && wb.tools().some(tool => tool.name === 'dock/delegation_status'));
});
