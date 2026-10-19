'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/multi-device');
const adb = path.join(root, '.build/mobile-tools/android-sdk/platform-tools/adb.exe');
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', windowsHide: true });
assert.equal(run('shell', 'getprop', 'ro.kernel.qemu').trim(), '1', 'Only the test emulator is allowed');
function nodes() { run('shell', 'uiautomator', 'dump', '/sdcard/dock-devices.xml'); return [...run('shell', 'cat', '/sdcard/dock-devices.xml').matchAll(/<node\b[^>]*>/g)].map(n => Object.fromEntries([...n[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]))); }
function tap(node) { assert.ok(node, 'Control not found'); const [x, y, r, b] = node.bounds.match(/\d+/g).map(Number); run('shell', 'input', 'tap', String(Math.round((x + r) / 2)), String(Math.round((y + b) / 2))); }
function input(text) { run('shell', 'input', 'keyevent', '123', ...Array(90).fill('67')); run('shell', 'input', 'text', text.replaceAll(' ', '%s')); run('shell', 'input', 'keyevent', '4'); }
const [action, value] = process.argv.slice(2);
if (action === 'reset') { run('shell', 'pm', 'clear', 'com.yeeroo.agentdock.mobile'); run('shell', 'am', 'start', '-n', 'com.yeeroo.agentdock.mobile/.MainActivity'); }
if (action === 'open') run('shell', 'am', 'start', '-n', 'com.yeeroo.agentdock.mobile/.MainActivity');
if (action === 'inspect') console.log(nodes().filter(x => x['content-desc'] || x.class === 'android.widget.EditText').map(x => `${x['content-desc'] || x.text} ${x.bounds}`).join('\n'));
if (action === 'tap') tap(nodes().find(x => x['content-desc'] === value || x.text === value));
if (action === 'back') run('shell', 'input', 'keyevent', '4');
if (action === 'fill') { assert.match(value, /^[\w .-]+$/); tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1)); input(value); }
if (action === 'pair') {
  const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json')))[Number(value)]; assert.ok(fixture);
  run('reverse', `tcp:${fixture.port}`, `tcp:${fixture.port}`);
  tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1)); input(fixture.code);
  tap(nodes().find(x => x['content-desc'] === 'Connect'));
}
if (action === 'capture') { assert.match(value, /^[a-z0-9-]+$/); fs.writeFileSync(path.join(out, value + '.png'), execFileSync(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { windowsHide: true })); console.log('Saved ' + value); }
if (action === 'check') { const state = JSON.parse(fs.readFileSync(path.join(out, 'state.json'))); assert.equal(state.length, 2); console.log(JSON.stringify(state.map(({ name, phones, writes }) => ({ name, phones: phones.map(({ name, connected }) => ({ name, connected })), writes })))); }
