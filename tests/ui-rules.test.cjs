'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { inspectInterface, probeInteraction } = require('../electron/ui-rules.cjs');
const { inspectSources } = require('../electron/ui-source-rules.cjs');
const { reviewRuntime } = require('../electron/review-browser.cjs');

const ids = report => report.findings.map(f => f.id).sort();

const flawed = `<!doctype html><style>
  body{margin:0;font:14px Arial}
  .card{border:1px solid #888;padding:8px;margin:8px}
  .choice{display:block}.choice.stacked{display:flex;flex-direction:column}
  button{border:0;padding:8px}button:focus{outline:2px solid blue}
  dialog{border:0}
</style>
<div class="card"><div class="card"><div class="card"><p>Deep</p></div></div></div>
<div><label class="choice"><strong>Choose songs</strong><small>One song or several</small></label><label class="choice stacked"><strong>Choose a folder</strong><small>Include subfolders</small></label></div>
<div><span class="row">A</span><span class="row">B</span></div>
<div><label class="opt"><b>Top</b><i>Bottom</i></label><label class="opt" style="display:flex;flex-direction:column"><b>Top</b><i>Bottom</i></label></div>
<button id="save">Save</button><dialog id="d">Hi</dialog>`;

const clean = `<!doctype html><style>
  body{margin:0;font:14px Arial}
  .card{border:1px solid #888;padding:8px;margin:8px}
  button,label{user-select:none;-webkit-user-select:none}
  button{border:0;padding:8px;transition:background .15s}button:focus-visible{outline:2px solid blue}
  dialog{border:0;transition:opacity .2s}
  .choice{display:flex;flex-direction:column;gap:4px}
</style>
<div class="card"><p>Shallow</p></div>
<div><label class="choice"><strong>Choose songs</strong><small>One song</small></label><label class="choice"><strong>Folder</strong><small>Subfolders</small></label></div>
<button id="save">Save</button><dialog id="d">Hi</dialog>`;

test('rendered rules flag nested boxes, still controls, selectable labels, touching text and mismatched siblings', async () => {
  const browser = await reviewRuntime().chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.setContent(flawed);
    const bad = await page.evaluate(inspectInterface);
    assert.deepEqual(ids(bad), ['nested-boxes', 'selectable-controls', 'sibling-layout', 'touching-text', 'unanimated-controls', 'unanimated-overlays']);
    assert.match(bad.findings.find(f => f.id === 'nested-boxes').samples[0], /3 levels/);
    assert.ok(bad.findings.find(f => f.id === 'touching-text').samples.some(s => s.includes('strong + small')));
    const interaction = await probeInteraction(page);
    assert.deepEqual(ids(interaction), ['mouse-focus-ring']);
    await page.setContent(clean);
    assert.deepEqual(ids(await page.evaluate(inspectInterface)), []);
    assert.deepEqual(ids(await probeInteraction(page)), []);
  } finally { await browser.close(); }
});

test('layout rules measure fixed-bar share, covered last content, field style outliers and mixed tooltips', async () => {
  const browser = await reviewRuntime().chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    const rows = Array.from({ length: 40 }, (_, i) => `<p>Song ${i}</p>`).join('');
    await page.setContent(`<style>body{margin:0;font:14px Arial}header{position:fixed;top:0;left:0;right:0;height:120px;background:#111}footer{position:fixed;bottom:0;left:0;right:0;height:150px;background:#222}
      input{border:1px solid #888;border-radius:8px}#odd{border-radius:0;background:#eee}</style>
      <header></header>${rows}<input id="a"><input id="b"><input id="odd"><span title="Native">x</span><span role="tooltip">Custom</span><footer></footer>`);
    const bad = await page.evaluate(inspectInterface);
    for (const id of ['chrome-share', 'covered-content', 'input-style-outliers', 'mixed-tooltips']) assert.ok(ids(bad).includes(id), id);
    assert.match(bad.findings.find(f => f.id === 'chrome-share').message, /41%/);
    assert.match(bad.findings.find(f => f.id === 'input-style-outliers').samples[0], /input#odd/);
    assert.equal(await page.evaluate(() => scrollY), 0, 'scroll position restored');
    await page.setContent(`<style>body{margin:0;font:14px Arial;padding-bottom:64px}footer{position:fixed;bottom:0;left:0;right:0;height:64px;background:#222}
      input{border:1px solid #888;border-radius:8px}</style>${rows}<input><input><span title="Native">x</span><footer></footer>`);
    const good = await page.evaluate(inspectInterface);
    for (const id of ['chrome-share', 'covered-content', 'input-style-outliers', 'mixed-tooltips']) assert.ok(!ids(good).includes(id), id);
  } finally { await browser.close(); }
});

