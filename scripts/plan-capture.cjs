'use strict';
// Captures each planning section for one project from a copy of a projects.json.
// Usage: node scripts/plan-capture.cjs <projects.json> <projectId> <outDir>
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const [source, projectId, out] = process.argv.slice(2);
const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(root, 'test-data', 'plan-'));
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(source, path.join(dataDir, 'projects.json'));
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ setupComplete: true, firstRunComplete: true }));
(async () => {
  const app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${dataDir}`], timeout: 30000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.waitForSelector('.session-grid');
  await page.setViewportSize({ width: 1240, height: 860 });
  await page.click('[data-page="projects"]');
  await page.click(`[data-project-plan="${projectId}"]`);
  await page.waitForSelector('#project-plan[open]');
  for (const section of ['brief', 'research', 'infrastructure', 'roadmap']) {
    await page.click(`[data-plan-step="${section}"]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `${section}.png`) });
    const height = await page.evaluate(() => document.querySelector('#project-plan').scrollHeight);
    console.log(section, 'dialog content height', height);
  }
  console.log('roadmap approve button:', await page.locator('[data-plan-step="roadmap"]').textContent());
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
})().catch(error => { console.error(error); process.exit(1); });
