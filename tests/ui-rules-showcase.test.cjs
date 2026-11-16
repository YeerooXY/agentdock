'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { main } = require('../scripts/ui-rules-showcase.cjs');

// Every rule that a single snapshot can check. The bad page breaks each once; the good page follows all of them.
const RULES = ['carousel-edge-fade', 'chrome-share', 'control-alignment', 'control-spacing', 'covered-content', 'dark-depth', 'focus-lost', 'focus-without-visible', 'gradient-interpolation', 'hsl-palette',
  'icon-stroke-weight', 'input-style-outliers', 'mixed-tooltips', 'mouse-focus-ring', 'nested-boxes', 'nested-radius', 'no-focus-indicator', 'opaque-borders',
  'reduced-motion-missing', 'selectable-controls', 'sibling-layout', 'small-font', 'touching-text', 'unanimated-controls', 'unanimated-overlays', 'viewport-height', 'white-image-background'];

test('the bad version of the fixture shop trips every rule and the good version trips none', async t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-showcase-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const write = process.stdout.write; process.stdout.write = () => true;
  let result; try { result = await main(out); } finally { process.stdout.write = write; }
  assert.deepEqual([...result.bad.keys()].sort(), RULES);
  assert.deepEqual([...result.good.keys()], []);
  assert.ok(fs.existsSync(path.join(out, 'REPORT.md')));
});
