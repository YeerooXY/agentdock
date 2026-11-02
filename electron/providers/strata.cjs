'use strict';
// Strata is a local model route through OpenCode. It has no CLI of its own and
// no account quota, so it appears in usage as Local rather than as unknown.
module.exports = {
  id: 'strata',
  catalog: null,
  launch: {},
  accounts: null,
  usage: { reader: null, state: 'no-quota', accountIds: ['opencode:strata'] }
};
