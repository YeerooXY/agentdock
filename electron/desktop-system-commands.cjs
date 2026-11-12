'use strict';
const fs = require('node:fs');
const { definitions: integrationDefinitions } = require('./integrations.cjs');
const { creativeTools } = require('./creative-tools.cjs');
const { catalog: recommendedTools } = require('./mcp-catalog.cjs');
const { catalog: cliCatalog } = require('./cli-catalog.cjs');
const { NO_VALUE } = require('./command-result.cjs');

function desktopSystemCommands(h) {
  const { snapshot, workbench,
    sessions, testMode, dialog, getWindow, restart, updates, getApiBusy, setQuitting, app, shell, setMode,
    minimize, hideToTray, revealWindow, dragWindow, quit, refreshLimits } = h;
  return {
    'state': async () => snapshot(),
    'meshy.auth': async () => { const auth = workbench.concepts.auth || { state: 'unchecked' }; return { ...auth }; },
    'restart.normal': async () => {
      if (sessions.list().some(item => item.alive) && !testMode) {
        const { response } = await dialog.showMessageBox(getWindow(), { type: 'question', message: 'End open consoles and restart normally?', detail: 'Consoles opened in safe mode are not saved.', buttons: ['Keep running', 'Restart normally'], defaultId: 0, cancelId: 0 });
        if (response !== 1) return NO_VALUE;
      }
      restart(false); return NO_VALUE;
    },
    'updates.check': async () => updates.check(),
    'updates.download': async () => {
      if (testMode) throw new Error('Real update downloads are disabled in tests.');
      return updates.download();
    },
    'updates.install': async () => {
      if (testMode) throw new Error('Installer launching is disabled in tests.');
      const file = await updates.verifiedFile();
      if (getApiBusy()) throw new Error('Wait for API work to finish before installing. The download is saved.');
      if (sessions.list().some(x => x.alive)) {
        const answer = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['Keep working', 'Install update'], defaultId: 0, cancelId: 0, message: 'Install the downloaded update?', detail: 'Running console tasks will stop. Your saved panels can reopen after installation.' });
        if (answer.response !== 1) return NO_VALUE;
      }
      if (process.platform === 'linux' && process.env.APPIMAGE) {
        const target = process.env.APPIMAGE, staged = target + '.update';
        fs.copyFileSync(file, staged); fs.chmodSync(staged, 0o755); fs.renameSync(staged, target);
        setQuitting(true); app.relaunch({ execPath: target }); app.quit(); return NO_VALUE;
      }
      if (process.platform === 'linux') { shell.showItemInFolder(file); return NO_VALUE; }
      const error = await shell.openPath(file); if (error) throw new Error('The installer could not be opened.');
      setQuitting(true); app.quit(); return NO_VALUE;
    },
    'mode': async payload => { await setMode(payload); return NO_VALUE; },
    'minimize': async () => { minimize(); return NO_VALUE; },
    'tray': async () => { hideToTray(); return NO_VALUE; },
    'show': async () => { revealWindow(); return NO_VALUE; },
    'window.drag': async payload => { dragWindow(payload?.action, payload); return NO_VALUE; },
    'quit': async () => { await quit(); return NO_VALUE; },
    'refresh': async () => { await refreshLimits(); return NO_VALUE; },
    'external.open': async payload => {
      if (typeof payload !== 'string' || payload.length > 4096) throw new Error('Invalid web link.');
      const url = new URL(payload);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only web links can open here.');
      await shell.openExternal(url.href); return NO_VALUE;
    },
    'docs': async payload => {
      const urls = { codex: 'https://learn.chatgpt.com/docs/codex/cli', claude: 'https://code.claude.com/docs/en/overview', openai: 'https://developers.openai.com/api/docs/pricing', anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing' };
      Object.assign(urls, { tailscale: 'https://tailscale.com/download', duckdns: 'https://www.duckdns.org/', 'mobile-guide': 'https://github.com/YeerooXY/agentdock/blob/main/docs/android-setup.md', 'android-download': 'https://github.com/YeerooXY/agentdock/releases' });
      for (const item of integrationDefinitions) urls[item.id] = item.docs;
      for (const item of creativeTools) urls[item.id] = item.docs;
      for (const item of recommendedTools) urls[item.id] = item.docs;
      for (const item of cliCatalog) urls[item.id] = item.docs;
      urls.zai = 'https://docs.z.ai/devpack/tool/opencode';
      urls.strata = 'https://github.com/Niko1221/Strata/blob/main/docs/INSTALL.md';
      Object.assign(urls, { 'key-notion': 'https://www.notion.so/profile/integrations', 'key-stripe': 'https://dashboard.stripe.com/apikeys', 'key-github': 'https://github.com/settings/personal-access-tokens/new' });
      if (!urls[payload]) throw new Error('Unknown documentation link.'); await shell.openExternal(urls[payload]); return NO_VALUE;
    }
  };
}

module.exports = { desktopSystemCommands };
