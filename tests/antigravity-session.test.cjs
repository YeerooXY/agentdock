'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { atomicJson } = require('../electron/storage.cjs');
const { cachedAntigravityConversation, prepareAntigravityTracking, antigravityHookCommand } = require('../electron/antigravity-session.cjs');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-agy-session-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(home)), fs.realpathSync(os.tmpdir())); fs.rmSync(home, { recursive: true, force: true }); });
  return home;
}
test('legacy recovery requires an exact workspace cache entry and an existing UUID database', t => {
  const home = fixture(t), cwd = path.join(home, 'project'), id = crypto.randomUUID();
  const cache = path.join(home, '.gemini/antigravity-cli/cache/last_conversations.json');
  const db = path.join(home, '.gemini/antigravity-cli/conversations', id + '.db');
  atomicJson(cache, { [cwd]: id });
  assert.equal(cachedAntigravityConversation(cwd, home), null);
  fs.mkdirSync(path.dirname(db), { recursive: true }); fs.writeFileSync(db, '');
  assert.equal(cachedAntigravityConversation(cwd, home), id);
  assert.equal(cachedAntigravityConversation(path.join(cwd, 'child'), home), null);
  atomicJson(cache, { [cwd]: '../different' }); assert.equal(cachedAntigravityConversation(cwd, home), null);
  atomicJson(cache, { [cwd]: id, [cwd + path.sep]: crypto.randomUUID() }); assert.equal(cachedAntigravityConversation(cwd, home), null);
  fs.writeFileSync(cache, '{broken'); assert.equal(cachedAntigravityConversation(cwd, home), null);
});
test('managed hooks preserve user hooks, are idempotent and respect disabled or conflicting entries', t => {
  const home = fixture(t), runtime = { node: process.execPath, event: path.resolve(__dirname, '../electron/agent-event.cjs') };
  const file = path.join(home, '.gemini/config/hooks.json'), user = { local: { PreInvocation: [{ type: 'command', command: 'user-tool' }] } };
  atomicJson(file, user); const before = fs.readFileSync(file, 'utf8');
  assert.equal(prepareAntigravityTracking(home, runtime).changed, true);
  const config = JSON.parse(fs.readFileSync(file)); assert.deepEqual(config.local, user.local);
  assert.equal(fs.readFileSync(file + '.paddock-backup', 'utf8'), before);
  assert.equal(prepareAntigravityTracking(home, runtime).changed, false);
  config['paddock-conversation'].enabled = false; atomicJson(file, config);
  assert.equal(prepareAntigravityTracking(home, runtime).disabled, true);
  config['paddock-conversation'] = { SessionStart: [{ command: 'user-tool' }] }; atomicJson(file, config);
  assert.throws(() => prepareAntigravityTracking(home, runtime), /different/);
});
test('native hook records only the matching Paddock conversation, without message data', t => {
  const home = fixture(t), session = crypto.randomUUID(), launch = crypto.randomUUID(), id = crypto.randomUUID();
  const runtime = { node: process.execPath, event: path.resolve(__dirname, '../electron/agent-event.cjs') };
  const command = antigravityHookCommand(runtime);
  const env = { ...process.env, PADDOCK_DATA_DIR: home, PADDOCK_SESSION_ID: session, PADDOCK_LAUNCH_ID: launch, PADDOCK_CLI_PROVIDER: 'antigravity' };
  const file = path.join(home, 'events', `${session}.${launch}.identity.json`);
  const invoke = (input, extra = {}) => spawnSync(command, { shell: true, env: { ...env, ...extra }, input: JSON.stringify(input), encoding: 'utf8', timeout: 10000, windowsHide: true });
  const input = { conversationId: id, workspacePaths: [home], transcriptPath: 'PRIVATE_TRANSCRIPT', prompt: 'PRIVATE_PROMPT' };
  const result = invoke(input); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /\{\}/);
  const text = fs.readFileSync(file, 'utf8'); assert.equal(JSON.parse(text).providerSessionId, id); assert.doesNotMatch(text, /PRIVATE/);
  assert.equal(invoke(input).status, 0); assert.equal(fs.readFileSync(file, 'utf8'), text);
  invoke({ ...input, conversationId: crypto.randomUUID(), parentConversationId: id });
  invoke({ ...input, conversationId: crypto.randomUUID() }, { PADDOCK_CLI_PROVIDER: 'codex' });
  invoke({ conversationId: '../invalid' }); assert.equal(fs.readFileSync(file, 'utf8'), text);
});
