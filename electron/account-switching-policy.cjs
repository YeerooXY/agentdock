'use strict';

function accountIdForLimit(limit) {
  if (limit?.accountId) return limit.accountId;
  if (limit?.provider === 'codex') return 'codex:default';
  if (limit?.provider === 'claude' && limit.id === 'claude:account') return 'claude:default';
  return null;
}

function isDefaultAccountLimit(limit) {
  return typeof limit?.provider === 'string' && accountIdForLimit(limit) === `${limit.provider}:default`;
}

module.exports = { accountIdForLimit, isDefaultAccountLimit };
