'use strict';
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ownedReaders = new Set();

const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const label = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80) : '';
class UsageError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function responseError(value) {
  // Never expose a provider's raw stderr, identity, URL, token or response body.
  const text = typeof value === 'string' ? value : '';
  if (/not authenticated|unauthenticated|not logged|\blog.?in\b|authentication.*(?:failed|required)|401|sign.?in/i.test(text))
    return new UsageError('sign-in', 'Sign in through this CLI, then refresh.');
  if (/429|rate.?limit|too many requests/i.test(text))
    return new UsageError('limited', 'The provider limited usage checks. Try again later.');
  if (/unsupported|not supported|unknown.*(?:method|request)|method not found/i.test(text))
    return new UsageError('unsupported', 'This CLI version does not provide a usage reader. Update the CLI and try again.');
  return new UsageError('unavailable', 'The provider could not return current usage. Try again.');
}
function usageEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(?:PADDOCK_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$|CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$)/i.test(key) ||
        /(?:_API_KEY|_AUTH_TOKEN|_ACCESS_TOKEN|_OAUTH_TOKEN)$|^(?:GH_TOKEN|GITHUB_TOKEN|COPILOT_GITHUB_TOKEN)$/i.test(key)) delete env[key];
  }
  // Claude treats its usage endpoint as nonessential traffic. Do not set
  // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC here: it suppresses fresh readings.
  return env;
}

class UsageTransport {
  constructor(executable, args, { env, cwd, format = 'lines', spawnProcess = spawn, timeoutMs = 20000 } = {}) {
    this.format = format; this.pending = new Map(); this.nextId = 0; this.buffer = Buffer.alloc(0); this.timeoutMs = timeoutMs;
    this.child = spawnProcess(executable, args, { env: usageEnvironment(env), cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    ownedReaders.add(this.child); this.child.once('exit', () => ownedReaders.delete(this.child));
    this.child.stdout.on('data', chunk => this.receive(chunk));
    this.child.stderr.on('data', () => {}); // Diagnostics can contain private account information.
    this.child.stdin.on('error', () => this.fail(new UsageError('unavailable', 'The usage reader closed. Try again.')));
    this.child.on('error', () => this.fail(new UsageError('unavailable', 'The usage reader could not start. Check the CLI installation.')));
    this.child.on('exit', () => this.fail(new UsageError('unavailable', 'The usage reader closed before returning a reading.')));
  }
  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    if (this.buffer.length > 1024 * 1024) { this.fail(new UsageError('unavailable', 'The usage response was too large.')); return this.close(); }
    while (this.buffer.length) {
      let raw;
      if (this.format === 'framed') {
        const end = this.buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const length = Number(/Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, end).toString())?.[1]);
        if (!Number.isSafeInteger(length) || length < 1 || length > 1024 * 1024) { this.fail(new UsageError('unavailable', 'The usage reader returned an invalid response.')); return this.close(); }
        if (this.buffer.length < end + 4 + length) return;
        raw = this.buffer.subarray(end + 4, end + 4 + length).toString();
        this.buffer = this.buffer.subarray(end + 4 + length);
      } else {
        const end = this.buffer.indexOf('\n'); if (end < 0) return;
        raw = this.buffer.subarray(0, end).toString(); this.buffer = this.buffer.subarray(end + 1);
      }
      let message; try { message = JSON.parse(raw); } catch { continue; }
      const response = this.format === 'framed' ? message : message.type === 'control_response' ? message.response : null;
      if (!response) continue;
      const id = this.format === 'framed' ? response.id : response.request_id, request = this.pending.get(id);
      if (!request) continue;
      clearTimeout(request.timer); this.pending.delete(id);
      if (response.error || response.subtype === 'error') request.reject(responseError(response.error?.message || response.error));
      else request.resolve(this.format === 'framed' ? response.result : response.response);
    }
  }
  request(method, params = {}) {
    if (this.closed || this.failure) return Promise.reject(this.failure || new UsageError('unavailable', 'The usage reader is closed.'));
    const id = String(++this.nextId);
    const value = this.format === 'framed' ? { jsonrpc: '2.0', id, method, params } : { type: 'control_request', request_id: id, request: { subtype: method, ...params } };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new UsageError('timeout', 'The usage check timed out. Try again.')); this.close(); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const data = Buffer.from(JSON.stringify(value));
      if (this.format === 'framed') this.child.stdin.write('Content-Length: ' + data.length + '\r\n\r\n');
      this.child.stdin.write(this.format === 'framed' ? data : Buffer.concat([data, Buffer.from('\n')]));
    });
  }
  fail(error) { this.failure = error; for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); }
  close() {
    if (this.closed) return; this.closed = true;
    this.fail(new UsageError('unavailable', 'The usage reader closed.'));
    this.child.stdin.end();
    const timer = setTimeout(() => { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill(); }, 1500);
    timer.unref?.(); this.child.once('exit', () => clearTimeout(timer));
  }
}

