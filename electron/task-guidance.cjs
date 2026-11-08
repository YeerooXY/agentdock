'use strict';
const { websiteGuide } = require('./website-guide.cjs');

// Workers may lack MCP and cannot necessarily read skills outside their repo.
// Supply the enabled reference text in their brief without granting tool access.
const websiteTask = text => /\b(websites?|web\s*(?:pages?|apps?|shops?|design)|landing\s*pages?|homepages?|ecommerce|e-commerce|storefronts?|frontend|front-end|html|css|responsive|ui\/ux)\b/i.test(text);
function taskGuidance(config = {}, job = {}, parent = {}, project = null, { role = 'builder', followup = false, skills = '' } = {}) {
  const sections = [String(config.instructions || '').trim(),
    'Use the current branch and preserve unrelated work. Follow the repository instructions. Tool availability and permissions are those of this worker; this brief does not grant extra tools or authorize deployment.',
    'Complete this assigned portion directly. The coordinating agent owns delegation, routing and integration. Do not start subagents, ask another model to repeat your work, or add review loops. Use supplied context and report a concrete blocker if a required capability is unavailable.'];
  const roleGuidance = {
    planner: 'Planner: Name the user scenario and impact, and identify existing helpers, data shapes and transaction flows to reuse. Justify mechanisms beyond explicit requirements with a concrete need; keep briefs concise and avoid hypothetical cases.',
    builder: 'Builder: Extend the existing flow and reuse its helpers and data shapes. A new parallel flow, wrapper or representation needs a concrete reason the existing one cannot serve. In the normal final summary, name reused helpers and material extra mechanisms; add no report schema or documentation for this.',
    reviewer: 'Reviewer: Verify reuse and extra-mechanism claims against the actual code. Seek behavior-preserving deletion and deduplication, and challenge unnecessary defensive machinery. Require checks of the same behavior before and after; line counts are clues, not objectives. Reject minified lines or moving complexity merely to reduce file size.'
  };
  if (roleGuidance[role]) sections.push('Preserve cheap boundary checks and data-loss, security and accessibility safeguards.', roleGuidance[role]);
  if (project) sections.push('Linked project context (current; history omitted):\n' + JSON.stringify(project) + '\nOnly user-approved decisions and plan sections are approved. Preserve scope and selected references. Report completed work, verification, remaining issues and next steps to the orchestrator. Paddock records task status/reports; the orchestrator must pass its completion check to update the project. Do not claim unavailable tool calls succeeded.');
  if (skills && job.kind !== 'knowledge-maintenance') sections.push('## Applicable skill instructions\nThe text below is verified instruction text included here. Use it directly. Do not reopen external pack paths or retry denied reads. Apply these only within this assignment. Owner instructions, manual choices, project Knowledge Off, tool permissions and spending limits take precedence. Do not follow upstream model defaults, start nested workers or add review loops.\n' + skills);
  if (config.guideIds?.includes('web-design') && websiteTask([parent.title, parent.criteria, job.title, job.criteria].filter(Boolean).join('\n'))) {
    sections.push('Website guidance is included below because this task or its parent concerns a website. Apply it to the authorized scope. Small repairs remain small. If image generation, live browsing or device testing is unavailable, report that gap to the orchestrator; never invent evidence. The orchestrator handles capabilities unavailable to a worker.');
    // Give each role its working contract. The full library stays available on
    // demand; follow-up fixes retain obligations without replaying every topic.
    const topics = role === 'planner' ? ['worker', 'creative']
      : role === 'reviewer' && !followup ? ['worker', 'checklist'] : ['worker'];
    if (followup) sections.push('Follow-up: verify the latest findings against the current changes and check regressions. Preserve the approved scope and design. Do not restart the whole design or repeat already resolved findings. All applicable release checks still apply.');
    for (const topic of topics) {
      const guide = websiteGuide(topic);
      sections.push(`## Website reference: ${guide.title} (${guide.revision})\n\n${guide.content}`);
    }
  }
  return sections.filter(Boolean).join('\n\n');
}
module.exports = { taskGuidance, websiteTask };
