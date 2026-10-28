'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CodePanel } = require('../electron/code-panel.cjs');
const { validateExplorerWidth } = require('../electron/domain.cjs');

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'paddock-explorer-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'console'), project = path.join(base, 'project'), outside = path.join(base, 'outside');
  await Promise.all([root, project, outside].map(p => fs.mkdir(p)));
  const consoles = [{ id: 'local', alive: true, cwd: root }, { id: 'remote', alive: true, remote: true, cwd: outside }];
  const projects = [{ folders: [{ path: project }] }];
  const created = [];
  const service = new CodePanel({ list: () => consoles, items: new Map(consoles.map(s => [s.id, s])), createCodePanel(raw) { created.push(raw); return raw; } }, { getProjects: () => projects });
  return { base, root, project, outside, consoles, projects, service, created };
}

test('Explorer permits only known project folders and live local console roots', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.service.list(f.root)).entries, []);
  assert.deepEqual((await f.service.list(f.project)).entries, []);
  for (const root of [f.outside, f.base, '.', '', null, `${f.root}${path.sep}..${path.sep}console`]) await assert.rejects(f.service.list(root));
  f.consoles[0].alive = false;
  await assert.rejects(f.service.list(f.root));
  f.consoles[0].alive = true; f.consoles[0].remoteHostId = 'ssh';
  await assert.rejects(f.service.list(f.root));
  f.consoles[0].remoteHostId = null; f.consoles[0].kind = 'code';
  await assert.rejects(f.service.list(f.root));
  f.projects.length = 0;
  await assert.rejects(f.service.list(f.project));
});

test('Explorer rejects traversal, absolute paths and links outside the approved root', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'src'));
  for (const name of ['..', '../outside', 'src/../src', 'src\\..\\src', f.outside, '/etc', 'C:\\Windows', 'file:stream', '\0']) await assert.rejects(f.service.list(f.root, name));
  await fs.symlink(f.outside, path.join(f.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.list(f.root, 'escape'), /outside/);
  assert.equal((await f.service.list(f.root)).entries.some(x => x.name === 'escape'), false);
});

test('Explorer uses Code panel exclusions, sorts folders first and loads one level', async t => {
  const f = await fixture(t);
  for (const dir of ['src', 'node_modules', '.git', '.codex']) await fs.mkdir(path.join(f.root, dir));
  for (const name of ['z.js', 'a.txt', '.env', 'secret.pem', '.npmrc', 'auth.json']) await fs.writeFile(path.join(f.root, name), 'fixture');
  await fs.writeFile(path.join(f.root, 'src/nested.js'), 'fixture');
  const first = await f.service.list(f.root);
  assert.deepEqual(first.entries.map(x => x.name), ['src', 'a.txt', 'z.js']);
  assert.equal(first.truncated, false);
  assert.deepEqual(first.entries[0], { name: 'src', path: 'src', directory: true });
  assert.deepEqual((await f.service.list(f.root, 'src')).entries, [{ name: 'nested.js', path: 'src/nested.js', directory: false }]);
  await assert.rejects(f.service.list(f.root, '.codex'), /excluded/);
  await assert.rejects(f.service.list(f.root, 'z.js'));
});

test('Explorer caps each folder at 500 entries and reports truncation', async t => {
  const f = await fixture(t);
  await Promise.all(Array.from({ length: 501 }, (_, i) => fs.writeFile(path.join(f.root, `${String(i).padStart(3, '0')}.txt`), 'fixture')));
  const result = await f.service.list(f.root);
  assert.equal(result.entries.length, 500); assert.equal(result.truncated, true);
});

test('code.create validates explicit Explorer roots before creating a panel', async t => {
  const f = await fixture(t);
  for (const root of [f.outside, f.base, '.', null, path.join(f.root, 'child')]) assert.throws(() => f.service.create({ root }, f.root));
  assert.equal(f.created.length, 0);
  assert.equal(f.service.create({ root: f.project }, f.root).cwd, f.project);
  assert.equal(f.created[0].codeSourceKey, null);
  assert.equal(f.service.create({ root: f.root, sourceId: 'local' }, f.root).codeSourceKey, null);
  assert.equal(f.service.create({ sourceId: 'local' }, f.project).codeSourceKey, 'local');
  assert.throws(() => f.service.create({ sourceId: 'remote', root: f.root }, f.root));
  f.consoles[0].remoteHostId = 'ssh';
  assert.throws(() => f.service.create({ sourceId: 'local' }, f.root));
  assert.throws(() => f.service.create({ root: f.root }, f.root));
});

test('Explorer settings require an integer width from 180 through 480', () => {
  for (const width of [180, 260, 480]) assert.equal(validateExplorerWidth(width), width);
  for (const width of [179, 481, 260.5, '260', null, undefined, NaN, Infinity]) assert.throws(() => validateExplorerWidth(width));
});

test('Explorer folder errors exclude absolute filesystem paths', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'file.txt'), 'fixture');
  await fs.mkdir(path.join(f.root, 'deleted'));
  await fs.rmdir(path.join(f.root, 'deleted'));
  for (const name of ['file.txt', 'deleted']) await assert.rejects(f.service.list(f.root, name), error => {
    assert.equal(error.message, 'Choose a folder inside this root.'); return true;
  });
});
