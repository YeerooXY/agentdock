'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SkillPacks } = require('../electron/skill-packs.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { adapters } = require('../electron/providers/index.cjs');
const { taskGuidance } = require('../electron/task-guidance.cjs');
const { runApi } = require('../electron/api-run.cjs');
const { Workbench } = require('../electron/workbench.cjs');

async function fixture(t, { forceAuto } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-auto-delivery-'));
  const home = path.join(root, 'home'), bundled = path.join(root, 'bundled');
  fs.mkdirSync(home); fs.mkdirSync(bundled);
  const preferences = { pstack: true, ponytail: true, 'thermo-nuclear-code-quality-review': true, 'project-documentation': true };
  if (forceAuto !== undefined) preferences['force-delegation'] = forceAuto;
  for (const id of Object.keys(preferences)) {
    const folder = path.join(bundled, id); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: ${id}\ndescription: ${id} fixture workflow.\n---\n# ${id}\n\n${id} instruction sentinel. Preserve owner scope.\n`);
  }
  const skills = new SkillPacks(root, { home, bundled, catalogEntries: [], getPreferences: () => preferences, getAgents: () => adapters.filter(a => a.catalog).map(a => ({ id: a.id, name: a.id, installed: true })) });
  for (const id of Object.keys(preferences)) await skills.install(id);
  const hub = new SharedHub(root, { list: () => [] }, { skills: () => skills.snapshot().packs, readSkill: args => skills.readGuide(args), knowledgeEnabled: () => false });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, home, preferences, skills, hub };
}

test('every registered CLI gets automatic triggers and absolute paths through its launch context', async t => {
  const f = await fixture(t); await f.hub.start();
  const launched = [];
  const sessions = new Sessions(f.root, { hub: f.hub, agentHome: f.home, grid: { columns: 4, rows: 4 },
    claude: { kind: 'native', path: process.execPath }, nativeCodex: () => process.execPath,
    findProgram: () => process.execPath, cliSetup: { executable: () => process.execPath },
    studyContext: () => '', pty: { spawn(executable, args, options) {
      launched.push({ args, options }); return { onData() {}, onExit() {}, kill() {} };
    } } });
  for (const provider of adapters.filter(a => a.catalog)) {
    const item = await sessions.create({ provider: provider.id, cwd: f.root });
    const context = sessions.contexts.get(item.id);
    assert.ok(context, provider.id);
    for (const id of ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review']) {
      assert.ok(context.includes(id + ':'), provider.id + ': ' + id);
      assert.ok(context.includes(f.skills.snapshot().packs.find(p => p.id === id).entryPath.replaceAll('\\', '/')));
    }
    assert.ok(!context.includes('- project-documentation:'), 'Knowledge Off is honored at launch');
    assert.ok(fs.readFileSync(launched.at(-1).options.env.PADDOCK_INSTRUCTIONS, 'utf8').includes('Automatic skill selection'));
  }
  assert.equal(launched.length, adapters.filter(a => a.catalog).length);
});

