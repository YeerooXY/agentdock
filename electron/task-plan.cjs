'use strict';
const fs = require('node:fs'), path = require('node:path');
const { suggestAssignment, defaults } = require('./task-routing.cjs');
const { redactText } = require('./delegation.cjs');

const ACTIVE = new Set(['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing']);
const SUB_ACTIVE = new Set(['implementing', 'checking', 'reviewing']);
const idPattern = /^[a-z0-9-]{1,32}$/;

// Globs deliberately have a small, explicit grammar. Both validation and the
// ownership guard use this matcher, including **/, character classes and braces.
function globRegex(pattern) {
  let source = '', braces = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { i++; if (pattern[i + 1] === '/') { i++; source += '(?:.*/)?'; } else source += '.*'; }
      else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0 || end === i + 1) throw new Error('Unclosed or empty character class.');
      const value = pattern.slice(i + 1, end);
      if (value.includes('/') || value.includes('[') || value.includes('\\')) throw new Error('Invalid character class.');
      source += `(?!/)[${value.startsWith('!') ? '^' + value.slice(1) : value}]`; i = end;
    } else if (c === '{') { braces++; source += '(?:'; }
    else if (c === '}') { if (!braces--) throw new Error('Unmatched brace.'); source += ')'; }
    else if (c === ',' && braces) source += '|';
    else source += c.replace(/[.+^$()|\\\]]/g, '\\$&');
  }
  if (braces) throw new Error('Unclosed brace.');
  return new RegExp(`^${source}$`, 'i');
}
function validGlob(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || value.includes('..') || /[\x00-\x1f\\:]/.test(value) || value.startsWith('/') || value.startsWith('-') || value.startsWith('!') || value.split('/').some(part => !part || part === '.' || part.toLowerCase() === '.git')) return false;
  try { globRegex(value); return true; } catch { return false; }
}
function ownsFile(subtask, file) { return subtask.owns.some(pattern => globRegex(pattern).test(file.replaceAll('\\', '/'))); }
function overlap(a, b) {
  const prefix = value => value.split(/[*?[{]/, 1)[0].toLowerCase();
  const left = prefix(a), right = prefix(b);
  return left.startsWith(right) || right.startsWith(left);
}
function sizeFromRating(difficulty, complexity) {
  const highest = Math.max(difficulty, complexity);
  if (highest <= 2) return 'small';
  if (highest === 3) return 'medium';
  return 'large';
}
const legacySizeMap = { small: 1, medium: 3, large: 5 };
function validatePlan(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { plan: null, errors: ['Return a JSON plan object.'] };
  if (typeof value.contracts !== 'string' || value.contracts.length > 12000 || value.contracts.includes('\0')) errors.push('Contracts must be text of at most 12,000 characters.');
  if (!Array.isArray(value.subtasks) || value.subtasks.length < 2 || value.subtasks.length > 8) errors.push('Use 2 to 8 subtasks.');
  const subtasks = Array.isArray(value.subtasks) ? value.subtasks.slice(0, 8) : [], ids = new Set();
  for (const [index, sub] of subtasks.entries()) {
    const label = `Subtask ${index + 1}`;
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) { errors.push(`${label} must be an object.`); continue; }
    if (typeof sub.id !== 'string' || !idPattern.test(sub.id)) errors.push(`${label}: use an id matching [a-z0-9-]{1,32}.`);
    if (ids.has(sub.id)) errors.push(`${label}: duplicate id ${sub.id}.`); ids.add(sub.id);
    if (typeof sub.title !== 'string' || !sub.title.trim() || sub.title.length > 200 || sub.title.includes('\0')) errors.push(`${label}: title must be 1 to 200 characters.`);
    if (typeof sub.criteria !== 'string' || !sub.criteria.trim() || sub.criteria.length > 4000 || sub.criteria.includes('\0')) errors.push(`${label}: criteria must be 1 to 4,000 characters.`);
    if (sub.difficulty === undefined && sub.complexity === undefined) {
      if (!['small', 'medium', 'large'].includes(sub.size)) errors.push(`${label}: size must be small, medium or large.`);
    } else {
      if (!Number.isInteger(sub.difficulty) || sub.difficulty < 1 || sub.difficulty > 5) errors.push(`${label}: difficulty must be a whole number from 1 to 5.`);
      if (!Number.isInteger(sub.complexity) || sub.complexity < 1 || sub.complexity > 5) errors.push(`${label}: complexity must be a whole number from 1 to 5.`);
    }
    if (!Array.isArray(sub.owns) || sub.owns.length < 1 || sub.owns.length > 30 || sub.owns.some(pattern => !validGlob(pattern))) errors.push(`${label}: owns must contain 1 to 30 relative globs, without .., absolute paths or .git paths.`);
    if (!Array.isArray(sub.dependsOn) || sub.dependsOn.length > 8 || sub.dependsOn.some(id => typeof id !== 'string' || !idPattern.test(id))) errors.push(`${label}: dependsOn must list subtask ids.`);
  }
  const dependencies = new Map(subtasks.filter(Boolean).map(sub => [sub.id, Array.isArray(sub.dependsOn) ? sub.dependsOn : []]));
  for (const [id, deps] of dependencies) for (const dep of deps) if (!ids.has(dep)) errors.push(`${id}: unknown dependency ${dep}.`);
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle at ${id}.`); return; }
    if (visited.has(id)) return;
    visiting.add(id); for (const dep of dependencies.get(id) || []) if (dependencies.has(dep)) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of dependencies.keys()) visit(id);
  function depends(id, target, seen = new Set()) {
    if (seen.has(id)) return false; seen.add(id);
    return (dependencies.get(id) || []).some(dep => dep === target || depends(dep, target, seen));
  }
  for (let i = 0; i < subtasks.length; i++) for (let j = i + 1; j < subtasks.length; j++) {
    const a = subtasks[i], b = subtasks[j];
    if (Array.isArray(a?.owns) && Array.isArray(b?.owns) && a.owns.some(left => typeof left === 'string' && b.owns.some(right => typeof right === 'string' && overlap(left, right))) && !depends(a.id, b.id) && !depends(b.id, a.id)) errors.push(`${a.id} and ${b.id}: ownership can overlap; order them by dependency.`);
  }
  return { errors, plan: errors.length ? null : { contracts: value.contracts, subtasks: subtasks.map(({ id, title, criteria, owns, dependsOn, size, difficulty, complexity }) => {
    const derivedDifficulty = difficulty ?? legacySizeMap[size];
    const derivedComplexity = complexity ?? legacySizeMap[size];
    return { id, title: title.trim(), criteria: criteria.trim(), owns: [...owns], dependsOn: [...new Set(dependsOn)], size: sizeFromRating(derivedDifficulty, derivedComplexity), difficulty: derivedDifficulty, complexity: derivedComplexity };
  }) } };
}
function parsePlan(text) {
  const block = String(text).match(/```json\s*\r?\n([\s\S]*?)```/i);
  if (!block) return { plan: null, errors: ['Return the plan in a fenced ```json block.'] };
  try { return validatePlan(JSON.parse(block[1])); } catch { return { plan: null, errors: ['The fenced JSON is invalid.'] }; }
}
function readySubtasks(subtasks) {
  return subtasks.filter(sub => sub.state === 'queued' && sub.dependsOn.every(id => subtasks.find(other => other.subtaskId === id)?.state === 'merged'));
}
function planPrompt(job, feedback = []) {
  return [
    'Plan this repository task read-only. Do not edit files or change Git state. Read the repository to establish interfaces, data shapes, timing, units, limits and exact product wording.',
    `Task: ${job.title}\nAcceptance criteria:\n${job.criteria}`,
    'Return one fenced ```json block with {"contracts":"shared interfaces, data shapes, timings and wording", "subtasks":[{"id":"short-id","title":"title","criteria":"acceptance criteria","owns":["src/foo/**"],"dependsOn":[],"difficulty":"1-5","complexity":"1-5"}]}.',
    'Rate difficulty and complexity relative to the other subtasks. Do not estimate hours.',
    'Use 2–8 subtasks, unique ids matching [a-z0-9-]{1,32}, 1–30 relative ownership globs per subtask, criteria up to 4,000 characters each and contracts up to 12,000 characters. No .., absolute or .git paths. Dependencies must exist and be acyclic. Overlapping ownership must be ordered by dependency. Cover all task criteria. Contracts must agree across every subtask.',
    feedback.length ? `Repair the plan using these exact validation errors or confirmed review findings:\n${feedback.join('\n')}\nPrevious plan:\n${job.plan ? JSON.stringify(job.plan) : job.planAnswer || '(invalid JSON)'}` : ''
  ].filter(Boolean).join('\n\n');
}
function planReviewPrompt(job) {
  return ['Review only the task criteria, contracts and plan below. Do not read repository files or edit anything.',
    `Task: ${job.title}\nAcceptance criteria:\n${job.criteria}`, `Contracts and subtasks:\n${JSON.stringify(job.plan, null, 2)}`,
    'Find confirmed contradictions between subtasks (timings, units, limits, names), uncovered task criteria, wording belonging to another product area, and ownership that forces subtasks to edit the same files.',
    'Reply with VERDICT: approve | changes-requested, then FINDINGS: and at most 12 findings. Use - subtask-id:1 — high|medium|low — the problem — the fix. Write - none when there are none.'
  ].join('\n\n');
}
function contractPrompt(job) {
  return `Shared contracts (changing these requires stopping and replying CONTRACT_CHANGE_REQUIRED with the reason):\n${job.contracts ?? job.plan?.contracts ?? ''}${job.owns ? `\nOwned files:\n${job.owns.join('\n')}\nEditing files outside this ownership is not allowed.` : `\nApproved plan:\n${JSON.stringify(job.plan)}`}`;
}
function planReport(job, usageText) {
  if (!job.split) return [];
  const steps = [];
  const lines = ['', '## Plan', `Planner: ${job.planner.label} / ${job.planner.model || 'CLI default'}`, job.planReview?.state === 'not-set' ? 'Plan not reviewed (No review).' : `Plan review: ${job.planReview?.verdict || 'not finished'}`, '', '### Contracts', job.plan?.contracts || 'Not available.'];
  for (const round of job.planRounds || []) {
    lines.push('', `### Plan round ${round.number}`);
    for (const [name, step] of [['Planner', round.planner], ['Repair', round.repair], ['Review', round.review]]) if (step) {
      if (name === 'Review' && step.reused) { lines.push(`Review: findings from plan revision ${step.planRevision}; this revision was not re-reviewed.`); continue; }
      lines.push(`${name}: ${step.state}; usage: ${usageText(step.usage)}`, ...(step.errors || []), ...(step.findings || []));
      if (step.accountId) steps.push({ label: `Plan round ${round.number} ${name}`, step });
    }
  }
  for (const sub of job.subtasks || []) {
    lines.push('', `### ${sub.subtaskId}: ${sub.title}`, `Status: ${sub.state}. Elapsed: ${Math.round((sub.elapsedMs || 0) / 1000)}s.`, sub.criteria, `Owns: ${sub.owns.join(', ')}`, `Dependencies: ${sub.dependsOn.join(', ') || 'None'}`, `Assignment: ${sub.implementer ? `${sub.implementer.label} / ${sub.implementer.model || 'CLI default'}` : 'Choose an implementer'}. ${sub.assignmentReason}`, `Work folder: ${sub.workFolder || 'Not created'}`, `Rounds: ${sub.rounds.length}.`, sub.error || '', ...(sub.unresolved || []));
    if (!sub.rounds.length) lines.push('Usage: not reported');
    for (const round of sub.rounds) {
      lines.push(`Round ${round.number}: ${Math.round((round.elapsedMs || 0) / 1000)}s`);
      for (const [name, step] of [['Implement', round.implement], ['Checks', round.check], ['Review', round.review]]) if (step) {
        lines.push(`${name}: ${step.state}; ${step.verdict || step.outcome || ''}; ${name === 'Checks' ? `exit ${step.exitCode ?? 'not reported'}` : `usage: ${usageText(step.usage)}`}`, step.summary || '', step.output ? `~~~text\n${step.output}\n~~~` : '', ...(step.findings || []));
        if (step.accountId) steps.push({ label: `${sub.subtaskId} round ${round.number} ${name}`, step });
      }
      lines.push(...(round.ownershipFindings || []));
    }
  }
  for (const round of job.rounds) for (const name of ['implement', 'review']) if (round[name]?.accountId) steps.push({ label: `Integration round ${round.number} ${name}`, step: round[name] });
  lines.push('', '## Usage by account');
  const accounts = [...new Set(steps.map(({ step }) => step.accountId))];
  for (const id of accounts) { lines.push(`### ${id}`); for (const entry of steps.filter(({ step }) => step.accountId === id)) lines.push(`- ${entry.label}: ${usageText(entry.step.usage)}`); }
  if (!accounts.length) lines.push('not reported');
  return lines;
}

class SplitTasks {
  constructor(loop) { this.loop = loop; this.running = new Map(); this.merging = new Map(); }
  async plan(job) {
    const loop = this.loop; let feedback = job.planFeedback || [];
    job.planRounds ||= [];
    for (let number = job.planRounds.length + 1; number <= 2 && ACTIVE.has(job.state); number++) {
      const round = { number, startedAt: loop.now(), planner: { ...job.planner, role: 'planner', state: 'running', startedAt: loop.now(), usage: null } };
      job.planRounds.push(round); job.state = 'planning'; loop.changed(job);
      let parsed;
      for (;;) {
        const step = round.repair || round.planner;
        const reply = await loop.provider(job, step, planPrompt(job, feedback), true);
        if (!ACTIVE.has(job.state)) return;
        step.state = 'done'; job.planAnswer = String(reply.text || '');
        parsed = parsePlan(job.planAnswer); step.errors = parsed.errors;
        if (!parsed.errors.length) break;
        feedback = parsed.errors; job.planFeedback = feedback;
        if (job.planRepairUsed) return loop.finish(job, 'needs-you', `The plan is invalid: ${feedback.join(' ')}`);
        job.planRepairUsed = true; round.repair = { ...job.planner, role: 'planner', state: 'running', startedAt: loop.now(), usage: null }; loop.changed(job);
      }
      job.plan = parsed.plan; job.planRevision = number; delete job.planAnswer;
      // A correction follows the one coherence check; it is presented with
      // that check's findings for owner approval, without another review call.
      const priorRound = job.planRounds.slice(0, -1).find(item => item.review && item.review.state !== 'not-set');
      const previousReview = priorRound?.review;
      if (previousReview) {
        const reviewedRevision = previousReview.planRevision ?? priorRound.number;
        round.review = { ...previousReview, planRevision: reviewedRevision, findings: [...(previousReview.findings || [])], reused: true };
        job.planReview = round.review;
        if (!previousReview.verdict) return loop.finish(job, 'needs-you', 'The plan review did not finish. Review the plan before continuing.');
      } else if (job.planReviewer) {
        job.state = 'reviewing-plan'; round.review = { ...job.planReviewer, planRevision: job.planRevision, state: 'running', startedAt: loop.now(), usage: null, findings: [] }; loop.changed(job);
        const reply = await loop.provider(job, round.review, planReviewPrompt(job), true);
        if (!ACTIVE.has(job.state)) return;
        const confirmed = loop.reviewFindings(reply);
        Object.assign(round.review, { state: 'done', verdict: reply.verdict ? (confirmed.length ? 'changes-requested' : reply.verdict) : null, findings: confirmed, text: String(reply.text || '').slice(-6000) });
        job.planReview = round.review;
        if (!round.review.verdict) return loop.finish(job, 'needs-you', 'The plan review did not return a verdict. Review the plan before continuing.');
        if (round.review.verdict !== 'approve') {
          feedback = confirmed; job.planFeedback = feedback; loop.changed(job);
          continue;
        }
      } else job.planReview = round.review = { state: 'not-set', findings: [], label: 'Plan not reviewed' };
      round.elapsedMs = loop.now() - round.startedAt;
      const counts = {};
      job.subtasks = job.plan.subtasks.map(sub => {
        const suggested = suggestAssignment({ size: sub.size, candidates: loop.candidates(), limits: loop.getLimits(), rules: loop.getSettings().routing || defaults, now: loop.now(), assignmentCounts: counts });
        const implementer = suggested.implementer ? loop.assignment(suggested.implementer, 'implementer') : null;
        if (implementer) counts[implementer.accountId] = (counts[implementer.accountId] || 0) + 1;
        return { ...sub, subtaskId: sub.id, id: `${job.id}-${sub.id}`, parentId: job.id, state: 'queued', implementer, assignmentReason: implementer ? suggested.reasons[0] : suggested.warnings.join(' '), rounds: [], unresolved: [], log: [], elapsedMs: 0, finalDiff: '', diffStat: '' };
      });
      job.planFeedback = []; job.unresolved = []; job.error = ''; job.state = 'plan-ready'; loop.changed(job); await loop.record(job); return;
    }
    if (ACTIVE.has(job.state)) await loop.finish(job, 'needs-you', 'The plan needs your review.');
  }
  async approve(args = {}) {
    const loop = this.loop, job = loop.jobs.get(String(args.id));
    if (!job?.split || job.state !== 'plan-ready') throw new Error('Approve a split task with a ready plan.');
    const validated = validatePlan(job.plan);
    if (validated.errors.length) throw new Error(validated.errors.join(' '));
    const limit = args.parallelLimit ?? 2;
    if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw new Error('Run 1 to 4 subtasks at once.');
    const overrides = args.assignments ?? args.overrides ?? {};
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).some(id => !job.subtasks.some(sub => sub.subtaskId === id))) throw new Error('Use assignments for the plan’s subtask ids.');
    const assignments = job.subtasks.map(sub => loop.assignment(Object.hasOwn(overrides, sub.subtaskId) ? overrides[sub.subtaskId] : sub.implementer, 'implementer'));
    const main = loop.assignment(args.implementer ?? job.implementer, 'implementer');
    if (main.accountId === job.reviewer?.accountId) throw new Error('Choose a main implementer different from the reviewer.');
    loop.ensureAvailable(job);
    const previous = loop.pending.get(job.id);
    const reviewers = assignments.map(implementer => {
      const suggestion = loop.choices(implementer.accountId).assignment;
      return job.reviewer?.accountId !== implementer.accountId ? job.reviewer : suggestion.reviewer ? loop.assignment(suggestion.reviewer, 'reviewer') : null;
    });
    job.parallelLimit = limit; job.implementer = main; job.approvedAt = loop.now(); job.state = 'building'; job.finishedAt = null;
    for (const [index, sub] of job.subtasks.entries()) {
      sub.implementer = assignments[index];
      if (Object.hasOwn(overrides, sub.subtaskId)) sub.assignmentReason = 'Selected by you.';
      sub.reviewer = reviewers[index];
      sub.why = { implementer: sub.assignmentReason, reviewer: sub.reviewer ? 'Independent subtask review.' : 'No review selected.' };
    }
    loop.changed(job); await previous;
    if (job.state === 'building' && !loop.cancelling.has(job.id)) loop.startSplit(job, false);
    return loop.view(job);
  }
  async resume(id) {
    const loop = this.loop, job = loop.jobs.get(String(id));
    if (!job?.split || !['needs-you', 'interrupted', 'stopped'].includes(job.state)) throw new Error('Resume a split task that needs you, was interrupted or was stopped.');
    if (loop.pending.has(job.id) || loop.cancelling.has(job.id)) throw new Error('Wait for this task to stop before resuming.');
    for (const item of [job, ...(job.subtasks || [])]) {
      if (loop.unconfirmed.has(item.id)) throw new Error('A previous process has not exited. Wait for it to close before resuming.');
      if (Number.isInteger(item.processPid)) {
        const recordedHere = Number.isFinite(item.processRecordedAt) && item.processRecordedAt >= loop.processStartedAt;
        const alive = recordedHere && loop.isProcessAlive(item.processPid);
        if (alive) throw new Error('A process from the previous run is still active. End it before resuming.');
        delete item.processPid; delete item.processRecordedAt;
      }
    }
    loop.ensureAvailable(job);
    if (!job.approvedAt) {
      if (job.subtasks?.length && job.plan) { job.state = 'plan-ready'; job.error = ''; job.finishedAt = null; loop.changed(job); return loop.view(job); }
      // A stopped planner can retry an unfinished round, but an uncertain review
      // is never replayed automatically.
      if (job.planRounds?.at(-1)?.review?.verdict === 'approve') throw new Error('The saved plan needs inspection.');
      if (job.planRounds?.some(round => round.review && round.review.state !== 'not-set' && !round.review.verdict)) throw new Error('The plan review did not finish. Review the plan before continuing.');
      if (job.planRounds?.length && !job.planRounds.at(-1).review) job.planRounds.pop();
      if ((job.planRounds?.length || 0) >= 2) throw new Error('The plan used both review rounds. Start a new task with revised criteria.');
      job.state = 'planning';
    } else {
      for (const sub of job.subtasks) if (sub.state !== 'merged') {
        if (this.running.has(sub.id) || loop.children.has(sub.id)) throw new Error('A subtask process is still running.');
        loop.assignment(sub.implementer, 'implementer');
      }
      for (const sub of job.subtasks) if (sub.state !== 'merged') {
        sub.state = 'queued'; sub.resumeRounds = true; sub.error = ''; sub.finishedAt = null;
      }
      job.state = 'building';
    }
    job.error = ''; job.finishedAt = null; job.verificationExpired = false; loop.changed(job); loop.startSplit(job, !job.approvedAt); return loop.view(job);
  }
  async ownership(sub, round) {
    const loop = this.loop, parent = loop.jobs.get(sub.parentId);
    const files = [...new Set([...(await loop.git(sub.workFolder, ['diff', '--name-only', '-z', '--no-renames', sub.baseline, '--'])).split('\0'), ...(await loop.git(sub.workFolder, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0')])].filter(Boolean);
    round.implement.changedFiles = files.map(file => redactText(file));
    sub.ownershipFindings = files.filter(file => !ownsFile(sub, file)).map(file => {
      const owner = parent.subtasks.find(other => other.id !== sub.id && ownsFile(other, file));
      return redactText(`You changed ${file}, which belongs to ${owner ? owner.subtaskId : 'no subtask'}. Restore it before this subtask can pass.`);
    });
    round.ownershipFindings = sub.ownershipFindings;
  }
  async assertBranch(job) {
    if (!/^paddock\/task-[a-f0-9]{8}(?:-[a-z0-9-]{1,32})?$/.test(job.branch || '') || (await this.loop.git(job.workFolder, ['branch', '--show-current'])).trim() !== job.branch) throw new Error('The Paddock worktree branch changed. Restore it before resuming.');
  }
  async merge(job, sub) {
    const loop = this.loop, previous = this.merging.get(job.id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      if (!ACTIVE.has(job.state)) return;
      await this.assertBranch(sub); await this.assertBranch(job);
      if (sub.committed) {
        if ((await loop.git(sub.workFolder, ['rev-parse', 'HEAD'])).trim() !== sub.committed || (await loop.git(sub.workFolder, ['status', '--porcelain'])).trim()) throw new Error('The committed subtask changed. Inspect its worktree before resuming.');
      } else if (await loop.fingerprint(sub) !== sub.fingerprint) throw new Error('Checks are out of date. The subtask changed after verification.');
      if ((await loop.git(job.workFolder, ['status', '--porcelain'])).trim() || (await loop.git(job.workFolder, ['rev-parse', 'HEAD'])).trim() !== job.integrationHead) throw new Error('The integration worktree changed. Inspect it before resuming.');
      const identity = [];
      for (const [key, fallback] of [['user.name', 'Paddock'], ['user.email', 'paddock@localhost']]) {
        let value = ''; try { value = (await loop.git(sub.workFolder, ['config', '--get', key])).trim(); } catch {}
        identity.push('-c', `${key}=${value || fallback}`);
      }
      const hooks = path.join(loop.root, 'task-hooks'); fs.mkdirSync(hooks, { recursive: true });
      const config = [...identity, '-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false'];
      if (!sub.committed) {
        await loop.git(sub.workFolder, ['add', '--all', '--', '.']);
        if (!ACTIVE.has(job.state)) return;
        await loop.git(sub.workFolder, [...config, 'commit', '--allow-empty', '-m', `Subtask ${sub.subtaskId}: ${sub.title}`]);
        sub.committed = sub.commit = (await loop.git(sub.workFolder, ['rev-parse', 'HEAD'])).trim(); loop.changed(sub);
      }
      if (!ACTIVE.has(job.state)) return;
      try { await loop.git(job.workFolder, [...config, 'merge', '--no-ff', '--no-edit', sub.branch]); }
      catch (error) {
        let conflicts = [];
        try { conflicts = (await loop.git(job.workFolder, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean); }
        finally {
          let merging = false; try { await loop.git(job.workFolder, ['rev-parse', '--verify', 'MERGE_HEAD']); merging = true; } catch {}
          if (merging) await loop.git(job.workFolder, ['merge', '--abort']);
        }
        throw new Error(conflicts.length ? `Merge conflict: ${conflicts.join(', ')}. The merge was aborted.` : 'The subtask could not be merged. The integration branch was kept.');
      }
      job.integrationHead = (await loop.git(job.workFolder, ['rev-parse', 'HEAD'])).trim(); sub.state = 'merged'; sub.error = ''; sub.unresolved = []; sub.mergedAt = loop.now(); loop.changed(sub);
    });
    this.merging.set(job.id, pending);
    try { await pending; } finally { if (this.merging.get(job.id) === pending) this.merging.delete(job.id); }
  }
  async buildSubtask(job, sub, command) {
    const loop = this.loop, started = loop.now(); sub.runStartedAt = started;
    try {
      if (!sub.workFolder) {
        // Short folder names: Windows Git fails with "'$GIT_DIR' too big" on long worktree paths.
        sub.workFolder = path.join(loop.root, 'task-worktrees', `${job.id.slice(0, 8)}-${sub.subtaskId}`); sub.branch = `${job.branch}-${sub.subtaskId}`;
        sub.baseline = (await loop.git(job.workFolder, ['rev-parse', 'HEAD'])).trim(); sub.sourceRevision = sub.baseline;
        loop.changed(sub);
      }
      if (!fs.existsSync(sub.workFolder)) {
        let existing = false; try { await loop.git(job.repo, ['rev-parse', '--verify', `refs/heads/${sub.branch}`]); existing = true; } catch {}
        await loop.git(job.repo, existing ? ['worktree', 'add', sub.workFolder, sub.branch] : ['worktree', 'add', sub.workFolder, '-b', sub.branch, sub.baseline]);
      }
      if (!ACTIVE.has(job.state)) return;
      Object.assign(sub, { repo: job.repo, workflow: 'worktree', contracts: job.plan.contracts, maxRounds: job.maxRounds, timeLimitMinutes: job.timeLimitMinutes, deadlineAt: job.deadlineAt, startedAt: sub.startedAt || started, baselineUntracked: [], baselineUntrackedState: {} });
      await this.assertBranch(sub);
      if (!sub.committed) await loop.runTask(sub, command, { additionalRounds: !!sub.resumeRounds, manageTime: false });
      sub.resumeRounds = false;
      if ((sub.committed || sub.state === 'passed') && ACTIVE.has(job.state)) await this.merge(job, sub);
    } catch (error) { sub.state = 'needs-you'; sub.error = redactText(error.message); sub.unresolved = [...new Set([...(sub.unresolved || []), sub.error])]; }
    finally { if (sub.runStartedAt) sub.elapsedMs = (sub.elapsedMs || 0) + loop.now() - sub.runStartedAt; delete sub.runStartedAt; loop.changed(sub); }
  }
  async recoverMerges(job) {
    const loop = this.loop;
    await this.assertBranch(job);
    const current = (await loop.git(job.workFolder, ['rev-parse', 'HEAD'])).trim();
    if (!job.integrationHead) job.integrationHead = current;
    // Earlier task files used commit without a separate committed marker.
    for (const sub of job.subtasks) if (sub.state !== 'merged' && sub.commit && !sub.committed) { sub.committed = sub.commit; loop.changed(sub); }
    if (current === job.integrationHead || job.subtasks.every(sub => sub.state === 'merged')) return;
    // A crash can happen after Git finishes a merge but before the task file is
    // saved. Recognize that exact merge so a completed subtask is never rebuilt.
    const parents = (await loop.git(job.workFolder, ['show', '-s', '--format=%P', 'HEAD'])).trim().split(' ');
    const merged = job.subtasks.find(sub => sub.state !== 'merged' && sub.committed && parents.length === 2 && parents[0] === job.integrationHead && parents[1] === sub.committed);
    if (!merged) throw new Error('The integration branch changed. Inspect it before resuming.');
    merged.state = 'merged'; merged.error = ''; merged.unresolved = []; merged.mergedAt = loop.now(); job.integrationHead = current; loop.changed(job);
  }
  async build(job, command) {
    const loop = this.loop, pending = new Map();
    await this.recoverMerges(job);
    while (ACTIVE.has(job.state)) {
      const failed = job.subtasks.some(sub => ['needs-you', 'failed', 'interrupted', 'stopped'].includes(sub.state));
      if (!failed) for (const sub of readySubtasks(job.subtasks)) {
        if (pending.size >= job.parallelLimit) break;
        if (this.running.has(sub.id)) continue;
        sub.state = 'implementing'; loop.changed(sub);
        const running = this.buildSubtask(job, sub, command).finally(() => { pending.delete(sub.id); this.running.delete(sub.id); });
        pending.set(sub.id, running); this.running.set(sub.id, running);
      }
      if (!pending.size) break;
      await Promise.race(pending.values());
    }
    await Promise.all(pending.values());
    if (!ACTIVE.has(job.state)) return;
    if (job.subtasks.some(sub => sub.state !== 'merged')) return loop.finish(job, 'needs-you', job.subtasks.filter(sub => sub.state !== 'merged').map(sub => `${sub.subtaskId}: ${sub.error || sub.unresolved.join(' ') || 'Waiting for dependencies.'}`).join('\n'));
    await loop.runTask(job, command, { verifyFirst: !job.rounds.length, manageTime: false });
  }
}

module.exports = { validatePlan, parsePlan, validGlob, ownsFile, overlap, readySubtasks, contractPrompt, planReport, SplitTasks, ACTIVE, SUB_ACTIVE };
