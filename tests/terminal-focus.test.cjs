'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { Sessions } = require('../electron/sessions.cjs');

function fixture(t, provider, height = 2) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'paddock-focus-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const writes = [], resizes = [], changes = [], touches = [];
  const sessions = new Sessions(root, { pty: { spawn() { assert.fail('No processes may launch'); } }, grid: { columns: 4, rows: 3 },
    projects: { on() {}, touch: id => touches.push(id) } });
  const terminal = { write: data => writes.push(data), resize: (cols, rows) => resizes.push([cols, rows]), kill() { assert.fail('Focus must preserve the process'); } };
  const item = { id: 'console', provider, slot: 1, width: 1, height, cols: 110, rows: height === 2 ? 48 : 24,
    alive: true, state: 'ready', updatedAt: 123, lastInputAt: 100, terminal };
  sessions.items.set(item.id, item);
  sessions.on('changed', () => changes.push('changed'));
  return { sessions, item, writes, resizes, changes, touches };
}

for (const height of [1, 2]) test(`Codex focus reports never reach the process at ${height} grid row(s)`, t => {
  const { sessions, item, writes, resizes, changes, touches } = fixture(t, 'codex', height);
  const before = { ...item };
  for (let cycle = 0; cycle < 5; cycle++) {
    sessions.write(item.id, '\x1b[O');
    sessions.write(item.id, '\x1b[I');
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(resizes, []);
  assert.deepEqual(changes, []);
  assert.deepEqual(touches, []);
  assert.equal(sessions.items.get(item.id), item);
  assert.deepEqual(item, before, 'Focus preserves slot, span, dimensions, state and input timestamps');
});

for (const provider of ['claude', 'shell', 'custom', 'opencode']) test(`${provider} keeps both focus reports`, t => {
  const { sessions, item, writes } = fixture(t, provider);
  sessions.write(item.id, '\x1b[O'); sessions.write(item.id, '\x1b[I');
  assert.deepEqual(writes, ['\x1b[O', '\x1b[I']);
});

test('Codex typing, other terminal replies and paste contents reach the process unchanged', t => {
  const { sessions, item, writes } = fixture(t, 'codex');
  const input = ['hello', '\r', '\x03', '\x7f', '\x1b[A', '\x1b[1;1R', '\x1b[<0;12;8M',
    '\x1b[200~pasted \x1b[I and \x1b[O\x1b[201~', 'text \x1b[I inside a paste'];
  for (const data of input) sessions.write(item.id, data);
  assert.deepEqual(writes, input);
  assert.throws(() => sessions.write(item.id, null), /Terminal input is too large/);
  assert.throws(() => sessions.write(item.id, 'x'.repeat(65537)), /Terminal input is too large/);
});

// Exercise the renderer's existing fit loop without importing the browser app.
const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const fitSource = app.slice(app.indexOf('function fitVisible() {'), app.indexOf('const SCREENSHOT_DRAG'));

test('unchanged fractional grid heights and cached dimensions do not resize on a repaint', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const height of [1, 2]) {
    const { sessions, item, resizes } = fixture(t, 'codex', height);
    const fits = [], calls = [], terminalResizes = [];
    // Two rows include the gap between tracks; both spans can have fractional pixels.
    const trackHeight = (761 - 24) / 3, pixelHeight = height * trackHeight + (height - 1) * 12;
    let cellHeight = 17.1;
    const term = { cols: item.cols, rows: item.rows, options: { fontSize: 14 }, buffer: { active: { viewportY: 0, baseY: 0 } },
      resize(cols, rows) { this.cols = cols; this.rows = rows; terminalResizes.push([cols, rows]); }, refresh() {} };
    const record = { id: item.id, term, follow: true,
      node: { clientWidth: 600, clientHeight: Math.round(pixelHeight), closest: () => true, getClientRects: () => [{ height: pixelHeight }] },
      fit: { fit() { fits.push('fit'); term.resize(70, Math.floor(pixelHeight / cellHeight)); } } };
    const fitVisible = vm.runInNewContext(fitSource + '\nfitVisible;', {
      windowMoving: false, layoutMotion: { active: false }, state: { mode: 'dashboard' }, page: 'consoles', expandedId: null,
      terminals: new Map([[item.id, record]]), devicePixelRatio: 1.25, clearTimeout, setTimeout,
      clearTerminalAnchor() {}, keepFollowing() {},
      call(method, payload) { calls.push(method); sessions.resize(payload.id, payload.cols, payload.rows); return Promise.resolve(); }
    });
    fitVisible(); t.mock.timers.tick(250);
    const rows = term.rows;
    assert.equal(fits.length, 1); assert.equal(calls.length, 1); assert.equal(resizes.length, 1);
    fits.length = calls.length = resizes.length = terminalResizes.length = 0;
    cellHeight = pixelHeight / (rows + 1); // A new measurement would choose another row count.
    fitVisible(); t.mock.timers.tick(250);
    for (let cycle = 0; cycle < 3; cycle++) {
      record.repaint = true; fitVisible(); t.mock.timers.tick(250);
    }
    assert.equal(term.rows, rows);
    assert.deepEqual(fits, []); assert.deepEqual(terminalResizes, []); assert.deepEqual(calls, []); assert.deepEqual(resizes, []);
    record.dimensions = null; // Even a requested re-fit reuses the cached row count.
    fitVisible(); t.mock.timers.tick(250);
    assert.equal(term.rows, rows); assert.deepEqual(fits, []); assert.deepEqual(calls, []); assert.deepEqual(resizes, []);
    assert.deepEqual(terminalResizes, [[70, rows]]);
  }
});
