#!/usr/bin/env node
'use strict';
// Starts the current code against a copy of the real Paddock data, before the
// real app is touched. The copy leaves out the console layout (so no agent
// consoles reopen), the phone listener and Antigravity's credential switch, and
// runs in test mode, so nothing reaches the live app, the phone port or the
// Windows credential store. Passes when the copy logs "window ready" with no
// ERROR lines, and exits non-zero otherwise.
//   node scripts/relaunch-preflight.cjs [--app <folder>] [--data <folder>]
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');

const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const app = path.resolve(option('--app') || path.join(__dirname, '..'));
const data = path.resolve(option('--data') || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'Paddock'));
const electron = path.join(app, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
// Files and folders the app reads at startup. Caches, logs, sessions and
// results are not needed to prove that the saved state loads.
const SKIP_FILES = new Set(['workspace.json', 'mobile.json', 'credential-switch.json', 'lockfile', 'DevToolsActivePort']);
const COPY_DIRS = ['tasks', 'agent-accounts', 'shared', 'integrations', 'ssh', 'skill-packs'];

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b); else if (entry.isFile()) fs.copyFileSync(a, b);
  }
}

async function main() {
  if (!fs.existsSync(electron)) throw new Error('Electron is missing in ' + app);
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-preflight-'));
  try {
    for (const name of fs.readdirSync(data)) {
      const full = path.join(data, name);
      if (fs.statSync(full).isFile() && name.endsWith('.json') && !SKIP_FILES.has(name)) fs.copyFileSync(full, path.join(copy, name));
    }
    for (const dir of COPY_DIRS) copyDir(path.join(data, dir), path.join(copy, dir));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
    const child = spawn(electron, [app, '--smoke-test', `--data-dir=${copy}`], { env, stdio: 'ignore', windowsHide: true });
    const log = path.join(copy, 'logs', 'main.log');
    const deadline = Date.now() + 90_000;
    let ready = false, errors = [];
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
      errors = text.split(/\r?\n/).filter(line => / ERROR /.test(line));
      if (/ INFO window ready/.test(text) || errors.length || child.exitCode !== null) { ready = / INFO window ready/.test(text); break; }
    }
    try { child.kill(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (ready && !errors.length) { console.log(`PASS: ${app} started against a copy of ${data}.`); return 0; }
    console.log(`FAIL: ${ready ? 'started with errors' : 'did not reach window ready'}.`);
    for (const line of errors.slice(0, 10)) console.log('  ' + line);
    return 1;
  } finally {
    try { fs.rmSync(copy, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
}
main().then(code => { process.exitCode = code; }, error => { console.error('FAIL: ' + error.message); process.exitCode = 1; });
