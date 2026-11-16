'use strict';
const { UsageError, usageEnvironment, trackUsageReader, runUsageCommand } = require('./subscription-usage.cjs');

async function readAntigravityModels({ executable, cwd, env, run, timeoutMs, now = Date.now } = {}) {
  const output = await runUsageCommand(executable, ['models'], { cwd, env, run, timeoutMs });
  const models = [], seen = new Set(), observedAt = now();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([a-z0-9][a-z0-9._-]{0,119})\t+([^\t\r\n]{1,200})$/i.exec(line.trim());
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    models.push({ id: match[1], name: match[2].trim().slice(0, 100), available: true, observedAt, source: 'Antigravity account models command' });
    if (models.length === 100) break;
  }
  if (!models.length) throw new UsageError('unavailable', 'Antigravity returned no readable model choices.');
  return models;
}

// /usage is a native TUI command, not a model prompt. Keep each shared model
// group's weekly and five-hour windows separate; never sum their percentages.
function antigravityReading(screen, accountId = 'antigravity:default', at = Date.now()) {
  const panel = String(screen).split(/Models & Quota/i)[1];
  if (!panel || !/\b(?:esc|q)\s+(?:to\s+)?close\b/i.test(panel) || /\b(?:loading|refreshing)\b/i.test(panel)) return null;
  const groups = [...panel.matchAll(/^([A-Z][A-Z0-9 &+/-]{1,64})\s*$/gm)]
    .filter(m => !/^(?:ESC|CLOSE|SCROLL|ACCOUNT|HELP)\b/i.test(m[1].trim()));
  if (!groups.length) return null;
  const windows = [];
  for (let i = 0; i < groups.length; i++) {
    const heading = groups[i][1].trim();
    const group = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const isArgon = /argon/i.test(heading);
    const name = ({
      'GEMINI MODELS': 'Gemini',
      'CLAUDE AND GPT MODELS': 'Claude / GPT',
      'GEMINI 4 ARGON': 'Gemini 4 Argon'
    })[heading] || (isArgon ? 'Gemini 4 Argon' : heading.replace(/\s+MODELS$/i, ''));
    const block = panel.slice(groups[i].index + groups[i][0].length, groups[i + 1]?.index ?? panel.length);
    const limitDefs = isArgon
      ? [['Weekly', 'weekly', 10080, 'weekly']]
      : [['Weekly', 'weekly', 10080, 'weekly'], ['Five Hour', 'five-hour', 300, '5-hour']];
    for (const [title, key, minutes, suffix] of limitDefs) {
      if (key === 'five-hour' && /(?:Five Hour Limit(?: Remaining)?)\s*\r?\n[ \t]*Disabled: You have hit your weekly limit, the 5-hour limit does not currently apply\./i.test(block)) {
        if (!windows.some(window => window.key === group + '-weekly' && window.usedPercent === 100)) return null;
        windows.push({ key: group + '-' + key, modelGroup: group, label: name + ' ' + suffix, minutes,
          usedPercent: null, notApplicable: true, resetsAt: null, resetLabel: 'Weekly limit reached' });
        continue;
      }
      const titlePattern = key === 'weekly'
        ? '(?:(?:(?:Gemini 4 Argon|[A-Za-z0-9]+)\\s+)?Weekly Limit(?: Remaining)?)'
        : '(?:Five Hour Limit(?: Remaining)?)';
      const limitRegex = new RegExp(
        titlePattern +
        '\\s*(?:\\r?\\n[ \\t]*)?\\[[^\\]\\r\\n]*\\]\\s*(\\d+(?:\\.\\d+)?)%[ \\t]*(?:\\r?\\n[ \\t]*|[ \\t]+)((?:Refreshes in|Resets? in|Reset)\\s+([^\\r\\n]+)|Quota available)',
        'i'
      );
      const match = limitRegex.exec(block);
      if (!match) return null;
      const left = Number(match[1]);
      if (!Number.isFinite(left) || left < 0 || left > 100) return null;
      let resetsAt = null;
      if (match[3]) {
        const duration = match[3].trim(), parts = [...duration.matchAll(/(\d+)\s*([dhms])/g)];
        if (!parts.length || duration.replace(/\d+\s*[dhms]/g, '').trim()) return null;
        const ms = parts.reduce((sum, p) => sum + Number(p[1]) * ({ d: 86400000, h: 3600000, m: 60000, s: 1000 })[p[2]], 0);
        if (!Number.isSafeInteger(ms) || ms > 366 * 86400000) return null;
        resetsAt = at + ms;
      }
      windows.push({
        key: group + '-' + key,
        modelGroup: group,
        label: name + ' ' + suffix,
        minutes,
        usedPercent: Number((100 - left).toFixed(6)),
        resetsAt,
        resetLabel: match[2].trim()
      });
    }
  }
  return [{ id: accountId, accountId, provider: 'antigravity', name: 'Google Antigravity', source: 'Antigravity /usage', funding: 'included', fundingSource: 'Native Antigravity quota allocation. Worker credit spending is disabled.', observedAt: at, windows }];
}

