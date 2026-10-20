'use strict';
// The device ID and qemu check deliberately exclude physical phones.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/mobile-controls');
const adb = path.join(root, '.build/mobile-tools/android-sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', windowsHide: true });
assert.equal(run('shell', 'getprop', 'ro.kernel.qemu').trim(), '1', 'Only the test emulator is allowed');
function nodes() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = run('shell', 'uiautomator', 'dump', '/sdcard/dock-controls.xml');
    if (!result.includes('dumped')) continue; // Never accept an old dump during rotation.
    return [...run('shell', 'cat', '/sdcard/dock-controls.xml').matchAll(/<node\b[^>]*>/g)]
      .map(n => Object.fromEntries([...n[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]])));
  }
  throw new Error('Emulator UI has not settled');
}
function tap(node) {
  assert.ok(node, 'Control not found');
  const [x, y, r, b] = node.bounds.match(/\d+/g).map(Number);
  run('shell', 'input', 'tap', String(Math.round((x + r) / 2)), String(Math.round((y + b) / 2)));
}
const [action, value] = process.argv.slice(2);
if (action === 'install') run('install', '-r', '-d', path.join(root, 'mobile/build/app/outputs/flutter-apk/app-debug.apk'));
if (action === 'open') run('shell', 'am', 'start', '-n', 'com.yeeroo.agentdock.mobile/.MainActivity');
if (action === 'reset') {
  run('shell', 'pm', 'clear', 'com.yeeroo.agentdock.mobile');
  run('shell', 'am', 'start', '-n', 'com.yeeroo.agentdock.mobile/.MainActivity');
}
if (action === 'inspect') console.log(nodes().filter(x => x['content-desc'] || x.class === 'android.widget.EditText').map(x => `${x['content-desc'] || x.text} ${x.bounds}`).join('\n'));
if (action === 'tap') tap(nodes().find(x => x['content-desc'] === value || x.text === value || x['content-desc']?.startsWith(value + '&#10;')));
if (action === 'back') run('shell', 'input', 'keyevent', '4');
if (action === 'compose') tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1));
if (action === 'profile') {
  assert.ok(['default', 'narrow', 'large-text', 'landscape'].includes(value));
  run('shell', 'wm', 'density', ['narrow', 'large-text'].includes(value) ? '540' : '420');
  run('shell', 'settings', 'put', 'system', 'font_scale', value === 'large-text' ? '2.0' : '1.0');
  run('shell', 'settings', 'put', 'system', 'accelerometer_rotation', value === 'default' ? '1' : '0');
  run('shell', 'settings', 'put', 'system', 'user_rotation', value === 'landscape' ? '1' : '0');
}
if (action === 'pair') {
  const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json')));
  run('reverse', `tcp:${fixture.port}`, `tcp:${fixture.port}`);
  tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1));
  run('shell', 'input', 'text', fixture.code);
  run('shell', 'input', 'keyevent', '4');
  tap(nodes().find(x => x['content-desc'] === 'Connect'));
}
if (action === 'capture') {
  assert.match(value, /^[a-z0-9-]+$/);
  nodes(); // Wait for route/keyboard animations before taking the screenshot.
  fs.writeFileSync(path.join(out, value + '.png'), execFileSync(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }));
  console.log('Saved ' + value);
}
