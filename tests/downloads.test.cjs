'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ManagedDownloads, repositoryUrl, cloneRepository } = require('../electron/managed-downloads.cjs');
const { creativeTools } = require('../electron/creative-tools.cjs');
const { SharedHub } = require('../electron/shared.cjs');
function root(t) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-downloads-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory; }
test('Git download starts without a shell, inherited provider secrets or repository checkout hooks', async t => {
  const directory = root(t), destination = path.join(directory, 'tool with spaces'); let call;
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'PRIVATE_TEST_VALUE';
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  await cloneRepository('https://github.com/storytold/photocraft', destination, directory, (command, args, options) => {
    call = { command, args, options }; const child = new (require('node:events').EventEmitter)(); child.kill = () => {};
    queueMicrotask(() => child.emit('exit', 0)); return child;
  });
  assert.equal(call.command, 'git'); assert.equal(call.options.shell, false); assert.equal(call.options.env.OPENAI_API_KEY, undefined);
  assert.equal(fs.readFileSync(call.options.env.GIT_CONFIG_GLOBAL, 'utf8'), '');
  assert.ok(call.args.includes(`core.hooksPath=${path.join(directory, 'disabled-git-hooks')}`));
  assert.deepEqual(call.args.slice(-3), ['--', 'https://github.com/storytold/photocraft', destination]);
});
test('managed repository downloads record exact sources/locations and never overwrite an existing directory', async t => {
  const directory = root(t), calls = [];
  const downloads = new ManagedDownloads(directory, { clone: async (source, destination) => { calls.push(source); fs.mkdirSync(path.join(destination, '.git'), { recursive: true }); fs.writeFileSync(path.join(destination, 'user-edit.txt'), 'KEEP'); } });
  const item = await downloads.download({ source: 'https://github.com/storytold/photocraft.git', name: 'PhotoCraft' });
  assert.equal(item.source, 'https://github.com/storytold/photocraft'); assert.equal(item.state, 'downloaded');
  assert.ok(item.directory.startsWith(downloads.directory + path.sep));
  await assert.rejects(downloads.download({ source: item.source }), /already exists/); assert.equal(calls.length, 1);
  const reopened = new ManagedDownloads(directory); assert.equal(reopened.list().length, 1);
  const report = fs.readFileSync(reopened.report, 'utf8'); assert.ok(report.includes(item.source) && report.includes(item.directory));
  assert.match(report, /No downloaded repository or tool is deleted automatically/);
  assert.equal(fs.readFileSync(path.join(item.directory, 'user-edit.txt'), 'utf8'), 'KEEP');
  for (const value of ['https://token@github.com/org/repo', 'https://github.com/org/repo/tree/main', 'file:///some/repo', 'https://github.com/org/repo?key=secret']) assert.throws(() => repositoryUrl(value));
});
test('failed downloads remain in the manual cleanup inventory and shared writers preserve each other', async t => {
  const directory = root(t);
  const downloads = new ManagedDownloads(directory, { clone: async (_, destination) => { fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, 'partial'), 'KEEP'); throw Error('offline'); } });
  await assert.rejects(downloads.download({ source: 'https://github.com/storytold/filmcraft' }), /offline/);
  assert.equal(downloads.list()[0].state, 'incomplete'); assert.ok(fs.existsSync(path.join(downloads.list()[0].directory, 'partial')));
  const other = new ManagedDownloads(directory);
  other.record({ name: 'REA', kind: 'npm', source: 'https://www.npmjs.com/package/rea-agents', directory: path.join(directory, 'rea') });
  assert.equal(downloads.list().length, 2);
});
test('uninstall hook is a non-deleting notice and creative recommendations do not create active connections', async t => {
  const config = require('../electron-builder.cjs'); assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  const hook = fs.readFileSync(path.resolve(__dirname, '..', config.nsis.include), 'utf8');
  assert.match(hook, /customUnInit/); assert.match(hook, /IfNot.*Silent/); assert.match(hook, /managed-downloads\.txt/);
  assert.doesNotMatch(hook, /\b(?:RMDir|Delete|ExecWait)\b/);
  const hub = new SharedHub(root(t), { list: () => [] }); t.after(() => hub.close());
  assert.equal(creativeTools.length, 7); assert.equal(hub.snapshot().creativeTools.length, 7);
  assert.equal(hub.config.connections.length, 0); assert.match(hub.summary(), /Use the user's preferred or already configured tools first/);
});