function runUsageCommand(executable, args, { env, cwd, run = execFile, timeoutMs = 20000 } = {}) {
  if (!executable) return Promise.reject(new UsageError('not-installed', 'Install this CLI to read its subscription.'));
  return new Promise((resolve, reject) => {
    const child = run(executable, args, { cwd, env: usageEnvironment(env), windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      ownedReaders.delete(child);
      if (error) reject(error.killed ? new UsageError('timeout', 'The usage check timed out. Try again.') : responseError(String(stdout) + String(stderr)));
      else resolve(String(stdout));
    });
    ownedReaders.add(child);
    child.stdin?.end();
  });
}

function kiroReading(raw, accountId, at = Date.now()) {
  const text = String(raw).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
  if (!text.includes('Estimated Usage')) throw responseError(text);
  const report = text.slice(text.indexOf('Estimated Usage'));
  // Plan and bonus grants are separate allowances. Never divide total spend
  // (which can include overages) by the base plan, or add their percentages.
  const match = /\(([\d.]+)\s+of\s+([\d.]+)\s+covered in plan\)/i.exec(report)
    || /covered in plan[^\n]*?\(([\d.]+)\s+of\s+([\d.]+)/i.exec(report);
  const used = Number(match?.[1]), total = Number(match?.[2]);
  if (!match || !Number.isFinite(used) || !Number.isFinite(total) || used < 0 || total <= 0 || used > total)
    throw new UsageError('unavailable', 'Kiro returned no readable plan allowance. Open /usage in Kiro to check.');
  const reset = /resets on (\d{4}-\d{2}-\d{2})/i.exec(report)?.[1];
  const windows = [{ key: 'plan', label: /\bKIRO FREE\b/.test(report) ? 'Free plan credits' : 'Plan credits', minutes: null, used, total, unit: 'credits', usedPercent: used / total * 100, resetsAt: null, resetLabel: reset ? 'Resets on ' + reset : null }];
  const bonus = report.split(/bonus credits:/i)[1]?.split(/\n\s*(?:Credits|Overages:)/)[0] || '';
  for (const line of bonus.split('\n').slice(0, 32)) {
    const item = /^\s*(.+?)\s*(?:-\s*|:\s*)([\d.]+)\/([\d.]+)\s*(?:used\s*\((\d+)\s+days?\s+left\)|\(expires\s+in\s+(\d+)\s+days?\))/i.exec(line);
    if (!item) continue;
    const spent = Number(item[2]), allowance = Number(item[3]);
    if (!Number.isFinite(spent) || !Number.isFinite(allowance) || spent < 0 || allowance <= 0 || spent > allowance) continue;
    windows.push({ key: 'bonus-' + windows.length, label: label(item[1]), minutes: null, usedPercent: spent / allowance * 100, resetsAt: null, resetLabel: `Expires in ${Number(item[4] || item[5])} days` });
  }
  return [{ id: accountId, accountId, provider: 'kiro', name: 'Kiro', observedAt: at, source: 'Kiro /usage estimate', windows }];
}
async function readKiroUsage({ executable, accountId = 'kiro:default', cwd, env, run, timeoutMs } = {}) {
  if (!cwd) throw new UsageError('unavailable', 'The usage workspace is unavailable.');
  const directory = path.join(cwd, '.kiro', 'agents'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'paddock-usage.json'), JSON.stringify({ name: 'paddock-usage', description: 'Read account usage', tools: [], allowedTools: [], mcpServers: {}, includeMcpJson: false, resources: [], hooks: {} }));
  // V3 interprets /usage as a model prompt. Pin V2, which implements the
  // built-in command locally; an older CLI rejecting this flag fails closed.
  const raw = await runUsageCommand(executable, ['chat', '--agent-engine', 'v2', '--no-interactive', '--agent', 'paddock-usage', '--trust-tools=', '/usage'], { cwd, env, run, timeoutMs });
  return kiroReading(raw, accountId);
}

