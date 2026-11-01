'use strict';
// Input is rendered visible text, not HTML/source. These narrow checks catch
// known owner corrections; they cannot establish overall writing quality.
const rules = [
  ['site-status', 'Keep website development status in the handoff.', /\b(?:(?:this|the|our)\s+(?:web\s*site|page)\s+is\s+(?:just\s+|only\s+)?(?:a\s+)?(?:demo|prototype|sample)|(?:demo|prototype|sample)\s+(?:web\s*site|page)|for\s+demonstration\s+(?:purposes\s+)?only)\b/gi],
  ['generic-slogan', 'Use a concrete fact or task label, or remove this line.', /\b(?:built around your (?:day|notes)|one (?:session|idea) at a time|a small session is still a start|a place for (?:every subject|study|play)|your notes,? put into practice|make a little room for learning)\b/gi],
  ['promotional-reversal', 'State the specific offer directly.', /\b(?:it['’]s|we['’]re)\s+not\s+just\b[^.!?\n]{0,140}\b(?:it['’]s|we['’]re)\b/gi],
  ['encoding', 'Inspect this possible encoding error in the rendered page.', /(?:\uFFFD|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â[€€™œ“”–—])/g]
];
function checkWebsiteCopy(text) {
  if (typeof text !== 'string' || text.length > 100000) throw Error('Supply up to 100000 characters of rendered visible text.');
  const findings = [];
  for (const [rule, action, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({ rule, line: text.slice(0, match.index).split('\n').length, offset: match.index, text: match[0], action });
      if (findings.length >= 100) return { findings, truncated: true, coverage: 'Known wording and encoding patterns in supplied text only.' };
    }
  }
  return { findings: findings.sort((a, b) => a.offset - b.offset), truncated: false,
    coverage: 'Known wording and encoding patterns in supplied text only. No findings does not establish complete rule compliance, factual accuracy or visual quality.' };
}
module.exports = { checkWebsiteCopy };
