'use strict';
const { spawn } = require('node:child_process');
const { isWindows, psQuote, shQuote } = require('./platform.cjs');

// Ask Codex for the identity/hash of our own hook. Trust only that exact
// definition for this invocation; never edit config.toml or trust other hooks.
function startupHook(node, helper, root, session, launchId) {
  const parts = [node, helper, 'codex-session', root, session, launchId];
  // Codex runs hook commands through the system shell.
  if (!isWindows) return parts.map(shQuote).join(' ');
  const script = `& ${parts.map(psQuote).join(' ')}`;
  return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
}
function prepareCodexSession(executable, { node, helper, root, session, launchId, cwd, env, sqliteHome = null }, { spawnProcess = spawn, timeout = 8000 } = {}) {
  const command = startupHook(node, helper, root, session, launchId);
  const hook = `hooks.SessionStart=[{hooks=[{type="command",command=${JSON.stringify(command)},timeout=10}]}]`;
  return new Promise((resolve, reject) => {
    let child, buffer = '', finished = false;
    const timer = setTimeout(() => finish(new Error('Codex chat tracking timed out.')), timeout);
    function finish(error, value) {
      if (finished) return; finished = true; clearTimeout(timer);
      try { child?.kill(); } catch {} error ? reject(error) : resolve(value);
    }
    function send(message) { child.stdin.write(JSON.stringify(message) + '\n'); }
    try {
      const args = [...(sqliteHome ? ['-c', `sqlite_home=${JSON.stringify(sqliteHome)}`] : []), 'app-server', '-c', hook];
      child = spawnProcess(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.on('error', () => finish(new Error('Codex chat tracking could not start.')));
      child.on('exit', () => finish(new Error('Codex chat tracking closed before setup finished.')));
      child.stdin.on('error', () => finish(new Error('Codex chat tracking disconnected.')));
      child.stderr.on('data', () => {});
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        if (finished) return;
        buffer += data;
        if (buffer.length > 2_000_000) return finish(new Error('Codex hook list is too large.'));
        let end;
        while (!finished && (end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 1) {
            if (message.error) return finish(new Error('Update Codex to enable startup chat tracking.'));
            send({ method: 'initialized', params: {} });
            send({ id: 2, method: 'hooks/list', params: { cwds: [cwd] } });
          } else if (message.id === 2) {
            const owned = (Array.isArray(message.result?.data) ? message.result.data : []).flatMap(entry => Array.isArray(entry?.hooks) ? entry.hooks : []).filter(entry =>
              entry?.source === 'sessionFlags' && entry.eventName === 'sessionStart' && entry.handlerType === 'command' &&
              entry.command === command && entry.enabled === true && entry.async === false && entry.matcher == null && entry.timeoutSec === 10 &&
              typeof entry.key === 'string' && entry.key.length < 2000 && /^sha256:[a-f0-9]{64}$/i.test(entry.currentHash));
            if (message.error || owned?.length !== 1) return finish(new Error('Update Codex to enable startup chat tracking.'));
            const entry = owned[0];
            // A TOML table preserves dots/quotes in the key. Splitting a -c
            // dotted key would interpret the ".toml" in Codex's hook ID.
            finish(null, ['-c', hook, '-c', `hooks.state={${JSON.stringify(entry.key)}={trusted_hash=${JSON.stringify(entry.currentHash)}}}`]);
          } else if (message.id !== undefined && message.method) {
            send({ id: message.id, error: { code: -32601, message: 'This connection only reads hook metadata.' } });
          }
        }
      });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'paddock', version: '0.6.0' }, capabilities: { experimentalApi: true } } });
    } catch { finish(new Error('Codex chat tracking could not start.')); }
  });
}
module.exports = { prepareCodexSession, startupHook };
