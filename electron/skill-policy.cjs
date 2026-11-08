'use strict';

// Pure provider-neutral automatic-skill policy. Selection depends only on the
// supplied pack entries, role and knowledge flag; it reads no files, models or
// project context and never grants permissions.

const ROLES = ['lead', 'planner', 'builder', 'reviewer'];
const MAX_SELECTED = 5;
const MAX_PACK_IDS = 64;
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DOCUMENTATION_ID = 'project-documentation';
// Opt-in lead workflow. Trusted by this exact built-in id only; it is selected
// outside the ordinary cap and never for worker roles.
const FORCE_DELEGATION_ID = 'force-delegation';

const KNOWN = {
  'force-delegation': { trigger: 'Substantive implementation must go to a bounded real worker through Paddock; tiny and check-only work stays direct.', roles: ['lead'], defaultAuto: false, entry: 'SKILL.md' },
  pstack: { trigger: 'Structured investigation, planning, implementation and verification workflows.', roles: ['lead', 'planner'], defaultAuto: false, entry: 'SKILL.md' },
  ponytail: { trigger: 'Reuse existing code and implement the smallest complete change.', roles: ['lead', 'builder'], defaultAuto: false, entry: 'SKILL.md' },
  'thermo-nuclear-code-quality-review': { trigger: 'Strict review of maintainability, boundaries and structural complexity.', roles: ['lead', 'reviewer'], defaultAuto: false, entry: 'SKILL.md' },
  'latex-document': { trigger: 'Create LaTeX study documents and PDFs from notes or source material: cheat sheets, lecture notes, exams, formula sheets, PDF-to-LaTeX.', roles: ['lead'], defaultAuto: true, entry: 'SKILL.md' },
  'project-documentation': { trigger: 'Retrieve source-backed system notes on demand; author only when requested and Knowledge is enabled.', roles: ['lead', 'builder'], defaultAuto: false, entry: 'SKILL.md' },
  'web-ux-ui': { trigger: 'Design, build and review websites, web apps and product UI.', roles: ['lead', 'planner', 'builder', 'reviewer'], defaultAuto: true, entry: 'SKILL.md' },
  'product-ui-ux': { trigger: 'Design or review product interfaces and user interactions.', roles: ['lead', 'planner', 'builder', 'reviewer'], defaultAuto: true, entry: 'SKILL.md' }
};

function metadata(pack) {
  const id = typeof pack === 'string' ? pack : pack && typeof pack.id === 'string' ? pack.id : '';
  const known = Object.hasOwn(KNOWN, id) ? KNOWN[id] : null;
  if (known) return { trigger: known.trigger, roles: [...known.roles], defaultAuto: known.defaultAuto, entry: known.entry };
  const description = pack && typeof pack === 'object' && typeof pack.description === 'string' ? pack.description : '';
  return { trigger: description.slice(0, 600), roles: ['lead'], defaultAuto: false, entry: 'SKILL.md' };
}

function normalizeSkillAuto(value, { recover = false } = {}) {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(item => item.get || item.set)) throw new Error('Skill automatic preferences must be a plain object.');
  const preferences = {};
  let count = 0;
  for (const id of Object.keys(value)) {
    if (recover && (!PACK_ID.test(id) || typeof value[id] !== 'boolean' || count >= MAX_PACK_IDS)) continue;
    if (!PACK_ID.test(id)) throw new Error(`Unknown skill pack: ${id}`);
    const automatic = value[id];
    if (typeof automatic !== 'boolean') throw new Error(`Skill automatic preference for ${id} must be a boolean.`);
    if (count >= MAX_PACK_IDS) throw new Error('Skill automatic preferences are too many.');
    preferences[id] = automatic;
    count += 1;
  }
  return preferences;
}

function cleanEntryPath(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replaceAll('\\', '/');
  if (!text || /[\x00-\x1f]/.test(text) || !/^(?:\/|[a-zA-Z]:\/)/.test(text)) return null;
  const parts = text.replace(/^(?:[a-zA-Z]:)?\/{1,2}/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return text;
}

function selectSkills(packs, { role = 'lead', knowledgeEnabled = true } = {}) {
  if (!Array.isArray(packs)) throw new Error('Skill packs must be a list.');
  if (!ROLES.includes(role)) throw new Error(`Unknown skill role: ${String(role)}`);
  if (typeof knowledgeEnabled !== 'boolean') throw new Error('Knowledge must be enabled or disabled.');
  const entries = [];
  const unavailable = [];
  let ordinary = 0;
  for (const entry of packs) {
    if (!entry || typeof entry !== 'object') throw new Error('Skill entries must be objects.');
    if (entry.availability === 'not-installed') continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const meta = entry.metadata || metadata(entry);
    if (!Array.isArray(meta.roles) || meta.roles.some(value => !ROLES.includes(value)) || typeof meta.trigger !== 'string') throw new Error('Invalid skill metadata.');
    const automatic = typeof entry.automatic === 'boolean' ? entry.automatic : meta.defaultAuto;
    if (automatic !== true) continue;
    if (!meta.roles.includes(role)) continue;
    if (id === DOCUMENTATION_ID && knowledgeEnabled === false) continue;
    const reason = typeof entry.unavailable === 'string' ? entry.unavailable.trim() : typeof entry.availabilityReason === 'string' ? entry.availabilityReason.trim() : '';
    if (reason) { unavailable.push({ id, reason }); continue; }
    const entryPath = cleanEntryPath(entry.entryPath);
    if (!entryPath) { unavailable.push({ id, reason: 'The skill has no clean entry path.' }); continue; }
    const forced = id === FORCE_DELEGATION_ID;
    const leadReview = role === 'lead' && id === 'thermo-nuclear-code-quality-review';
    if (!forced && !leadReview && ordinary >= MAX_SELECTED) { unavailable.push({ id, reason: 'Automatic skill delivery limit reached.' }); continue; }
    if (!forced) ordinary += 1;
    entries.push({ id, entryPath, trigger: meta.trigger });
  }
  return { entries, unavailable };
}

module.exports = { FORCE_DELEGATION_ID, metadata, normalizeSkillAuto, selectSkills };
