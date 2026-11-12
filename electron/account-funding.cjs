'use strict';
const FUNDING = ['free', 'included', 'metered', 'unknown'];
function accountFunding(candidate, allowance = {}, rules = {}) {
  if (candidate?.local) return 'local';
  const configured = rules.accountFunding?.[candidate?.id];
  if (FUNDING.includes(configured)) return configured;
  if (FUNDING.includes(candidate?.funding) && candidate.funding !== 'unknown') return candidate.funding;
  // An installed provider or a model listing does not establish entitlement.
  const plan = allowance.plan || '';
  if (/(?:^|[\s_-])free(?:$|[\s_-])/i.test(plan)) return 'free';
  if (/pay.as.you.go|metered|api credits/i.test(plan)) return 'metered';
  if (/(?:^|[\s_-])(?:plus|pro|premium|business|enterprise|team|max|ultra|go)(?:$|[\s_-])/i.test(plan)) return 'included';
  if (!plan && allowance.windows?.some(w => /free (?:plan|tier|credits|allocation)/i.test(w.label || ''))) return 'free';
  return 'unknown';
}
function fundingRank(kind) { return ({ local: 0, free: 1, included: 2, unknown: 3, metered: 4 })[kind] ?? 3; }
module.exports = { FUNDING, accountFunding, fundingRank };
