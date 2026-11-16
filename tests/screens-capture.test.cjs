'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const {
  MAX_VISIBLE_TEXT,
  validateRegistry,
  loadRegistry,
  selectTargets,
  diffImages,
  storeCapture
} = require('../electron/screens/capture.cjs');

const sampleTargets = [
  {
    alias: 1,
    id: 'settings-general',
    kind: 'page',
    group: 'settings',
    reach: { url: '/', steps: [{ click: '.sidebar-bottom [data-page=settings]' }] },
    selector: '.settings-content',
    sources: ['src/pages/settings-page.js', 'src/settings-ui.js']
  },
  {
    alias: 2,
    id: 'vim-controls-overlay',
    kind: 'component',
    group: 'overlays',
    reach: { url: '/', steps: [{ click: '[data-action=vim-help]' }, { wait: '#vim-help[open]' }] },
    selector: '#vim-help',
    sources: ['src/vim-controls.js', 'src/styles.css']
  },
  {
    alias: 3,
    id: 'tools-empty-state',
    kind: 'state',
    group: 'states',
    reach: { url: '/', steps: [{ click: '[data-page=tools]' }] },
    selector: '.empty-tools',
    sources: ['src/pages/tools-page.js', 'src/shared-ui.js']
  }
];

test('validates seeded Paddock targets registry and rejects invalid entries', () => {
  const root = path.resolve(__dirname, '..');
  const registry = loadRegistry(root);
  assert.ok(registry.length >= 24, `expected at least 24 targets, got ${registry.length}`);
  assert.equal(registry[0].alias, 1);
  assert.ok(registry.some(t => t.id === 'settings-general' && t.group === 'settings'));
  assert.ok(registry.some(t => t.id === 'vim-controls-overlay' && t.kind === 'component'));
  assert.ok(registry.some(t => t.id === 'tools-empty-state' && t.kind === 'state'));
  assert.ok(registry.some(t => t.id === 'tool-key-error' && t.kind === 'state'));

  assert.throws(() => validateRegistry([]), /non-empty array/);
  assert.throws(() => validateRegistry([{ ...sampleTargets[0], id: 'bad id!' }]), /Invalid target id/);
  assert.throws(() => validateRegistry([sampleTargets[0], sampleTargets[0]]), /Duplicate target id/);
  assert.throws(() => validateRegistry([{ ...sampleTargets[0], kind: 'unknown' }]), /invalid kind/);
  assert.throws(() => validateRegistry([{ ...sampleTargets[0], sources: [] }]), /non-empty sources/);
  assert.throws(() => validateRegistry([{ ...sampleTargets[0], reach: { steps: [{ bogus: 'x' }] } }]), /must specify one action/);
  assert.throws(() => validateRegistry([{ ...sampleTargets[0], profiles: ['bogus'] }]), /invalid profiles/);
});

test('selects targets by id, numeric alias, all, and changed files intersection', () => {
  const registry = validateRegistry(sampleTargets);
  assert.equal(selectTargets(registry, { targets: 'all' }).length, 3);
  assert.deepEqual(
    selectTargets(registry, { targets: ['2', 'tools-empty-state', '2'] }).map(t => t.id),
    ['vim-controls-overlay', 'tools-empty-state']
  );
  assert.deepEqual(
    selectTargets(registry, { targets: 'changed', changedFiles: ['./src\\vim-controls.js'] }).map(t => t.id),
    ['vim-controls-overlay']
  );
  assert.deepEqual(
    selectTargets(registry, { targets: 'changed', changedFiles: ['electron/main.cjs'] }),
    []
  );
  assert.throws(() => selectTargets(registry, { targets: ['missing-target'] }), /Unknown screen target/);
});

test('retains latest image and visible text and only the last 3 history captures per target', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-screens-'));
  try {
    const img = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 1 } }
    }).png().toBuffer();
    for (const stamp of [1000, 2000, 3000, 4000, 5000]) {
      await storeCapture(tmp, 'settings-general', img, {
        timestamp: stamp,
        text: `  Visible text ${stamp} ${'x'.repeat(4200)}  `
      });
    }
    const latestFile = path.join(tmp, 'latest', 'settings-general.webp');
    const latestTextFile = path.join(tmp, 'latest', 'settings-general.txt');
    const historyDir = path.join(tmp, 'history', 'settings-general');
    assert.equal(fs.existsSync(latestFile), true);
    assert.equal(fs.existsSync(latestTextFile), true);
    const savedLatestText = fs.readFileSync(latestTextFile, 'utf8');
    assert.equal(savedLatestText.length, MAX_VISIBLE_TEXT);
    assert.match(savedLatestText, /^Visible text 5000 /);
    const historyFiles = fs.readdirSync(historyDir).sort();
    assert.deepEqual(historyFiles, ['3000.txt', '3000.webp', '4000.txt', '4000.webp', '5000.txt', '5000.webp']);
    assert.equal(fs.readFileSync(path.join(historyDir, '3000.txt'), 'utf8').startsWith('Visible text 3000 '), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('pixel diff respects threshold for identical, minor noise, and changed synthetic images', async () => {
  const base = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 30, g: 30, b: 40, alpha: 1 } }
  }).png().toBuffer();

  const same = await diffImages(base, base, { threshold: 0.01 });
  assert.equal(same.changed, false);
  assert.equal(same.diffPixels, 0);

  // 1 changed pixel out of 400 = 0.0025 ratio.
  const rawOnePixel = Buffer.alloc(20 * 20 * 4, 30);
  const rawBase = Buffer.alloc(20 * 20 * 4, 30);
  rawOnePixel[0] = 240;
  const imgBase = await sharp(rawBase, { raw: { width: 20, height: 20, channels: 4 } }).png().toBuffer();
  const imgOne = await sharp(rawOnePixel, { raw: { width: 20, height: 20, channels: 4 } }).png().toBuffer();

  const underThreshold = await diffImages(imgBase, imgOne, { threshold: 0.01 });
  assert.equal(underThreshold.diffPixels, 1);
  assert.equal(underThreshold.changed, false);

  const overThreshold = await diffImages(imgBase, imgOne, { threshold: 0.001 });
  assert.equal(overThreshold.changed, true);
});