test('role-filtered inline instructions reach every provider brief and follow-up without filesystem grants', async t => {
  const f = await fixture(t);
  for (const provider of adapters) for (const [role, id] of [['planner', 'pstack'], ['builder', 'ponytail'], ['reviewer', 'thermo-nuclear-code-quality-review']]) {
    const skills = f.skills.guidance({ role, knowledgeEnabled: false });
    const brief = taskGuidance({}, { title: 'Contained code change', provider: provider.id }, {}, null, { role, followup: true, skills });
    assert.ok(brief.includes(id + ' instruction sentinel'), provider.id + ': ' + role);
    assert.ok(brief.includes('digest'));
    assert.ok(!brief.includes('project-documentation instruction sentinel'));
    for (const other of ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review'].filter(x => x !== id)) assert.ok(!brief.includes(other + ' instruction sentinel'));
  }
  assert.ok(!taskGuidance({}, { kind: 'knowledge-maintenance' }, {}, null, { skills: 'general-skill-sentinel' }).includes('general-skill-sentinel'));
});

test('all API protocols receive the same automatic skill policy using mocked HTTP only', async t => {
  const f = await fixture(t);
  for (const protocol of ['responses', 'anthropic', 'chat']) {
    let payload;
    const reply = protocol === 'responses' ? { output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }], usage: { input_tokens: 1, output_tokens: 1 } }
      : protocol === 'anthropic' ? { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
        : { choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    const result = await runApi({ model: 'fixture', prompt: 'Make the contained change', maxOutput: 128 }, '', {}, {
      profile: { protocol, url: 'https://fixture.invalid/v1', id: protocol }, hub: f.hub,
      fetcher: async (_url, init) => { payload = JSON.parse(init.body); return { ok: true, json: async () => reply }; }
    });
    assert.ok(!result.error, JSON.stringify(result.error));
    const instructions = protocol === 'responses' ? payload.instructions : protocol === 'anthropic' ? payload.system : payload.messages.find(x => x.role === 'system').content;
    assert.ok(instructions.includes('ponytail:'));
    assert.ok(instructions.includes('dock/skill_guide'));
    assert.ok(!instructions.includes('- project-documentation:'));
  }
});

test('policy refresh changes cached context receipts; manual selection stops future instruction delivery', async t => {
  const f = await fixture(t);
  const context = async receipt => (await f.hub.invoke('dock_context', receipt ? { sinceContextRevision: receipt } : {})).content[0].text;
  const first = await context();
  const receipt = JSON.parse(first.split('\n')[0]).contextRevision;
  assert.ok(first.includes('ponytail:'));
  await f.skills.setAutomatic('ponytail', false); f.preferences.ponytail = false; f.skills.list();
  const second = await context(receipt);
  assert.ok(!JSON.parse(second.split('\n')[0]).unchanged);
  assert.ok(!second.includes('- ponytail:'));
  assert.ok(!f.skills.guidance({ role: 'builder', knowledgeEnabled: false }).includes('ponytail instruction sentinel'));
});

test('force-delegation is off by default and the lead summary returns to the baseline when toggled off', async t => {
  const f = await fixture(t, { forceAuto: false });
  const baseline = f.hub.summary();
  assert.doesNotMatch(baseline, /### force-delegation|instruction sentinel/);
  await f.skills.setAutomatic('force-delegation', true);
  const on = f.hub.summary();
  assert.match(on, /### force-delegation \(revision \w+, digest \w+\)/);
  assert.match(on, /force-delegation instruction sentinel/);
  await f.skills.setAutomatic('force-delegation', false);
  assert.equal(f.hub.summary(), baseline);
});

test('worker briefs for planner, builder and reviewer never receive force-delegation and keep their role skills', async t => {
  const f = await fixture(t, { forceAuto: true });
  for (const [role, id] of [['planner', 'pstack'], ['builder', 'ponytail'], ['reviewer', 'thermo-nuclear-code-quality-review']]) {
    const guide = f.skills.guidance({ role, knowledgeEnabled: false });
    assert.ok(guide.includes(id + ' instruction sentinel'), role);
    assert.doesNotMatch(guide, /force-delegation/, role);
    const brief = taskGuidance({}, { title: 'Contained code change', provider: 'codex' }, {}, null, { role, followup: true, skills: guide });
    assert.doesNotMatch(brief, /force-delegation/, role);
    assert.doesNotMatch(brief, /Installed at:/, role);
    assert.match(brief, /Use it directly\. Do not reopen external pack paths/, role);
  }
});

test('the lead receives the forced body with Knowledge off, and project documentation stays absent', async t => {
  const f = await fixture(t, { forceAuto: true });
  const text = f.hub.summary({ knowledgeEnabled: false });
  assert.match(text, /force-delegation instruction sentinel/);
  assert.doesNotMatch(text, /- project-documentation:|project-documentation instruction sentinel/);
  assert.match(text, /- ponytail:/);
});

test('a modified force-delegation copy is reported unavailable to the lead with no inline body', async t => {
  const f = await fixture(t, { forceAuto: true });
  for (const target of f.skills.applicable()) {
    const file = path.join(target.path, 'force-delegation', 'SKILL.md');
    if (fs.existsSync(file)) fs.appendFileSync(file, '\nowner edit\n');
  }
  f.skills.list();
  const text = f.hub.summary();
  assert.match(text, /Unavailable automatic skills: force-delegation: The modified copy/);
  assert.doesNotMatch(text, /### force-delegation|force-delegation instruction sentinel/);
});

test('an unreadable force-delegation body is reported as unavailable instead of a fabricated rule', async t => {
  const f = await fixture(t, { forceAuto: true });
  const hub = new SharedHub(f.root, { list: () => [] }, { skills: () => f.skills.snapshot().packs, knowledgeEnabled: () => false });
  t.after(() => hub.close());
  const text = hub.summary();
  assert.match(text, /Unavailable automatic skills: force-delegation: Installed skill instructions are unavailable\./);
  assert.doesNotMatch(text, /### force-delegation|- force-delegation:/);
  assert.match(text, /- ponytail:/);
});

test('the shared skill reader works without a native file tool and respects Knowledge Off', async t => {
  const f = await fixture(t);
  const wb = new Workbench(f.root, {}, { nativeImage: {} }, { getHub: () => f.hub, getProject: () => f.root, getSettings: () => ({ knowledgeMode: 'off' }), onChange() {} });
  const guide = await wb.invoke('dock/skill_guide', { id: 'ponytail' });
  assert.ok(guide.text.includes('ponytail instruction sentinel'));
  await assert.rejects(wb.invoke('dock/skill_guide', { id: 'project-documentation' }), /Knowledge is off/);
  await assert.rejects(wb.invoke('dock/skill_guide', { id: 'ponytail', path: '../outside.md' }), /Markdown/);
});
