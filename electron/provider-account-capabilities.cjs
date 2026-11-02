'use strict';
// Derived from the provider adapters in ./providers.
const { capabilities } = require('./providers/index.cjs');

function getAccountProvider(id) {
  return typeof id === 'string' && Object.hasOwn(capabilities, id) ? capabilities[id] : null;
}
function listAccountProviders() { return Object.values(capabilities); }
function supportsNamedProfiles(id) { return getAccountProvider(id)?.namedProfiles === true; }

module.exports = { getAccountProvider, listAccountProviders, supportsNamedProfiles };
