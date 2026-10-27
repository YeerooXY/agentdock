'use strict';
// Cross-agent reviews: an agent asks another of the user's own subscriptions to
// review its changes. Paddock runs that vendor's official CLI read-only, with
// the user's existing sign-in, and returns a short structured answer.
// Paddock never reads, copies or forwards sign-in tokens.
const fs = require('node:fs'), path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { permitted } = require('./code-panel.cjs');
const { programLaunch } = require('./platform.cjs');

const REVIEWERS = ['claude', 'codex'];
const MAX_DIFF = 150_000, MAX_REPLY = 6000, MAX_FOCUS = 2000, MAX_FILES = 50;
const MAX_RUNNING = 2, MAX_PER_HOUR = 20, FRESH_MS = 30 * 60_000, FULL_PERCENT = 90;
const names = { claude: 'Claude Code', codex: 'Codex' };

function git(cwd, args, run = execFile) {
  return new Promise((resolve, reject) => run('git', args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 20000 }, (error, stdout) => error ? reject(error) : resolve(String(stdout))));
}

function cleanFiles(files) {
  if (files === undefined) return [];
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`List up to ${MAX_FILES} files.`);
  return files.map(file => {
    const value = String(file).replaceAll('\\', '/');
    if (!value || value.startsWith('-') || path.isAbsolute(value) || /^[a-z]:/i.test(value) || value.split('/').includes('..')) throw new Error('Use file paths relative to the project folder.');
    return value;
  });
}

// The changes to review, with credential and generated files left out.
async function collectChanges(cwd, { base = 'HEAD', files = [] } = {}, run = execFile) {
  if (typeof base !== 'string' || !/^[\w./@^~-]{1,100}$/.test(base) || base.startsWith('-')) throw new Error('Use a branch, tag or commit as the base.');
  try { await git(cwd, ['rev-parse', '--verify', '--quiet', base + '^{commit}'], run); }
  catch { throw new Error(`The base ${base} is not a commit in this project.`); }
  const scope = files.length ? ['--', ...files] : [];
  const changed = (await git(cwd, ['diff', '--name-only', '--no-renames', base, ...scope], run)).split('\n').filter(Boolean);
  const untracked = (await git(cwd, ['ls-files', '--others', '--exclude-standard', ...scope], run)).split('\n').filter(Boolean);
  const included = changed.filter(permitted), fresh = untracked.filter(permitted);
  const omitted = changed.length - included.length + untracked.length - fresh.length;
  if (!included.length && !fresh.length) throw new Error(omitted ? 'Only private or generated files changed. Nothing to review.' : 'There are no changes to review.');
  const diff = included.length ? await git(cwd, ['diff', '--no-color', '--no-ext-diff', '--no-renames', base, '--', ...included], run) : '';
  if (diff.length > MAX_DIFF) throw new Error(`The diff is ${Math.round(diff.length / 1000)} KB. Narrow the review to fewer files.`);
  return { base, diff, files: included, untracked: fresh.slice(0, 100), omitted };
}

function reviewBrief({ focus, changes }) {
  return [
    'You are reviewing changes another coding agent made. Paddock started you read-only: do not edit files or change anything.',
    'Read the surrounding code in this folder where you need context.',
    `What to check: ${focus || 'correctness bugs, regressions and missing edge cases.'}`,
    '',
    'Reply in exactly this shape and nothing else:',
    'VERDICT: approve | changes-requested',
    'FINDINGS:',
    '- path:line — high|medium|low — the problem — the fix',
    '',
    'List at most 12 findings, most severe first. Write "- none" when there are none. Do not restate the diff or praise the change.',
    changes.untracked.length ? `\nNew files, not in the diff (read them directly): ${changes.untracked.join(', ')}` : '',
    changes.omitted ? `\n${changes.omitted} private or generated file(s) were left out of this review.` : '',
    changes.diff ? `\nDiff against ${changes.base}:\n\`\`\`diff\n${changes.diff}\n\`\`\`` : ''
  ].filter(line => line !== '').join('\n');
}

