'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CrashReport, redact, detectAgents, terminalCommand, diagnose, guardStartup, PROMPT, ISSUE_URL } = require('../electron/crash-report.cjs');
const { Workspace } = require('../electron/workspace.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-crash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('redacts paths, emails, credentials and command arguments', () => {
  const text = redact('/home/alex/file alex@example.com Bearer short-value key=short-value token="other" sk-abc123 ghp_12345 ' + 'a'.repeat(40) + '\nCommand failed: secret arguments', '/home/alex');
  for (const value of ['/home/alex', 'alex@example.com', 'short-value', 'other', 'sk-abc123', 'ghp_12345', 'a'.repeat(40), 'secret arguments']) assert.ok(!text.includes(value));
  assert.match(text, /~\/file/);
});

test('keeps stack trace paths readable while hiding mixed-case token runs', () => {
  const frame = 'at refreshConsole (/home/alex/agents/opencode/node_modules/opencode-windows-x64/bin/opencode.cmd:14:3)';
  assert.equal(redact(frame, '/home/alex'), 'at refreshConsole (~/agents/opencode/node_modules/opencode-windows-x64/bin/opencode.cmd:14:3)');
  assert.equal(redact('value abcdEFGH1234ijklMNOP5678qrstUVWX9012yz', '/home/alex'), 'value [redacted]');
});
test('rotates logs and redacts the report and its log tail', t => {
  const root = fixture(t), crash = new CrashReport(root, { home: '/home/alex', maxBytes: 40 });
  crash.log('INFO', 'first ' + 'x'.repeat(60));
  crash.log('WARN', 'token=private alex@example.com');
  assert.ok(fs.existsSync(path.join(root, 'logs', 'main.1.log')));
  crash.step = 'loading settings';
  const result = crash.report(new Error('sk-secret123 /home/alex/private'), { version: '1', electron: '2', node: '3', install: '/home/alex/app', system: 'test OS' });
  const text = fs.readFileSync(path.join(result.folder, 'CRASH.md'), 'utf8');
  for (const value of ['sk-secret123', '/home/alex', 'alex@example.com', 'token=private']) assert.ok(!text.includes(value));
  for (const value of ['loading settings', 'Electron: 2', 'test OS', 'Last 200 log lines', 'Instructions for the AI assistant', 'ISSUE.md', 'asking the user']) assert.ok(text.includes(value));
});
test('optional startup failures are notices; required failures propagate', async t => {
  const crash = new CrashReport(fixture(t));
  await crash.startupStep('sync check', () => { throw Error('sync'); }, { optional: true });
  await crash.startupStep('async check', async () => { throw Error('async'); }, { optional: true });
  assert.equal(crash.notices.length, 2);
  await assert.rejects(crash.startupStep('window', () => { throw Error('required'); }), /required/);
  assert.equal(crash.step, 'window');
  let called = false;
  await crash.startupStep('skipped', () => { called = true; }, { optional: true, safeMode: true });
  assert.equal(called, false);
});
test('a required startup failure enters the crash flow', async t => {
  const crash = new CrashReport(fixture(t)); let captured;
  await guardStartup(() => crash.startupStep('window', () => { throw Error('window failed'); }), error => { captured = error; });
  assert.equal(captured.message, 'window failed'); assert.equal(crash.step, 'window');
});
test('two unfinished launches enable safe mode and a ready window clears the marker', t => {
  const root = fixture(t);
  assert.equal(new CrashReport(root).begin(), false);
  assert.equal(new CrashReport(root).begin(), false);
  const third = new CrashReport(root);
  assert.equal(third.begin(), true);
  third.ready();
  assert.equal(new CrashReport(root).begin(), false);
});
test('safe mode never restores, removes or overwrites the saved workspace', async t => {
  const root = fixture(t), file = path.join(root, 'workspace.json'), saved = '{"saved":"original"}';
  fs.writeFileSync(file, saved);
  const sessions = new EventEmitter(); sessions.savedConsoles = () => []; sessions.scanEvents = () => {}; sessions.grid = {};
  const workspace = new Workspace(root, sessions, {}, { readOnly: true });
  await workspace.restore(); sessions.emit('changed'); workspace.setEnabled(false); workspace.save(); workspace.freeze();
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
});
test('detects supported agents independently of setup state', t => {
  const root = fixture(t);
  const found = detectAgents(root, { platform: 'linux', locate: agent => ['codex', 'gemini'].includes(agent.id) ? `/bin/${agent.command}` : null });
  assert.deepEqual(found.map(item => item.id), ['codex', 'gemini']);
});
test('terminal commands use the fixed prompt and safe platform wrappers', () => {
  const agent = { id: 'codex', executable: 'C:\\Program Files\\Agent & Co\\codex.cmd' };
  const wt = terminalCommand(agent, 'C:\\Users\\A & B\\crash', { platform: 'win32', findProgram: name => name === 'wt.exe' ? 'wt.exe' : null });
  assert.deepEqual(wt.args.slice(0, 2), ['-d', 'C:\\Users\\A & B\\crash']);
  let script = Buffer.from(wt.args.at(-1), 'base64').toString('utf16le');
  assert.ok(script.includes(PROMPT)); assert.ok(script.includes("'C:\\Program Files\\Agent & Co\\codex.cmd'"));
  const fallback = terminalCommand(agent, 'C:\\Users\\A & B\\crash', { platform: 'win32', findProgram: () => null });
  assert.match(fallback.args.at(-1), /start "Paddock diagnosis" \/D \. cmd \/k/);
  assert.ok(!fallback.args.at(-1).includes('A & B'));
  const mac = terminalCommand({ id: 'codex', executable: "/tmp/agent's cli" }, '/tmp/crash folder', { platform: 'darwin' });
  assert.equal(mac.executable, 'osascript'); assert.ok(mac.args[1].includes(PROMPT));
  const attempted = [];
  const linux = terminalCommand({ id: 'kiro', executable: '/bin/kiro' }, '/tmp/report', { platform: 'linux', findProgram: name => { attempted.push(name); return name === 'konsole' ? '/bin/konsole' : null; } });
  assert.deepEqual(attempted, ['x-terminal-emulator', 'gnome-terminal', 'konsole']);
  assert.deepEqual(linux.args, ['-e', '/bin/kiro', 'chat', PROMPT]);
  for (const [id, flag] of [['opencode', '--prompt'], ['gemini', '--prompt-interactive']]) {
    const command = terminalCommand({ id, executable: '/bin/agent' }, '/tmp/report', { platform: 'linux', findProgram: () => '/bin/terminal' });
    assert.deepEqual(command.args.slice(-2), [flag, PROMPT]);
  }
  for (const command of [wt, fallback, mac, linux]) assert.doesNotMatch(JSON.stringify(command), /skip-permissions|dangerously|--auto|--force|--trust-tools|yolo/);
});
test('agent choice and missing agent fallback use dialogs without starting real processes', async () => {
  const opened = [], calls = [], agents = [{ id: 'codex', name: 'Codex', executable: 'codex' }, { id: 'gemini', name: 'Gemini', executable: 'gemini' }];
  const dialog = { showMessageBox: async options => { calls.push(options); return { response: 1 }; } };
  const shell = { openPath: async value => opened.push(value), openExternal: async value => opened.push(value) };
  let selected;
  await diagnose('/report', { root: '/data', dialog, shell, findAgents: () => agents, terminal: agent => { selected = agent.id; return { executable: 'mock', args: [], cwd: '/report' }; }, launch: () => { const child = new EventEmitter(); child.unref = () => {}; process.nextTick(() => child.emit('spawn')); return child; } });
  assert.equal(selected, 'gemini'); assert.deepEqual(calls[0].buttons, ['Codex', 'Gemini', 'Cancel']);
  await diagnose('/report', { root: '/data', dialog, shell, findAgents: () => [] });
  assert.deepEqual(opened, [ISSUE_URL]);
});
