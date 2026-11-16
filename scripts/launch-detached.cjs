'use strict';
const { spawn } = require('node:child_process');

const [executable, folder, ...args] = process.argv.slice(2);
if (!executable || !folder) {
  console.error('Usage: node launch-detached.cjs <executable> <app folder> [arguments]');
  process.exitCode = 1;
} else {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  // Detach the console and its handles so closing the launcher leaves the app alive.
  const child = spawn(executable, [folder, ...args], {
    cwd: folder, env, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('spawn', () => { child.unref(); console.log(child.pid); });
}
