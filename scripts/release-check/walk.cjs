'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { items, baseline } = require('./items.cjs');
const { installBridge } = require('./fixture.cjs');
const { renderChecklistHtml } = require('./review-html.cjs');
const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'dist');
const output = path.join(root, 'artifacts/release-check/latest');
const rules = ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value'];
const ruleLabels = { 'color-contrast': 'Text contrast', 'button-name': 'Button has no accessible name', label: 'Input has no label', 'aria-valid-attr-value': 'Invalid accessibility setting' };
const escape = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function options(args) {
  const result = { only: items.map(x => x.id), profiles: ['pc', 'mac', 'narrow'] };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') return null;
    if (flag === '--report-only') { result.reportOnly = true; continue; }
    if (!['--only', '--profiles'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid option: ${flag}. Use --only 2.11,5.1 --profiles pc,mac,narrow`);
    result[flag.slice(2)] = [...new Set(args[++i].split(','))];
  }
  for (const id of result.only) if (!items.some(x => x.id === id)) throw new Error(`Unknown desktop item: ${id}`);
  for (const name of result.profiles) if (!['pc', 'mac', 'narrow'].includes(name)) throw new Error(`Unknown profile: ${name}`);
  if (result.reportOnly && args.length !== 1) throw new Error('Use --report-only on its own to render all saved results.');
  return result;
}
function staticServer() {
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
    if (pathname === '/__preview') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Local fixture</title></head><body><h1>Preview fixture</h1><label>Search <input type="search"></label></body></html>'); }
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }[path.extname(file)] || 'text/html');
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}
function save(report, selected) {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = ['# Paddock release checklist', '', `Created: ${report.startedAt}`, '', 'Synthetic desktop evidence. Mac uses the Safari engine, not a physical Mac. Phone app items are excluded.', '', '✓ means the listed automated checks found no issue. It does not mark an item reviewed. ⚠ means a finding, an incomplete check, or a manual step.', '', 'Statuses: Not seen, Looks good, Needs work, Cut. Review each image and manual case, then edit Status and Notes. Copy this folder before another run to keep your notes.', ''];
  for (const item of selected) {
    lines.push(`## ${item.id} ${item.title}`, '', item.description, '', '| Case | Profile / theme | Automated findings | Evidence |', '|---|---|---|---|');
    for (const test of item.cases) for (const run of report.runs.filter(x => x.itemId === item.id && x.caseId === test.id)) {
      const finding = run.manual ? `⚠ Manual: ${run.reason}` : run.findings.length ? `⚠ ${run.findings.join('; ')}` : '✓ No issue found by the automated checks';
      lines.push(`| ${escape(test.label)} | ${escape(run.profile + ' / ' + run.theme)} | ${escape(finding)} | ${run.screenshot ? `[View image](${run.screenshot})` : 'No image'} |`);
    }
    lines.push('', 'Status: Not seen', '', 'Notes:', '');
  }
  if (report.fatalError) lines.push('## Run stopped', '', escape(report.fatalError), '');
  fs.writeFileSync(path.join(output, 'checklist.md'), lines.join('\n'));
  fs.writeFileSync(path.join(output, 'checklist.html'), renderChecklistHtml(report, selected));
}
function diskBytes(directory) { return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? diskBytes(path.join(directory, entry.name)) : fs.statSync(path.join(directory, entry.name)).size), 0); }

