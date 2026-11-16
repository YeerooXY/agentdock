'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const helper = path.resolve(__dirname, '../scripts/launch-detached.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('app keeps running after its PowerShell launcher is closed', { skip: process.platform !== 'win32', timeout: 15000 }, async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "paddock launch ' "));
  const heartbeat = path.join(folder, 'heartbeat.json');
  fs.writeFileSync(path.join(folder, 'index.js'), `
    const fs = require('node:fs');
    let count = 0;
    setInterval(() => {
      fs.writeFileSync('heartbeat.tmp', JSON.stringify({ pid: process.pid, count: ++count }));
      fs.renameSync('heartbeat.tmp', 'heartbeat.json');
    }, 50);
    setTimeout(() => process.exit(), 10000);
  `);
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const command = '& ' + [process.execPath, helper, process.execPath, folder].map(quote).join(' ') + '; Start-Sleep -Seconds 30';
  const parent = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let appPid;
  t.after(async () => {
    parent.kill();
    if (appPid) { try { process.kill(appPid); } catch {} }
    await pause(150);
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
  });
  let output = '', errors = '';
  parent.stdout.on('data', data => { output += data; });
  parent.stderr.on('data', data => { errors += data; });
  for (let i = 0; i < 100 && (!/^\d+\s*$/.test(output) || !fs.existsSync(heartbeat)); i++) await pause(50);
  assert.match(output, /^\d+\s*$/, errors);
  appPid = Number(output.trim());
  assert.equal(JSON.parse(fs.readFileSync(heartbeat)).pid, appPid);
  const exited = once(parent, 'exit');
  parent.kill();
  await exited;
  const before = JSON.parse(fs.readFileSync(heartbeat)).count;
  await pause(250);
  process.kill(appPid, 0);
  assert.ok(JSON.parse(fs.readFileSync(heartbeat)).count > before);
});

test('failed detached launch returns an error without reporting an app PID', () => {
  const result = spawnSync(process.execPath, [helper, path.join(os.tmpdir(), 'paddock-missing-executable', 'missing.exe'), os.tmpdir()], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ENOENT/);
});
