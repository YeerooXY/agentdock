'use strict';
// Structured, plain-language task outcome written next to the markdown report.
// The report stays the technical log; this is the shape task cards render.
const { taskUsage } = require('./workflow-usage.cjs');

const VERDICTS = ['ready', 'needs-decision', 'failed-checks', 'failed', 'interrupted'];
const SETTLED = new Set(['passed', 'accepted', 'needs-you', 'failed', 'interrupted', 'stopped']);
const TOOL_TAGS = 'tool_call|tool_calls|tool_use|tool_result|function_calls?|function_results?|antml:[a-z_]+|invoke|thinking';

// Remove tool markup that provider output sometimes leaks into summaries.
function stripToolMarkup(value) {
  return String(value ?? '')
    .replace(new RegExp(`<(${TOOL_TAGS})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi'), ' ')
    .replace(new RegExp(`<(${TOOL_TAGS})\\b[^>]*>[\\s\\S]*$`, 'i'), ' ')
    .replace(new RegExp(`</?(${TOOL_TAGS})\\b[^>]*>`, 'gi'), ' ')
    .replace(/\s+/g, ' ').trim();
}
const sentence = (value, max = 240) => {
  const text = stripToolMarkup(value); if (!text) return '';
  const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] || text;
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
};
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function lastStep(job, name, pick) {
  for (const round of [...(job.rounds || [])].reverse()) if (round[name] && pick(round[name])) return round[name];
  return null;
}
function checksSummary(job) {
  const step = lastStep(job, 'check', s => s.outcome || ['failed', 'stale', 'done'].includes(s.state));
  if (!job.checks && !step) return { status: 'none', summary: 'No checks command was set.' };
  if (!step) return { status: 'not-run', summary: 'Checks did not run.' };
  if (step.state === 'stale') return { status: 'stale', summary: 'Checks are out of date for the current files.' };
  if (step.outcome === 'passed') return { status: 'passed', summary: 'Checks passed.' };
  if (step.outcome === 'failed' || step.state === 'failed') return { status: 'failed', summary: step.timedOut ? 'Checks timed out.' : `Checks failed (exit ${step.exitCode ?? 'unknown'}).` };
  return { status: 'not-run', summary: 'Checks did not finish.' };
}
function verdictFor(job, checks) {
  if (job.state === 'interrupted' || job.state === 'stopped') return 'interrupted';
  if (job.state === 'failed') return 'failed';
  if (checks.status === 'failed') return 'failed-checks';
  const clean = !(job.unresolved || []).length;
  return ['passed', 'accepted'].includes(job.state) && clean ? 'ready' : 'needs-decision';
}
function usageSummary(job) {
  try {
    const { cloud, local } = taskUsage(job), pick = u => ({ calls: u.calls, input: u.input, output: u.output, cached: u.cached });
    return { cloud: pick(cloud), local: pick(local), note: 'Worker usage only. Coordinating chat usage is not included.' };
  } catch { return null; }
}

function buildOutcome(job) {
  if (!job || !SETTLED.has(job.state)) return null;
  const checks = checksSummary(job), verdict = verdictFor(job, checks);
  const files = [...new Set((job.changedFiles || []).map(String))];
  const unresolved = (job.unresolved || []).map(item => stripToolMarkup(item)).filter(Boolean).slice(0, 20);
  const summary = sentence(lastStep(job, 'implement', s => s.summary)?.summary);
  const changeText = files.length ? plural(files.length, 'file') + ' changed' : 'No files changed';
  const outcome = {
    ready: summary || `${changeText}. Checks and review found nothing open.`,
    'needs-decision': unresolved.length ? `${changeText}. ${sentence(unresolved[0])}` : `${changeText}. Review the result before accepting.`,
    'failed-checks': `${changeText}. ${checks.summary}`,
    failed: sentence(job.error) || 'The task failed before it finished.',
    interrupted: sentence(job.error) || 'The task was stopped before it finished.'
  }[verdict];
  return { type: 'task', taskId: job.id, projectId: job.projectId || null, originConsoleId: job.originConsoleId || null, verdict, outcome,
    changedFiles: { count: files.length, top: files.slice(0, 5) }, checks, unresolved, usage: usageSummary(job) };
}

// Bounded, validated copy for storage in the Results index.
function cleanOutcome(raw) {
  if (!raw || typeof raw !== 'object' || raw.type !== 'task' || !VERDICTS.includes(raw.verdict)) return null;
  const text = (v, n) => stripToolMarkup(v).slice(0, n);
  return { type: 'task', taskId: text(raw.taskId, 80), projectId: raw.projectId ? text(raw.projectId, 80) : null, originConsoleId: raw.originConsoleId ? text(raw.originConsoleId, 80) : null,
    verdict: raw.verdict, outcome: text(raw.outcome, 400),
    changedFiles: { count: Math.max(0, Number(raw.changedFiles?.count) || 0), top: (raw.changedFiles?.top || []).slice(0, 5).map(f => String(f).slice(0, 300)) },
    checks: { status: text(raw.checks?.status, 20), summary: text(raw.checks?.summary, 200) },
    unresolved: (raw.unresolved || []).slice(0, 20).map(i => text(i, 400)),
    usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : null };
}
module.exports = { buildOutcome, cleanOutcome, stripToolMarkup, VERDICTS };
