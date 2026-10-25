'use strict';
// node-pty 1.1.0 publishes its macOS spawn-helper without the execute bit, so
// every terminal fails with "posix_spawnp failed" on a Mac. Restore it after
// install; electron-builder then packages the corrected mode.
const fs = require('node:fs');
const path = require('node:path');
const prebuilds = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
for (const arch of ['darwin-arm64', 'darwin-x64']) {
  const helper = path.join(prebuilds, arch, 'spawn-helper');
  try { fs.chmodSync(helper, 0o755); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
