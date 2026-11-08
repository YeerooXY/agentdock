'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SkillPacks, MANIFEST } = require('../electron/skill-packs.cjs');
const { ManagedDownloads } = require('../electron/managed-downloads.cjs');
const { desktopSettingsCommands } = require('../electron/desktop-settings-commands.cjs');

function fixture(t, agents = [{ id: 'claude', name: 'Claude Code', installed: true }, { id: 'kiro', name: 'Kiro', installed: true }, { id: 'qwen', name: 'Qwen Code', installed: false }]) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-skills-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), root = path.join(base, 'profile'), bundled = path.join(base, 'bundled');
  const pack = path.join(bundled, 'demo-pack');
  fs.mkdirSync(path.join(pack, 'references'), { recursive: true }); fs.mkdirSync(home); fs.mkdirSync(root);
  fs.writeFileSync(path.join(pack, 'SKILL.md'), '---\nname: demo-pack\ndescription: Demo knowledge for tests.\n---\n# Demo\n');
  fs.writeFileSync(path.join(pack, 'references', 'topic.md'), 'Topic v1\n');
  const skills = new SkillPacks(root, { home, bundled, getAgents: () => agents, downloads: new ManagedDownloads(root), catalogEntries: [] });
  return { base, home, root, bundled, pack, skills };
}
const folder = (home, ...dir) => path.join(home, ...dir, 'demo-pack');

test('a failed preference save restores automatic delivery and managed entry files', async t => {
  const { skills, home } = fixture(t);
  await skills.install('demo-pack');
  const commands = desktopSettingsCommands({ skillPacks: skills, getSettings: () => ({ skillAuto: {} }),
    persistSettings() { throw Error('Disk full'); }, hub: { writeSummary() {} }, publish() {} });
  await assert.rejects(commands['skills.automatic']({ id: 'demo-pack', automatic: true }), /could not be saved/);
  assert.equal(skills.list().find(pack => pack.id === 'demo-pack').automatic, false);
  assert.match(fs.readFileSync(path.join(folder(home, '.agents', 'skills'), 'SKILL.md'), 'utf8'), /disable-model-invocation: true/);
  assert.equal(skills.guidance({ role: 'lead' }), '');
  assert.equal(skills.overrides.size, 0);
});

test('a render failure leaves the saved automatic preference effective', async t => {
  const { skills, source, prefs } = managed(t);
  await skills.install('pstack');
  fs.writeFileSync(path.join(source('pstack'), 'upstream/skills/poteto-mode/SKILL.upstream.md'), 'collision');
  await assert.rejects(skills.setAutomatic('pstack', true), /already exists/);
  assert.equal(skills.list().find(pack => pack.id === 'pstack').automatic, false);
  prefs.skillAuto.pstack = true;
  assert.equal(skills.list().find(pack => pack.id === 'pstack').automatic, true);
});

test('a failed install-record write does not retain an automatic override', async t => {
  const { skills } = managed(t);
  await skills.install('pstack');
  skills.record = () => { throw Error('Disk full'); };
  await assert.rejects(skills.setAutomatic('pstack', true), /Disk full/);
  assert.equal(skills.overrides.size, 0);
  assert.equal(skills.list().find(pack => pack.id === 'pstack').automatic, false);
});

test('mixed-case nested entry names are not independently discoverable', async t => {
  const { skills, source, dest } = managed(t);
  const nested = path.join(source('pstack'), 'upstream/skills/other');
  fs.writeFileSync(path.join(nested, 'Skill.md'), '# Nested skill');
  fs.appendFileSync(path.join(nested, 'notes.md'), '\n[extra](sKILL.md)\n');
  await skills.install('pstack');
  const target = path.join(dest('.agents', 'skills'), 'upstream/skills/other');
  assert.ok(fs.existsSync(path.join(target, 'SKILL.upstream.md')));
  assert.equal(fs.existsSync(path.join(target, 'Skill.md')), false);
  assert.match(fs.readFileSync(path.join(target, 'notes.md'), 'utf8'), /\[extra\]\(SKILL.upstream.md\)/);
});

