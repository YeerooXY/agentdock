'use strict';
// Initial aggregation drafted by Strata; verified and repaired by the caller.
module.exports = { summarizeUsage, taskUsage };

function taskUsage(job) {
  const entries = [], seen = new Set();
  function visit(task) {
    for (const round of [...(task.planRounds || []), ...(task.rounds || [])]) {
      for (const name of ['planner', 'repair', 'implement', 'review']) {
        const step = round[name];
        if (!step?.accountId || step.state === 'reused' || seen.has(step)) continue;
        seen.add(step);
        const u = step.usage;
        entries.push({ local: step.local === true || step.model === 'strata/local', funding: step.funding || 'unknown', status: step.state === 'done' ? 'completed' : 'incomplete',
          usage: u ? { input: u.inputTokens, output: u.outputTokens, cached: u.cachedInputTokens } : null });
      }
    }
    for (const sub of task.subtasks || []) visit(sub);
  }
  visit(job);
  const byFunding = Object.fromEntries(['free', 'included', 'metered', 'unknown'].map(kind => [kind, summarizeUsage(entries.filter(entry => !entry.local && entry.funding === kind)).cloud]));
  return { ...summarizeUsage(entries), byFunding, scope: 'workers', cloudComplete: false,
    note: 'Includes recorded planning, implementation, review and failed attempts. Coordinating chat usage must be added before comparing savings.' };
}

function summarizeUsage(entries) {
  const cloud = newBucket();
  const local = newBucket();

  for (const entry of entries || []) {
    if (!entry) continue;

    const bucket = entry.local === true ? local : cloud;
    bucket.calls++;
    const status = typeof entry.status === 'string' ? entry.status.toLowerCase() : '';

    if (status === 'failed' || status === 'incomplete') {
      bucket.failed++;
    }

    const usage = entry.usage;
    if (!usage) {
      bucket.unknown++;
      bucket.unknownCached++;
      continue;
    }

    const input = parseNonNegative(usage.input);
    const output = parseNonNegative(usage.output);

    if (input !== null && output !== null) {
      bucket.input += input;
      bucket.output += output;
    } else {
      bucket.unknown++;
      bucket.unknownCached++;
      continue;
    }

    const cached = parseNonNegative(usage.cached);
    if (cached === null || cached > input) {
      bucket.unknownCached++;
    } else {
      bucket.cached += cached;
    }
  }

  return { cloud, local };
}

function newBucket() {
  return { calls: 0, input: 0, output: 0, cached: 0, unknown: 0, unknownCached: 0, failed: 0 };
}

function parseNonNegative(value) {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}