function kimiReading(raw, accountId, at = Date.now()) {
  if (raw?.kind !== 'ok') throw responseError(`${raw?.status || ''} ${raw?.message || ''}`);
  const windows = [];
  for (const [key, minutes, name] of [['limit5h', 300, '5-hour'], ['limit7d', 10080, 'Weekly'], ['monthTotal', null, 'Monthly'], ['monthCode', null, 'Monthly Code']]) {
    const item = raw.quota?.usages?.[key];
    if (!item || typeof item.usedRatio !== 'number' || percent(item.usedRatio * 100) === null) continue;
    windows.push({ key, label: name, minutes, usedPercent: item.usedRatio * 100, resetsAt: date(item.resetAt) });
  }
  if (!windows.length) throw new UsageError('unavailable', 'Kimi Code returned no readable subscription allowance.');
  return [{ id: accountId, accountId, provider: 'kimi', name: 'Kimi Code', source: 'Kimi Code account service', observedAt: at, windows }];
}
async function readKimiUsage({ executable, accountId = 'kimi:default', cwd, env, spawnProcess = spawn, fetchUsage = fetch, timeoutMs = 20000 } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install Kimi Code to read this subscription.');
  // The native CLI owns authentication. Its loopback-only server exposes a
  // documented read-only quota route; no session or prompt is created.
  const child = spawnProcess(executable, ['web', '--port', '0', '--host', '127.0.0.1', '--no-open'], { cwd, env: usageEnvironment(env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  ownedReaders.add(child); child.once('exit', () => ownedReaders.delete(child));
  const controller = new AbortController(); let timer;
  try {
    return await new Promise((resolve, reject) => {
      let buffer = '', fetching = false;
      timer = setTimeout(() => { controller.abort(); reject(new UsageError('timeout', 'The usage check timed out. Try again.')); }, timeoutMs);
      child.once('error', () => reject(new UsageError('unavailable', 'The Kimi usage reader could not start.')));
      child.once('exit', () => reject(new UsageError('unavailable', 'The Kimi usage reader closed.')));
      const consume = chunk => {
        if (fetching) return;
        buffer += chunk.toString();
        if (buffer.length > 1024 * 1024) { reject(new UsageError('unavailable', 'The usage reader returned an invalid response.')); return; }
        const address = /http:\/\/127\.0\.0\.1:(\d{1,5})\/#token=([A-Za-z0-9_.~-]+)(?=\s)/.exec(buffer);
        if (!address || Number(address[1]) < 1 || Number(address[1]) > 65535) return;
        fetching = true; buffer = '';
        // The local server token stays in this closure and is never logged,
        // stored, returned to the renderer or included in a URL request.
        fetchUsage(`http://127.0.0.1:${address[1]}/api/v1/oauth/usage`, { headers: { Authorization: 'Bearer ' + address[2] }, redirect: 'error', signal: controller.signal })
          .then(async response => {
            if (!response.ok) throw responseError(String(response.status));
            let text = '';
            for await (const chunk of response.body) { text += Buffer.from(chunk).toString(); if (text.length > 1024 * 1024) throw new UsageError('unavailable', 'The usage response was too large.'); }
            const envelope = JSON.parse(text);
            if (envelope.code !== 0) throw responseError(String(envelope.msg));
            return kimiReading(envelope.data, accountId);
          }).then(resolve, error => reject(error instanceof UsageError ? error : responseError('')));
      };
      child.stdout.on('data', consume); child.stderr.on('data', consume);
    });
  } finally { clearTimeout(timer); controller.abort(); try { child.kill(); } catch {} ownedReaders.delete(child); }
}

function claudeReading(raw, accountId, at = Date.now()) {
  if (!raw?.rate_limits_available) throw new UsageError('unavailable', 'Claude Code did not report a subscription. Check its sign-in and subscription.');
  if (!raw.rate_limits || typeof raw.rate_limits !== 'object') throw new UsageError('unavailable', 'Claude Code could not fetch current subscription usage. Try again.');
  const limits = raw.rate_limits, windows = [];
  for (const [key, minutes, name] of [['five_hour', 300, '5-hour'], ['seven_day', 10080, 'Weekly'],
    ['seven_day_opus', 10080, 'Opus weekly'], ['seven_day_sonnet', 10080, 'Sonnet weekly'], ['seven_day_oauth_apps', 10080, 'Apps weekly']]) {
    const item = limits[key]; if (!item || percent(item.utilization) === null) continue;
    windows.push({ key, label: name, minutes, usedPercent: item.utilization, resetsAt: date(item.resets_at) });
  }
  for (const [index, item] of (Array.isArray(limits.model_scoped) ? limits.model_scoped.slice(0, 24) : []).entries()) {
    if (percent(item?.utilization) !== null && label(item.display_name)) windows.push({ key: 'model-' + index, label: label(item.display_name) + ' weekly', minutes: 10080, usedPercent: item.utilization, resetsAt: date(item.resets_at) });
  }
  if (!windows.length) throw new UsageError('unavailable', 'Claude Code returned no readable subscription limits.');
  return [{ id: accountId, accountId, provider: 'claude', name: 'Claude Code', plan: label(raw.subscription_type) || null, source: 'Claude Code account service', observedAt: at, windows }];
}
async function readClaudeUsage({ executable, accountId = 'claude:default', env, cwd, spawnProcess, timeoutMs } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install Claude Code to read this subscription.');
  const transport = new UsageTransport(executable, ['--print', '--verbose', '--input-format', 'stream-json', '--output-format', 'stream-json', '--restricted', '--no-session-persistence', '--settings', '{"disableAllHooks":true}'], { env, cwd, spawnProcess, timeoutMs });
  try {
    // No user messages, model prompts, tools, transcript scans or login-file reads.
    await transport.request('initialize', { hooks: {}, sdkMcpServers: [], agents: {} });
    return claudeReading(await transport.request('get_usage', { skip_behaviors: true }), accountId);
  } finally { transport.close(); }
}
function copilotReading(raw, accountId, at = Date.now()) {
  const windows = Object.entries(raw?.quotaSnapshots || {}).slice(0, 32).flatMap(([key, item]) => {
    if (!item || typeof item !== 'object') return [];
    const unlimited = item.entitlementRequests === -1;
    const left = percent(item.remainingPercentage);
    if (!unlimited && left === null) return [];
    return [{ key, label: ({ premium_interactions: 'Premium interactions', chat: 'Chat', completions: 'Completions' })[key] || label(key.replaceAll('_', ' ')), minutes: null,
      usedPercent: unlimited ? null : 100 - left, unlimited, resetsAt: date(item.resetDate) }];
  });
  if (!windows.length) throw new UsageError('unavailable', 'Copilot returned no readable account limits.');
  return [{ id: accountId, accountId, provider: 'copilot', name: 'GitHub Copilot', source: 'Copilot account service', observedAt: at, windows }];
}
function copilotExecutable(file) {
  if (!file || !fs.existsSync(file)) return null;
  if (file.toLowerCase().endsWith('.exe')) return file;
  const binary = path.resolve(path.dirname(file), '..', '@github', 'copilot-win32-x64', 'copilot.exe');
  return fs.existsSync(binary) ? binary : null;
}
async function readCopilotUsage({ executable, accountId = 'copilot:default', env, cwd, spawnProcess, timeoutMs } = {}) {
  if (!executable) throw new UsageError('not-installed', 'Install the native Copilot CLI to read this subscription.');
  const transport = new UsageTransport(executable, ['--headless', '--no-auto-update', '--stdio', '--log-level', 'error'], { env, cwd, format: 'framed', spawnProcess, timeoutMs });
  try {
    await transport.request('ping', { message: 'Paddock usage' });
    return copilotReading(await transport.request('account.getQuota'), accountId);
  } finally { transport.close(); }
}

// All providers enter the same refresh and freshness path. A missing reader is
// an explicit capability state, never a fabricated zero or a silently hidden card.
class SubscriptionUsage {
  constructor({ readers = {}, now = Date.now, onReading = () => {}, onChange = () => {}, cooldownMs = 15000 } = {}) {
    Object.assign(this, { readers, now, onReading, onChange, cooldownMs });
    this.states = new Map(); this.pending = new Map();
  }
  snapshot() { return [...this.states.values()].map(value => ({ ...value })); }
  async refresh(accounts) {
    const queue = accounts.filter((account, index) => accounts.findIndex(other => other.id === account.id) === index);
    // Bound native helper concurrency on large account lists.
    const worker = async () => { let account; while ((account = queue.shift())) await this.refreshOne(account); };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    return this.snapshot();
  }
  refreshOne(account) {
    if (this.pending.has(account.id)) return this.pending.get(account.id);
    const before = this.states.get(account.id);
    if (before && this.now() - before.checkedAt < this.cooldownMs) return Promise.resolve();
    const task = this.read(account).finally(() => this.pending.delete(account.id));
    this.pending.set(account.id, task); return task;
  }
  async read(account) {
    const before = this.states.get(account.id), reader = Object.hasOwn(this.readers, account.provider) ? this.readers[account.provider] : null;
    const base = { accountId: account.id, provider: account.provider, checkedAt: this.now(), observedAt: before?.observedAt || null };
    if (!reader) {
      this.states.set(account.id, { ...base, status: 'unsupported', message: usageHelp(account.provider) }); this.onChange(); return;
    }
    this.states.set(account.id, { ...base, status: 'refreshing', message: '' }); this.onChange();
    try {
      const values = await reader(account);
      if (!Array.isArray(values) || !values.length || values.some(value => value.accountId !== account.id || value.provider !== account.provider || !Number.isFinite(value.observedAt)))
        throw new UsageError('unavailable', 'The provider returned no account usage.');
      this.onReading(account, values);
      this.states.set(account.id, { ...base, status: 'current', checkedAt: this.now(), observedAt: Math.max(...values.map(value => value.observedAt)), message: '' });
    } catch (error) {
      const safe = error instanceof UsageError ? error : responseError(error?.message);
      this.states.set(account.id, { ...base, status: safe.code, checkedAt: this.now(), message: safe.message });
    }
    this.onChange();
  }
}
function usageHelp(provider) {
  const native = { antigravity: '/usage in Antigravity', gemini: '/stats model in Gemini CLI', cursor: 'the Cursor usage dashboard', grok: 'the xAI subscription dashboard', droid: '/limits in Droid', kimi: '/usage in Kimi Code' }[provider];
  return native ? `This CLI has no connected background quota reader. Check ${native}.` : 'This CLI uses its selected provider’s allowance. Its account quota is not available through this CLI.';
}
function stopUsageReaders() { for (const child of ownedReaders) { try { child.kill(); } catch {} } ownedReaders.clear(); }
module.exports = { UsageError, UsageTransport, SubscriptionUsage, usageEnvironment, responseError, claudeReading, copilotReading, copilotExecutable, readClaudeUsage, readCopilotUsage, runUsageCommand, kiroReading, readKiroUsage, kimiReading, readKimiUsage, usageHelp, stopUsageReaders };
