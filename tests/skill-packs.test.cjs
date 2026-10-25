'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SkillPacks, MANIFEST } = require('../electron/skill-packs.cjs');
const { ManagedDownloads } = require('../electron/managed-downloads.cjs');

function fixture(t, agents = [{ id: 'claude', name: 'Claude Code', installed: true }, { id: 'kiro', name: 'Kiro', installed: true }, { id: 'qwen', name: 'Qwen Code', installed: false }]) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-skills-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), root = path.join(base, 'profile'), bundled = path.join(base, 'bundled');
  const pack = path.join(bundled, 'demo-pack');
  fs.mkdirSync(path.join(pack, 'references'), { recursive: true }); fs.mkdirSync(home); fs.mkdirSync(root);
  fs.writeFileSync(path.join(pack, 'SKILL.md'), '---\nname: demo-pack\ndescription: Demo knowledge for tests.\n---\n# Demo\n');
  fs.writeFileSync(path.join(pack, 'references', 'topic.md'), 'Topic v1\n');
  const skills = new SkillPacks(root, { home, bundled, getAgents: () => agents, downloads: new ManagedDownloads(root) });
  return { base, home, root, bundled, pack, skills };
}
const folder = (home, ...dir) => path.join(home, ...dir, 'demo-pack');

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
  assert.doesNotMatch(hub.summary(), /## Skill packs/);
  await skills.install('demo-pack');
  assert.match(hub.summary(), /## Skill packs[\s\S]*demo-pack: Demo knowledge for tests\. \(.*demo-pack[\\/]SKILL\.md\)/);
});
