'use strict';

// Copy only display fields. Turn records must never carry prompt or file data.
function turnPage(records, projects, { projectId, limit = 50, before } = {}) {
  if (projectId !== undefined && typeof projectId !== 'string') throw new Error('Invalid project filter.');
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid turn limit.');
  limit = Math.min(limit, 200);
  let cursor;
  if (before !== undefined) {
    try {
      if (typeof before !== 'string' || before.length > 2048) throw Error();
      cursor = JSON.parse(Buffer.from(before, 'base64url').toString());
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string') throw Error();
    } catch { throw new Error('Invalid turn cursor.'); }
  }
  const names = new Map(projects.map(p => [p.id, p.name]));
  for (const row of records) if (row.projectId && !names.has(row.projectId)) names.set(row.projectId, row.projectName || 'Removed project');
  const rows = records.filter(row => Number.isFinite(row.at) && typeof row.id === 'string')
    .filter(row => projectId === undefined || (row.projectId || 'unassigned') === projectId)
    .filter(row => !cursor || row.at < cursor[0] || (row.at === cursor[0] && row.id < cursor[1]))
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const percent = value => number(value) !== null && value <= 100 ? value : null;
  const label = value => typeof value === 'string' ? value : null;
  const turns = rows.slice(0, limit).map(row => ({
    id: row.id, at: row.at, consoleName: label(row.consoleName), projectId: label(row.projectId),
    projectName: label(names.get(row.projectId)), provider: label(row.provider), model: label(row.model), source: label(row.source),
    usage: { input: number(row.usage?.input), output: number(row.usage?.output), cached: number(row.usage?.cached) },
    quota: (Array.isArray(row.quota) ? row.quota : []).map(q => ({
      minutes: number(q.minutes), changePercent: percent(q.changePercent),
      scope: 'account', attribution: 'estimate',
    })),
  }));
  const last = turns.at(-1);
  return { turns, before: rows.length > limit ? Buffer.from(JSON.stringify([last.at, last.id])).toString('base64url') : null,
    projects: [...names].map(([id, name]) => ({ id, name })) };
}
module.exports = { turnPage };
