'use strict';
// Read-only account integration and an idle CLI launch. No prompts or paid API calls.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
let app;
async function eventually(fn, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 200)); }
  throw new Error('Timed out waiting for live integration');
}
(async () => {
  app = await electron.launch({ args: [root, '--hud'], timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForSelector('#hud:not([hidden])');
  const invoke = (method, payload) => page.evaluate(async ([m, p]) => {
    const result = await window.dock.call(m, p); if (!result.ok) throw new Error(result.error); return result.value;
  }, [method, payload]);
  await eventually(async () => { const s = await invoke('state'); return !s.refreshing && (s.lastRefresh || s.accountError); });
  const initial = await invoke('state');
  assert.equal(initial.accountError, null);
  assert.ok(initial.limits.some(x => x.provider === 'codex'));
  await page.screenshot({ path: path.join(artifacts, 'desktop-hud.png') });
  await invoke('mode', 'dashboard');
  await page.waitForSelector('.session-grid');
  await page.screenshot({ path: path.join(artifacts, 'desktop-overview.png') });
  const codex = await invoke('session.create', { provider: 'codex', cwd: root, name: 'Codex launch check' });
  await page.locator(`[data-session="${codex.id}"]`).click();
  await eventually(async () => (await invoke('session.buffer', codex.id)).data.length > 40);
  await new Promise(resolve => setTimeout(resolve, 2000));
  const state = await invoke('state');
  assert.equal(state.sessions.find(x => x.id === codex.id).alive, true);
  const buffer = (await invoke('session.buffer', codex.id)).data;
  assert.ok(!/Error parsing config|error: unexpected argument|failed to parse config/i.test(buffer));
  await page.screenshot({ path: path.join(artifacts, 'codex-terminal.png') });
  // Close only the idle CLI created by this check, without interacting with its trust prompt.
  await invoke('session.input', { id: codex.id, data: '\u0003' });
  await invoke('session.input', { id: codex.id, data: '\u0003' });
  await eventually(async () => !(await invoke('state')).sessions.find(x => x.id === codex.id).alive);
  await invoke('mode', 'hud');
  await new Promise(resolve => setTimeout(resolve, 1500));
  await app.evaluate(({ app }) => app.getAppMetrics());
  await new Promise(resolve => setTimeout(resolve, 5000));
  const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map(x => ({ type: x.type, cpuPercent: x.cpu.percentCPUUsage, privateKB: x.memory.privateBytes, workingSetKB: x.memory.workingSetSize })));
  const report = { at: new Date().toISOString(), codexCliLaunch: true, accountLimits: initial.limits.map(x => ({ provider: x.provider, windows: x.windows })), capabilities: initial.capabilities, metrics, note: 'Five-second idle HUD sample after one Codex console was opened and closed. Electron processes only; excludes Codex account-service child. No inference requests made.' };
  fs.writeFileSync(path.join(artifacts, 'live-check-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close().catch(() => {}); }
});
