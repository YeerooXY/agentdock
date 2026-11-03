'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { CredentialSwitch, credentialEmail } = require('../electron/credential-switch.cjs');
const { buildUsageReaders } = require('../electron/usage-readers.cjs');

const TARGET = 'gemini:antigravity', WORK = '11111111-1111-4111-8111-111111111111', HOME = '22222222-2222-4222-8222-222222222222';
const login = email => ({ user: 'antigravity', persist: 2, blob: Buffer.from(JSON.stringify({ token: { refresh_token: 'r-' + email }, auth_method: 'oauth', id_token_email: email })) });
function fixture(t, { inUse = () => [], encryption = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-credential-switch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new Map([[TARGET, login('main@example.com')]]), writes = [];
  const credentials = {
    readCredential: async target => store.get(target) || null,
    writeCredential: async (target, value) => { writes.push(credentialEmail(value.blob)); store.set(target, { user: value.user, persist: value.persist, blob: Buffer.from(value.blob) }); },
    deleteCredential: async target => { writes.push(null); store.delete(target); }
  };
  const safeStorage = { isEncryptionAvailable: () => encryption, encryptString: value => Buffer.from('sealed:' + Buffer.from(value).toString('base64')), decryptString: value => Buffer.from(String(value).slice(7), 'base64').toString() };
  const sw = new CredentialSwitch(root, { safeStorage, credentials, providers: { antigravity: { target: TARGET, name: 'Antigravity' } }, inUse, platform: 'win32' });
  const current = () => store.has(TARGET) ? credentialEmail(store.get(TARGET).blob) : null;
  return { root, store, sw, current, writes };
}

test('a new account signs in with the CLI signed out, and the default sign-in is kept', async t => {
  const { sw, store, current, root } = fixture(t);
  await sw.activate('antigravity', WORK);
  assert.equal(current(), null, 'the new account starts signed out');
  store.set(TARGET, login('work@example.com'));
  assert.deepEqual(await sw.completeLogin('antigravity', WORK), { completed: true, email: 'work@example.com' });
  await sw.release('antigravity');
  assert.equal(current(), 'main@example.com', 'the default account is back for CLIs started outside Paddock');
  await sw.activate('antigravity', WORK);
  assert.equal(current(), 'work@example.com');
  for (const file of fs.readdirSync(path.join(root, 'credential-slots', 'antigravity'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'credential-slots', 'antigravity', file), 'utf8'), /refresh_token|example\.com/, 'saved sign-ins are encrypted');
  }
});

test('a refreshed token is saved under the account its email names, not the active one', async t => {
  const { sw, store, current } = fixture(t);
  await sw.activate('antigravity', WORK); store.set(TARGET, login('work@example.com')); await sw.completeLogin('antigravity', WORK);
  // A CLI started outside Paddock rewrites the default account's token while Work is active.
  store.set(TARGET, { ...login('main@example.com'), blob: Buffer.from(JSON.stringify({ token: { refresh_token: 'newer' }, id_token_email: 'main@example.com' })) });
  await sw.activate('antigravity', 'antigravity:default');
  assert.equal(current(), 'main@example.com');
  await sw.activate('antigravity', WORK);
  assert.equal(current(), 'work@example.com', 'Work kept its own sign-in');
  await sw.activate('antigravity', 'antigravity:default');
  assert.match(store.get(TARGET).blob.toString(), /newer/, 'the default account kept its refreshed token');
});

test('the same Google account cannot be added twice', async t => {
  const { sw, store } = fixture(t);
  await sw.activate('antigravity', WORK); store.set(TARGET, login('work@example.com')); await sw.completeLogin('antigravity', WORK);
  await sw.activate('antigravity', HOME); store.set(TARGET, login('work@example.com'));
  const result = await sw.completeLogin('antigravity', HOME);
  assert.equal(result.completed, false); assert.equal(result.duplicate, WORK);
});

test('switching waits for open consoles of the other account', async t => {
  let open = ['antigravity:default'];
  const { sw, current } = fixture(t, { inUse: (provider, except) => open });
  await assert.rejects(sw.activate('antigravity', WORK), { code: 'switch-busy' });
  assert.equal(current(), 'main@example.com', 'nothing changed');
  open = [];
  await sw.activate('antigravity', WORK);
  assert.equal(current(), null);
});

test('switching needs Windows and secure storage', async t => {
  const { sw } = fixture(t, { encryption: false });
  await assert.rejects(sw.activate('antigravity', WORK), /Secure storage is unavailable/);
  sw.platform = 'linux';
  await assert.rejects(sw.activate('antigravity', WORK), /Windows only/);
});

test('usage reads switch to the account and back, and report an open other account', async t => {
  let open = [];
  const { sw, store, current } = fixture(t, { inUse: () => open });
  await sw.activate('antigravity', WORK); store.set(TARGET, login('work@example.com')); await sw.completeLogin('antigravity', WORK); await sw.release('antigravity');
  const seen = [];
  const accounts = { environment: () => ({}) };
  const readers = buildUsageReaders({ executable: () => 'agy', accounts, usageDirectory: os.tmpdir(), codex: async () => [], credentialSwitch: sw,
    impl: { readAntigravityUsage: async () => { seen.push(current()); return [{ provider: 'antigravity', windows: [] }]; } } });
  await readers.antigravity({ id: WORK, provider: 'antigravity' });
  assert.deepEqual(seen, ['work@example.com']);
  assert.equal(current(), 'main@example.com', 'returns to the default account');
  open = ['antigravity:default'];
  await assert.rejects(readers.antigravity({ id: WORK, provider: 'antigravity' }), { code: 'inactive' });
});

test('removing an account deletes its saved sign-in and restores the default', async t => {
  const { sw, store, current, root } = fixture(t);
  await sw.activate('antigravity', WORK); store.set(TARGET, login('work@example.com')); await sw.completeLogin('antigravity', WORK);
  await sw.remove('antigravity', WORK);
  assert.equal(current(), 'main@example.com');
  assert.equal(fs.existsSync(path.join(root, 'credential-slots', 'antigravity', WORK + '.bin')), false);
});
