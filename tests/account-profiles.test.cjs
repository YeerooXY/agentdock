'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AccountProfiles } = require('../electron/account-profiles.cjs');

test('removing a profile deletes only its own folder and record', t => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-profiles-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profiles = new AccountProfiles(root, { home: root, env: {} });
  const work = profiles.create('codex', 'Work'), spare = profiles.create('claude', 'Spare');
  fs.writeFileSync(path.join(work.configDir, 'auth.json'), 'TEST_ONLY');
  assert.deepEqual(profiles.remove(work.id), { id: work.id, provider: 'codex', label: 'Work' });
  assert.equal(fs.existsSync(work.configDir), false);
  assert.equal(fs.existsSync(spare.configDir), true);
  assert.deepEqual(new AccountProfiles(root, { home: root, env: {} }).list().map(x => x.id), [spare.id], 'the removal is saved');
  assert.throws(() => profiles.remove(work.id), /not found/);
  assert.throws(() => profiles.remove('codex:default'), /not found/, 'default accounts are never removed');
});
