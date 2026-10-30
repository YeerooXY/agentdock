'use strict';
const fs = require('node:fs'), path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');
const { atomicJson, readJson } = require('./storage.cjs');
const { realRoot, programLaunch, powershell, userShell } = require('./platform.cjs');
const { permitted } = require('./code-panel.cjs');
const { usageEnvironment } = require('./subscription-usage.cjs');
const { collectChanges, reviewBrief, pickReviewer, reviewerLaunch, parseReply, progressStream, progressLog, appendLog, killTree, redactText, REVIEWERS, git: runGit } = require('./delegation.cjs');
const { defaults: routingDefaults, estimateEffort, suggestAssignment } = require('./task-routing.cjs');
const { TASK_SCHEMA_VERSION, ATTEMPT_SCHEMA_VERSION, STEERING_SCHEMA_VERSION, attemptId, migrateTaskRecord } = require('./task-contracts.cjs');
const { SplitTasks, ACTIVE: RUNNING, SUB_ACTIVE, contractPrompt, planReport } = require('./task-plan.cjs');
const TASK_PROVIDERS = [...REVIEWERS, 'opencode'];
const PROCESS_STARTED_AT = Date.now() - process.uptime() * 1000;
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function openCodeEvent(state, event) {
  if (event.type === 'text' && typeof event.part?.text === 'string') state.text = event.part.text.slice(-(state.maxText || 6000));
  if (event.type === 'step_finish') {
    const part = event.part || {}, tokens = part.tokens || {};
    state.length ||= part.reason === 'length';
    state.usage ||= { inputTokens: null, outputTokens: null, cachedInputTokens: null, reportedCost: null };
    for (const [key, value] of [['inputTokens', tokens.input], ['outputTokens', tokens.output], ['cachedInputTokens', tokens.cache?.read], ['reportedCost', part.cost]]) if (Number.isFinite(value) && value >= 0) state.usage[key] = (state.usage[key] ?? 0) + value;
  }
}
function openCodeEvents(stdout) {
  const state = { text: '', length: false, usage: null };
  for (const line of stdout.split(/\r?\n/)) { try { openCodeEvent(state, JSON.parse(line)); } catch {} }
  return state;
}
function openCodeLaunch(executable, { model, workFolder, promptFile }) {
  return programLaunch(executable, ['run', '-m', model, '--dir', workFolder, '--format', 'json', '-f', promptFile, 'Read the attached file and follow it.']);
}

const REFRESHABLE = new Set(['passed', 'needs-you']), REFRESH_LIMIT = 2, MAX_HISTORY = 20, VERIFICATION_AGE = 7 * 24 * 60 * 60_000;
class ProviderError extends Error {}
class CheckLaunchError extends Error {}
const oversizedDiff = error => ['PADDOCK_DIFF_TOO_LARGE', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'].includes(error?.code) || /^(?:stdout|stderr) maxBuffer length exceeded\b/i.test(error?.message || '');
const missingBaseline = error => error?.code === 'PADDOCK_BASELINE_MISSING' || (Number.isInteger(error?.code) && /bad object|bad revision|unknown revision|not a valid object|unable to read tree/i.test(error?.message || ''));
const permanentRepositoryError = error => oversizedDiff(error) || (!error?.killed && !error?.signal && !/index\.lock|timed? ?out|timeout/i.test(error?.message || '') && missingBaseline(error));
const repositoryError = error => oversizedDiff(error)
  ? 'The repository diff is too large to verify. Inspect the changes in the work folder.'
  : missingBaseline(error)
    ? 'The task baseline is unavailable. Inspect the changes in the work folder.'
    : 'The repository changes could not be read. Check the work folder and Git baseline.';
const tail = (text, size) => String(text || '').slice(-size);
const truncate = (text, bytes) => {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= bytes) return text;
  const suffix = '\n[truncated]';
  return buffer.subarray(0, bytes - Buffer.byteLength(suffix)).toString('utf8').replace(/\ufffd$/, '') + suffix;
};
const folderKey = folder => process.platform === 'win32' ? realRoot(folder).toLowerCase() : realRoot(folder);
function input(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw new Error(`Enter ${label}${required ? '' : ' or leave it blank'} (up to ${max} characters).`);
  return value.trim();
}
function implementerLaunch(provider, executable, { model, effort, platform = process.platform } = {}) {
  const args = provider === 'claude'
    ? ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--tools', 'Read,Grep,Glob,Edit,Write', '--strict-mcp-config', '--no-session-persistence', ...(model ? ['--model', model] : [])]
    : provider === 'kiro' ? ['chat', '--no-interactive', '--trust-tools=fs_read,fs_write', ...(model ? ['--model', model] : [])]
      : ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', ...(platform === 'win32' ? ['-c', 'windows.sandbox=unelevated'] : []), ...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), '-'];
  return programLaunch(executable, args);
}
function checkLaunch(command, platform = process.platform) {
  const wrapper = `& {\n${command}\n}\n$paddockChecksOK = $?\nif ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if (-not $paddockChecksOK) { exit 1 }\nexit 0`;
  return platform === 'win32'
    ? { executable: powershell(), args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(wrapper, 'utf16le').toString('base64')] }
    : { executable: userShell(), args: ['-c', command] };
}
function usageText(usage) {
  return usage ? `${usage.inputTokens ?? 'not reported'} input, ${usage.outputTokens ?? 'not reported'} output tokens${usage.cachedInputTokens != null ? `, ${usage.cachedInputTokens} cached input` : ''}${usage.reportedCost != null ? `, OpenCode reported cost $${usage.reportedCost}` : ''}` : 'not reported';
}
function findings(reply) {
  const parsed = reply.text.split(/\r?\n/).filter(line => /^-\s+.+:\d+\s+[—–-]\s+(high|medium|low)\s+[—–-]\s+.+/i.test(line)).slice(0, 12).map(line => line.slice(0, 1000));
  return parsed.length || reply.verdict === 'approve' ? parsed : [tail(redactText(reply.text), 4000) || 'The review did not approve the changes.'];
}
function killAndWait(child, kill, timeoutMs) {
  return new Promise(resolve => {
    let finished = false;
    const finish = closed => { if (finished) return; finished = true; clearTimeout(timer); child.removeListener('close', closedHandler); resolve(closed); };
    const closedHandler = () => finish(true), timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', closedHandler);
    try { kill(child); } catch { finish(false); }
  });
}

