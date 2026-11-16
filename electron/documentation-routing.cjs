'use strict';
const { fundingRank } = require('./account-funding.cjs');
const { documentationCapabilities } = require('./provider-workers.cjs');

// Automatic documentation never invents a model ID or treats installation as entitlement.
function selectDocumentationWorker(loop, { excluded = [] } = {}) {
  const routes = [], reasons = [];
  const candidates = loop.candidates();
  for (const account of candidates) {
    if (excluded.includes(account.id) || account.available === false || account.installed === false) continue;
    if (!documentationCapabilities[account.provider]) continue;
    if (!account.local && account.signedIn !== true) continue;
    const models = (account.models || []).filter(model => model.available !== false && model.id);
    if (account.local && account.available === true && account.model && !models.some(model => model.id === account.model)) models.push({ id: account.model });
    for (const model of models) {
      try {
        const step = loop.documentationEligibility({ accountId: account.id, model: model.id }, candidates);
        if (!['local', 'free', 'included'].includes(step.funding)) continue;
        const small = /haiku|flash|mini|small/i.test(model.id) ? 0 : /sonnet|pro/i.test(model.id) ? 1 : 2;
        routes.push({ accountId: account.id, model: model.id, funding: step.funding, rank: fundingRank(step.funding) * 10 + small });
      } catch (error) { reasons.push(`${account.label || account.id}: ${error.message}`); }
    }
  }
  routes.sort((a, b) => a.rank - b.rank || a.accountId.localeCompare(b.accountId) || a.model.localeCompare(b.model));
  if (!routes.length) throw Error(reasons.length ? [...new Set(reasons)].slice(0, 3).join(' ') : 'No ready documentation worker with a known free, included or local allowance. Refresh account usage or sign in.');
  const { rank, ...worker } = routes[0];
  return worker;
}
module.exports = { selectDocumentationWorker };
