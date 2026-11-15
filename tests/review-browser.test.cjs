'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs');
const { reviewBrowserProfiles, reviewRuntime, reviewFindings } = require('../electron/review-browser.cjs');
const runtime = reviewRuntime();
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('review covers both engines and phone profiles and distinguishes styled interfaces from browser defaults', async t => {
  const styled = '<style>:root{--accent:#1651c7;color-scheme:light}body{font-family:Arial,sans-serif;margin:0}button,input{font:inherit;background:var(--accent);color:white;border:0;border-radius:8px;padding:12px}a{color:var(--accent);text-decoration:none}</style>';
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><html lang="en"><title>Settings</title><meta name="viewport" content="width=device-width,initial-scale=1">${req.url === '/styled' ? styled : ''}<body><main><h1>Settings</h1><button>Save</button><input aria-label="Name"><a href="/styled">Preferences</a></main></body></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const review = url => reviewBrowserProfiles({ url: `http://127.0.0.1:${server.address().port}${url}`, axeSource, onStage() {}, onView: (view, buffer) => { assert.ok(buffer.length); assert.ok(view.width); } });
  const plain = await review('/plain');
  assert.deepEqual(plain.profiles.map(p => p.status), ['complete', 'complete', 'complete', 'complete']);
  assert.deepEqual(plain.views.map(v => v.name), ['Desktop', 'Mac WebKit', 'Android Chrome', 'iPhone WebKit']);
  for (const view of plain.views) {
    const ids = view.page.unstyled.map(f => f.id);
    assert.ok(ids.includes('default-page-margin'), view.name);
    assert.ok(ids.includes('no-theme-colors'), view.name);
    assert.ok(ids.includes('native-controls'), view.name);
    assert.ok(ids.includes('default-serif'), view.name);
    assert.ok(ids.includes('default-links'), view.name);
    assert.ok(view.accessibility);
  }
  const designed = await review('/styled');
  assert.equal(designed.views.length, 4);
  for (const view of designed.views) assert.deepEqual(view.page.unstyled, [], view.name);
  const summary = reviewFindings(plain);
  assert.equal(summary.byCategory.unstyled, 5);
  assert.ok(summary.findings.filter(f => f.category === 'unstyled').every(f => f.profiles.length === 4));
  assert.equal(summary.total, Object.values(summary.byCategory).reduce((a, b) => a + b, 0));
  assert.equal(summary.total, summary.findings.length);
  const partial = await reviewBrowserProfiles({ url: `http://127.0.0.1:${server.address().port}/styled`, axeSource, onStage() {}, onView() {},
    runtime: { ...runtime, webkit: { launch: async () => { throw Error("Executable doesn't exist"); } } } });
  assert.equal(partial.views.length, 2);
  assert.equal(partial.profiles.filter(p => p.status === 'not-run' && /missing/.test(p.reason)).length, 2);
});

test('visible typography diversity reports seven font stacks, nine sizes and eight weights', async () => {
  const browser = await runtime.chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    const families = ['Arial', 'Verdana', 'Georgia', 'Tahoma', 'Courier New', 'Trebuchet MS', 'Times New Roman'];
    await page.setContent('<!doctype html><body>' + Array.from({ length: 9 }, (_, i) => `<p style="font-family:${families[i % 7]};font-size:${12 + i}px;font-weight:${100 + i % 8 * 100}">Label ${i}</p>`).join(''));
    const report = await page.evaluate(require('../electron/review-browser.cjs').inspectPage);
    assert.equal(report.typography.families.length, 7); assert.equal(report.typography.sizes.length, 9); assert.equal(report.typography.weights.length, 8);
    assert.deepEqual(report.typography.findings.map(f => f.count), [7, 9, 8]);
  } finally { await browser.close(); }
});
