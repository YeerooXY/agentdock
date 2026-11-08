'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SkillPacks } = require('../electron/skill-packs.cjs');
const root = path.resolve(__dirname, '..'), work = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-skill-startup-'));
const profile = path.join(work, 'profile'), home = path.join(work, 'home'), id = 'startup-skill-check';
const source = path.join(profile, 'skill-packs', id), entry = path.join(home, '.agents', 'skills', id, 'SKILL.md');
let app;
async function start() {
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`], env: { ...process.env, PADDOCK_SKILLS_HOME: home }, timeout: 30000 });
  const page = await app.firstWindow();
  try { await page.waitForSelector('.session-grid'); }
  catch (error) {
    const log = path.join(profile, 'logs', 'main.log');
    if (fs.existsSync(log)) console.error(fs.readFileSync(log, 'utf8').split('\n').slice(-35).join('\n'));
    console.error(await page.locator('body').innerText()); throw error;
  }
  return async (method, payload) => page.evaluate(async ([name, args]) => {
    const result = await window.dock.call(name, args); if (!result.ok) throw Error(result.error); return result.value;
  }, [method, payload]);
}
function check(state, automatic) {
  const pack = state.skills.packs.find(pack => pack.id === id);
  assert.equal(state.settings.skillAuto[id], automatic, 'Saved preference must reach running settings');
  assert.equal(pack.automatic, automatic, 'Cached skill policy must match running settings');
  assert.equal(pack.availability, 'available', 'Installed adapter must match current policy');
  assert.equal(pack.entryPath, entry);
  assert.equal(state.shared.summary.includes(`- ${id}:`), automatic, 'Agent instructions must match saved policy');
  assert.equal(/disable-model-invocation: true/.test(fs.readFileSync(entry, 'utf8')), !automatic, 'Native entry policy must match saved preference');
  const reader = new SkillPacks(profile, { home, getPreferences: () => state.settings.skillAuto });
  assert.equal(reader.readGuide({ id }).revision, pack.version, 'Fresh reader and cached card must agree');
}
(async () => {
  try {
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'SKILL.md'), `---\nname: ${id}\ndescription: Check saved startup policy.\n---\n# Startup policy fixture\n`);
    await new SkillPacks(profile, { home, getPreferences: () => ({ [id]: false }) }).install(id);
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, skillAuto: { [id]: true }, consoleDefaults: { provider: 'shell', cwd: work } }));
    let call = await start(); check(await call('state'), true);
    for (const automatic of [false, true, false, true]) {
      await call('skills.automatic', { id, automatic });
      check(await call('state'), automatic);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
      assert.equal(saved.skillAuto[id], automatic);
    }
    await app.close(); app = null;
    call = await start(); check(await call('state'), true);
    console.log('PASS saved skill policy survives startup, repeated toggles and relaunch with matching files, cache and guide reads');
  } finally { if (app) await app.close(); fs.rmSync(work, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