// Measured headroom for one account. Unknown usage is never treated as free.
function headroom(limits, accountId, now) {
  const fresh = (limits || []).filter(item => item.accountId === accountId && Number.isFinite(item.observedAt) && now - item.observedAt <= FRESH_MS)
    .flatMap(item => Array.isArray(item.windows) ? item.windows : []).filter(w => Number.isFinite(w.usedPercent));
  if (!fresh.length) return { known: false };
  const used = Math.max(...fresh.map(w => w.usedPercent));
  const soon = fresh.filter(w => Number.isFinite(w.resetsAt) && w.resetsAt > now).sort((a, b) => a.resetsAt - b.resetsAt)[0];
  return { known: true, left: Math.max(0, 100 - used), resetsAt: soon?.resetsAt || null };
}

function hours(ms) { const h = Math.round(ms / 3_600_000); return h < 1 ? 'under an hour' : h === 1 ? '1 hour' : `${h} hours`; }

// Chooses the reviewer with the most measured room, preferring a different
// vendor than the caller for an independent second opinion.
function pickReviewer({ candidates, limits, callerProvider, requested, now = Date.now() }) {
  let pool = candidates;
  if (requested && requested !== 'auto') {
    pool = candidates.filter(c => c.id === requested || c.provider === requested);
    if (!pool.length) throw new Error(`${requested} is not an allowed, installed reviewer. Allowed: ${candidates.map(c => c.id).join(', ') || 'none'}.`);
  }
  const scored = pool.map(choice => {
    const room = headroom(limits, choice.id, now), other = choice.provider !== callerProvider;
    const resetsSoon = room.known && room.resetsAt && room.resetsAt - now < 12 * 3_600_000 && room.left >= 30;
    const score = (room.known ? room.left : 40) + (other ? 30 : 0) + (resetsSoon ? 10 : 0);
    const reasons = [other ? `a different vendor from ${names[callerProvider] || 'the caller'}` : 'the same vendor as the caller',
      room.known ? `${Math.round(room.left)}% left${room.resetsAt ? `, resets in ${hours(room.resetsAt - now)}` : ''}` : 'usage unknown'];
    return { choice, room, score, why: `${choice.label}: ${reasons.join(', ')}.` };
  }).filter(item => !(item.room.known && item.room.left <= 100 - FULL_PERCENT));
  if (!scored.length) throw new Error('Every allowed reviewer is at or above 90% of its limit. Try again after a reset.');
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

function reviewerLaunch(provider, executable, { briefFile, outFile, model }) {
  const prompt = `Read the review brief in ${briefFile} and follow it exactly.`;
  const args = provider === 'claude'
    ? ['-p', prompt, '--output-format', 'json', '--add-dir', path.dirname(briefFile), '--tools', 'Read,Grep,Glob', '--strict-mcp-config', '--no-session-persistence', ...(model ? ['--model', model] : [])]
    : ['exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '-o', outFile, ...(model ? ['-m', model] : []), prompt];
  return programLaunch(executable, args);
}

function parseReply(provider, stdout, outFile) {
  let text = '', usage = null;
  if (provider === 'claude') {
    const line = stdout.trim().split('\n').reverse().find(l => l.startsWith('{'));
    const data = line ? JSON.parse(line) : null;
    if (!data || data.is_error) throw new Error(String(data?.result || 'The reviewer returned no answer.').slice(0, 300));
    text = String(data.result || '');
    usage = { inputTokens: data.usage?.input_tokens ?? null, outputTokens: data.usage?.output_tokens ?? null, turns: data.num_turns ?? null };
  } else {
    try { text = fs.readFileSync(outFile, 'utf8'); } catch { text = ''; }
  }
  text = text.trim();
  if (!text) throw new Error('The reviewer returned no answer.');
  const verdict = /VERDICT:\s*approve\b/i.test(text) ? 'approve' : /VERDICT:\s*changes-requested/i.test(text) ? 'changes-requested' : 'unclear';
  return { text, verdict, usage };
}

function killTree(child) {
  try {
    if (process.platform === 'win32' && Number.isInteger(child.pid)) {
      const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
      if (fs.existsSync(taskkill)) { const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('error', () => {}); killer.unref(); return; }
    }
    child.kill();
  } catch {}
}

class Delegation extends EventEmitter {
  constructor(root, { getSettings, candidates, getLimits, environment, saveResult, spawnProcess = spawn, run = execFile, now = Date.now, testMode = false } = {}) {
    super();
    Object.assign(this, { getSettings, candidates, getLimits, environment, saveResult, spawnProcess, run, now, testMode });
    this.dir = path.join(root, 'delegations'); this.jobs = new Map(); this.children = new Map(); this.finishers = new Map(); this.started = [];
  }
  snapshot() {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 20)
      .map(({ id, state, reviewer, why, consoleName, startedAt, finishedAt, verdict, error, resultId }) => ({ id, state, reviewer, why, consoleName, startedAt, finishedAt, verdict, error, resultId }));
  }
  allowed() {
    const settings = this.getSettings() || {};
    const providers = REVIEWERS.filter(id => (settings.delegationProviders || REVIEWERS).includes(id));
    return this.candidates().filter(c => providers.includes(c.provider));
  }
  async start(args = {}, caller) {
    if (this.getSettings()?.delegationEnabled !== true) throw new Error('Cross-agent reviews are off. The user can turn them on in Usage → Cross-agent reviews.');
    if (!caller?.sessionId || !caller.cwd) throw new Error('Start reviews from an open console.');
    const running = [...this.jobs.values()].filter(job => job.state === 'running');
    if (running.some(job => job.callerSessionId === caller.sessionId)) throw new Error('This console already has a review running. Read it with dock/delegation_status.');
    if (running.length >= MAX_RUNNING) throw new Error('Two reviews are already running. Wait for one to finish.');
    const hourAgo = this.now() - 3_600_000; this.started = this.started.filter(at => at > hourAgo);
    if (this.started.length >= MAX_PER_HOUR) throw new Error('The hourly review limit was reached. Try again later.');
    const focus = String(args.focus || '').slice(0, MAX_FOCUS);
    const changes = await collectChanges(caller.cwd, { base: args.base || 'HEAD', files: cleanFiles(args.files) }, this.run);
    const picked = pickReviewer({ candidates: this.allowed(), limits: this.getLimits(), callerProvider: caller.provider, requested: args.reviewer, now: this.now() });
    const id = randomUUID(), folder = path.join(this.dir, id);
    fs.mkdirSync(folder, { recursive: true });
    const briefFile = path.join(folder, 'brief.md'), outFile = path.join(folder, 'reply.md');
    fs.writeFileSync(briefFile, reviewBrief({ focus, changes }), { mode: 0o600 });
    const job = { id, state: 'running', reviewer: { accountId: picked.choice.id, provider: picked.choice.provider, label: picked.choice.label }, why: picked.why,
      callerSessionId: caller.sessionId, consoleName: caller.consoleName || '', context: caller.context, focus, files: changes.files.length + changes.untracked.length,
      startedAt: this.now(), finishedAt: null, verdict: null, text: '', error: '', usage: null, resultId: null, waiters: [] };
    this.jobs.set(id, job); this.started.push(job.startedAt); this.emit('changed');
    this.run_(job, { briefFile, outFile, folder });
    return this.status(id);
  }
  run_(job, { briefFile, outFile, folder }) {
    const settings = this.getSettings() || {}, provider = job.reviewer.provider;
    const finish = (patch) => {
      if (job.state !== 'running') return;
      Object.assign(job, patch, { finishedAt: this.now() }); clearTimeout(timer); this.children.delete(job.id); this.finishers.delete(job.id);
      try { fs.rmSync(folder, { recursive: true, force: true }); } catch {}
      this.record(job).finally(() => { for (const wake of job.waiters.splice(0)) wake(); this.emit('changed'); });
    };
    const timer = setTimeout(() => { if (child) killTree(child); finish({ state: 'failed', error: 'The review timed out after 10 minutes.' }); }, (settings.delegationTimeoutMinutes || 10) * 60_000);
    let child, stdout = '', stderr = '';
    this.finishers.set(job.id, patch => { finish(patch); if (child) killTree(child); });
    try {
      const executable = this.candidates().find(c => c.id === job.reviewer.accountId)?.executable;
      if (!executable) throw new Error(`${names[provider]} is no longer installed.`);
      const launch = reviewerLaunch(provider, executable, { briefFile, outFile, model: settings.delegationModels?.[provider] });
      child = this.spawnProcess(launch.executable, launch.args, { cwd: job.context?.project || undefined, env: this.environment(job.reviewer.accountId, provider), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { finish({ state: 'failed', error: error.message }); return; }
    this.children.set(job.id, child);
    child.stdout?.on('data', chunk => { if (stdout.length < 2_000_000) stdout += chunk; });
    child.stderr?.on('data', chunk => { if (stderr.length < 20_000) stderr += chunk; });
    child.once('error', () => finish({ state: 'failed', error: `${names[provider]} could not start.` }));
    child.once('close', code => {
      try {
        const reply = parseReply(provider, stdout, outFile);
        finish({ state: 'done', ...reply });
      } catch (error) {
        const hint = /log ?in|sign ?in|auth|credential/i.test(stdout + stderr) ? ` Sign in to ${names[provider]} in a console first.` : '';
        finish({ state: 'failed', error: (code ? `${names[provider]} exited with code ${code}. ` : '') + error.message + hint });
      }
    });
  }
  async record(job) {
    if (!this.saveResult) return;
    const body = [`# Review by ${job.reviewer.label}`, '', `Requested by ${job.consoleName || 'a console'}. ${job.why}`, job.focus ? `\nFocus: ${job.focus}` : '', '',
      job.state === 'done' ? job.text : `Review failed: ${job.error}`].join('\n');
    try {
      job.resultId = (await this.saveResult({ text: body, ext: '.md', title: `Review by ${job.reviewer.label}`, kind: 'report', status: job.verdict === 'approve' ? 'passed' : job.state === 'done' ? 'needs-review' : 'failed', summary: job.state === 'done' ? `Verdict: ${job.verdict}` : job.error }, job.context))?.id || null;
    } catch {}
  }
  async status(id, { waitSeconds = 0, sessionId = null } = {}) {
    const job = this.jobs.get(String(id));
    if (!job || (sessionId && job.callerSessionId !== sessionId)) throw new Error('No review with that ID for this console.');
    const wait = Math.min(Math.max(Number(waitSeconds) || 0, 0), 45);
    if (job.state === 'running' && wait) await new Promise(resolve => { const timer = setTimeout(resolve, wait * 1000); job.waiters.push(() => { clearTimeout(timer); resolve(); }); });
    const out = { id: job.id, state: job.state, reviewer: job.reviewer.label, why: job.why, elapsedSeconds: Math.round(((job.finishedAt || this.now()) - job.startedAt) / 1000) };
    if (job.state === 'running') return { ...out, next: 'Call dock/delegation_status again with waitSeconds to keep waiting.' };
    if (job.state === 'failed' || job.state === 'stopped') return { ...out, error: job.error };
    return { ...out, verdict: job.verdict, review: job.text.length > MAX_REPLY ? job.text.slice(0, MAX_REPLY) + '\n[shortened; the full review is in Results]' : job.text, usage: job.usage, resultId: job.resultId };
  }
  stop(id) { this.finishers.get(String(id))?.({ state: 'stopped', error: 'Stopped by the user.' }); }
  stopAll() { for (const id of [...this.finishers.keys()]) this.stop(id); }
}

module.exports = { Delegation, collectChanges, reviewBrief, pickReviewer, reviewerLaunch, parseReply, headroom, cleanFiles, REVIEWERS };