class TaskLoop extends EventEmitter {
  constructor(root, { candidates = () => [], repositories = () => [], getLimits = () => [], getSettings = () => ({}), environment = () => ({}), saveResult, spawnProcess = spawn, run = execFile, now = Date.now, killProcess = killTree, platform = process.platform, stopTimeoutMs = 2000, processStartedAt = PROCESS_STARTED_AT, isProcessAlive = processAlive } = {}) {
    super();
    Object.assign(this, { root, candidates, repositories, getLimits, getSettings, environment, saveResult, spawnProcess, run, now, killProcess, platform, stopTimeoutMs, processStartedAt, isProcessAlive });
    this.dir = path.join(root, 'tasks'); this.jobs = new Map(); this.children = new Map(); this.cancellers = new Map(); this.pending = new Map(); this.refreshing = new Map(); this.refreshedAt = new Map(); this.reserved = new Set(); this.records = new Map();
    this.fileCache = new Map(); this.cancelling = new Set(); this.cancellations = new Map();
    this.split = new SplitTasks(this); this.providerSlots = 0; this.providerQueue = []; this.unconfirmed = new Map();
    fs.mkdirSync(this.dir, { recursive: true });
    for (const file of fs.readdirSync(this.dir).filter(file => /^[\w-]+\.json$/.test(file))) {
      const job = readJson(path.join(this.dir, file), null);
      if (!job?.id || path.basename(file, '.json') !== job.id) continue;
      const migrated = migrateTaskRecord(job);
      // Older task files have no recording time. Their PIDs came from an earlier
      // app instance and cannot identify a process started by this instance.
      for (const item of [job, ...(job.subtasks || [])]) if (Number.isInteger(item.processPid) && !Number.isFinite(item.processRecordedAt)) item.processRecordedAt = 0;
      this.jobs.set(job.id, job);
      if (RUNNING.has(job.state) || job.rebuildReport || job.subtasks?.some(sub => SUB_ACTIVE.has(sub.state))) {
        if (RUNNING.has(job.state) || !job.finishedAt) job.finishedAt = this.now();
        job.state = 'interrupted'; job.error = 'Paddock closed before this task finished.';
        const round = job.rounds.at(-1), step = round && [round.implement, round.check, round.review].find(step => step?.state === 'running');
        if (step) { step.state = 'interrupted'; step.elapsedMs = Math.max(0, job.finishedAt - step.startedAt); }
        if (round) round.elapsedMs = Math.max(0, job.finishedAt - round.startedAt);
        if (job.split && job.runStartedAt) { job.activeElapsedMs = (job.activeElapsedMs || 0) + Math.max(0, Math.min(this.now(), job.deadlineAt || this.now()) - job.runStartedAt); delete job.runStartedAt; }
        this.interruptSteps(job, 'interrupted');
        job.unresolved = [...new Set([...(job.unresolved || []), job.error])]; this.persist(job);
        const recovered = Promise.resolve().then(async () => {
          for (const sub of job.subtasks || []) if (sub.workFolder) await this.capture(sub, { final: true });
          return this.capture(job, { final: true });
        }).catch(() => { job.diffError = 'The interrupted task diff could not be read.'; })
          .then(() => { if (!this.closing) { job.rebuildReport = false; this.changed(job); return this.record(job); } }).finally(() => this.pending.delete(job.id));
        this.pending.set(job.id, recovered);
      } else if (migrated) this.persist(job);
    }
  }
  choices(implementerId, { title = '', criteria = '', size, split = false } = {}) {
    const accounts = this.candidates().filter(choice => TASK_PROVIDERS.includes(choice.provider));
    const estimate = estimateEffort({ title, criteria });
    const assignment = suggestAssignment({ size: split ? 'large' : ['small', 'medium', 'large'].includes(size) ? size : estimate.size, candidates: accounts, limits: this.getLimits(), rules: this.getSettings().routing || routingDefaults, now: this.now(), selectedImplementer: implementerId, preferDifferentVendor: split });
    const implementer = accounts.find(choice => choice.id === implementerId) || accounts.find(choice => choice.id === assignment.implementer?.accountId);
    let suggestion = null, why = '';
    const reviewers = accounts.filter(choice => choice.id !== implementer?.id);
    if (reviewers.length) {
      try {
        const picked = pickReviewer({ candidates: reviewers, limits: this.getLimits(), callerProvider: implementer?.provider, now: this.now() });
        suggestion = picked.choice.id; why = picked.why;
      } catch (error) { why = error.message; }
    } else why = 'No other signed-in account is available.';
    const publicChoice = ({ id, provider, label }) => ({ id, provider, label });
    return { implementers: accounts.map(publicChoice), reviewers: reviewers.map(publicChoice), allReviewers: accounts.map(publicChoice), suggestion, why, repos: this.repositories(), estimate, assignment };
  }
  persist(job) { atomicJson(path.join(this.dir, `${job.id}.json`), job); }
  changed(job) { this.persist(job.parentId ? this.jobs.get(job.parentId) : job); this.emit('changed'); }
  assignment(raw, role) {
    const account = this.candidates().find(choice => TASK_PROVIDERS.includes(choice.provider) && choice.id === raw?.accountId && choice.installed !== false && choice.signedIn !== false);
    if (!account) throw new Error(`Choose an installed, signed-in ${role} account.`);
    const model = input(raw.model ?? '', 120, 'a model');
    if (model && (!/^[\w.:/-]{1,120}$/.test(model) || model.startsWith('-'))) throw new Error('Use a model name with letters, numbers, dots, colons, slashes, underscores or dashes.');
    if (account.provider === 'opencode' && !/^(?:opencode-go\/[\w.-]+|opencode\/[\w.-]+-free)$/.test(model)) throw new Error('Choose an OpenCode Go or OpenCode free model.');
    const effort = raw.effort ?? '';
    if (effort && (role !== 'implementer' || account.provider !== 'codex' || !['minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort))) throw new Error('Choose a supported Codex reasoning effort: minimal, low, medium, high or xhigh.');
    return { accountId: account.id, provider: account.provider, label: account.label, model, ...(role === 'implementer' ? { effort } : {}) };
  }
  ensureAvailable(job) {
    if (this.closing) throw new Error('Paddock is closing. Resume after reopening.');
    const active = [...this.jobs.values()].filter(other => other.id !== job.id && (RUNNING.has(other.state) || other.state === 'plan-ready' || this.cancelling.has(other.id)));
    if (this.reserved.has(job.repoKey) || active.some(other => other.repoKey === job.repoKey)) throw new Error('A task is already running for this repository.');
    if (this.reserved.size + active.length >= 2) throw new Error('Two tasks are already running. Wait for one to finish.');
  }
  reviewFindings(reply) { return findings(reply); }
  approvePlan(args) { return this.split.approve(args); }
  resume(id) { return this.split.resume(id); }
  startSplit(job, planning, command = job.checks) {
    const remaining = Math.max(0, job.timeLimitMinutes * 60_000 - (job.activeElapsedMs || 0)), started = this.now();
    job.deadlineAt = started + remaining;
    job.runStartedAt = started; this.persist(job);
    const timer = setTimeout(() => { if (RUNNING.has(job.state)) this.cancel(job, 'needs-you', 'The task reached its time limit.').catch(() => {}); }, remaining); timer.unref?.();
    const running = Promise.resolve().then(() => {
      if (!RUNNING.has(job.state)) return;
      if (!remaining) return this.finish(job, 'needs-you', 'The task reached its time limit.');
      return planning ? this.split.plan(job) : this.split.build(job, command);
    }).catch(error => this.finish(job, error instanceof ProviderError ? 'failed' : 'needs-you', redactText(error.message)))
      .finally(() => { clearTimeout(timer); job.activeElapsedMs = (job.activeElapsedMs || 0) + Math.max(0, this.now() - started); delete job.runStartedAt; this.persist(job); if (this.pending.get(job.id) === running) this.pending.delete(job.id); });
    this.pending.set(job.id, running);
  }
  view({ baselineUntrackedState, baselineUntracked, processPid, processRecordedAt, ...job }) {
    return structuredClone({ ...job, subtasks: job.subtasks?.map(({ baselineUntrackedState, baselineUntracked, processPid, processRecordedAt, ...sub }) => ({ ...sub, log: [] })), log: RUNNING.has(job.state) ? tail([...(job.log || []), ...(job.subtasks || []).flatMap(sub => (sub.log || []).slice(-10).map(line => `${sub.subtaskId}: ${line}`))].join('\n'), 8000).split('\n') : [] });
  }
  snapshot() {
    this.refresh().catch(() => {});
    const jobs = [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
    const active = job => RUNNING.has(job.state) || job.state === 'plan-ready' || this.cancelling.has(job.id);
    return [...jobs.filter(active), ...jobs.filter(job => !active(job)).slice(0, MAX_HISTORY)]
      .sort((a, b) => b.startedAt - a.startedAt).map(job => this.view(job));
  }
  git(cwd, args) { return runGit(cwd, args, this.run); }
  async start(args = {}) {
    if (this.closing) throw new Error('Paddock is closing. Start the task after reopening.');
    const title = input(args.title, 200, 'a task title', true), criteria = input(args.criteria, 12000, 'acceptance criteria', true);
    const checks = input(args.checks ?? '', 4000, 'a checks command');
    if (args.split !== undefined && typeof args.split !== 'boolean') throw new Error('Split into subtasks must be on or off.');
    const split = args.split === true, workflow = split ? 'worktree' : args.workflow ?? 'current', maxRounds = args.maxRounds ?? 3, timeLimitMinutes = args.timeLimitMinutes ?? 30;
    if (split && checks !== redactText(checks)) throw new Error('Use a checks command that can be saved without private text. Read credentials from the environment.');
    if (!['current', 'worktree'].includes(workflow)) throw new Error('Choose Current branch or Separate worktree.');
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5) throw new Error('Use 1 to 5 rounds.');
    if (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 5 || timeLimitMinutes > 120) throw new Error('Use a time limit of 5 to 120 minutes.');
    const suggested = split ? this.choices(args.planner?.accountId ?? args.implementer?.accountId, { split: true }).assignment : null;
    const implementer = this.assignment(split ? args.planner ?? args.implementer ?? suggested.implementer : args.implementer, 'implementer');
    const reviewerInput = args.reviewer === undefined && split ? suggested.reviewer : args.reviewer;
    const reviewer = reviewerInput == null ? null : this.assignment(reviewerInput, 'reviewer');
    if (reviewer?.accountId === implementer.accountId) throw new Error('Choose a reviewer account different from the implementer.');
    if (typeof args.repo !== 'string' || !path.isAbsolute(args.repo) || !this.repositories().some(choice => folderKey(choice.path) === folderKey(args.repo))) throw new Error('Choose a project folder or an open local console folder.');
    let repo, repoKey;
    try {
      repo = realRoot((await this.git(args.repo, ['rev-parse', '--show-toplevel'])).trim());
      const common = (await this.git(repo, ['rev-parse', '--git-common-dir'])).trim();
      repoKey = folderKey(path.resolve(repo, common));
    } catch { throw new Error('Choose a folder in a Git working tree with a commit.'); }
    if (folderKey(args.repo) !== folderKey(repo)) throw new Error('Select the Git repository root as the project or console folder. Subfolders cannot start tasks.');
    if (this.closing) throw new Error('Paddock is closing. Start the task after reopening.');
    const active = [...this.jobs.values()].filter(job => RUNNING.has(job.state) || job.state === 'plan-ready' || this.cancelling.has(job.id));
    if (this.reserved.has(repoKey) || active.some(job => job.repoKey === repoKey)) throw new Error('A task is already running for this repository.');
    if (this.reserved.size + active.length >= 2) throw new Error('Two tasks are already running. Wait for one to finish.');
    this.reserved.add(repoKey);
    try {
      const id = randomUUID(), sourceRevision = (await this.git(repo, ['rev-parse', 'HEAD'])).trim();
      let workFolder = repo, baseline = sourceRevision, baselineUntracked = [], baselineUntrackedState = {}, branch = null;
      if (workflow === 'worktree') {
        workFolder = path.join(this.root, 'task-worktrees', id); branch = `paddock/task-${id.slice(0, 8)}`;
        fs.mkdirSync(path.dirname(workFolder), { recursive: true });
        await this.git(repo, ['worktree', 'add', workFolder, '-b', branch, sourceRevision]);
      } else {
        baselineUntracked = (await this.git(repo, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
        const states = [];
        for (const file of baselineUntracked) states.push([file, await this.fileStamp(repo, file)]);
        baselineUntrackedState = Object.fromEntries(states);
        baseline = (await this.git(repo, ['stash', 'create'])).trim() || sourceRevision;
      }
      const suggestion = this.choices(implementer.accountId);
      const job = { id, schemaVersion: TASK_SCHEMA_VERSION, attemptSchemaVersion: ATTEMPT_SCHEMA_VERSION, steeringSchemaVersion: STEERING_SCHEMA_VERSION, eventSequence: 0, steeringSequence: 0,
        repo, repoKey, workFolder, title: redactText(title), criteria: redactText(criteria), checks: redactText(checks), workflow, branch, sourceRevision, baseline, baselineUntracked, baselineUntrackedState,
        implementer, reviewer, why: { implementer: 'Selected by you.', reviewer: reviewer ? reviewer.accountId === suggestion.suggestion ? `Selected by you. Suggested: ${suggestion.why}` : 'Selected by you.' : 'No review selected.' },
        maxRounds, timeLimitMinutes, startedAt: this.now(), finishedAt: null, state: split ? 'planning' : 'implementing', rounds: [], unresolved: [], log: [], error: '', fingerprint: null, diffStat: '', finalDiff: '', resultId: null,
        ...(split ? { split: true, planner: implementer, planReviewer: reviewer, planRounds: [], subtasks: [], parallelLimit: 2, activeElapsedMs: 0, integrationHead: sourceRevision } : {}) };
      this.jobs.set(id, job); this.reserved.delete(repoKey); this.changed(job);
      if (this.closing) { await this.finish(job, 'interrupted', 'Paddock closed before this task finished.'); return this.view(job); }
      // The command is held separately while running; agents only receive check output.
      if (split) this.startSplit(job, true, checks);
      else this.pending.set(id, this.runTask(job, checks).catch(error => this.finish(job, error instanceof ProviderError ? 'failed' : 'needs-you', error instanceof ProviderError ? redactText(error.message) : repositoryError(error))).finally(() => this.pending.delete(id)));
      return this.view(job);
    } finally { this.reserved.delete(repoKey); }
  }
  async changes(job, maxDiff = Infinity) {
    if ((job.baselineUntracked || []).some(file => !Object.hasOwn(job.baselineUntrackedState || {}, file))) throw Object.assign(new Error('The baseline hashes for pre-existing untracked files are unavailable.'), { code: 'PADDOCK_BASELINE_MISSING' });
    const changes = await collectChanges(job.workFolder, { base: job.baseline, exclude: job.baselineUntracked, allowEmpty: true, maxDiff, maxUntracked: Infinity }, this.run);
    changes.trackedFiles = [...changes.files]; changes.baselineChanges = [];
    for (const [file, before] of Object.entries(job.baselineUntrackedState || {})) {
      const after = await this.fileStamp(job.workFolder, file);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      if (!permitted(file)) { changes.omitted++; continue; }
      const status = after ? 'modified' : 'deleted';
      changes.baselineChanges.push({ file, status, before: before?.hash || 'metadata only', after: after?.hash || (after ? 'metadata only' : 'absent') });
      changes.files.push(file);
      changes.diff += `\nPreviously untracked file ${status}: ${file}\nBaseline SHA-256: ${before?.hash || 'metadata only'}\nCurrent SHA-256: ${after?.hash || (after ? 'metadata only' : 'absent')}\n${after ? 'Read the current file to review its changes.\n' : ''}`;
    }
    if (changes.diff.length > maxDiff) throw Object.assign(new Error('The diff is too large for review.'), { code: 'PADDOCK_DIFF_TOO_LARGE' });
    return changes;
  }
  async fileStamp(folder, file) {
    const target = path.resolve(folder, file);
    try {
      const stat = fs.lstatSync(target), key = JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, stat.isSymbolicLink()]);
      const cached = this.fileCache.get(target);
      if (cached?.key === key) return cached.value;
      let value;
      if (!permitted(file) || (!stat.isFile() && !stat.isSymbolicLink())) value = { size: stat.size, mtimeMs: stat.mtimeMs };
      else {
        const hash = createHash('sha256');
        if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(target));
        else for await (const chunk of fs.createReadStream(target)) hash.update(chunk);
        value = { hash: hash.digest('hex'), kind: stat.isSymbolicLink() ? 'link' : 'file', mode: stat.mode & 0o777 };
      }
      this.fileCache.set(target, { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, key, value }); return value;
    } catch (error) { if (error.code === 'ENOENT') { this.fileCache.delete(target); return null; } throw error; }
  }
  async fingerprint(job) {
    const diff = await this.git(job.workFolder, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--binary', job.baseline, '--']);
    const files = (await this.git(job.workFolder, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter(Boolean).sort();
    const hash = createHash('sha256').update(diff);
    if (job.split) { hash.update(await this.git(job.workFolder, ['rev-parse', 'HEAD'])); hash.update(await this.git(job.workFolder, ['branch', '--show-current'])); }
    for (const file of files) {
      const stamp = await this.fileStamp(job.workFolder, file);
      if (stamp) hash.update(JSON.stringify([file, stamp]));
    }
    return hash.digest('hex');
  }
  prompt(job, changes) {
    const failures = job.rounds.flatMap(round => round.check?.outcome === 'failed' || round.check?.state === 'failed' ? [`Round ${round.number} checks (exit ${round.check.exitCode ?? 'unknown'}):\n${tail(round.check.output, 4000)}`] : []);
    const confirmed = job.rounds.flatMap(round => round.review?.findings || []);
    return [
      `Repository task: ${job.title}`, `Acceptance criteria:\n${job.criteria}`, `Source revision: ${job.sourceRevision}`, `Workflow: ${job.workflow}; work folder: ${job.workFolder}`,
      job.split || job.parentId ? contractPrompt(job) : '',
      `Files changed so far by this task:\n${[...changes.files, ...changes.untracked].join('\n') || '(none)'}`,
      failures.length ? `Previous failed checks:\n${tail(failures.join('\n\n'), 4000)}` : '',
      confirmed.length ? `Confirmed review findings (verify each against the current code and fix remaining problems):\n${confirmed.join('\n')}` : '',
      job.ownershipFindings?.length ? `Ownership findings:\n${job.ownershipFindings.join('\n')}` : '',
      job.parentId && job.unresolved?.length ? `Previous unresolved items:\n${job.unresolved.join('\n')}` : '',
      'Implement the task and acceptance criteria in this folder. Preserve pre-existing work. Do not commit. Do not run Git commands that change state (including stash, reset, checkout, switch, clean, add and worktree). Do not change the checks command or task assignments. Reply with a short summary. Your summary does not determine whether the task passes.'
    ].filter(Boolean).join('\n\n');
  }
  async runTask(job, command, { verifyFirst = false, additionalRounds = false, manageTime = true } = {}) {
    const timer = manageTime ? setTimeout(() => this.cancel(job, 'needs-you', 'The task reached its time limit.').catch(() => {}), job.timeLimitMinutes * 60_000) : null;
    timer?.unref?.();
    try {
      const first = job.rounds.length + 1, last = additionalRounds ? job.rounds.length + job.maxRounds : job.maxRounds;
      for (let number = first; number <= last && RUNNING.has(job.state); number++) {
        if (this.now() >= (job.deadlineAt ?? job.startedAt + job.timeLimitMinutes * 60_000)) return await this.finish(job, 'needs-you', 'The task reached its time limit.');
        const changes = await this.changes(job);
        if (!RUNNING.has(job.state)) return;
        const brief = this.prompt(job, changes);
        const round = { attemptId: attemptId(job.id, number), schemaVersion: ATTEMPT_SCHEMA_VERSION, steeringSequenceConsumed: 0, number, startedAt: this.now(), elapsedMs: null, implement: null, check: null, review: null };
        job.rounds.push(round);
        if (!(verifyFirst && number === first)) {
          round.implement = { ...job.implementer, state: 'running', startedAt: this.now(), elapsedMs: null, usage: null };
          job.state = 'implementing'; this.changed(job);
          const implemented = await this.provider(job, round.implement, brief, false);
          if (!RUNNING.has(job.state)) return;
          round.implement.summary = tail(implemented.summary, 4000); round.implement.state = 'done'; this.changed(job);
          if ((job.split || job.parentId) && /CONTRACT_CHANGE_REQUIRED/i.test(implemented.summary || '')) return await this.finish(job, 'needs-you', 'The implementer requested a contract change. Review the plan before continuing.');
          if (job.parentId) await this.split.ownership(job, round);
        }
        const checkedTree = await this.fingerprint(job);
        const checkedHead = job.split ? (await this.git(job.workFolder, ['rev-parse', 'HEAD'])).trim() : undefined;
        if (!RUNNING.has(job.state)) return;
        if (command) {
          job.state = 'checking'; round.check = { state: 'running', startedAt: this.now(), elapsedMs: null, exitCode: null, output: '', fingerprint: checkedTree, head: checkedHead }; this.changed(job);
          let result;
          try { result = await this.process(job, checkLaunch(command, this.platform), { environment: this.checkEnvironment(), check: true, step: round.check, timeoutMs: 15 * 60_000 }); }
          catch (error) {
            if (!RUNNING.has(job.state)) return;
            if (!(error instanceof CheckLaunchError)) throw error;
            Object.assign(round.check, { state: 'failed', outcome: 'failed', failureClass: 'infrastructure', output: 'The checks command could not start.' });
            return await this.finish(job, 'needs-you', 'The checks command could not start.');
          }
          if (!RUNNING.has(job.state)) return;
          const outcome = result.code === 0 && !result.timedOut ? 'passed' : 'failed';
          Object.assign(round.check, { state: outcome, outcome, ...(outcome === 'failed' ? { failureClass: result.timedOut || result.code == null ? 'infrastructure' : 'checks' } : {}), exitCode: result.code, output: result.output, timedOut: result.timedOut }); this.changed(job);
        } else round.check = { state: 'not-set', elapsedMs: 0, fingerprint: checkedTree, head: checkedHead };
        const reviewGatePassed = !command || (round.check.state === 'passed' && round.check.outcome === 'passed');
        if (job.reviewer && reviewGatePassed) {
          const reviewTree = await this.fingerprint(job);
          if (!RUNNING.has(job.state)) return;
          if (command && reviewTree !== round.check.fingerprint) {
            round.check.state = 'stale'; round.check.failureClass = 'stale-evidence';
            round.review = { state: 'skipped', reason: 'stale-check-evidence', findings: [] };
            this.changed(job);
          } else {
            let reviewChanges;
            try { reviewChanges = await this.changes(job, 150_000); }
            catch (error) { return await this.finish(job, 'needs-you', repositoryError(error)); }
            if (!RUNNING.has(job.state)) return;
            job.state = 'reviewing'; round.review = { ...job.reviewer, state: 'running', startedAt: this.now(), elapsedMs: null, usage: null, findings: [], fingerprint: reviewTree, head: job.split ? (await this.git(job.workFolder, ['rev-parse', 'HEAD'])).trim() : undefined };
            this.changed(job);
            const review = await this.provider(job, round.review, reviewBrief({ focus: `Task: ${job.title}\nAcceptance criteria:\n${job.criteria}${job.split || job.parentId ? '\n' + contractPrompt(job) : ''}\nReport only confirmed problems, with file and line evidence.`, changes: reviewChanges }), true);
            if (!RUNNING.has(job.state)) return;
            Object.assign(round.review, { state: 'done', verdict: review.verdict, findings: findings(review), text: tail(review.text, 6000) });
            if (round.review.findings.length && round.review.verdict === 'approve') round.review.verdict = 'changes-requested';
          }
        } else if (!job.reviewer) round.review = { state: 'not-set', elapsedMs: 0, findings: [] };
        else round.review = { state: 'skipped', reason: 'checks-failed', findings: [] };
        const verifiedTree = await this.fingerprint(job);
        if (!RUNNING.has(job.state)) return;
        job.fingerprint = verifiedTree; job.observedFingerprint = verifiedTree; this.refreshedAt.set(job.id, this.now());
        if (round.check.fingerprint !== verifiedTree && command) { round.check.state = 'stale'; if (round.check.outcome === 'passed') round.check.failureClass = 'stale-evidence'; }
        if (round.review.fingerprint && round.review.fingerprint !== verifiedTree) round.review.state = 'stale';
        round.elapsedMs = this.now() - round.startedAt;
        job.unresolved = this.unresolved(job);
        await this.capture(job);
        if (!RUNNING.has(job.state)) return;
        this.changed(job);
        if (!job.unresolved.length) return await this.finish(job, 'passed');
        if (number === last) return await this.finish(job, 'needs-you');
      }
      if (RUNNING.has(job.state)) await this.finish(job, 'needs-you', 'The task used its remaining rounds.');
    } catch (error) {
      if (RUNNING.has(job.state)) await this.finish(job, error instanceof ProviderError ? 'failed' : 'needs-you', error instanceof ProviderError ? redactText(error.message) : repositoryError(error));
    } finally { clearTimeout(timer); }
  }
  checkEnvironment() {
    return usageEnvironment(process.env);
  }
  async provider(job, step, brief, review) {
    const outFile = path.join(this.dir, `${job.id}.reply.md`);
    let tempDir, release;
    try {
      release = await this.acquireProvider(job);
      if (!RUNNING.has(job.state)) return {};
      const choice = this.candidates().find(choice => choice.id === step.accountId);
      if (!choice?.executable) throw new ProviderError(`${step.label} is no longer installed or signed in.`);
      const env = { ...this.environment(step.accountId, step.provider) };
      let launch, before;
      if (step.provider === 'opencode') {
        const tempRoot = path.join(this.root, 'task-temp'); fs.mkdirSync(tempRoot, { recursive: true });
        tempDir = fs.mkdtempSync(path.join(tempRoot, 'opencode-'));
        const promptFile = path.join(tempDir, 'prompt.txt'), configFile = path.join(tempDir, 'config.json');
        fs.writeFileSync(promptFile, brief, { mode: 0o600 });
        const permission = { edit: review ? 'deny' : 'allow', bash: 'deny', webfetch: 'deny', websearch: 'deny', external_directory: 'deny' };
        fs.writeFileSync(configFile, JSON.stringify({ permission }), { mode: 0o600 });
        for (const key of Object.keys(env)) if (/^opencode_/i.test(key)) delete env[key];
        env.OPENCODE_CONFIG = configFile; env.OPENCODE_PERMISSION = JSON.stringify(permission);
        launch = openCodeLaunch(choice.executable, { model: step.model, workFolder: job.workFolder, promptFile });
        before = await this.fingerprint(job);
      } else launch = review ? reviewerLaunch(step.provider, choice.executable, { outFile, model: step.model, platform: this.platform }) : implementerLaunch(step.provider, choice.executable, { ...step, platform: this.platform });
      const result = await this.process(job, launch, { environment: env, brief: step.provider === 'opencode' ? '' : brief, provider: step.provider, step });
      if (!RUNNING.has(job.state)) return {};
      if (result.code !== 0 || result.providerError) {
        const hint = /log ?in|sign ?in|auth|credential/i.test(result.stdout + result.output) ? ` Sign in to ${step.label} in a console first.` : '';
        throw new ProviderError(`${step.label} ${result.code ? `exited with code ${result.code}` : 'could not finish the request'}.${hint}`);
      }
      if (step.provider === 'opencode') {
        const parsed = result.openCode;
        if (parsed.length && before === await this.fingerprint(job)) throw new ProviderError('The model hit its output limit.');
        const text = redactText(parsed.text, env).trim();
        if (review) {
          if (!text && step.role !== 'planner') throw new ProviderError(`${step.label} returned no valid review answer.`);
          return { text, verdict: /VERDICT:\s*approve\b/i.test(text) ? 'approve' : /VERDICT:\s*changes-requested/i.test(text) ? 'changes-requested' : 'unclear', usage: parsed.usage };
        }
        return { summary: text || 'No summary reported.' };
      }
      if (review) {
        try {
          const reply = parseReply(step.provider, result.stdout, outFile);
          return { ...reply, text: redactText(reply.text, env) };
        } catch { if (step.role === 'planner') return { text: '', verdict: 'unclear' }; throw new ProviderError(`${step.label} returned no valid review answer.`); }
      }
      if (step.provider === 'claude') {
        try { return { summary: redactText(parseReply('claude', result.stdout).text, env) }; }
        catch { return { summary: 'No summary reported.' }; }
      }
      if (step.provider === 'kiro') return { summary: tail(redactText(result.stdout, env).trim(), 4000) || 'No summary reported.' };
      return { summary: result.summary || 'No summary reported.' };
    } catch (error) { throw error instanceof ProviderError ? error : new ProviderError(`${step.label} could not complete the request.`); }
    finally { release?.(); try { fs.unlinkSync(outFile); } catch {} if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true }); }
  }
  acquireProvider(job) {
    return new Promise(resolve => {
      const grant = () => {
        this.providerSlots++;
        let released = false;
        resolve(() => {
          if (released) return; released = true;
          const free = () => { this.providerSlots--; this.providerQueue.shift()?.grant(); };
          const lingering = this.unconfirmed.get(job.id);
          if (lingering) lingering.once('close', free); else free();
        });
      };
      if (this.providerSlots < 4) grant(); else this.providerQueue.push({ job, grant, cancel: () => resolve(() => {}) });
    });
  }
  cancelProviderQueue(job) {
    this.providerQueue = this.providerQueue.filter(item => {
      if (item.job.id !== job.id && item.job.parentId !== job.id) return true;
      item.cancel(); return false;
    });
  }
  process(job, launch, { environment, brief = '', provider, check = false, step, timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      let child, finished = false, stdout = '', output = '', pending = '', summary = '', providerError = false, deadlineHit = false, exitSeen = false, stopping, timer, progressTimer;
      const openCode = { text: '', length: false, usage: null, maxText: step?.role === 'planner' ? 64000 : 6000 };
      const decoder = new StringDecoder('utf8'), errDecoder = new StringDecoder('utf8');
      const privateEnvironment = check ? Object.fromEntries(Object.entries(environment).filter(([key]) => /token|secret|password|key/i.test(key))) : environment;
      const append = progressLog({ brief, environment, append: line => appendLog(job, line) });
      const stream = provider ? progressStream(provider, text => append(text.replaceAll('read-only command', 'command').replaceAll('read-only tool', 'tool'))) : null;
      const consume = text => {
        const lines = (pending + text).split('\n'); pending = lines.pop();
        if (pending.length > 256_000) pending = '';
        for (const line of lines) {
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (!event || typeof event !== 'object') continue;
          if (provider === 'opencode') { openCodeEvent(openCode, event); step.usage = openCode.usage; }
          if (provider === 'codex' && event.type === 'turn.completed' && event.usage) {
            const previous = step.usage, reported = {};
            for (const [target, source] of [['inputTokens', 'input_tokens'], ['outputTokens', 'output_tokens'], ['cachedInputTokens', 'cached_input_tokens']]) reported[target] = Number.isFinite(event.usage[source]) && (!previous || Number.isFinite(previous[target])) ? (previous?.[target] || 0) + event.usage[source] : null;
            step.usage = reported;
          }
          if (provider === 'claude' && (event.type === 'result' || (!event.type && 'result' in event))) {
            step.usage = event.usage ? { inputTokens: event.usage.input_tokens ?? null, outputTokens: event.usage.output_tokens ?? null, cachedInputTokens: event.usage.cache_read_input_tokens ?? null, turns: event.num_turns ?? null } : null;
            providerError ||= !!event.is_error;
          }
          if (provider === 'codex' && ['turn.failed', 'error'].includes(event.type)) providerError = true;
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') summary = redactText(tail(event.item.text, 4000), environment);
        }
      };
      const clearProcess = () => {
        if (!Number.isInteger(child?.pid) || job.processPid !== child.pid) return;
        delete job.processPid; delete job.processRecordedAt;
        if (this.jobs.has(job.parentId || job.id)) this.changed(job);
      };
      const complete = (error, code = null, timedOut = deadlineHit) => {
        if (finished) return; finished = true;
        clearTimeout(timer); clearTimeout(progressTimer); stream?.end();
        const last = decoder.end();
        if (check) output += last; else { stdout = tail(stdout + last, 2_000_000); consume(last + '\n'); }
        output = tail(redactText(output + errDecoder.end(), privateEnvironment), check ? 8000 : 4000);
        step.elapsedMs = this.now() - step.startedAt;
        if (!error && child && !exitSeen) this.unconfirmed.set(job.id, child);
        else clearProcess();
        this.children.delete(job.id); this.cancellers.delete(job.id);
        if (error) { step.state = 'failed'; reject(error); } else resolve({ code, timedOut, stdout, output, summary, openCode, providerError, exitConfirmed: exitSeen });
      };
      const stopChild = ({ wait = false } = {}) => {
        if (!wait) { this.killProcess(child); complete(null); return; }
        stopping ||= killAndWait(child, this.killProcess, this.stopTimeoutMs).then(closed => { complete(null); return closed; });
        return stopping;
      };
      try {
        child = this.spawnProcess(launch.executable, launch.args, { cwd: job.workFolder, env: environment, windowsHide: true, shell: false, detached: this.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        if (Number.isInteger(child.pid)) { job.processPid = child.pid; job.processRecordedAt = this.now(); if (this.jobs.has(job.parentId || job.id)) this.changed(job); }
        this.children.set(job.id, child); this.cancellers.set(job.id, stopChild);
        child.stdout?.on('data', chunk => {
          if (finished) return;
          const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
          if (check) output = tail(output + text, 8000);
          else { stdout = tail(stdout + text, 2_000_000); consume(text); stream?.push(chunk); }
          if (!progressTimer) progressTimer = setTimeout(() => { progressTimer = null; if (RUNNING.has(job.state)) this.emit('changed'); }, 100);
        });
        child.stderr?.on('data', chunk => { if (!finished) output = tail(output + (typeof chunk === 'string' ? chunk : errDecoder.write(chunk)), check ? 8000 : 4000); });
        child.once('error', () => complete(check ? new CheckLaunchError('The checks command could not start.') : new ProviderError(`${step.label} could not start.`)));
        child.once('close', code => { exitSeen = true; this.unconfirmed.delete(job.id); clearProcess(); complete(null, code); });
        child.stdin?.on('error', () => {}); child.stdin?.end(brief);
        if (timeoutMs) { timer = setTimeout(() => { deadlineHit = true; stopChild({ wait: true }); }, timeoutMs); timer.unref?.(); }
      } catch { complete(check ? new CheckLaunchError('The checks command could not start.') : new ProviderError(`${step.label} could not start.`)); if (child) this.killProcess(child); }
    });
  }
  unresolved(job) {
    const rounds = [...job.rounds].reverse(), items = [];
    const check = rounds.map(round => round.check).find(step => step?.outcome || ['failed', 'stale'].includes(step?.state));
    const review = rounds.map(round => round.review).find(step => step?.verdict || step?.state === 'stale');
    if (check?.state === 'failed' || check?.outcome === 'failed') items.push(check.timedOut ? 'Checks timed out after 15 minutes.' : `Checks failed (exit ${check.exitCode ?? 'unknown'}).`);
    if (check?.state === 'stale') items.push(job.split ? 'Checks are out of date. Files changed during or after verification.' : 'Checks are stale. Files changed during or after verification.');
    if (review?.state === 'stale') items.push('Review is stale. Files changed during or after verification.');
    if (review?.verdict && review.verdict !== 'approve') items.push(...(review.findings.length ? review.findings : ['The review did not approve the changes.']));
    items.push(...(job.ownershipFindings || []));
    if (job.split) for (const sub of job.subtasks || []) if (sub.state !== 'merged') items.push(...(sub.unresolved || []).map(item => `${sub.subtaskId}: ${item}`));
    return items;
  }
  async capture(job, { final = false, apply = true } = {}) {
    if (this.closing || (!final && !RUNNING.has(job.state) && (!REFRESHABLE.has(job.state) || job.verificationExpired))) return false;
    const epoch = job.freezeEpoch || 0;
    const changes = await this.changes(job);
    let diff = changes.diff; const missing = new Set();
    for (const file of [...changes.untracked, ...changes.baselineChanges.filter(change => change.status === 'modified').map(change => change.file)]) {
      const target = path.join(job.workFolder, file);
      let stat, content;
      try {
        stat = fs.lstatSync(target);
        if (stat.isFile() && stat.size <= 60 * 1024) content = fs.readFileSync(target, 'utf8');
      } catch (error) { if (error.code === 'ENOENT') { missing.add(file); continue; } throw error; }
      const existing = changes.baselineChanges.some(change => change.file === file);
      if (!stat.isFile() || stat.size > 60 * 1024) { diff += `\n${existing ? 'Modified previously untracked' : 'New'} file: ${file} (content omitted)\n`; continue; }
      const lines = content.split('\n'); if (content.endsWith('\n')) lines.pop();
      diff += content.includes('\0') ? `\nBinary file: ${file} (content omitted)\n` : existing ? `\nCurrent content of previously untracked file: ${file}\n${content}\n` : `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content ? lines.length : 0} @@\n${content ? lines.map(line => '+' + line).join('\n') + '\n' : ''}${content && !content.endsWith('\n') ? '\\ No newline at end of file\n' : ''}`;
      if (Buffer.byteLength(diff) > 60 * 1024) break;
    }
    const stat = changes.trackedFiles.length ? await this.git(job.workFolder, ['diff', '--stat', '--no-ext-diff', job.baseline, '--', ...changes.trackedFiles]) : '';
    if (this.closing || epoch !== (job.freezeEpoch || 0)) return false;
    const untracked = changes.untracked.filter(file => !missing.has(file));
    const captured = { diffStat: tail(redactText(stat + (untracked.length ? `\n${untracked.length} new file(s): ${untracked.join(', ')}` : '') + changes.baselineChanges.map(change => `\n${change.file}: previously untracked, ${change.status}`).join('') + (changes.omitted ? `\n${changes.omitted} private or generated file(s) omitted.` : '')), 8000) || 'No task changes.',
      finalDiff: truncate(redactText(diff), 60 * 1024), changedFiles: [...changes.files, ...untracked], diffError: '' };
    if (apply) Object.assign(job, captured);
    return apply ? true : captured;
  }
  settle(job, state, error = '') {
    job.freezeEpoch = (job.freezeEpoch || 0) + 1;
    if (state === 'interrupted') job.rebuildReport = true;
    job.state = state; job.error = error; job.finishedAt = this.now();
    const round = job.rounds.at(-1);
    if (round) {
      round.elapsedMs = job.finishedAt - round.startedAt;
      for (const step of [round.implement, round.check, round.review]) if (step?.state === 'running') { step.state = state; step.elapsedMs = job.finishedAt - step.startedAt; }
    }
    for (const planRound of job.planRounds || []) for (const step of [planRound.planner, planRound.repair, planRound.review]) if (step?.state === 'running') { step.state = state; step.elapsedMs = job.finishedAt - step.startedAt; }
    job.unresolved = [...new Set([...this.unresolved(job), ...(error ? [error] : [])])];
    this.changed(job);
  }
  interruptSteps(job, state) {
    for (const round of job.planRounds || []) for (const step of [round.planner, round.repair, round.review]) if (step?.state === 'running') { step.state = state; step.elapsedMs = this.now() - step.startedAt; }
    for (const sub of job.subtasks || []) if (SUB_ACTIVE.has(sub.state) || sub.state === 'passed' && !sub.mergedAt) {
      if (sub.runStartedAt) { sub.elapsedMs = (sub.elapsedMs || 0) + Math.max(0, this.now() - sub.runStartedAt); delete sub.runStartedAt; }
      this.settle(sub, state, state === 'interrupted' ? 'Paddock closed before this subtask finished.' : 'Stopped. All work was kept.');
    }
  }
  async finish(job, state, error = '') {
    if (!RUNNING.has(job.state)) return;
    this.settle(job, state, error);
    await this.finalize(job);
  }
  async finalize(job) {
    if (this.closing) return;
    try { await this.capture(job, { final: true }); } catch (failure) {
      job.diffError = repositoryError(failure);
      if (job.state === 'passed') job.state = 'needs-you';
      job.unresolved = [...new Set([...job.unresolved, job.diffError])];
    }
    if (this.closing) return;
    this.changed(job); if (!job.parentId) await this.record(job);
  }
  cancel(job, state, error) {
    if (this.cancellations.has(job?.id)) return this.cancellations.get(job.id);
    if (!job || !RUNNING.has(job.state) && job.state !== 'plan-ready') return Promise.resolve();
    this.cancelling.add(job.id); this.settle(job, state, error);
    this.interruptSteps(job, state === 'interrupted' ? 'interrupted' : 'stopped'); this.cancelProviderQueue(job);
    const halted = [job, ...(job.subtasks || [])].map(item => this.cancellers.get(item.id)?.({ wait: true }));
    const finished = Promise.all(halted).then(async closed => {
      if (this.closing) return;
      if (closed.includes(false)) {
        job.error += ' Process exit was not confirmed before the wait timed out.';
        job.unresolved = [...new Set([...job.unresolved, job.error])];
      }
      if (job.split) await this.pending.get(job.id);
      if (job.split) for (const sub of job.subtasks || []) if (sub.workFolder) try { await this.capture(sub, { final: true }); } catch { sub.diffError = 'The subtask diff could not be read.'; }
      job.finishedAt = this.now(); const round = job.rounds.at(-1); if (round) round.elapsedMs = job.finishedAt - round.startedAt;
      await this.finalize(job);
    }).finally(() => { this.cancelling.delete(job.id); this.cancellations.delete(job.id); });
    this.cancellations.set(job.id, finished); return finished;
  }
  async stop(id) {
    const job = this.jobs.get(String(id));
    if (!job) throw new Error('Task not found.');
    await this.cancel(job, 'stopped', 'Stopped by you. All work was kept.');
    return this.view(job);
  }
  interruptAll() {
    this.closing = true;
    for (const job of this.jobs.values()) if (RUNNING.has(job.state) || this.cancelling.has(job.id)) {
      job.rebuildReport = true;
      this.settle(job, 'interrupted', 'Paddock closed before this task finished.');
      this.interruptSteps(job, 'interrupted'); this.cancelProviderQueue(job);
      for (const item of [job, ...(job.subtasks || [])]) this.cancellers.get(item.id)?.();
    }
  }
  refreshable(job) { return !this.closing && !this.cancelling.has(job?.id) && REFRESHABLE.has(job?.state) && !!job.fingerprint && !job.verificationExpired; }
  async refresh(id) {
    if (id === undefined) {
      const slots = Math.max(0, REFRESH_LIMIT - this.refreshing.size);
      const jobs = [...this.jobs.values()].filter(job => this.refreshable(job) && !this.refreshing.has(job.id) && this.now() - (this.refreshedAt.get(job.id) || 0) > 5000)
        .sort((a, b) => (this.refreshedAt.get(a.id) || 0) - (this.refreshedAt.get(b.id) || 0)).slice(0, slots);
      await Promise.all(jobs.map(job => this.refresh(job.id))); return;
    }
    if (this.refreshing.has(id)) return this.refreshing.get(id);
    const job = this.jobs.get(id);
    if (!this.refreshable(job)) return;
    this.refreshedAt.set(id, this.now());
    const pending = (async () => {
      const expired = this.now() - (job.finishedAt || job.startedAt) > VERIFICATION_AGE;
      let current = null, captured, error = expired ? 'Verification expired after seven days. Inspect the saved diff before accepting this task.' : '';
      if (!expired) try {
        current = await this.fingerprint(job);
        if (current !== (job.observedFingerprint ?? job.fingerprint)) captured = await this.capture(job, { apply: false });
      } catch (failure) {
        if (!permanentRepositoryError(failure)) return false;
        error = repositoryError(failure);
      }
      if (!this.refreshable(job)) return;
      if (error) {
        job.verificationExpired = true; job.state = 'needs-you'; job.error = error;
        for (const round of job.rounds) for (const step of [round.check, round.review]) if (step?.fingerprint && step.state !== 'not-set') step.state = 'stale';
        job.unresolved = [...new Set([...this.unresolved(job), error])]; this.changed(job); await this.record(job); return true;
      }
      if (current === (job.observedFingerprint ?? job.fingerprint)) return true;
      if (!captured) return false;
      let changed = false;
      for (const round of job.rounds) for (const step of [round.check, round.review]) {
        if (step?.fingerprint && step.fingerprint !== current && !['stale', 'not-set'].includes(step.state)) { step.state = 'stale'; changed = true; }
      }
      job.observedFingerprint = current;
      Object.assign(job, captured);
      if (changed && job.state === 'passed') job.state = 'needs-you';
      job.unresolved = [...new Set([...this.unresolved(job), ...(job.error ? [job.error] : [])])];
      if (this.closing) return;
      this.changed(job); await this.record(job); return true;
    })().finally(() => this.refreshing.delete(id));
    this.refreshing.set(id, pending); return pending;
  }
  async accept(id) {
    const job = this.jobs.get(String(id));
    if (!job) throw new Error('Task not found.');
    if (!['passed', 'needs-you'].includes(job.state)) throw new Error('Accept a task after it has passed or needs your review.');
    await this.cancellations.get(job.id); await this.pending.get(job.id);
    if (await this.refresh(job.id) === false) throw new Error('Verification could not be refreshed. Try Accept again.');
    if (!['passed', 'needs-you'].includes(job.state)) throw new Error('Accept a task after it has passed or needs your review.');
    job.freezeEpoch = (job.freezeEpoch || 0) + 1;
    job.state = 'accepted'; job.acceptedAt = this.now(); this.changed(job); await this.record(job);
    return this.view(job);
  }
  report(job) {
    return [`# ${job.title}`, '', `Status: ${job.state}`, `Repository: ${job.repo}`, `Work folder: ${job.workFolder}`, `Workflow: ${job.workflow}${job.branch ? ` (${job.branch})` : ''}`, `Source revision: ${job.sourceRevision}`, `Baseline: ${job.baseline}`, `Checks command: ${job.checks || 'Not set'}`, `Rounds: ${job.rounds.length}/${job.maxRounds}. Time limit: ${job.timeLimitMinutes} minutes.`, '', '## Acceptance criteria', job.criteria,
      '', `Implementer: ${job.implementer.label} / ${job.implementer.model || 'CLI default'}. ${job.why.implementer}`, `Reviewer: ${job.reviewer ? `${job.reviewer.label} / ${job.reviewer.model || 'CLI default'}` : 'No review'}. ${job.why.reviewer}`, '',
      ...planReport(job, usageText),
      ...job.rounds.flatMap(round => [`## Round ${round.number}`, `Elapsed: ${Math.round((round.elapsedMs || 0) / 1000)}s`, ...[['Implement', round.implement], ['Checks', round.check], ['Review', round.review]].flatMap(([name, step]) => !step ? [`${name}: not run`] : [
        `${name}: ${step.state}${step.label ? `; ${step.label} / ${step.model || 'CLI default'}` : ''}; ${Math.round((step.elapsedMs || 0) / 1000)}s${name === 'Checks' ? `; exit ${step.exitCode ?? 'not reported'}${step.failureClass ? `; ${step.failureClass}` : ''}` : `; usage: ${usageText(step.usage)}`}`,
        step.summary || '', step.output ? `\n~~~text\n${step.output}\n~~~` : '', step.verdict ? `Verdict: ${step.verdict}` : '', ...(step.findings || [])
      ])]), '', '## Unresolved items', ...(job.unresolved.length ? job.unresolved : ['None.']), job.error || '', '', '## Diff stat', job.diffError || '', `~~~text\n${job.diffStat}\n~~~`, '', '## Final diff', `~~~diff\n${job.finalDiff}\n~~~`].join('\n');
  }
  record(job) {
    const previous = this.records.get(job.id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      if (!this.saveResult || this.closing) return;
      try {
        job.resultId = (await this.saveResult({ text: this.report(job), ext: '.md', title: job.title, kind: 'report', status: job.state === 'passed' || (job.state === 'accepted' && !job.unresolved.length) ? 'passed' : job.state === 'failed' ? 'failed' : 'needs-review', summary: `Task: ${job.state}. ${job.rounds.length} round(s).`, taskId: job.id, resultId: job.resultId }, { project: job.repo, consoleName: 'Tasks', consoleKey: `task-${job.id}` }))?.id || job.resultId;
        job.reportError = ''; this.changed(job);
      } catch { job.reportError = 'The report could not be saved to Results.'; this.changed(job); }
    });
    this.records.set(job.id, pending); return pending;
  }
}

module.exports = { TaskLoop, implementerLaunch, openCodeLaunch, openCodeEvents, checkLaunch, RUNNING, usageText };
