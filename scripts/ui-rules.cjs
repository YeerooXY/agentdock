'use strict';
// Usage: node scripts/ui-rules.cjs <project-root> [url]
// Source checks always run; rendered and interaction checks run in headless desktop Chromium when a URL is given.
const path = require('node:path');
const { inspectSources } = require('../electron/ui-source-rules.cjs');
const { inspectInterface, probeInteraction } = require('../electron/ui-rules.cjs');
const { inspectCraft } = require('../electron/ui-craft-rules.cjs');
const { reviewRuntime } = require('../electron/review-browser.cjs');

async function main([root, url]) {
  if (!root) throw Error('Usage: node scripts/ui-rules.cjs <project-root> [url]');
  const result = { source: inspectSources(path.resolve(root)) };
  if (url) {
    const browser = await reviewRuntime().chromium.launch({ headless: true, chromiumSandbox: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on('dialog', dialog => void dialog.dismiss());
      await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      result.rendered = await page.evaluate(inspectInterface);
      result.craft = await page.evaluate(inspectCraft);
      await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; }' });
      result.interaction = await probeInteraction(page);
    } finally { await browser.close(); }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exit(1); });
