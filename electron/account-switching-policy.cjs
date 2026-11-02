'use strict';

function accountIdForLimit(limit) {
  if (limit?.accountId) return limit.accountId;
  if (limit?.provider === 'codex') return 'codex:default';
  if (limit?.provider === 'claude' && limit.id === 'claude:account') return 'claude:default';
  return null;
}

module.exports = { accountIdForLimit };
