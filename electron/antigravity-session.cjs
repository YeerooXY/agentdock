'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { atomicJson } = require('./storage.cjs');
const { psQuote, shQuote } = require('./platform.cjs');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const workspaceKey = value => { const resolved = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; };

function cachedAntigravityConversation(cwd, home = os.homedir()) {
  try {
    const file = path.join(home, '.gemini/antigravity-cli/cache/last_conversations.json');
    if (fs.statSync(file).size > 1024 * 1024) return null;
    const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!cache || Array.isArray(cache) || typeof cache !== 'object') return null;
    const matches = Object.entries(cache).filter(([folder]) => path.isAbsolute(folder) && workspaceKey(folder) === workspaceKey(cwd));
    if (matches.length !== 1 || !uuid(matches[0][1])) return null;
    // Recover only an existing local conversation. Authentication and history
    // remain with Antigravity; never scan other folders or pick a global latest.
    const id = matches[0][1], db = path.join(home, '.gemini/antigravity-cli/conversations', id + '.db');
    const stat = fs.lstatSync(db);
    return stat.isFile() && !stat.isSymbolicLink() ? id : null;
  } catch { return null; }
}

function antigravityHookCommand(runtime, platform = process.platform) {
  const helper = runtime.event || path.join(path.dirname(runtime.tools), 'agent-event.cjs');
  if (platform === 'win32') {
    const script = `$paddockHookInput = [Console]::In.ReadToEnd(); $paddockHookInput | & ${psQuote(runtime.node)} ${psQuote(helper)} antigravity-session`;
    return 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(script, 'utf16le').toString('base64');
  }
  return `${shQuote(runtime.node)} ${shQuote(helper)} antigravity-session`;
}

function prepareAntigravityTracking(home, runtime) {
  const file = path.join(home, '.gemini/config/hooks.json'), key = 'paddock-conversation';
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (before.length > 2_000_000) throw new Error('Antigravity hooks are too large to update automatically.');
  let config;
  try { config = before.trim() ? JSON.parse(before) : {}; } catch { throw new Error('Antigravity hooks.json is not valid JSON.'); }
  if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('Antigravity hooks.json has an unsupported format.');
  const previous = config[key];
  const owned = handler => {
    const command = handler?.command;
    if (typeof command !== 'string') return false;
    const encoded = /^powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ([A-Za-z0-9+/=]+)$/.exec(command);
    const script = encoded ? Buffer.from(encoded[1], 'base64').toString('utf16le') : command;
    return /agent-event\.cjs/.test(script) && /antigravity-session/.test(script);
  };
  if (previous && (!Array.isArray(previous.SessionStart) || !Array.isArray(previous.PreInvocation) || !previous.SessionStart.length || !previous.PreInvocation.length || ![...previous.SessionStart, ...previous.PreInvocation].every(owned))) throw new Error('Antigravity already has a different paddock-conversation hook.');
  if (previous?.enabled === false) return { file, changed: false, disabled: true };
  const handler = { type: 'command', command: antigravityHookCommand(runtime), timeout: 5 };
  config[key] = { SessionStart: [handler], PreInvocation: [handler] };
  const after = JSON.stringify(config, null, 2);
  if (before.trimEnd() === after) return { file, changed: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (before && !fs.existsSync(file + '.paddock-backup')) fs.copyFileSync(file, file + '.paddock-backup', fs.constants.COPYFILE_EXCL);
  atomicJson(file, config);
  return { file, changed: true };
}

module.exports = { cachedAntigravityConversation, prepareAntigravityTracking, antigravityHookCommand, workspaceKey };
