'use strict';

function completionNotice(raw, context = {}) {
  return { ...raw, sessionId: context.sessionId || null };
}
module.exports = { completionNotice };
