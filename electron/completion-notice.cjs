'use strict';

// A completion belongs to a captured turn, never to the folder or latest chat.
function completionNotice(raw, context = {}, results = []) {
  const notice = { ...raw, sessionId: context.sessionId || null };
  if ((raw.kind || 'ready') !== 'ready') return notice;
  const turnId = context.turnId || null;
  const candidates = turnId ? results.filter(item => item.groupId === turnId &&
    (item.consoleKey || item.sessionId) === (context.consoleKey || context.sessionId)) : [];
  const priority = item => item.ext !== '.json' && ['report', 'test', 'review'].includes(item.kind) ? 0
    : item.image ? 1 : item.kind === 'code' ? 2 : item.ext === '.json' ? 4 : 3;
  candidates.sort((a, b) => priority(a) - priority(b) || (b.at || 0) - (a.at || 0));
  return { ...notice, kind: 'ready', destination: 'results', turnId, resultId: candidates[0]?.id || null };
}

module.exports = { completionNotice };
