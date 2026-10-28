'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openCodeSignedIn } = require('../electron/opencode-auth.cjs');

test('OpenCode sign-in checks only credentials file presence', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-opencode-auth-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const folder = path.join(home, '.local', 'share', 'opencode');
  assert.equal(openCodeSignedIn({ home, env: {} }), false);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'auth.json'), 'not parsed');
  assert.equal(openCodeSignedIn({ home, env: {} }), true);
  assert.equal(openCodeSignedIn({ home, env: { XDG_DATA_HOME: path.join(home, 'other') } }), false);
});

test('OpenCode console sign-in is detected from the org list in the background and cached', t => {
  const { consoleState } = require('../electron/opencode-auth.cjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-opencode-auth-'));
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); Object.assign(consoleState, { signedIn: false, checked: 0, running: false }); });
  const calls = [];
  let reply;
  const run = (file, args, options, done) => { calls.push(args.join(' ')); reply = done; };
  assert.equal(openCodeSignedIn({ executable: 'opencode', home, env: {}, run, now: Date.now() }), false);
  // OpenCode writes the coloured org list to stderr.
  reply(null, '', '  \u001b[92m●\u001b[0m Personal  [someone]  \u001b[90morg_01ABCDEF\u001b[0m\n');
  assert.equal(openCodeSignedIn({ executable: 'opencode', home, env: {}, run, now: Date.now() }), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /console'? '?orgs/);
  consoleState.checked = 0;
  openCodeSignedIn({ executable: 'opencode', home, env: {}, run, now: Date.now() });
  reply(new Error('not signed in'), '');
  assert.equal(openCodeSignedIn({ executable: 'opencode', home, env: {}, run, now: Date.now() }), false);
});

test('a failing OpenCode sign-in check never throws and counts as signed out', t => {
  const { consoleState } = require('../electron/opencode-auth.cjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-opencode-auth-'));
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); Object.assign(consoleState, { signedIn: false, checked: 0, running: false }); });
  const run = () => { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }); };
  assert.equal(openCodeSignedIn({ executable: 'C:\agents\opencode.cmd', home, env: {}, run, now: Date.now() }), false);
  assert.equal(consoleState.running, false);
});
