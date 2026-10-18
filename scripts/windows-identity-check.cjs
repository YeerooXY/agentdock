'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function checkWindowsIdentity({ app, dataDir }) {
  if (process.platform !== 'win32') return;
  const running = await app.evaluate(({ app, BrowserWindow }) => ({
    window: Number(BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE()),
    executable: process.execPath, projectDir: app.getAppPath(),
  }));
  const details = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'window-app-details.ps1'), '-WindowHandle', String(running.window)], { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
  assert.equal(details.appId, 'com.yeeroo.agentdock', 'A real window must identify as Dock, never electron.exe');
  assert.equal(details.displayName, 'Agent Dock');
  assert.equal(details.command, `"${running.executable}" "${running.projectDir}"`);
  assert.match(details.icon, /agent-dock-[a-f0-9]{12}\.ico,0$/);
  const icon = details.icon.slice(0, -2);
  assert.deepEqual(fs.readFileSync(icon), fs.readFileSync(path.join(running.projectDir, 'assets', 'icon.ico')));
  const desktop = path.join(dataDir, 'Shortcut desktop'), programs = path.join(dataDir, 'Shortcut programs');
  fs.mkdirSync(desktop); fs.mkdirSync(programs);
  const links = await app.evaluate(({ shell }, options) => {
    const path = process.getBuiltinModule('node:path');
    const requireModule = process.getBuiltinModule('node:module').createRequire(path.join(options.projectDir, 'package.json'));
    const { developmentShortcuts } = requireModule('./electron/windows-identity.cjs');
    const args = { shell, ...options, create: true };
    developmentShortcuts(args);
    const files = [args.desktop, args.programs].map(folder => path.join(folder, 'Agent Dock.lnk'));
    const first = files.map(file => shell.readShortcutLink(file));
    // Simulate an old WScript shortcut and a separately installed copy.
    shell.writeShortcutLink(files[0], 'update', { appUserModelId: '' });
    shell.writeShortcutLink(files[1], 'update', { target: process.env.ComSpec, appUserModelId: 'other.application' });
    const repaired = developmentShortcuts({ ...args, create: false });
    const after = files.map(file => shell.readShortcutLink(file));
    const again = developmentShortcuts({ ...args, create: false });
    return { first, after, repaired, again };
  }, { ...running, desktop, programs, icon });
  for (const link of links.first) {
    assert.equal(link.appUserModelId, details.appId);
    assert.equal(link.target.toLowerCase(), running.executable.toLowerCase());
    assert.equal(link.icon, icon);
    assert.equal(link.args, `"${running.projectDir}"`);
  }
  assert.equal(links.repaired.length, 1);
  assert.equal(links.after[0].appUserModelId, details.appId);
  assert.equal(links.after[1].appUserModelId, 'other.application', 'Preserve shortcuts to other installations');
  assert.deepEqual(links.again, [], 'Do not rewrite matching shortcuts on every launch');
}

module.exports = { checkWindowsIdentity };