async function readAntigravityUsage({ executable, accountId = 'antigravity:default', cwd, env, timeoutMs = 20000, spawnPty, createTerminal, stopProcess, now = Date.now } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install Antigravity CLI to read its allowance.');
  if (!cwd) throw new UsageError('unavailable', 'The usage workspace is unavailable.');
  spawnPty ||= require('node-pty').spawn;
  createTerminal ||= options => new (require('@xterm/headless').Terminal)(options);
  stopProcess ||= child => { require('./delegation.cjs').killTree(child); try { child.kill(); } catch {} };
  const terminal = createTerminal({ cols: 150, rows: 100, scrollback: 0, allowProposedApi: true });
  // Session-only overrides preserve the user's preferences and do not add the
  // usage folder to their permanent trusted-workspace list.
  const args = ['--settings', JSON.stringify({ toolPermission: 'strict', agentMode: 'plan', allowNonWorkspaceAccess: false, enableTerminalSandbox: false, trustedWorkspaces: [cwd] })];
  return new Promise((resolve, reject) => {
    let child, finished = false, sent = false, bytes = 0, submitTimer, loginTimer, unregister, dataListener, exitListener;
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer); clearTimeout(submitTimer); clearTimeout(loginTimer);
      dataListener?.dispose(); exitListener?.dispose(); unregister?.();
      if (child) { try { stopProcess(child); } catch {} }
      terminal.dispose();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new UsageError('timeout', 'The Antigravity usage check timed out. Check /usage in Antigravity.')), timeoutMs);
    const inspect = (confirmLogin = false) => {
      if (finished) return;
      try {
        const buffer = terminal.buffer.active;
        const screen = Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) || '').join('\n');
        const signingIn = /\b(?:signing in|authenticating|checking credentials)\b/i.test(screen);
        const ready = /Antigravity CLI \d/.test(screen) && /for shortcuts/.test(screen) && !signingIn;
        if (!ready && /sign in with Google|authenticate with Google|not signed in|waiting for (?:login|authentication)/i.test(screen)) {
          if (signingIn) { clearTimeout(loginTimer); loginTimer = null; return; }
          if (confirmLogin) return finish(new UsageError('sign-in', 'Sign in through Antigravity, then refresh.'));
          loginTimer ||= setTimeout(() => { loginTimer = null; inspect(true); }, 750);
          return;
        }
        clearTimeout(loginTimer); loginTimer = null;
        if (sent) {
          const value = antigravityReading(screen, accountId, now());
          if (value) finish(null, value);
          return;
        }
        if (!ready) return;
        sent = true;
        child.write('/usage');
        submitTimer = setTimeout(() => { if (!finished) { try { child.write('\r'); } catch { finish(new UsageError('unavailable', 'The Antigravity usage reader closed.')); } } }, 350);
      } catch { finish(new UsageError('unavailable', 'Antigravity returned no readable allowance. Check /usage in Antigravity.')); }
    };
    try {
      child = spawnPty(executable, args, { cwd, env: { ...usageEnvironment(env), TERM: 'xterm-256color' }, useConpty: true, cols: 150, rows: 100, name: 'xterm-256color' });
      unregister = trackUsageReader({ kill: () => finish(new UsageError('unavailable', 'The usage reader closed.')) });
      exitListener = child.onExit(() => finish(new UsageError('unavailable', 'Antigravity closed before returning its allowance.')));
      dataListener = child.onData(data => {
        if (finished) return;
        bytes += Buffer.byteLength(data);
        if (bytes > 1024 * 1024) return finish(new UsageError('unavailable', 'The Antigravity usage response was too large.'));
        try {
          if (data.includes('\x1b[6n')) child.write('\x1b[1;1R');
          terminal.write(data, inspect);
        } catch { finish(new UsageError('unavailable', 'The Antigravity usage reader failed.')); }
      });
    } catch { finish(new UsageError('unavailable', 'The Antigravity usage reader could not start.')); }
  });
}

module.exports = { antigravityReading, readAntigravityUsage, readAntigravityModels };