test('installs into the shared folder and each installed agent folder, and lists them for uninstall review', async t => {
  const { home, root, skills } = fixture(t);
  const results = await skills.install('demo-pack');
  assert.deepEqual(results.map(x => [x.target, x.state]), [['agents', 'installed'], ['claude', 'installed'], ['kiro', 'installed']]);
  for (const dir of [['.agents', 'skills'], ['.claude', 'skills'], ['.kiro', 'skills']]) {
    assert.equal(fs.readFileSync(path.join(folder(home, ...dir), 'references', 'topic.md'), 'utf8'), 'Topic v1\n');
    assert.ok(fs.existsSync(path.join(folder(home, ...dir), MANIFEST)));
  }
  assert.equal(fs.existsSync(path.join(home, '.qwen')), false);
  assert.ok(skills.snapshot().packs[0].targets.every(x => x.state === 'installed'));
  assert.match(fs.readFileSync(path.join(root, 'managed-downloads.txt'), 'utf8'), /demo-pack: .*\.kiro/);
  assert.equal(fs.readdirSync(path.join(home, '.claude', 'skills')).length, 1, 'no staging folders remain');
});

test('updates an unchanged install and refuses to overwrite folders it does not own or that were edited', async t => {
  const { home, pack, skills } = fixture(t);
  fs.mkdirSync(folder(home, '.kiro', 'skills'), { recursive: true }); fs.writeFileSync(path.join(folder(home, '.kiro', 'skills'), 'SKILL.md'), 'mine');
  const first = await skills.install('demo-pack');
  assert.equal(first.find(x => x.target === 'kiro').state, 'skipped');
  assert.equal(fs.readFileSync(path.join(folder(home, '.kiro', 'skills'), 'SKILL.md'), 'utf8'), 'mine');
  fs.writeFileSync(path.join(pack, 'references', 'topic.md'), 'Topic v2\n');
  fs.appendFileSync(path.join(folder(home, '.claude', 'skills'), 'SKILL.md'), 'my note\n');
  assert.deepEqual(skills.list()[0].targets.map(x => x.state), ['outdated', 'modified', 'conflict']);
  const second = await skills.install('demo-pack');
  assert.equal(second.find(x => x.target === 'agents').state, 'updated');
  assert.equal(fs.readFileSync(path.join(folder(home, '.agents', 'skills'), 'references', 'topic.md'), 'utf8'), 'Topic v2\n');
  assert.equal(second.find(x => x.target === 'claude').state, 'skipped');
  assert.match(fs.readFileSync(path.join(folder(home, '.claude', 'skills'), 'SKILL.md'), 'utf8'), /my note/);
});

test('uninstall removes only unchanged Paddock files, keeps edits and ignores folders it does not own', async t => {
  const { home, skills } = fixture(t);
  await skills.install('demo-pack');
  fs.appendFileSync(path.join(folder(home, '.claude', 'skills'), 'references', 'topic.md'), 'edit\n');
  fs.mkdirSync(path.join(folder(home, '.agents', 'skills'), 'scripts', '__pycache__'), { recursive: true });
  fs.writeFileSync(path.join(folder(home, '.agents', 'skills'), 'scripts', '__pycache__', 'x.pyc'), '');
  fs.mkdirSync(path.join(home, '.qwen', 'skills', 'demo-pack'), { recursive: true }); fs.writeFileSync(path.join(home, '.qwen', 'skills', 'demo-pack', 'SKILL.md'), 'not ours');
  const results = await skills.uninstall('demo-pack');
  assert.deepEqual(results.map(x => [x.target, x.state]), [['agents', 'removed'], ['claude', 'kept'], ['kiro', 'removed']]);
  assert.equal(fs.existsSync(folder(home, '.agents', 'skills')), false);
  assert.deepEqual(fs.readdirSync(folder(home, '.claude', 'skills'), { recursive: true }).map(x => x.replaceAll('\\', '/')).sort(), ['references', 'references/topic.md']);
  assert.equal(fs.readFileSync(path.join(home, '.qwen', 'skills', 'demo-pack', 'SKILL.md'), 'utf8'), 'not ours');
});

