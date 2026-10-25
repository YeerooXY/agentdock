'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { userDataPath } = require('../electron/user-data.cjs');

function fixture(t) {
  const parent = path.resolve(__dirname, '..', 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'user-data-'));
  const current = path.join(root, 'Paddock'), legacy = path.join(root, 'Agent Dock');
  const write = (directory, file, value) => {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, current, legacy, write };
}

test('the rename retains legacy projects when Chromium already created the Paddock folder', t => {
  const f = fixture(t), projects = '[{"id":"existing-project","name":"Existing project"}]';
  f.write(f.legacy, 'projects.json', projects);
  f.write(f.current, 'Local State', '{}');
  f.write(f.current, 'Cache/entry', 'cache');
  f.write(f.current, 'limits.json', '[]');
  assert.equal(userDataPath(f.root, f.current), f.legacy);
  assert.equal(fs.readFileSync(path.join(f.legacy, 'projects.json'), 'utf8'), projects);
  assert.equal(fs.existsSync(path.join(f.current, 'projects.json')), false, 'Selection must not move or copy saves');
});

test('a new installation uses Paddock and does not create data during selection', t => {
  const f = fixture(t);
  assert.equal(userDataPath(f.root, f.current), f.current);
  assert.deepEqual(fs.readdirSync(f.root), []);
  f.write(f.legacy, 'Cache/entry', 'cache');
  assert.equal(userDataPath(f.root, f.current), f.current);
});

test('an established Paddock workspace keeps its current conversations', t => {
  const f = fixture(t), workspace = '{"encrypted":"saved-workspace"}';
  f.write(f.legacy, 'projects.json', '[{"id":"older-project"}]');
  f.write(f.current, 'workspace.json', workspace);
  assert.equal(userDataPath(f.root, f.current), f.current);
  assert.equal(fs.readFileSync(path.join(f.current, 'workspace.json'), 'utf8'), workspace);
});

test('an intentionally empty project list and damaged current saves stay in the current profile', t => {
  const f = fixture(t);
  f.write(f.legacy, 'projects.json', '[{"id":"older-project"}]');
  for (const value of ['[]', 'damaged JSON']) {
    f.write(f.current, 'projects.json', value);
    assert.equal(userDataPath(f.root, f.current), f.current);
    assert.equal(fs.readFileSync(path.join(f.current, 'projects.json'), 'utf8'), value);
  }
});

test('settings, credentials and nested saved results also identify an established profile', t => {
  const f = fixture(t);
  f.write(f.legacy, 'projects.json', '[]');
  for (const file of ['settings.json', 'vault.json', 'shared.json', 'results/index.json', 'ssh/hosts.json']) {
    const current = path.join(f.root, file.replace(/[/\.]/g, '-'));
    f.write(current, file, '{}');
    assert.equal(userDataPath(f.root, current), current);
  }
});

test('filesystem errors do not silently switch to another profile', t => {
  const f = fixture(t);
  f.write(f.legacy, 'projects.json', '[]');
  fs.writeFileSync(f.current, 'not a directory');
  assert.throws(() => userDataPath(f.root, f.current));
  assert.equal(fs.readFileSync(f.current, 'utf8'), 'not a directory');
});
