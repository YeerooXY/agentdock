'use strict';
const fs = require('node:fs/promises'), path = require('node:path');
const { redactText } = require('./delegation.cjs');

async function resolveIntegrationConflict(loop, job, sub, conflicts, config) {
  const active = () => ['building', 'implementing', 'checking', 'reviewing'].includes(job.state) && !loop.closing;
  loop.dispatcher.checkAssignments(job);
  const protectedDiff = cached => loop.git(job.workFolder, ['diff', ...(cached ? ['--cached'] : []), '--binary', 'HEAD', '--', '.', ...conflicts.map(file => `:(exclude,literal)${file}`)]);
  const untracked = () => loop.git(job.workFolder, ['ls-files', '-z', '--others', '--exclude-standard']);
  const before = await protectedDiff(false), beforeIndex = await protectedDiff(true), beforeUntracked = await untracked();
  if (!active()) return false;
  const step = { ...job.implementer, role: 'integration', state: 'running', startedAt: loop.now(), usage: null };
  const round = { number: (job.integrationRounds?.length || 0) + 1, subtaskId: sub.subtaskId, conflicts: [...conflicts], startedAt: loop.now(), implement: step };
  (job.integrationRounds ||= []).push(round);
  job.integrationConflict = { state: 'resolving', subtaskId: sub.subtaskId, paths: [...conflicts] };
  if (!loop.changed(job)) throw Error('The integration conflict could not be saved. No resolver started.');
  try {
    const reply = await loop.provider(job, step, [
      `Resolve the merge conflicts for approved lane ${sub.subtaskId} in this integration worktree.`,
      `Current integrated commit: ${job.integrationHead}. Incoming lane commit: ${sub.committed}.`,
      `Conflicted files:\n${conflicts.join('\n')}`,
      `Shared contracts:\n${job.plan.contracts}`,
      `Approved lanes:\n${JSON.stringify(job.plan.subtasks)}`,
      'The files contain Git conflict markers showing both sides. Preserve both lanes\' required behavior. Edit only the listed conflict files; do not edit any other file, delete a lane\'s work, or change assignments/check commands. Remove markers only after reconciling the behavior. If the requirements conflict or you cannot resolve a file, report the blocker and leave it unresolved. Do not stage, commit, abort the merge, or run any Git command. Paddock verifies the file scope and resolves the Git index, then runs combined checks and review. Reply with a short summary.'
    ].join('\n\n'), false);
    if (!active()) return false;
    step.summary = redactText(String(reply.summary || reply.text || '').slice(0, 4000)); step.usage ||= reply.usage || null;
    if ((await loop.git(job.workFolder, ['branch', '--show-current'])).trim() !== job.branch ||
      (await loop.git(job.workFolder, ['rev-parse', 'HEAD'])).trim() !== job.integrationHead ||
      (await loop.git(job.workFolder, ['rev-parse', 'MERGE_HEAD'])).trim() !== sub.committed) throw Error('The integration merge changed while the resolver was running. Inspect its worktree.');
    if (await protectedDiff(false) !== before || await protectedDiff(true) !== beforeIndex || await untracked() !== beforeUntracked) throw Error('The conflict resolver changed files outside the listed conflict paths. Inspect the integration worktree.');
    for (const file of conflicts) {
      const target = path.join(job.workFolder, file);
      let stat;
      try { stat = await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') throw Error(`Conflict file ${file} disappeared. Inspect the integration worktree.`); throw error; }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error(`Inspect the unresolved conflict in ${file}.`);
      const content = await fs.readFile(target, 'utf8');
      if (content.includes('\0') || /^(?:<{7}|={7}|>{7}|\|{7})(?: |$)/m.test(content)) throw Error(`Merge conflict markers remain in ${file}.`);
    }
    if (!active()) return false;
    await loop.git(job.workFolder, ['add', '--all', '--', ...conflicts]);
    if ((await loop.git(job.workFolder, ['diff', '--name-only', '--diff-filter=U'])).trim()) throw Error('The integration merge still has unresolved files.');
    if (!active()) return false;
    await loop.git(job.workFolder, [...config, 'commit', '--no-edit']);
    step.state = 'done'; job.integrationConflict.state = 'resolved'; return true;
  } catch (error) {
    step.state = 'failed'; step.error = redactText(error.message); job.integrationConflict.state = 'needs-you';
    throw error;
  } finally {
    if (step.state === 'running') step.state = 'interrupted';
    step.elapsedMs = loop.now() - step.startedAt; round.elapsedMs = step.elapsedMs; loop.changed(job);
  }
}
module.exports = { resolveIntegrationConflict };
