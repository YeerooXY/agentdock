'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFile } = require('node:child_process');
const { programLaunch } = require('./platform.cjs');

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
  const done = (error, stdout, stderr) => { // OpenCode prints the org list to stderr
    consoleState.running = false; consoleState.checked = Date.now();
    consoleState.signedIn = !error && /org_[A-Za-z0-9]{6,}/.test(`${stdout || ''}\n${stderr || ''}`); // colour codes sit right before org_
  };
  // A .cmd shim cannot be started directly on Windows (spawn EINVAL); programLaunch wraps it.
  // A failed check only means "not signed in"; it must never throw into the caller.
  try { const launch = programLaunch(executable, ['console', 'orgs']); run(launch.executable, launch.args, { windowsHide: true, timeout: 15_000 }, done); }
  catch (error) { done(error); }
}
function openCodeSignedIn({ executable, env, home, run, now } = {}) {
  try { refreshConsole(executable, { run, now }); } catch {}
  return credentialsFile({ env, home }) || consoleState.signedIn;
}
module.exports = { openCodeSignedIn, consoleState };
