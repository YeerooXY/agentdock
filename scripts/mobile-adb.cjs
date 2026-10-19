'use strict';
// Android-emulator UI checks only. This never targets a physical phone.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'mobile-device');
const adb = path.join(root, '.build', 'mobile-tools', 'android-sdk', 'platform-tools', 'adb.exe');
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', windowsHide: true });
function nodes() {
  run('shell', 'uiautomator', 'dump', '/sdcard/dock-window.xml');
  const xml = run('shell', 'cat', '/sdcard/dock-window.xml');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(x => Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
}
function tap(node) { if (!node) throw Error('Control not found'); const [x, y, right, bottom] = node.bounds.match(/\d+/g).map(Number); run('shell', 'input', 'tap', '' + Math.round((x + right) / 2), '' + Math.round((y + bottom) / 2)); }
const action = process.argv[2], value = process.argv[3];
if (action === 'inspect') console.log(nodes().filter(x => x['content-desc']).map(x => `${x['content-desc']} ${x.bounds}`).join('\n'));
if (action === 'tap') tap(nodes().find(x => x['content-desc'] === value || x.text === value));
if (action === 'field') tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1));
if (action === 'type') { if (!/^[\w :/.+-]+$/.test(value)) throw Error('Use fixture text only'); run('shell', 'input', 'text', value.replaceAll(' ', '%s')); }
if (action === 'back') run('shell', 'input', 'keyevent', '4');
if (action === 'home') run('shell', 'input', 'keyevent', '3');
if (action === 'open') console.log(run('shell', 'am', 'start', '-n', 'com.yeeroo.agentdock.mobile/com.yeeroo.agentdock.mobile.MainActivity'));
if (action === 'pair') {
  const connection = JSON.parse(fs.readFileSync(path.join(out, 'connection.json')));
  run('reverse', 'tcp:' + connection.port, 'tcp:' + connection.port);
  tap(nodes().filter(x => x.class === 'android.widget.EditText').at(-1));
  run('shell', 'input', 'keyevent', '123'); // end
  run('shell', 'input', 'keyevent', '--longpress', '67');
  // Clear with Android select-all, preserving no text from the user's device.
  run('shell', 'input', 'keycombination', '113', '29');
  run('shell', 'input', 'text', connection.code); run('shell', 'input', 'keyevent', '4');
  tap(nodes().find(x => x['content-desc'] === 'Connect'));
}
if (action === 'capture') {
  if (!/^[a-z0-9-]+$/.test(value)) throw Error('Invalid capture name');
  fs.writeFileSync(path.join(out, value + '.png'), execFileSync(adb, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], { windowsHide: true }));
  console.log('Saved ' + value + '.png');
}