test('keyboard probe reports controls without a focus change and focus falling to the body', async () => {
  const browser = await reviewRuntime().chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>button{outline:none!important;border:0}</style><button>Plain</button>
      <button id="t" aria-pressed="false" onclick="this.remove()">Toggle</button>`);
    const report = await probeInteraction(page);
    assert.deepEqual(ids(report), ['focus-lost', 'no-focus-indicator']);
  } finally { await browser.close(); }
});

test('source rules find focus rings, small fonts, missing reduced motion and windows without a minimum size', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-rules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  write('app.css', '/* a:focus{outline:1px solid} */\nbutton:focus { outline: 2px solid blue }\n.x:focus:not(:focus-visible){outline:none}\n.tiny{font-size:11px}\n.ok{font-size:.8rem}\n.fade{transition:opacity .2s}');
  write('calm.css', '.fade{transition:opacity .2s}@media(prefers-reduced-motion:reduce){.fade{transition:none}}');
  write('main.cjs', 'new BrowserWindow({ width: 800, height: 600, webPreferences: { sandbox: true } });\nnew BrowserWindow({ minWidth: 640, minHeight: 480 });');
  write('App.cs', 'var window = new Window(page) { Title = "Music" };');
  write('node_modules/pkg/bad.css', 'a:focus{outline:1px solid}');
  write('wwwroot/lib/bootstrap.css', 'a:focus{outline:1px solid}');
  const report = inspectSources(root);
  const at = id => report.findings.find(f => f.id === id)?.locations || [];
  assert.deepEqual(at('focus-without-visible'), [{ file: 'app.css', line: 2, detail: 'button:focus' }]);
  assert.deepEqual(at('small-font').map(l => [l.file, l.line]), [['app.css', 4]]);
  assert.deepEqual(at('reduced-motion-missing').map(l => l.file), ['app.css']);
  assert.deepEqual(at('window-min-size').map(l => [l.file, l.line]), [['App.cs', 1], ['main.cjs', 1]]);
  write('Platform.cs', 'window.MinimumWidth = 850; window.MinimumHeight = 640;');
  assert.deepEqual(inspectSources(root).findings.find(f => f.id === 'window-min-size').locations.map(l => l.file), ['main.cjs']);
});

test('reduced-motion overrides must match each animated selector and loops are reported', () => {
  const { cssFindings } = require('../electron/ui-source-rules.cjs');
  const css = [
    '.tile.r4.todo::after,.tile.r5.todo::after{animation:sheen 3s infinite}',
    '.card.r6{animation:pop .4s}',
    '.dot.on{animation:ping 2s infinite}',
    '.sheet{transition:transform .2s}',
    '.fade{transition:opacity .2s}',
    '@keyframes sheen{to{transform:none}}',
    '@media (prefers-reduced-motion:reduce){.tile.r4::after,.card{animation:none}.dot{animation:none!important}.sheet{transition:none}}'
  ].join('\n');
  const found = cssFindings('a.css', css), at = id => found.filter(f => f.id === id).map(f => [f.line, f.detail]);
  assert.deepEqual(at('reduced-motion-uncovered'), [[1, 'animation on .tile.r4.todo::after'], [1, 'animation on .tile.r5.todo::after'], [2, 'animation on .card.r6']]);
  assert.deepEqual(at('looping-animation').map(([line]) => line), [1, 3]);
  const fixed = css.replace('.tile.r4::after,.card{', '.tile.r4.todo::after,.tile.r5.todo::after,.card.r6{');
  assert.deepEqual(cssFindings('a.css', fixed).filter(f => f.id === 'reduced-motion-uncovered'), []);
});

test('motion findings compare normal and reduced-motion samples', () => {
  const { motionFindings } = require('../electron/ui-rules.cjs');
  const normal = [{ target: 'div.dot', infinite: true, moving: false }, { target: 'dialog', infinite: false, moving: true }];
  const reduced = [{ target: 'div.dot', infinite: true, moving: false }, { target: 'span.fade', infinite: false, moving: false }];
  assert.deepEqual(motionFindings(normal, reduced).map(f => [f.id, f.samples]), [['looping-animation', ['div.dot']], ['reduced-motion-running', ['div.dot']]]);
  assert.deepEqual(motionFindings([], []), []);
});

test('gradient rule ignores fades between greys and flags fades between hues', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-grey-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.css'), '.a{background:linear-gradient(#ffffff02,#ffffff00)}\n.b{background:linear-gradient(rgb(40 40 40),rgb(10 10 10))}\n.c{background:linear-gradient(135deg,#4d405a,#28232e)}\n.d{background:linear-gradient(135deg in oklch,#4d405a,#28232e)}\n@media(prefers-reduced-motion:reduce){}');
  const lines = (inspectSources(root).findings.find(f => f.id === 'gradient-interpolation')?.locations || []).map(l => l.line);
  assert.deepEqual(lines, [3]);
});
