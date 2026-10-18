'use strict';
const { app, shell } = require('electron');
const path = require('node:path');
const { taskbarIcon, developmentShortcuts } = require('../electron/windows-identity.cjs');
app.setName('Agent Dock');
app.whenReady().then(() => {
  const projectDir = path.resolve(__dirname, '..');
  const icon = taskbarIcon({ projectDir, dataDir: app.getPath('userData') });
  const updated = developmentShortcuts({ shell, desktop: app.getPath('desktop'), programs: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), projectDir, icon, create: true });
  console.log(updated.length ? updated.join('\n') : 'Agent Dock shortcuts are up to date.');
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
