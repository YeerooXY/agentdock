'use strict';
// How consoles start programs on each system. Windows runs them through
// PowerShell; macOS and Linux use the user's own login shell.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const isWindows = process.platform === 'win32';
const psQuote = text => "'" + String(text).replaceAll("'", "''") + "'";
const shQuote = text => "'" + String(text).replaceAll("'", "'\"'\"'") + "'";
const quote = isWindows ? psQuote : shQuote;
const powershell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function userShell(env = process.env) {
  const preferred = env.SHELL;
  if (preferred && path.isAbsolute(preferred) && fs.existsSync(preferred)) return preferred;
  return ['/bin/zsh', '/bin/bash', '/bin/sh'].find(file => fs.existsSync(file)) || '/bin/sh';
}
// An interactive shell console.
function shellLaunch() {
  return isWindows ? { executable: powershell(), args: ['-NoLogo', '-NoProfile'] } : { executable: userShell(), args: ['-l'] };
}
// A program with arguments. Windows scripts (.cmd, .ps1) run through PowerShell.
function programLaunch(program, args, { bypass = false } = {}) {
  if (!isWindows || program.toLowerCase().endsWith('.exe')) return { executable: program, args };
  return { executable: powershell(), args: ['-NoLogo', '-NoProfile', ...(bypass ? ['-ExecutionPolicy', 'Bypass'] : []), '-Command', `& ${psQuote(program)} ${args.map(psQuote).join(' ')}`] };
}
// A user-written command. The console stays open in a shell afterwards.
function customLaunch(command) {
  if (isWindows) return { executable: powershell(), args: ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')] };
  const shell = userShell();
  return { executable: shell, args: ['-l', '-c', `${command}\nexec ${shQuote(shell)} -l`] };
}
// Apps opened from the macOS Dock or a Linux launcher get a minimal PATH.
// Read the login shell's PATH once so installed agents and Node are found.
function loginPath({ env = process.env, run = spawnSync } = {}) {
  if (isWindows) return env.PATH || '';
  const extras = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  let shellPath = '';
  try {
    const marker = '__PADDOCK_PATH__';
    const result = run(userShell(env), ['-ilc', `printf '${marker}%s${marker}' "$PATH"`], { encoding: 'utf8', timeout: 5000, env });
    shellPath = new RegExp(`${marker}(.*)${marker}`).exec(result.stdout || '')?.[1] || '';
  } catch {}
  const parts = [...shellPath.split(path.delimiter), ...(env.PATH || '').split(path.delimiter), ...extras].filter(Boolean);
  return [...new Set(parts)].join(path.delimiter);
}
// Where Electron's safeStorage keeps its key on this system.
function secureStore() {
  return { win32: 'your Windows account', darwin: 'the macOS Keychain' }[process.platform] || 'your system keyring';
}
function encryptionUnavailable(detail = '') {
  const fix = process.platform === 'linux' ? ' Install and unlock a keyring such as GNOME Keyring or KWallet, then restart Paddock.' : '';
  return `Paddock needs encryption through ${secureStore()}, which is unavailable.${detail ? ' ' + detail : ''}${fix}`;
}
// The real location of a folder Paddock owns. macOS temp folders sit behind a
// /private symlink and Windows may report 8.3 short names; checks that refuse
// redirected folders compare against this resolved path.
function realRoot(folder) {
  try { return fs.realpathSync.native(folder); } catch { return path.resolve(folder); }
}
module.exports = { realRoot, secureStore, encryptionUnavailable, isWindows, psQuote, shQuote, quote, powershell, userShell, shellLaunch, programLaunch, customLaunch, loginPath };