test('local packs come from the profile, bundled IDs win, and invalid packs or IDs are rejected', async t => {
  const { root, skills } = fixture(t);
  const local = path.join(root, 'skill-packs');
  fs.mkdirSync(path.join(local, 'my-notes'), { recursive: true }); fs.writeFileSync(path.join(local, 'my-notes', 'SKILL.md'), '---\nname: my-notes\ndescription: Personal notes.\n---\n');
  fs.mkdirSync(path.join(local, 'demo-pack'), { recursive: true }); fs.writeFileSync(path.join(local, 'demo-pack', 'SKILL.md'), '---\nname: demo-pack\ndescription: Shadow.\n---\n');
  fs.mkdirSync(path.join(local, 'wrong-name'), { recursive: true }); fs.writeFileSync(path.join(local, 'wrong-name', 'SKILL.md'), '---\nname: other\ndescription: Mismatch.\n---\n');
  assert.deepEqual(skills.packs().map(x => [x.id, x.source]), [['demo-pack', 'bundled'], ['my-notes', 'local']]);
  await assert.rejects(skills.install('../demo-pack'), /available skill pack/);
  await assert.rejects(skills.install('wrong-name'), /available skill pack/);
  await assert.rejects(skills.uninstall('..'), /available skill pack/);
});

test('a fresh profile discovers catalog packs without downloading and one install waits for setup', async t => {
  const { root, home, bundled } = fixture(t);
  let release, calls = 0;
  const entry = { id: 'catalog-demo', name: 'Catalog demo', description: 'Downloadable workflow.', repo: 'maker/repo', commit: 'a'.repeat(40) };
  const skills = new SkillPacks(root, { home, bundled, catalogEntries: [entry], ensurePack: async ({ id, localRoot }) => {
    calls++; await new Promise(resolve => { release = resolve; });
    const dir = path.join(localRoot, id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${id}\ndescription: Downloaded workflow.\n---\n# Catalog demo\n`);
  } });
  assert.equal(skills.list().find(x => x.id === entry.id).downloadable, true);
  assert.equal(calls, 0);
  const pending = skills.install(entry.id);
  assert.equal(skills.busy, true);
  await assert.rejects(skills.install(entry.id), /already running/);
  release(); await pending;
  const installed = skills.list().find(x => x.id === entry.id);
  assert.equal(calls, 1); assert.equal(skills.busy, false);
  assert.equal(installed.downloadable, false);
  assert.ok(installed.targets.every(x => x.state === 'installed'));
  assert.match(installed.setup, /No additional API key/);
});

test('a failed catalog download leaves no target installation and releases the busy state', async t => {
  const { root, home, bundled } = fixture(t);
  const skills = new SkillPacks(root, { home, bundled, catalogEntries: [{ id: 'catalog-demo', name: 'Demo' }], ensurePack: async () => { throw Error('Download failed.'); } });
  await assert.rejects(skills.install('catalog-demo'), /Download failed/);
  assert.equal(skills.busy, false);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'catalog-demo')), false);
  assert.equal(skills.list().find(x => x.id === 'catalog-demo').downloadable, true);
});

