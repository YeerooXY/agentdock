'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openCodeAllowanceCredential } = require('../electron/opencode-allowance.cjs');
const { readOpenCodeUsage, readOpenCodeAccount } = require('../electron/subscription-usage.cjs');
function fixture(t, values = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-go-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = path.join(home, '.local/share/opencode'); fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'opencode.db'));
  db.exec('CREATE TABLE account(id TEXT PRIMARY KEY,url TEXT,access_token TEXT,token_expiry INTEGER); CREATE TABLE account_state(id INTEGER PRIMARY KEY,active_account_id TEXT,active_org_id TEXT)');
  db.prepare('INSERT INTO account VALUES(?,?,?,?)').run('active', values.url || 'https://opencode.ai/console', 'private-active-token', values.expiry ?? 2000);
  db.prepare('INSERT INTO account VALUES(?,?,?,?)').run('inactive', 'https://opencode.ai/console', 'private-other-token', 2000);
  db.prepare('INSERT INTO account_state VALUES(1,?,?)').run('active', 'org_fixture'); db.close();
  return { home, env: {}, now: 1000 };
}
test('native Console allowance uses only the selected account/workspace without changing its database', t => {
  const options = fixture(t), file = path.join(options.home, '.local/share/opencode/opencode.db'), before = fs.readFileSync(file);
  assert.deepEqual(openCodeAllowanceCredential(options), { key: 'private-active-token', orgId: 'org_fixture', source: 'OpenCode Console sign-in' });
  assert.deepEqual(fs.readFileSync(file), before);
});
test('expired and custom-server native logins never supply credentials to the public endpoint', t => {
  assert.throws(() => openCodeAllowanceCredential(fixture(t, { expiry: 1000 })), e => e.code === 'sign-in' && !e.message.includes('private-'));
  assert.throws(() => openCodeAllowanceCredential(fixture(t, { url: 'https://other.example/console' })), e => e.code === 'unsupported');
});
test('native Go key fallback ignores other providers and honors XDG_DATA_HOME', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-go-auth-')); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const base = path.join(home, 'data'), dir = path.join(base, 'opencode'); fs.mkdirSync(dir, { recursive: true });
  const auth = path.join(dir, 'auth.json');
  fs.writeFileSync(auth, JSON.stringify({ anthropic: { type: 'api', key: 'not-go' } }));
  assert.equal(openCodeAllowanceCredential({ home, env: { XDG_DATA_HOME: base } }), null);
  fs.writeFileSync(auth, JSON.stringify({ 'opencode-go': { type: 'api', key: 'native-go' } }));
  assert.equal(openCodeAllowanceCredential({ home, env: { XDG_DATA_HOME: base } }).key, 'native-go');
});
test('allowance request binds OAuth to its workspace and exposes only normalized quota', async () => {
  const fetchUsage = async (url, options) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-opencode-org-id'], 'org_fixture');
    assert.equal(options.headers.Authorization, 'Bearer private-active-token');
    return new Response(JSON.stringify({ usage: { rolling: { status: 'ok', percent: 12 } }, extraSecret: 'private-active-token' }));
  };
  const values = await readOpenCodeAccount({ key: 'private-active-token', orgId: 'org_fixture', fetchUsage });
  assert.equal(values[0].windows[0].usedPercent, 12); assert.ok(!JSON.stringify(values).includes('private-active-token'));
});
test('usage reader reuses native login without requiring a second vault key', async () => {
  const run = (exe, args, options, done) => { const child = { stdin: { end() {} } }; setImmediate(() => done(null, '')); return child; };
  const result = await readOpenCodeUsage({ executable: 'opencode', run, getKey: () => null, getCredential: () => ({ key: 'native', orgId: 'org_fixture' }), fetchUsage: async () => new Response(JSON.stringify({ usage: { monthly: { status: 'ok', percent: 23 } } })) });
  assert.equal(result.missing, false); assert.equal(result.values[0].windows[2].usedPercent, 23);
  const failed = await readOpenCodeUsage({ executable: 'opencode', run, getCredential: () => { throw new Error('private-token'); } });
  assert.ok(!JSON.stringify(failed).includes('private-token')); assert.equal(failed.error.code, 'unavailable');
});

test('the selected native workspace takes precedence over a legacy vault key', async () => {
  let legacyReads = 0;
  const result = await readOpenCodeUsage({ getKey: () => { legacyReads++; return 'old-account'; },
    getCredential: () => ({ key: 'selected-account', orgId: 'org_selected' }),
    fetchUsage: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer selected-account');
      assert.equal(options.headers['x-opencode-org-id'], 'org_selected');
      return new Response(JSON.stringify({ usage: { rolling: { status: 'ok', percent: 10 } } }));
    } });
  assert.equal(legacyReads, 0); assert.equal(result.values[0].windows[0].usedPercent, 10);
  const fallback = await readOpenCodeUsage({ getCredential: () => null, getKey: () => 'legacy-only',
    fetchUsage: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer legacy-only');
      assert.equal(options.headers['x-opencode-org-id'], undefined);
      return new Response(JSON.stringify({ usage: { rolling: { status: 'ok', percent: 15 } } }));
    } });
  assert.equal(fallback.values[0].windows[0].usedPercent, 15);
});
