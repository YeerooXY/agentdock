'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Projects } = require('../electron/projects.cjs');

async function checkUserData({ root }) {
  const parent = path.join(root, 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(parent, 'rename-startup-'));
  const appData = path.join(fixture, 'appdata'), legacy = path.join(appData, 'Agent Dock'), current = path.join(appData, 'Paddock');
  const explicit = path.join(fixture, 'explicit-test-profile');
  for (const directory of [legacy, current, explicit]) fs.mkdirSync(directory, { recursive: true });
  const settings = JSON.stringify({ setupComplete: true, restoreConsoles: false, notifications: false, consoleDefaults: { provider: 'shell', cwd: fixture } });
  fs.writeFileSync(path.join(legacy, 'settings.json'), settings);
  fs.writeFileSync(path.join(current, 'Preferences'), '{}');
  const older = new Projects(legacy).save({ name: 'Existing project', folders: [{ path: fixture }], notes: 'Saved before the rename' });
  const original = fs.readFileSync(path.join(legacy, 'projects.json'));
  const boot = path.join(fixture, 'boot.cjs');
  fs.writeFileSync(boot, `const { app, dialog } = require('electron');\napp.getAppPath = () => ${JSON.stringify(root)};\ndialog.showErrorBox = (title, message) => console.error(title + ': ' + message);\napp.setPath('appData', ${JSON.stringify(appData)});\napp.setPath('userData', ${JSON.stringify(current)});\nrequire(${JSON.stringify(path.join(root, 'electron', 'main.cjs'))});\n`);
  let app;
  async function check(expectedRoot, expectedProjects, extra = []) {
    app = await electron.launch({ args: [boot, '--smoke-test', ...extra], timeout: 30000 });
    try {
      const page = await app.firstWindow();
      page.setDefaultTimeout(15000);
      await page.waitForSelector('.session-grid');
      assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), expectedRoot);
      const result = await page.evaluate(() => window.dock.call('state'));
      assert.equal(result.ok, true);
      assert.deepEqual(result.value.projects.map(item => item.id), expectedProjects);
      assert.equal(result.value.sessions.length, 0, 'A profile check must not launch agent requests');
    } finally { await app.close(); app = null; }
  }
  try {
    await check(legacy, [older.id]);
    assert.deepEqual(fs.readFileSync(path.join(legacy, 'projects.json')), original);
    assert.equal(fs.existsSync(path.join(current, 'projects.json')), false);
    fs.writeFileSync(path.join(current, 'settings.json'), settings);
    const newer = new Projects(current).save({ name: 'Current project', folders: [{ path: fixture }] });
    await check(current, [newer.id]);
    fs.writeFileSync(path.join(explicit, 'settings.json'), settings);
    await check(explicit, [], [`--data-dir=${explicit}`]);
    assert.deepEqual(fs.readFileSync(path.join(legacy, 'projects.json')), original);
    console.log('PASS rename startup, existing profile preservation and isolated test data');
  } finally {
    await app?.close().catch(() => {});
    assert.equal(path.dirname(fs.realpathSync(fixture)), fs.realpathSync(parent));
    fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
}

module.exports = { checkUserData };
