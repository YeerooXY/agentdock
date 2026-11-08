'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { metadata, normalizeSkillAuto, selectSkills } = require('../electron/skill-policy.cjs');

const ENTRY = '/skills/example/SKILL.md';
const SOURCE_ENTRY = 'SKILL.md';

test('known engineering packs default to manual and web UI packs stay automatic', () => {
  assert.equal(metadata('pstack').defaultAuto, false);
  assert.deepEqual(metadata('pstack').roles, ['lead', 'planner']);
  assert.deepEqual(metadata('ponytail').roles, ['lead', 'builder']);
  assert.deepEqual(metadata('thermo-nuclear-code-quality-review').roles, ['lead', 'reviewer']);
  assert.equal(metadata('project-documentation').defaultAuto, false);
  const ui = metadata('web-ux-ui');
  assert.deepEqual(ui.roles, ['lead', 'planner', 'builder', 'reviewer']);
  assert.equal(ui.defaultAuto, true);
  assert.equal(ui.entry, SOURCE_ENTRY);
});

test('unknown packs fall back to their own description and a manual default', () => {
  const fallback = metadata({ id: 'mystery-pack', description: 'Mystery workflow.', entryPath: ENTRY });
  assert.equal(fallback.defaultAuto, false);
  assert.ok(fallback.trigger.includes('Mystery workflow'));
  assert.deepEqual(fallback.roles, ['lead']);
  assert.equal(fallback.entry, SOURCE_ENTRY);
});

test('normalizeSkillAuto accepts a bounded plain object of valid pack ids to booleans', () => {
  assert.deepEqual(normalizeSkillAuto({}), {});
  assert.deepEqual(normalizeSkillAuto({ pstack: false, 'web-ux-ui': true }), { pstack: false, 'web-ux-ui': true });
});

test('normalizeSkillAuto rejects malformed preferences at the boundary', () => {
  assert.throws(() => normalizeSkillAuto(null));
  assert.throws(() => normalizeSkillAuto([]));
  assert.throws(() => normalizeSkillAuto({ pstack: 'false' }));
  assert.throws(() => normalizeSkillAuto({ 'Bad_Id': true }));
  assert.throws(() => normalizeSkillAuto({ pstack: 1 }));
  assert.throws(() => normalizeSkillAuto(JSON.parse('{"__proto__":true}')));
});

test('normalizeSkillAuto bounds the preference map', () => {
  const tooMany = {};
  for (let index = 0; index < 65; index += 1) tooMany[`pack-${index}`] = true;
  assert.throws(() => normalizeSkillAuto(tooMany));
});

test('selectSkills returns at most five applicable automatic packs and reports unavailable ones', () => {
  const packs = [
    { id: 'pstack', automatic: true, entryPath: ENTRY },
    { id: 'ponytail', automatic: true, entryPath: ENTRY },
    { id: 'thermo-nuclear-code-quality-review', automatic: true, entryPath: ENTRY },
    { id: 'project-documentation', automatic: true, entryPath: ENTRY },
    { id: 'web-ux-ui', automatic: true, entryPath: ENTRY },
    { id: 'sixth-pack', automatic: true, entryPath: ENTRY, description: 'Custom workflow.' }
  ];
  const result = selectSkills(packs, { role: 'lead' });
  assert.equal(result.entries.length, 5);
  assert.deepEqual(result.unavailable.map(item => item.id), ['sixth-pack']);
});

test('selectSkills only picks automatic packs for the requested role', () => {
  const { entries } = selectSkills([
    { id: 'pstack', entryPath: ENTRY },
    { id: 'web-ux-ui', automatic: true, entryPath: ENTRY }
  ], { role: 'builder' });
  assert.deepEqual(entries.map(entry => entry.id), ['web-ux-ui']);
});

test('selectSkills suppresses project documentation when knowledge is off', () => {
  const packs = [
    { id: 'project-documentation', automatic: true, entryPath: ENTRY },
    { id: 'web-ux-ui', automatic: true, entryPath: ENTRY }
  ];
  const on = selectSkills(packs, { role: 'lead', knowledgeEnabled: true });
  assert.deepEqual(on.entries.map(entry => entry.id), ['project-documentation', 'web-ux-ui']);
  const off = selectSkills(packs, { role: 'lead', knowledgeEnabled: false });
  assert.deepEqual(off.entries.map(entry => entry.id), ['web-ux-ui']);
  assert.deepEqual(off.unavailable, []);
});

test('selectSkills reports unavailable packs explicitly and rejects unclean entry paths', () => {
  const result = selectSkills([
    { id: 'ponytail', automatic: true, entryPath: 'SKILL.md', unavailable: ' Download failed. ' },
    { id: 'web-ux-ui', automatic: true, entryPath: '../escape/SKILL.md' }
  ], { role: 'lead' });
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.unavailable, [
    { id: 'ponytail', reason: 'Download failed.' },
    { id: 'web-ux-ui', reason: 'The skill has no clean entry path.' }
  ]);
});

