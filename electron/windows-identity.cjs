'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Match the installer and shortcuts. An electron.exe path groups source builds
// under Electron and lets Explorer reuse its cached icon.
const APP_ID = 'com.yeeroo.agentdock';

function taskbarIcon({ projectDir, dataDir, packaged = false, executable = process.execPath }) {
  if (packaged) return executable; // Explorer cannot read resources inside app.asar.
  const data = fs.readFileSync(path.join(projectDir, 'assets', 'icon.ico'));
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
  const directory = path.join(dataDir, 'icons');
  fs.mkdirSync(directory, { recursive: true });
  const icon = path.join(directory, `paddock-${hash}.ico`);
  if (!fs.existsSync(icon)) fs.writeFileSync(icon, data);
  return icon;
}

function developmentShortcuts({ shell, desktop, programs, projectDir, icon, executable = process.execPath, create = false }) {
  const args = `"${projectDir}"`;
  const updated = [];
  for (const directory of new Set([desktop, programs])) {
    const shortcut = path.join(directory, 'Paddock.lnk');
    // Rename this checkout's shortcut from the app's former name, Agent Dock.
    const legacy = path.join(directory, 'Agent Dock.lnk');
    if (!fs.existsSync(shortcut) && fs.existsSync(legacy)) {
      const current = shell.readShortcutLink(legacy);
      if (path.resolve(current.target).toLowerCase() === path.resolve(executable).toLowerCase() && current.args === args) fs.renameSync(legacy, shortcut);
    }
    const exists = fs.existsSync(shortcut);
    if (!exists && !create) continue;
    if (exists) {
      const current = shell.readShortcutLink(shortcut);
      // Preserve installed copies, other checkouts, and custom launch arguments.
      if (path.resolve(current.target).toLowerCase() !== path.resolve(executable).toLowerCase() || current.args !== args) {
        if (create) throw new Error(`A different shortcut already exists at ${shortcut}; it was preserved.`);
        continue;
      }
      if (current.appUserModelId === APP_ID && current.icon === icon && current.iconIndex === 0) continue;
    }
    const details = { target: executable, args, cwd: projectDir, description: 'Open Paddock', icon, iconIndex: 0, appUserModelId: APP_ID };
    if (!shell.writeShortcutLink(shortcut, exists ? 'update' : 'create', details)) throw new Error(`Could not save shortcut: ${shortcut}`);
    updated.push(shortcut);
  }
  return updated;
}

module.exports = { APP_ID, taskbarIcon, developmentShortcuts };
