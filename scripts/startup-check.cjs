'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');

async function checkHiddenStartup({ root }) {
  const parent = path.join(root, 'test-data'); fs.mkdirSync(parent, { recursive: true });
  const profile = fs.mkdtempSync(path.join(parent, 'hidden-startup-'));
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false }));
  let app;
  try {
    app = await electron.launch({ args: [root, '--smoke-test', '--startup-check', `--data-dir=${profile}`], timeout: 30000 });
    const page = await app.firstWindow();
    await page.waitForSelector('.session-grid', { state: 'attached', timeout: 15000 });
    const result = await page.evaluate(() => window.dock.call('state'));
    assert.equal(result.ok, true, result.error);
    assert.equal(result.value.sessions.length, 0);
    // Explicit reveal/mode requests must not present a preflight window either.
    assert.equal((await page.evaluate(() => window.dock.call('mode', 'hud'))).ok, true);
    const states = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ visible: window.isVisible(), focused: window.isFocused() })));
    assert.equal(states.length, 1);
    assert.deepEqual(states, [{ visible: false, focused: false }]);
    const deadline = Date.now() + 10000, log = path.join(profile, 'logs', 'main.log');
    while ((!fs.existsSync(log) || !fs.readFileSync(log, 'utf8').includes('INFO window ready')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    const text = fs.readFileSync(log, 'utf8');
    assert.match(text, /INFO window ready/);
    assert.doesNotMatch(text, / ERROR /);
    await app.close(); app = null;
    // A corrupt copied profile must exit instead of opening the startup-error dialog.
    fs.writeFileSync(path.join(profile, 'projects.json'), '{}');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [root, '--smoke-test', '--startup-check', `--data-dir=${profile}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { env, stdio: 'ignore', windowsHide: true });
      const timer = setTimeout(() => { child.kill(); reject(Error('Hidden startup failure did not exit; a modal may be blocking it.')); }, 20000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(exitCode, 1);
    assert.match(fs.readFileSync(log, 'utf8'), / ERROR /, 'The app must record the corrupt-profile error, not fail in the test launcher.');
    console.log('PASS startup preflight loads renderer/state without showing or focusing a window');
    console.log('PASS failed startup preflight exits without a modal dialog');
  } finally {
    await app?.close().catch(() => {});
    assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
module.exports = { checkHiddenStartup };
if (require.main === module) checkHiddenStartup({ root: path.resolve(__dirname, '..') }).catch(error => { console.error(error); process.exitCode = 1; });
