'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFile } = require('node:child_process');

// Provider keys live in auth.json; a console sign-in lives in OpenCode's database, so ask `console orgs`.
// Neither check reads or keeps credential values. The console check runs in the background and is cached.
const consoleState = { signedIn: false, checked: 0, running: false };
function credentialsFile({ env = process.env, home = os.homedir() } = {}) {
  const data = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(home, '.local', 'share');
  try { return fs.statSync(path.join(data, 'opencode', 'auth.json')).isFile(); } catch { return false; }
}
function refreshConsole(executable, { run = execFile, now = Date.now(), maxAge = 5 * 60_000 } = {}) {
  if (!executable || consoleState.running || now - consoleState.checked < maxAge) return;
  consoleState.running = true;
  run(executable, ['console', 'orgs'], { windowsHide: true, timeout: 15_000 }, (error, stdout) => {
    consoleState.running = false; consoleState.checked = Date.now();
    consoleState.signedIn = !error && /\borg_[A-Za-z0-9]+/.test(String(stdout || ''));
  });
}
function openCodeSignedIn({ executable, env, home, run, now } = {}) {
  refreshConsole(executable, { run, now });
  return credentialsFile({ env, home }) || consoleState.signedIn;
}
module.exports = { openCodeSignedIn, consoleState };
