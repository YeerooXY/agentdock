'use strict';
const { UsageError, usageEnvironment, trackUsageReader } = require('./subscription-usage.cjs');
const { programLaunch } = require('./platform.cjs');

function cursorReading(screen, accountId = 'cursor:default', at = Date.now()) {
  const panel = String(screen).slice(String(screen).search(/Usage [•·]/));
  if (!/Monthly plan and on-demand usage/.test(panel) || !/Esc to close/.test(panel)) return null;
  const plan = /Usage [•·]\s*(.*?)\s{2,}(?:Resets |Current period)/.exec(panel)?.[1]?.trim();
  const resetLabel = /\bResets [A-Za-z]{3,9} \d{1,2}\b/.exec(panel)?.[0] || null;
  const windows = [];
  for (const [name, key] of [['Included', 'included'], ['Auto', 'auto'], ['API', 'api']]) {
    const match = new RegExp('^\\s*' + name + '\\s+(\\d+(?:\\.\\d+)?)% used\\b', 'm').exec(panel);
    if (!match || Number(match[1]) > 100) return null;
    windows.push({ key, label: name, modelGroup: 'cursor:' + key, usedPercent: Number(match[1]), minutes: null, resetsAt: null, resetLabel });
  }
  // Native TUI rounds percentages and omits reset year/time. Preserve its date
  // label; do not invent a timestamp or treat disabled paid overages as spent.
  return [{ id: accountId, accountId, provider: 'cursor', name: 'Cursor', ...(plan ? { plan } : {}), source: 'Cursor /usage (rounded)', observedAt: at, windows }];
}

async function readCursorUsage({ executable, accountId = 'cursor:default', cwd, env, timeoutMs = 25000, spawnPty, createTerminal, stopProcess, now = Date.now, settleMs = 450 } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install Cursor CLI to read its allowance.');
  if (!cwd) throw new UsageError('unavailable', 'The usage workspace is unavailable.');
  spawnPty ||= require('node-pty').spawn;
  createTerminal ||= options => new (require('@xterm/headless').Terminal)(options);
  stopProcess ||= child => {
    // ConPTY's kill closes its pipes and collects console children itself.
    // Killing only the shell PID leaves the owning reader's handles open.
    if (process.platform !== 'win32') require('./delegation.cjs').killTree(child);
    try { child.kill(); } catch {}
  };
  const terminal = createTerminal({ cols: 140, rows: 65, scrollback: 0, allowProposedApi: true });
  const launch = programLaunch(executable, ['--mode', 'ask', '--trust'], { bypass: true });
  return new Promise((resolve, reject) => {
    let child, phase = 0, finished = false, bytes = 0, idle, unregister, dataListener, exitListener;
    const finish = (error, result) => {
      if (finished) return;
      finished = true; clearTimeout(timer); clearTimeout(idle);
      dataListener?.dispose(); exitListener?.dispose(); unregister?.();
      if (child) { try { stopProcess(child); } catch {} }
      terminal.dispose(); error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new UsageError('timeout', 'Cursor usage check timed out. Check /usage in Cursor.')), timeoutMs);
    const inspect = () => {
      if (finished) return;
      try {
        const buffer = terminal.buffer.active;
        const screen = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) || '').join('\n');
        if (/Not logged in|Sign in to Cursor|Waiting for authentication/i.test(screen)) return finish(new UsageError('sign-in', 'Sign in through Cursor, then refresh.'));
        if (phase === 2) {
          if (/Usage details are not available|Enterprise spend details are not available|Current cycle spend/i.test(screen)) return finish(new UsageError('unsupported', 'This plan has no readable CLI allowance. Check the Cursor usage dashboard.'));
          if (/Failed to load usage data/i.test(screen)) return finish(new UsageError('unavailable', 'Cursor could not return usage. Try again later.'));
          const value = cursorReading(screen, accountId, now());
          if (value) finish(null, value);
        } else if (phase === 0 && /Cursor Agent/.test(screen) && /Ask|ask mode/i.test(screen)) {
          phase = 1; child.write('/usage');
        } else if (phase === 1 && /Show plan and on-demand usage/.test(screen)) {
          // Only submit after the native command picker confirms /usage exists.
          // An older CLI never receives an unknown slash command as a prompt.
          phase = 2; child.write('\r');
        }
      } catch { finish(new UsageError('unavailable', 'Cursor returned no readable allowance.')); }
    };
    try {
      child = spawnPty(launch.executable, launch.args, { cwd, env: { ...usageEnvironment(env), TERM: 'xterm-256color', NO_OPEN_BROWSER: '1' }, cols: 140, rows: 65, name: 'xterm-256color' });
      unregister = trackUsageReader({ kill: () => finish(new UsageError('unavailable', 'The usage reader closed.')) });
      exitListener = child.onExit(() => finish(new UsageError('unavailable', 'Cursor closed before returning usage.')));
      dataListener = child.onData(data => {
        if (finished) return;
        bytes += Buffer.byteLength(data);
        if (bytes > 1024 * 1024) return finish(new UsageError('unavailable', 'The Cursor usage response was too large.'));
        try {
          if (data.includes('\x1b[6n')) child.write('\x1b[1;1R');
          terminal.write(data, () => { clearTimeout(idle); if (!finished) idle = setTimeout(inspect, settleMs); });
        } catch { finish(new UsageError('unavailable', 'The Cursor usage reader failed.')); }
      });
    } catch { finish(new UsageError('unavailable', 'The Cursor usage reader could not start.')); }
  });
}
module.exports = { cursorReading, readCursorUsage };
