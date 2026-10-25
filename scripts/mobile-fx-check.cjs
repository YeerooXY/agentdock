'use strict';
// Capture native Flutter rendering on the dedicated Android emulator. Requires
// scripts/mobile-device-fixture.cjs and an already paired preview 21 APK.
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/mobile-fx');
const adb = path.join(root, '.build/mobile-tools/android-sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', windowsHide: true });
assert.equal(run('shell', 'getprop', 'ro.kernel.qemu').trim(), '1', 'Test emulator only');
fs.mkdirSync(out, { recursive: true });
function nodes() {
  const result = run('shell', 'uiautomator', 'dump', '/sdcard/dock-fx.xml');
  assert.ok(result.includes('dumped'), 'Fresh UI tree required');
  const decode = text => text.replaceAll('&amp;', '&').replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&#10;', '\n').replaceAll('&quot;', '"');
  return [...run('shell', 'cat', '/sdcard/dock-fx.xml').matchAll(/<node\b[^>]*>/g)]
    .map(n => Object.fromEntries([...n[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], decode(x[2])])));
}
function tap(label) {
  const candidates = nodes().filter(n => n['content-desc'] === label || n.text === label || n['content-desc']?.split('\n').includes(label));
  const node = candidates.find(n => n.clickable === 'true') || candidates[0];
  assert.ok(node, `Missing ${label}`);
  const [x, y, right, bottom] = node.bounds.match(/\d+/g).map(Number);
  run('shell', 'input', 'tap', String(Math.round((x + right) / 2)), String(Math.round((y + bottom) / 2)));
}
function capture(name) {
  assert.match(name, /^[a-z0-9-]+$/);
  nodes();
  fs.writeFileSync(path.join(out, name + '.png'), execFileSync(adb,
    ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 12 * 1024 * 1024 }));
  console.log(`Saved ${name}`);
}
const [action, value] = process.argv.slice(2);
if (action === 'capture') capture(value);
if (action === 'tap') tap(value);
if (action === 'themes') {
  const themes = [['normal', 'Normal'], ['classic', 'Accent colors'], ['blue', 'Blue'],
    ['violet', 'Violet'], ['hot-pink', 'Hot pink'], ['redline', 'Redline'],
    ['cyber', 'Cyber'], ['icy', 'Arctic'], ['fiery', 'Inferno'], ['gamer', 'RGB']];
  for (const [id, label] of themes) {
    tap('More options'); tap('Console style'); tap('Style'); tap(label);
    if (id === 'cyber') capture('phone-style-controls');
    tap('Close appearance'); capture('phone-theme-' + id);
  }
}
if (action === 'journey') {
  capture('phone-large-text');
  tap('More options'); tap('Console style'); capture('phone-controls-large-text');
  run('shell', 'input', 'swipe', '700', '1800', '700', '900', '450');
  capture('phone-controls-large-text-bottom');
  tap('Close appearance');
  tap('More options'); tap('Text & display'); tap('Grid');
  run('shell', 'input', 'keyevent', '4'); capture('phone-grid-stars');
  tap('Trader'); tap('Robonslaught'); capture('phone-console-switched');
  tap('Enter chat mode');
  run('shell', 'input', 'text', 'Draft%stest%son%sthe%sphone');
  capture('phone-keyboard-large-text');
  run('shell', 'input', 'keyevent', '4');
  run('shell', 'wm', 'density', '420');
  run('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  run('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  run('shell', 'wm', 'user-rotation', 'lock', '1');
  run('shell', 'sleep', '2');
  capture('phone-landscape');
  tap('More options'); tap('Console style'); capture('phone-controls-landscape');
  tap('Close appearance');
  run('shell', 'wm', 'user-rotation', 'lock', '0');
  run('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0');
  run('shell', 'settings', 'put', 'global', 'transition_animation_scale', '0');
  run('shell', 'settings', 'put', 'global', 'window_animation_scale', '0');
  tap('More options'); tap('Console style');
  finish();
}
function finish() {
  assert.ok(nodes().some(n => n['content-desc'].includes('Motion is paused')),
    'Android reduced-motion setting must be acknowledged');
  capture('phone-reduced-motion');
  tap('Stars'); capture('phone-stars-disabled'); tap('Stars');
  tap('Close appearance');
  run('shell', 'settings', 'put', 'global', 'animator_duration_scale', '1');
  run('shell', 'settings', 'put', 'global', 'transition_animation_scale', '1');
  run('shell', 'settings', 'put', 'global', 'window_animation_scale', '1');
  run('shell', 'wm', 'size', '1600x2560');
  run('shell', 'wm', 'density', '320');
  capture('tablet-console');
  tap('More options'); tap('Console style'); capture('tablet-controls');
  tap('Close appearance');
  run('shell', 'wm', 'size', 'reset');
  run('shell', 'wm', 'density', '420');
  run('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1');
  console.log('Native FX interaction checks passed. No terminal command was submitted.');
}
if (action === 'finish') finish();
