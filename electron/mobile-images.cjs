'use strict';

const resumableImageJob = job => !!job && (!job.provider || job.provider === 'meshy') && !!job.taskId && ['failed', 'interrupted'].includes(job.state);
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
function imageJobs(concepts, redact = value => value) {
  const items = new Map(concepts.items.map(job => [job.id, job]));
  const records = new Map(concepts.usage.map(job => [job.id, job]));
  for (const job of concepts.items) records.set(job.id, { ...records.get(job.id), ...job });
  const summary = value => {
    if (typeof value !== 'string') return '';
    const clean = redact(value).replace(/\bBearer\s+\S+/gi, 'Bearer [credential removed]')
      .replace(/\b(?:api[_-]?key|authorization|token|secret|password)\s*[:=]\s*\S+/gi, '[credential removed]')
      .replace(/https?:\/\/\S+/gi, '[URL]');
    return [...clean].slice(0, 200).join('');
  };
  return [...records.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30).map(job => ({
    id: job.id, provider: job.provider || 'meshy', model: job.config?.model || job.model ? summary(job.config?.model || job.model) : (job.provider === 'meshy' || !job.provider ? 'nano-banana-pro' : null),
    promptSummary: summary(job.prompt), status: job.state, startedAt: job.at || null, finishedAt: job.finishedAt || null,
    usage: { input: number(job.usage?.input), output: number(job.usage?.output), total: number(job.usage?.total), credits: number(job.credits) },
    resultId: job.resultId || null, canResume: resumableImageJob(items.get(job.id)),
  }));
}
module.exports = { imageJobs, resumableImageJob };
