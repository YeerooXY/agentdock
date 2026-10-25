'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sessions } = require('../electron/sessions.cjs');
const { CodePanel } = require('../electron/code-panel.cjs');
const { Turns } = require('../electron/turns.cjs');
const { Workspace } = require('../electron/workspace.cjs');
const parent = path.resolve(__dirname, '../test-data'); fs.mkdirSync(parent, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(parent, 'code-panel-')), project = path.join(root, 'project'); fs.mkdirSync(project);
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  const sessions = new Sessions(root, { pty: { spawn() { throw new Error('A code panel must not spawn a process.'); } } });
  const source = { id: 'source', consoleKey: 'source-key', cwd: project, alive: true, provider: 'codex', name: 'Example', slot: 1, width: 1, height: 1, permissions: 'default' };
  sessions.items.set(source.id, source);
  const panel = sessions.createCodePanel({ cwd: project, codeSourceKey: source.consoleKey, slot: 2 });
  const service = new CodePanel(sessions, { getSecrets: () => ['private-value-in-source'] });
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { windowsHide: true, encoding: 'utf8' });
  const write = (name, text) => fs.writeFileSync(path.join(project, name), text);
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Fixture');
  write('app.js', 'export const value = 1;\n'); git('add', '.'); git('commit', '-qm', 'baseline');
  return { root, project, sessions, source, panel, service, git, write };
}
test('code panel distinguishes working-tree changes from turn changes with Results capture off', async t => {
  const f = fixture(t); f.write('app.js', 'export const value = 2;\n'); f.write('new.txt', 'new');
  let report = await f.service.report(f.panel.id);
  assert.equal(report.mode, 'working'); assert.equal(report.changes.length, 2); assert.equal(report.changes[0].before, undefined);
  let file = await f.service.file(f.panel.id, 'app.js', report.id); assert.match(file.before, /value = 1/); assert.match(file.after, /value = 2/);
  const results = { items: [], add() { throw new Error('Code panels must not create Results entries.'); } };
  const turns = new Turns(results, { getSession: id => f.sessions.items.get(id), enabled: false }); turns.codePanel = f.service;
  await turns.begin(f.source.id); f.write('app.js', 'export const value = 3;\n'); fs.unlinkSync(path.join(f.project, 'new.txt'));
  await turns.finish(f.source.id); report = await f.service.report(f.panel.id);
  assert.equal(report.mode, 'turn'); assert.equal(report.changes.length, 2); assert.match(report.notes.join(' '), /other editors/);
  file = await f.service.file(f.panel.id, 'app.js', report.id); assert.match(file.before, /value = 2/); assert.match(file.after, /value = 3/);
  assert.equal((await f.service.file(f.panel.id, 'new.txt', report.id)).after, '');
  assert.equal(f.git('status', '--porcelain').includes('app.js'), true);
  await assert.rejects(f.service.file(f.panel.id, 'app.js', 'old-report'), /updated/);
});
test('file browsing stays inside the source folder and excludes credentials, binaries and large files', async t => {
  const f = fixture(t); f.write('.env', 'TOP_SECRET=private'); f.write('normal.js', 'const example="private-value-in-source"');
  f.write('secret.pem', 'private'); f.write('large.txt', 'x'.repeat(300000)); f.write('binary.dat', Buffer.from([0, 1, 2]));
  fs.mkdirSync(path.join(f.project, 'node_modules')); fs.writeFileSync(path.join(f.root, 'outside.txt'), 'outside');
  const directory = await f.service.browse(f.panel.id);
  assert.equal(directory.items.some(x => ['.env', 'secret.pem', 'node_modules', '.git'].includes(x.name)), false);
  for (const p of ['../outside.txt', '.env', 'secret.pem', 'C:/Windows/win.ini', 'app.js:stream']) await assert.rejects(f.service.file(f.panel.id, p));
  for (const p of ['large.txt', 'binary.dat']) await assert.rejects(f.service.file(f.panel.id, p));
  assert.equal((await f.service.file(f.panel.id, 'normal.js')).after, 'const example="[redacted]"');
  fs.symlinkSync(f.root, path.join(f.project, 'outside-link'), 'junction');
  await assert.rejects(f.service.file(f.panel.id, 'outside-link/outside.txt'), /outside/);
  fs.unlinkSync(path.join(f.project, 'outside-link'));
  fs.mkdirSync(path.join(f.project, '.codex')); fs.writeFileSync(path.join(f.project, '.codex/auth.json'), 'private login fixture');
  fs.symlinkSync(path.join(f.project, '.codex'), path.join(f.project, 'internal-link'), 'junction');
  await assert.rejects(f.service.file(f.panel.id, 'internal-link/auth.json'), /excluded/);
  fs.writeFileSync(path.join(f.project, '.codex/renamed.txt'), 'private login fixture');
  await assert.rejects(f.service.file(f.panel.id, 'internal-link/renamed.txt'), /excluded/);
  fs.unlinkSync(path.join(f.project, 'internal-link'));
});

test('renaming a private file does not expose its Git history in a code panel', async t => {
  const f = fixture(t); f.write('auth.json', '{"private":"fixture"}'); f.git('add', 'auth.json'); f.git('commit', '-qm', 'private fixture');
  f.git('mv', 'auth.json', 'public.json');
  const report = await f.service.report(f.panel.id);
  assert.equal(report.changes.some(x => x.file === 'public.json'), false);
});
test('code panels share grid layout, restore encrypted placement, and close without ending an agent', async t => {
  const f = fixture(t); f.sessions.layout({ id: f.panel.id, slot: 3, width: 1, height: 2 });
  assert.equal(f.sessions.list().length, 1); assert.equal(f.sessions.codePanels()[0].slot, 3);
  assert.throws(() => f.sessions.write(f.panel.id, 'execute'), /read-only/);
  const crypto = { isEncryptionAvailable: () => true, encryptString: x => Buffer.from(x), decryptString: x => x.toString() };
  // Only this no-process panel is persisted by the fixture.
  f.sessions.items.delete(f.source.id);
  const ws = new Workspace(f.root, f.sessions, crypto); ws.save(); ws.freeze();
  const restored = new Sessions(f.root, { pty: { spawn() { throw new Error('restore spawned a CLI'); } } });
  const restore = new Workspace(f.root, restored, crypto); await restore.restore(); restore.freeze();
  assert.equal(restored.codePanels()[0].codeSourceKey, 'source-key'); assert.equal(restored.codePanels()[0].height, 2);
  f.sessions.items.set(f.source.id, f.source); f.sessions.end(f.panel.id);
  assert.equal(f.source.alive, true); assert.equal(f.sessions.codePanels().length, 0);
  await restored.stop();
});
