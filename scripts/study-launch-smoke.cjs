'use strict';
// Isolated shell console: no model request, account change or real study profile.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-subject-smoke-'));
const profile = path.join(fixture, 'paddock'), study = path.join(fixture, 'playtime');
fs.mkdirSync(profile); fs.mkdirSync(study);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, notifications: false,
  consoleDefaults: { provider: 'shell', cwd: fixture } }));
(async () => {
  const app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`, '--study-subject=Soft Skills', `--study-data-dir=${study}`], timeout: 30000 });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => console.error(error));
    let item;
    for (let attempt = 0; attempt < 450 && !item; attempt++) {
      const reply = await page.evaluate(() => window.dock?.call('state'));
      item = reply?.value?.sessions.find(item => item.name === 'Soft Skills' && item.alive);
      if (!item) await page.waitForTimeout(100);
    }
    if (!item) {
      console.log('Fixture arguments:', await app.evaluate(() => process.argv));
      console.log('Fixture window:', (await page.locator('body').innerText()).slice(0, 1800));
      console.log('Fixture files:', fs.readdirSync(profile));
      for (const file of fs.readdirSync(path.join(profile, 'logs'))) {
        const target = path.join(profile, 'logs', file); if (fs.statSync(target).isFile()) console.log('fixture log', fs.readFileSync(target, 'utf8').slice(-3500));
      }
      for (const file of fs.readdirSync(profile).filter(name => /crash|startup|\.log$/.test(name))) {
        const target = path.join(profile, file); if (fs.statSync(target).isFile()) console.log(file, fs.readFileSync(target, 'utf8').slice(-4000));
      }
    }
    assert.ok(item, 'custom subject console launched');
    assert.equal(item.provider, 'shell'); assert.equal(path.dirname(item.cwd), path.join(study, 'subjects'));
    assert.equal(item.playtimeDataDir, study);
    await page.locator('.session-card').first().waitFor({ state: 'visible' });
    assert.equal(await page.locator(`.session-card[data-console-id="${item.id}"] [data-text-size="1"]`).isDisabled(), true);
    const data = JSON.parse(fs.readFileSync(path.join(item.cwd, 'subject.json'), 'utf8'));
    assert.equal(data.name, 'Soft Skills');
    console.log('PASS actual Electron: custom subject launches its console, selects it and uses the largest text size.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