test('the bundled web-ux-ui pack is valid and carries no personal or third-party screenshot content', () => {
  const dir = path.join(__dirname, '..', 'skills', 'web-ux-ui');
  const skills = new SkillPacks(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-skills-real-')), { home: os.tmpdir(), bundled: path.join(__dirname, '..', 'skills') });
  assert.ok(skills.packs().some(x => x.id === 'web-ux-ui' && x.source === 'bundled'));
  const files = fs.readdirSync(dir, { recursive: true }).map(x => x.replaceAll('\\', '/'));
  assert.equal(files.some(x => /\.(png|jpe?g|pdf)$/i.test(x)), false);
  for (const file of files.filter(x => x.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(text, /Yeeroo|Rexdeco|For this user|evidence\//, file);
    for (const [, link] of text.matchAll(/\]\(((?!https?:|#)[^)\s]+)\)/g)) assert.ok(fs.existsSync(path.join(dir, path.dirname(file), link)), `${file} links ${link}`);
  }
});

test('agents are told which packs are installed and where to read them', async t => {
  const { SharedHub } = require('../electron/shared.cjs');
  const { root, skills } = fixture(t);
  const hub = new SharedHub(root, { list: () => [] }, { skills: () => skills.snapshot().packs }); t.after(() => hub.close());
  assert.doesNotMatch(hub.fullSummary(), /## Skill packs/);
  await skills.install('demo-pack');
  assert.match(hub.fullSummary(), /## Skill packs[\s\S]*demo-pack: Demo knowledge for tests\. \(.*demo-pack[\\/]SKILL\.md\)/);
});

const { generateRootSkill } = require('../electron/skill-catalog.cjs');
const ENTRY = 'upstream/skills/poteto-mode/SKILL.md';
function managed(t, { ids = ['pstack'], filler = 0, preferences = {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-auto-skills-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), root = path.join(base, 'profile'), bundled = path.join(base, 'bundled');
  for (const dir of [home, root, bundled]) fs.mkdirSync(dir);
  const entries = ids.map(id => ({ id, name: id, description: `${id} upstream.`, repo: 'maker/repo', commit: 'a'.repeat(40), entry: ENTRY }));
  for (const item of entries) {
    const dir = path.join(root, 'skill-packs', item.id), nested = path.join(dir, 'upstream', 'skills');
    fs.mkdirSync(path.join(nested, 'poteto-mode'), { recursive: true }); fs.mkdirSync(path.join(nested, 'other'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), generateRootSkill(item));
    fs.writeFileSync(path.join(nested, 'poteto-mode', 'SKILL.md'), `---\nname: poteto\ndescription: Upstream.\n---\nSee [rules](rules.md) and [notes](../other/notes.md).\n${'x'.repeat(filler)}\n`);
    fs.writeFileSync(path.join(nested, 'poteto-mode', 'rules.md'), 'Rules\n');
    fs.writeFileSync(path.join(nested, 'other', 'notes.md'), 'Back to [main](../poteto-mode/SKILL.md#top) and [ref]: x\n[ref]: ../poteto-mode/SKILL.md\n');
  }
  const prefs = { skillAuto: { ...preferences } };
  const skills = new SkillPacks(root, { home, bundled, getAgents: () => [{ id: 'claude', name: 'Claude Code', installed: true }], catalogEntries: entries,
    getPreferences: () => prefs, ensurePack: async () => { throw Error('no download'); } });
  const dest = (...dir) => path.join(home, ...dir, 'pstack');
  return { base, home, root, skills, prefs, entries, dest, source: id => path.join(root, 'skill-packs', id) };
}
function patchFs(t, name, wrap) { const original = fs[name]; fs[name] = wrap(original); const restore = () => { fs[name] = original; }; t.after(restore); return restore; }

test('managed packs publish a manual root by default, rename nested entries and keep references intact', async t => {
  const { skills, dest, source } = managed(t);
  const before = fs.readFileSync(path.join(source('pstack'), 'upstream', 'skills', 'poteto-mode', 'SKILL.md'));
  const rootBefore = fs.readFileSync(path.join(source('pstack'), 'SKILL.md'));
  assert.equal(skills.list()[0].automatic, false);
  await skills.install('pstack');
  const target = dest('.agents', 'skills'), nested = path.join(target, 'upstream', 'skills');
  assert.match(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), /disable-model-invocation: true/);
  assert.match(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), /upstream\/skills\/poteto-mode\/SKILL\.upstream\.md/);
  assert.equal(fs.existsSync(path.join(nested, 'poteto-mode', 'SKILL.md')), false);
  assert.match(fs.readFileSync(path.join(nested, 'poteto-mode', 'SKILL.upstream.md'), 'utf8'), /\(rules\.md\)/);
  const notes = fs.readFileSync(path.join(nested, 'other', 'notes.md'), 'utf8');
  assert.match(notes, /\(\.\.\/poteto-mode\/SKILL\.upstream\.md#top\)/); assert.match(notes, /\]: \.\.\/poteto-mode\/SKILL\.upstream\.md/);
  const found = fs.readdirSync(target, { recursive: true }).filter(x => path.basename(x) === 'SKILL.md');
  assert.deepEqual(found, ['SKILL.md']);
  assert.ok(fs.readFileSync(path.join(source('pstack'), 'upstream', 'skills', 'poteto-mode', 'SKILL.md')).equals(before), 'source stays pristine');
  assert.ok(fs.readFileSync(path.join(source('pstack'), 'SKILL.md')).equals(rootBefore));
  assert.ok(skills.list()[0].targets.every(x => x.state === 'installed'));
});

test('setAutomatic re-renders existing installs only, keeps edits, never downloads or creates targets', async t => {
  const { skills, prefs, dest, home } = managed(t);
  await skills.install('pstack');
  fs.appendFileSync(path.join(dest('.claude', 'skills'), 'upstream', 'skills', 'other', 'notes.md'), 'mine\n');
  fs.writeFileSync(path.join(dest('.claude', 'skills'), 'added.md'), 'added');
  prefs.skillAuto.pstack = true;
  const results = await skills.setAutomatic('pstack', true);
  assert.deepEqual(results.map(x => [x.target, x.state]), [['agents', 'updated'], ['claude', 'skipped']]);
  const root = fs.readFileSync(path.join(dest('.agents', 'skills'), 'SKILL.md'), 'utf8');
  assert.doesNotMatch(root, /disable-model-invocation/); assert.match(root, /Use when the task matches: Structured investigation/);
  assert.match(fs.readFileSync(path.join(dest('.claude', 'skills'), 'SKILL.md'), 'utf8'), /disable-model-invocation: true/);
  assert.equal(fs.readFileSync(path.join(dest('.claude', 'skills'), 'added.md'), 'utf8'), 'added');
  assert.match(fs.readFileSync(path.join(dest('.claude', 'skills'), 'upstream', 'skills', 'other', 'notes.md'), 'utf8'), /mine/);
  assert.equal(fs.existsSync(path.join(home, '.kiro')), false);
  assert.equal(skills.list()[0].automatic, true);
  prefs.skillAuto.pstack = false;
  await skills.setAutomatic('pstack', false);
  assert.match(fs.readFileSync(path.join(dest('.agents', 'skills'), 'SKILL.md'), 'utf8'), /disable-model-invocation: true/);
});

test('setAutomatic does nothing for a pack that was never downloaded or installed', async t => {
  const { root, home, skills } = managed(t);
  fs.rmSync(path.join(root, 'skill-packs'), { recursive: true });
  assert.deepEqual(await skills.setAutomatic('pstack', true), []);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
  await assert.rejects(skills.setAutomatic('pstack', 'yes'), /on or off/);
});

test('a failed promotion restores the previous copy; a failed restore keeps the backup; cleanup failure is reported apart', async t => {
  const { skills, prefs, dest } = managed(t);
  await skills.install('pstack');
  const target = dest('.agents', 'skills'), original = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
  prefs.skillAuto.pstack = true;
  const staged = p => path.basename(String(p)).startsWith('.pstack.paddock-') && !String(p).endsWith('-old');
  const restore = patchFs(t, 'renameSync', rename => function (from, to) { if (staged(from)) throw Error('boom'); return rename.apply(this, arguments); });
  let results = await skills.setAutomatic('pstack', true);
  assert.equal(results[0].state, 'failed'); assert.match(results[0].reason, /restored/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['pstack']);
  restore();
  patchFs(t, 'renameSync', rename => function (from, to) { if (staged(from) || String(from).endsWith('-old') && !String(to).includes('-old')) throw Error('boom'); return rename.apply(this, arguments); });
  results = await skills.setAutomatic('pstack', true);
  assert.equal(results[0].state, 'failed'); assert.ok(results[0].backup);
  assert.ok(fs.existsSync(path.join(results[0].backup, 'SKILL.md')), 'backup retained');
});

test('cleanup failure after promotion is reported separately', async t => {
  const { skills, prefs, dest } = managed(t);
  await skills.install('pstack');
  prefs.skillAuto.pstack = true;
  patchFs(t, 'rmSync', rm => function (p) { if (String(p).endsWith('-old')) throw Error('locked'); return rm.apply(this, arguments); });
  const results = await skills.setAutomatic('pstack', true);
  assert.equal(results[0].state, 'updated'); assert.equal(results[0].cleanup.state, 'failed');
  assert.doesNotMatch(fs.readFileSync(path.join(dest('.agents', 'skills'), 'SKILL.md'), 'utf8'), /disable-model-invocation/);
});

test('guidance inlines root and primary text for selected automatic roles only', async t => {
  const { skills, prefs } = managed(t, { preferences: { pstack: true } });
  assert.equal(skills.guidance({ role: 'lead' }), '', 'Uninstalled optional packs are omitted');
  await skills.install('pstack');
  const lead = skills.guidance({ role: 'lead' });
  assert.match(lead, /### pstack \(revision \w+, digest \w+\)/); assert.match(lead, /Read \[the upstream skill\]/); assert.match(lead, /See \[rules\]\(rules\.md\)/);
  assert.match(lead, /not inlined/);
  assert.equal(skills.guidance({ role: 'builder' }), '');
  prefs.skillAuto.pstack = false;
  assert.equal(skills.guidance({ role: 'lead' }), '');
  assert.throws(() => skills.guidance({ role: 'nobody' }), /Unknown skill role/);
});

test('worker guidance is verified supplied text with no installed path', async t => {
  const { skills } = managed(t, { preferences: { pstack: true } });
  await skills.install('pstack');
  const entryPath = skills.list().find(p => p.id === 'pstack').entryPath;
  const planner = skills.guidance({ role: 'planner' });
  assert.match(planner, /### pstack \(revision \w+, digest \w+\)/);
  assert.match(planner, /verified instruction text included here/);
  assert.match(planner, /not inlined/);
  assert.match(planner, /do not retry denied reads/);
  assert.doesNotMatch(planner, /Installed at:/);
  assert.ok(!planner.includes(entryPath), 'worker briefs never carry the absolute pack path');
});

test('guidance reports oversize and over-budget skills instead of truncating', async t => {
  const big = managed(t, { filler: 33 * 1024, preferences: { pstack: true } });
  await big.skills.install('pstack');
  assert.match(big.skills.guidance({ role: 'lead' }), /Unavailable automatic skills: pstack \(.*larger than 32768/);
  const many = managed(t, { ids: ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review'], filler: 20 * 1024, preferences: { pstack: true, ponytail: true, 'thermo-nuclear-code-quality-review': true } });
  for (const id of ['pstack', 'ponytail', 'thermo-nuclear-code-quality-review']) await many.skills.install(id);
  const text = many.skills.guidance({ role: 'lead' });
  assert.equal([...text.matchAll(/^### /gm)].length, 2); assert.match(text, /Unavailable automatic skills: thermo-nuclear-code-quality-review \(.*48 KiB/);
  assert.doesNotMatch(text, /x{21000}/);
});

test('guidance marks edited or missing installs unavailable', async t => {
  const { skills, dest } = managed(t, { preferences: { pstack: true } });
  await skills.install('pstack');
  fs.appendFileSync(path.join(dest('.agents', 'skills'), 'SKILL.md'), 'edit\n');
  fs.rmSync(path.join(dest('.claude', 'skills'), 'SKILL.md'));
  assert.match(skills.guidance({ role: 'lead' }), /pstack \(The modified copy cannot be used/);
  assert.equal(skills.list()[0].availability, 'modified');
});

test('readGuide returns bounded verified Markdown and rejects unsafe requests', async t => {
  const { skills, dest } = managed(t);
  await skills.install('pstack');
  const guide = skills.readGuide({ id: 'pstack', path: 'upstream/skills/poteto-mode/rules.md' });
  assert.equal(guide.text, 'Rules\n'); assert.match(guide.digest, /^[a-f0-9]{64}$/); assert.ok(guide.revision);
  assert.equal(guide.provenance.commit, 'a'.repeat(40)); assert.match(guide.provenance.upstream, /maker\/repo/);
  assert.equal(skills.readGuide({ id: 'pstack' }).path, 'SKILL.md');
  for (const bad of ['../x.md', '/etc/x.md', 'upstream\\x.md', 'a//b.md', 'upstream/skills/poteto-mode/run.py', 'missing.md', '.paddock-skill.json'])
    assert.throws(() => skills.readGuide({ id: 'pstack', path: bad }), /Markdown|not part/, bad);
  assert.throws(() => skills.readGuide({ id: 'pstack', path: 'SKILL.md', maxBytes: 10 }), /larger than/);
  assert.throws(() => skills.readGuide({ id: 'pstack', maxBytes: 10 ** 9 }), /smaller/);
  assert.throws(() => skills.readGuide({ id: '../pstack' }), /available skill pack/);
  fs.appendFileSync(path.join(dest('.agents', 'skills'), 'upstream', 'skills', 'poteto-mode', 'rules.md'), 'edit');
  assert.equal(skills.readGuide({ id: 'pstack', path: 'upstream/skills/poteto-mode/rules.md' }).target, 'claude', 'A clean copy remains readable; the edited copy is skipped.');
  fs.appendFileSync(path.join(dest('.claude', 'skills'), 'upstream', 'skills', 'poteto-mode', 'rules.md'), 'edit');
  assert.throws(() => skills.readGuide({ id: 'pstack', path: 'upstream/skills/poteto-mode/rules.md' }), /files were changed after install/);
});

test('readGuide refuses linked folders', async t => {
  const { skills, dest, base } = managed(t);
  await skills.install('pstack');
  const target = dest('.agents', 'skills'), moved = path.join(base, 'moved');
  fs.renameSync(path.join(target, 'upstream'), moved);
  try { fs.symlinkSync(moved, path.join(target, 'upstream'), 'junction'); } catch { return t.skip('links unavailable'); }
  assert.equal(skills.readGuide({ id: 'pstack', path: 'upstream/skills/poteto-mode/rules.md' }).target, 'claude');
  fs.appendFileSync(path.join(dest('.claude', 'skills'), 'upstream', 'skills', 'poteto-mode', 'rules.md'), 'changed');
  assert.throws(() => skills.readGuide({ id: 'pstack', path: 'upstream/skills/poteto-mode/rules.md' }), /files were changed after install|Linked/);
});

test('managed startup migration upgrades old versions without downloads, new installs or altered manual choices', async t => {
  const { skills, dest, home } = managed(t);
  await skills.install('pstack');
  for (const target of [dest('.agents', 'skills'), dest('.claude', 'skills')]) {
    const file = path.join(target, MANIFEST), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.version = 'old-renderer'; fs.writeFileSync(file, JSON.stringify(manifest));
  }
  fs.appendFileSync(path.join(dest('.claude', 'skills'), 'SKILL.md'), '\nOwner edit');
  assert.throws(() => skills.readGuide({ id: 'pstack' }), /outdated\. Run Update in Tools/);
  const results = await skills.updateManaged();
  assert.deepEqual(results.map(result => [result.target, result.state]), [['agents', 'updated'], ['claude', 'skipped']]);
  assert.match(skills.readGuide({ id: 'pstack' }).text, /disable-model-invocation: true/);
  assert.equal(skills.list().find(pack => pack.id === 'pstack').automatic, false);
  assert.match(fs.readFileSync(path.join(dest('.claude', 'skills'), 'SKILL.md'), 'utf8'), /Owner edit/);
  assert.equal(fs.existsSync(path.join(home, '.kiro')), false);
  const before = fs.readFileSync(path.join(dest('.agents', 'skills'), MANIFEST), 'utf8');
  await skills.updateManaged();
  assert.equal(fs.readFileSync(path.join(dest('.agents', 'skills'), MANIFEST), 'utf8'), before);
});

test('engineering skills include the bundled portable documentation skill', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-engineering-'));
  try {
    const skills = new SkillPacks(base, { home: path.join(base, 'home') });
    const group = skills.list().filter(pack => pack.group === 'engineering');
    assert.deepEqual(group.map(pack => pack.id).sort(), ['ponytail', 'project-documentation', 'pstack', 'thermo-nuclear-code-quality-review']);
    assert.deepEqual(skills.list().filter(pack => pack.group === 'study').map(pack => pack.id), ['latex-document']);
    const docs = skills.pack('project-documentation');
    assert.equal(docs.source, 'bundled');
    assert.ok(fs.existsSync(path.join(docs.dir, 'references', 'standalone.md')));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('the bundled force-delegation pack is off by default, lead-only and enabled only by the automatic setting', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-force-')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'); fs.mkdirSync(home);
  const prefs = { skillAuto: {} };
  const skills = new SkillPacks(base, { home, bundled: path.join(__dirname, '..', 'skills'), catalogEntries: [], getAgents: () => [{ id: 'claude', name: 'Claude Code', installed: true }], getPreferences: () => prefs });
  const pack = () => skills.list().find(x => x.id === 'force-delegation');
  assert.equal(skills.packs().find(x => x.id === 'force-delegation').source, 'bundled');
  assert.equal(pack().automatic, false);
  assert.deepEqual(pack().roles, ['lead']);
  await skills.install('force-delegation');
  assert.equal(pack().availability, 'available');
  assert.equal(skills.guidance({ role: 'lead', knowledgeEnabled: false }), '', 'off means no inline instructions');
  await skills.setAutomatic('force-delegation', true);
  assert.equal(pack().automatic, true);
  const lead = skills.guidance({ role: 'lead', knowledgeEnabled: false });
  assert.match(lead, /### force-delegation \(revision \w+, digest \w+\)/);
  assert.match(lead, /# Force delegation/);
  for (const role of ['planner', 'builder', 'reviewer']) assert.equal(skills.guidance({ role, knowledgeEnabled: false }), '', role);
});

test('bundled roots obey manual and automatic settings without changing the source', async t => {
  const { skills, pack, home } = fixture(t);
  const original = fs.readFileSync(path.join(pack, 'SKILL.md'), 'utf8');
  await skills.install('demo-pack');
  const installed = path.join(home, '.agents', 'skills', 'demo-pack', 'SKILL.md');
  assert.match(fs.readFileSync(installed, 'utf8'), /disable-model-invocation: true/);
  await skills.setAutomatic('demo-pack', true);
  assert.doesNotMatch(fs.readFileSync(installed, 'utf8'), /disable-model-invocation/);
  assert.equal(fs.readFileSync(path.join(pack, 'SKILL.md'), 'utf8'), original);
  assert.ok(skills.guidance({ role: 'lead' }).includes('# Demo'));
});
