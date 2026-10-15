'use strict';
const { _electron: electron } = require('playwright');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { checkFirstRun } = require('./first-run-check.cjs');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
fs.mkdirSync(parent, { recursive: true });
const work = fs.mkdtempSync(path.join(parent, 'Installed Dock '));
const dataDir = path.join(work, 'profile'); fs.mkdirSync(dataDir);
const suppliedApp = process.argv.find(arg => arg.startsWith('--app='))?.slice(6);
const install = suppliedApp ? path.dirname(path.resolve(suppliedApp)) : path.join(work, 'Program Files', 'Agent Dock');
const executablePath = suppliedApp ? path.resolve(suppliedApp) : path.join(install, 'Agent Dock.exe');
const systemRoot = process.env.SystemRoot || 'C:\\Windows';
// Exclude developer runtimes and npm from PATH, as on a computer without Node.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['path', 'userprofile', 'home', 'appdata', 'localappdata', 'electron_run_as_node', 'node_options'].includes(key.toLowerCase())));
Object.assign(env, { PATH: `${systemRoot}\\System32;${systemRoot}\\System32\\WindowsPowerShell\\v1.0`, USERPROFILE: work, APPDATA: path.join(work, 'Roaming'), LOCALAPPDATA: path.join(work, 'Local') });
let app, client, server;
async function eventually(predicate) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timed out waiting for the packaged app');
}
(async () => {
  if (!suppliedApp) fs.cpSync(path.join(root, 'release', 'win-unpacked'), install, { recursive: true });
  assert.notEqual(spawnSync(path.join(systemRoot, 'System32', 'where.exe'), ['node'], { env, windowsHide: true }).status, 0, 'No system Node is available to the test app');
  const packaged = require('@electron/asar').listPackage(path.join(install, 'resources', 'app.asar')).map(file => file.replaceAll('\\', '/'));
  const allowed = new Set(['assets', 'dist', 'electron', 'node_modules', 'package.json']);
  assert.ok(packaged.every(file => allowed.has(file.split('/').filter(Boolean)[0])), 'Only allowlisted app files and production dependencies are packaged');
  assert.ok(!packaged.some(file => /\/(vault|workspace|settings|ledger)\.json$/.test(file) || /\/(test-data|artifacts|\.git)(\/|$)/.test(file)), 'No user data or development artifacts');
  const runtime = path.join(install, 'resources', 'runtime'), node = path.join(runtime, 'node.exe');
  assert.deepEqual(fs.readdirSync(runtime).sort(), ['agent-event.cjs', 'agent-tools.cjs', 'node.exe', 'NODE-LICENSE.txt', 'THIRD-PARTY-NOTICES.txt', 'runtime.json'].sort());
  assert.equal(execFileSync(node, ['--version'], { env, windowsHide: true, encoding: 'utf8' }).trim(), 'v24.19.0');
  const problems = [];
  const launch = async () => {
    app = await electron.launch({ executablePath, args: ['--smoke-test', `--data-dir=${dataDir}`], env, timeout: 30000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => problems.push(error.message));
    await page.waitForSelector('.session-grid'); return page;
  };
  let page = await launch();
  const invoke = (method, payload) => page.evaluate(async ([m, p]) => {
    const result = await window.dock.call(m, p); if (!result.ok) throw new Error(result.error); return result.value;
  }, [method, payload]);
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  const artifacts = path.join(root, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const folder = await checkFirstRun({ app, page, invoke, dataDir, screenshot: path.join(artifacts, 'test-packaged-setup.png') });
  await page.locator('.session-card[data-slot="1"] [data-action=new]').click();
  await eventually(async () => (await invoke('state')).sessions.some(item => item.alive));
  const session = (await invoke('state')).sessions.find(item => item.alive);
  assert.equal(session.cwd, folder); assert.equal(session.provider, 'shell');
  await invoke('session.input', { id: session.id, data: "Write-Output ('BUNDLED_' + 'TERMINAL_OK'); (Get-Location).Path\r" });
  await eventually(async () => (await invoke('session.buffer', session.id)).data.includes('BUNDLED_TERMINAL_OK'));
  await page.screenshot({ path: path.join(artifacts, 'test-packaged-console.png') });

  const hookSession = crypto.randomUUID();
  execFileSync(node, [path.join(runtime, 'agent-event.cjs'), 'codex-notify', JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 'bundled-hook-check' })], {
    env: { ...env, AGENT_DOCK_DATA_DIR: dataDir, AGENT_DOCK_SESSION_ID: hookSession }, windowsHide: true, timeout: 15000
  });
  const hook = JSON.parse(fs.readFileSync(path.join(dataDir, 'events', `${hookSession}.state.json`), 'utf8'));
  assert.equal(hook.state, 'ready'); assert.equal(hook.providerSessionId, 'bundled-hook-check');

  const token = crypto.randomUUID();
  server = http.createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401); response.end(); return; }
    request.resume(); response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ content: [{ type: 'text', text: 'PACKAGED_CONTEXT_OK' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  client = new Client({ name: 'packaged-smoke', version: '1.0' });
  await client.connect(new StdioClientTransport({ command: node, args: [path.join(runtime, 'agent-tools.cjs')], env: { ...env, AGENT_DOCK_BRIDGE_URL: `http://127.0.0.1:${server.address().port}`, AGENT_DOCK_BRIDGE_TOKEN: token } }));
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'dock_context'));
  assert.equal((await client.callTool({ name: 'dock_context', arguments: {} })).content[0].text, 'PACKAGED_CONTEXT_OK');
  await client.close(); client = null;

  await app.close(); page = await launch();
  assert.equal(await page.locator('#first-run').evaluate(el => el.open), false);
  const restored = (await invoke('state')).sessions.find(item => item.alive);
  assert.equal(restored.cwd, folder); assert.equal(restored.slot, 1); assert.notEqual(restored.id, session.id);
  await invoke('session.input', { id: restored.id, data: "Write-Output ('RESTORED_' + 'PACKAGE_OK')\r" });
  await eventually(async () => (await invoke('session.buffer', restored.id)).data.includes('RESTORED_PACKAGE_OK'));
  assert.deepEqual(problems, []);
  console.log('PASS: packaged first-run setup, real terminal in the chosen folder, bundled Node, completion callback, MCP bridge, and restart/restore. No system Node or paid model requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (client) await client.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  if (app) await app.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(work)), fs.realpathSync(parent));
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});