test('selectSkills rejects malformed packs, roles and options at the boundary', () => {
  assert.throws(() => selectSkills(null));
  assert.throws(() => selectSkills({}, { role: 'lead' }));
  assert.throws(() => selectSkills([], { role: 'owner' }));
  assert.throws(() => selectSkills([], { knowledgeEnabled: 'yes' }));
});

test('selected entries carry only id, entry path and trigger', () => {
  const { entries } = selectSkills([{ id: 'web-ux-ui', automatic: true, entryPath: ENTRY }], { role: 'lead' });
  assert.deepEqual(entries, [{ id: 'web-ux-ui', entryPath: ENTRY, trigger: 'Design, build and review websites, web apps and product UI.' }]);
});

test('Windows paths work, while missing and relative paths never become instructions', () => {
  const selected = selectSkills([{ id: 'ponytail', automatic: true, entryPath: 'C:\\Users\\Owner\\skills\\ponytail\\SKILL.md' }], { role: 'builder' });
  assert.equal(selected.entries[0].entryPath, 'C:/Users/Owner/skills/ponytail/SKILL.md');
  assert.equal(selectSkills([{ id: 'ponytail', automatic: true }], { role: 'builder' }).entries.length, 0);
  assert.equal(selectSkills([{ id: 'ponytail', automatic: true, entryPath: 'SKILL.md' }], { role: 'builder' }).entries.length, 0);
});

test('force-delegation is lead-only and off by default', () => {
  const meta = metadata('force-delegation');
  assert.equal(meta.defaultAuto, false);
  assert.deepEqual(meta.roles, ['lead']);
  assert.deepEqual(selectSkills([{ id: 'force-delegation', entryPath: ENTRY }], { role: 'lead' }).entries, []);
  for (const role of ['planner', 'builder', 'reviewer']) {
    assert.deepEqual(selectSkills([{ id: 'force-delegation', automatic: true, entryPath: ENTRY }], { role }).entries, [], role);
  }
});

test('an enabled force-delegation is selected outside the five ordinary skills', () => {
  const ordinary = ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review', 'web-ux-ui', 'product-ui-ux', 'sixth-pack']
    .map(id => ({ id, automatic: true, entryPath: ENTRY, description: 'Custom workflow.' }));
  const result = selectSkills([...ordinary, { id: 'force-delegation', automatic: true, entryPath: ENTRY }], { role: 'lead' });
  assert.deepEqual(result.entries.map(entry => entry.id), ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review', 'web-ux-ui', 'product-ui-ux', 'force-delegation']);
  assert.deepEqual(result.unavailable.map(item => item.id), ['sixth-pack']);
});

test('force-delegation keeps the installed, automatic, path and knowledge checks', () => {
  const result = selectSkills([
    { id: 'force-delegation', availability: 'not-installed', automatic: true, entryPath: ENTRY },
    { id: 'force-delegation', automatic: true, unavailable: 'The modified copy cannot be used for automatic delivery.' },
    { id: 'force-delegation', automatic: true, entryPath: '../escape/SKILL.md' }
  ], { role: 'lead' });
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.unavailable.map(item => item.reason), ['The modified copy cannot be used for automatic delivery.', 'The skill has no clean entry path.']);
  assert.deepEqual(selectSkills([{ id: 'force-delegation', automatic: true, entryPath: ENTRY }], { role: 'lead', knowledgeEnabled: false }).entries.map(entry => entry.id), ['force-delegation']);
});

test('a priority flag on an unknown pack does not bypass the ordinary cap', () => {
  const ordinary = ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review', 'web-ux-ui', 'product-ui-ux']
    .map(id => ({ id, automatic: true, entryPath: ENTRY }));
  const result = selectSkills([...ordinary, { id: 'owner-pack', automatic: true, entryPath: ENTRY, description: 'Owner workflow.', priority: true, metadata: { trigger: 'Owner.', roles: ['lead'], defaultAuto: true, priority: true } }], { role: 'lead' });
  assert.equal(result.entries.length, 5);
  assert.deepEqual(result.unavailable, [{ id: 'owner-pack', reason: 'Automatic skill delivery limit reached.' }]);
});

test('prototype keys and accessors cannot supply trusted policy metadata', () => {
  assert.equal(metadata({ id: 'constructor', description: 'Owner pack.' }).defaultAuto, false);
  assert.throws(() => normalizeSkillAuto(Object.create({ pstack: true })));
  let read = false;
  const value = {}; Object.defineProperty(value, 'pstack', { enumerable: true, get() { read = true; return true; } });
  assert.throws(() => normalizeSkillAuto(value)); assert.equal(read, false);
  const selected = selectSkills([{ id: 'project-documentation', automatic: false, unavailable: 'Missing' }], { knowledgeEnabled: false });
  assert.deepEqual(selected, { entries: [], unavailable: [] });
});