async function main() {
  const opts = options(process.argv.slice(2));
  if (!opts) { console.log('node scripts/release-check/walk.cjs [--only 2.11,5.1] [--profiles pc,mac,narrow] | --report-only'); return; }
  if (opts.reportOnly) {
    const report = JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8'));
    if (!Array.isArray(report.items) || !Array.isArray(report.runs)) throw new Error('Saved results must contain items and runs.');
    fs.writeFileSync(path.join(output, 'checklist.html'), renderChecklistHtml(report, report.items));
    console.log('Wrote checklist.html from saved results; screenshots and review notes were preserved.');
    return;
  }
  // Resolve and check the exact disposable directory before recursive deletion.
  const intended = path.resolve(root, 'artifacts', 'release-check', 'latest');
  if (output !== intended || !output.startsWith(root + path.sep)) throw new Error('Unsafe evidence directory');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(path.join(output, 'images'), { recursive: true });
  const selected = items.filter(x => opts.only.includes(x.id));
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), profiles: opts.profiles, rules, reducedMotion: 'reduce', synthetic: true, items: selected.map(({ id, title, description, cases }) => ({ id, title, description, cases: cases.map(({ id, label, manual, reason }) => ({ id, label, manual: !!manual, reason })) })), runs: [] };
  // Preallocate every combination so a missing browser never silently drops coverage.
  for (const item of selected) for (const [index, test] of item.cases.entries()) for (const profile of opts.profiles) for (const theme of index === 0 ? ['classic', 'icy'] : ['classic']) {
    report.runs.push({ itemId: item.id, caseId: test.id, label: test.label, profile, theme, manual: !!test.manual, reason: test.reason, status: test.manual ? 'manual' : 'pending', screenshot: null, pageErrors: [], overflow: null, axe: null, findings: test.manual ? [] : ['Not run'], calls: [], unsupportedCalls: [], blockedRequests: [] });
  }
  let server;
  save(report, selected);
  try {
    if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html is missing. Build the app before running the walk.');
    const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json'), 'utf8'));
    const axePath = require.resolve('axe-core/axe.min.js');
    const { chromium, webkit, devices } = require('playwright');
    const profiles = { pc: [chromium, { viewport: { width: 1440, height: 1000 } }], mac: [webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], narrow: [chromium, { viewport: { width: 760, height: 900 } }] };
    server = staticServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const name of opts.profiles) {
      let browser;
      try {
        const [engine, contextOptions] = profiles[name];
        browser = await engine.launch({ headless: true });
        for (const record of report.runs.filter(x => x.profile === name && !x.manual)) {
          const item = selected.find(x => x.id === record.itemId), test = item.cases.find(x => x.id === record.caseId);
          let context, page;
          record.findings = []; record.status = 'running';
          try {
            const state = baseline(base);
            await test.prepare(state);
            state.settings.trimStyle = record.theme;
            context = await browser.newContext({ ...contextOptions, reducedMotion: 'reduce', serviceWorkers: 'block' });
            record.viewport = contextOptions.viewport; record.engine = browser.version();
            await context.route('**/*', route => {
              const url = route.request().url();
              if (new URL(url).origin === origin) return route.continue();
              record.blockedRequests.push(url); return route.abort('blockedbyclient');
            });
            // Playwright's HTTP routing does not cover WebSockets.
            await context.routeWebSocket('**/*', socket => { record.blockedRequests.push(socket.url()); socket.close(); });
            await installBridge(context, state, record, origin);
            await context.addInitScript({ path: axePath });
            page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
            page.on('pageerror', error => record.pageErrors.push(error.message));
            await page.goto(origin, { waitUntil: 'load' });
            await page.locator('.session-grid').waitFor({ state: 'attached' });
            await item.setup(page, state);
            if (test.setup) await test.setup(page, state);
            const selector = test.main || item.main;
            await page.locator(selector).first().waitFor({ state: 'visible' });
            if (test.scrollMain !== false) await page.locator(selector).first().scrollIntoViewIfNeeded();
            await page.evaluate(async () => { await document.fonts.ready; });
            // Freeze even infinite CSS effects; reduced-motion remains set for app logic and canvas.
            await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            record.effectiveTheme = state.settings.trimStyle;
            await page.waitForFunction(() => [...document.images].filter(img => img.getClientRects().length && img.src).every(img => img.complete));
            record.axe = await page.evaluate(async ({ selector, rules }) => {
              const element = document.querySelector(selector);
              if (!element) throw new Error(`Main element missing: ${selector}`);
              const result = await window.axe.run(element, { runOnly: { type: 'rule', values: rules } });
              const simplify = rows => rows.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
              return { violations: simplify(result.violations), incomplete: simplify(result.incomplete) };
            }, { selector, rules });
            record.main = selector;
            for (const violation of record.axe.violations) record.findings.push(`${ruleLabels[violation.id] || violation.id}: ${violation.nodes.length} affected element(s)`);
            // Contrast over gradients and textures is always "incomplete"; listing it on every screen hides real findings.
            for (const check of record.axe.incomplete.filter(x => x.id !== 'color-contrast')) record.findings.push(`Needs manual checking: ${ruleLabels[check.id] || check.id} (${check.nodes.length} element(s))`);
            record.status = 'captured';
          } catch (error) { record.status = 'failed'; record.findings.push(`Could not finish this case: ${error.message}`); }
          finally {
            if (page && !page.isClosed()) {
              try {
                record.overflow = await page.evaluate(() => {
                  const doc = document.documentElement, content = document.querySelector('#content');
                  const visible = content && content.getClientRects().length > 0;
                  return { viewport: innerWidth, documentWidth: doc.scrollWidth, contentWidth: visible ? content.scrollWidth : null, contentClientWidth: visible ? content.clientWidth : null, document: doc.scrollWidth > innerWidth + 1, content: !!visible && (content.scrollWidth > innerWidth + 1 || content.scrollWidth > content.clientWidth + 1) };
                });
                if (record.overflow.document || record.overflow.content) record.findings.push('Content is wider than the available window');
                const filename = `images/${record.itemId}-${record.caseId}-${name}-${record.theme}.jpg`;
                await page.screenshot({ path: path.join(output, filename), type: 'jpeg', quality: 70, fullPage: false, animations: 'disabled', timeout: 15000 });
                record.screenshot = filename;
              } catch (error) { record.findings.push(`Evidence capture failed: ${error.message}`); record.status = 'failed'; }
            }
            for (const error of record.pageErrors) record.findings.push(`Page error: ${error}`);
            for (const method of new Set(record.unsupportedCalls)) record.findings.push(`Missing fixture response: ${method}`);
            // Wrong-port preview is deliberately denied; all other denied requests need review.
            if (record.blockedRequests.length && !(record.itemId === '2.13' && record.caseId === 'wrong-port' && record.blockedRequests.every(url => url.startsWith('http://127.0.0.1:1/')))) record.findings.push(`${record.blockedRequests.length} network request(s) blocked`);
            try { await context?.close(); } catch (error) { record.findings.push(`Browser cleanup failed: ${error.message}`); record.status = 'failed'; }
            save(report, selected);
          }
        }
      } catch (error) {
        for (const record of report.runs.filter(x => x.profile === name && x.status === 'pending')) { record.status = 'failed'; record.findings = [`Browser profile unavailable: ${error.message}`]; }
      } finally { await browser?.close(); }
    }
  } catch (error) { report.fatalError = error.message; process.exitCode = 1; }
  finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    report.finishedAt = new Date().toISOString();
    report.summary = { items: selected.length, runs: report.runs.filter(x => !x.manual).length, manualCases: selected.reduce((n, item) => n + item.cases.filter(x => x.manual).length, 0), findings: report.runs.reduce((n, x) => n + x.findings.length, 0) };
    save(report, selected);
    if (report.runs.some(x => x.status === 'failed' || x.status === 'pending')) process.exitCode = 1;
    console.log(`${report.summary.items} items, ${report.summary.runs} runs, ${report.summary.findings} findings, ${(diskBytes(output) / 1048576).toFixed(1)} MB on disk (${report.summary.manualCases} manual cases)`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
