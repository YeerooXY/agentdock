'use strict';

// Isolated nine-console Electron fixture. The measured process tree is this
// synthetic app only; no active Paddock process or model CLI is contacted.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.PADDOCK_CPU_OUT || path.join(root, '.build/codex-prompt-runs/2026-10-24/4/verification/cpu-bench'));
const fixtureDir = path.join(out, 'electron-fixture');
const metricsPath = path.join(out, 'electron-metrics.json');
const readyPath = path.join(out, 'control-ready.json');
const electronPath = require('electron');
const phaseSeconds = Math.max(2, Number(process.env.PADDOCK_CPU_BENCH_SECONDS) || 12);
const phases = [
  { id: 'idle-ambient-on', seconds: phaseSeconds },
  { id: 'active-effects', seconds: phaseSeconds },
  { id: 'disabled', seconds: phaseSeconds },
  { id: 'hidden', seconds: phaseSeconds },
];
const themes = ['fiery', 'icy', 'blue', 'redline', 'hot-pink', 'cyber', 'void', 'gamer', 'violet'];
function hashDist() {
  const files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); entry.isDirectory() ? walk(file) : files.push(file); } }
  walk(path.join(root, 'dist'));
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) { hash.update(path.relative(path.join(root, 'dist'), file)); hash.update(fs.readFileSync(file)); }
  return hash.digest('hex');
}

function writeFixtureFiles() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const main = String.raw`
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { session } = require('electron');
const root = '__ROOT__';
const dist = path.join(root, 'dist');
const out = '__OUT__';
const readyFile = '__READY__';
const themes = ${JSON.stringify(themes)};
const { initialSettings } = require(path.join(root, 'electron/settings.cjs'));
app.setName('Paddock appearance CPU fixture');
fs.mkdirSync(path.join(out, 'electron-profile'), { recursive: true });
app.setPath('userData', path.join(out, 'electron-profile'));
const now = Date.now();
const settings = initialSettings({ setupComplete: true, suggestProjects: false }, root, {});
Object.assign(settings, {
  trimStyle: 'classic', slotTrims: Object.fromEntries(themes.map((theme, i) => [i + 1, theme])),
  launchEffect: true, ambientMotion: true, starDensity: 2, lighting: 'static',
  lightingSpeed: 'normal', themeTextures: true, sidebarCollapsed: false,
  grid: { columns: 3, rows: 3 },
});
let state = {
  mode: 'dashboard', grid: { columns: 3, rows: 3 }, settings,
  sessions: themes.map((theme, i) => ({
    id: 'bench-' + (i + 1), consoleKey: 'bench-' + (i + 1), projectId: null,
    slot: i + 1, width: 1, height: 1, name: theme + ' fixture', nameMode: 'custom',
    cwd: root, provider: 'shell', permissions: 'system', launchModel: '',
    state: 'active', alive: true, cols: 80, rows: 24, createdAt: now,
    updatedAt: now, sequence: 0, usage: null, providerSessionId: null,
  })),
  agents: [], projects: [], shared: { connections: [], instructions: '', profiles: [] },
  vault: { available: false, entries: [] }, limits: [], recent: [], messages: [],
  ledger: [], summary: { requests: 0, tokens: 0, cost: 0, unpriced: 0, unknownUsage: 0 },
  capabilities: { codex: false, claude: false, node: true, shell: true }, version: 'synthetic-effects-cpu-fixture',
};
let currentPhase = 'warmup', win, metricsTimer, previous = new Map(), lastSampleNs = null, sampleTail = Promise.resolve(), sampleFailure = null, localOrigin = '';
const samples = [], rendererErrors = [], externalRequests = [];
ipcMain.handle('dock:call', async (_event, method) => {
  if (method === 'state') return { ok: true, value: state };
  if (method === 'session.buffer') return { ok: true, value: { data: 'Synthetic benchmark console ready', sequence: 0 } };
  return { ok: true, value: [] };
});
function sendState() { if (win && !win.isDestroyed()) win.webContents.send('dock:state', structuredClone(state)); }
function json(res, value) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); }
function readBody(req) { return new Promise((resolve, reject) => { let body = ''; req.setEncoding('utf8'); req.on('data', part => body += part); req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); } }); req.on('error', reject); }); }
function mime(file) {
  return ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff':'font/woff', '.woff2':'font/woff2' })[path.extname(file)] || 'application/octet-stream';
}
async function sampleMetrics(phase = currentPhase) {
  const nowNs = process.hrtime.bigint();
  const elapsedSeconds = lastSampleNs ? Number(nowNs - lastSampleNs) / 1e9 : null;
  lastSampleNs = nowNs;
  const processes = app.getAppMetrics().map(metric => {
    const key = metric.pid + ':' + metric.creationTime;
    const cpuTime = metric.cpu?.cumulativeCPUUsage;
    const before = previous.get(key);
    previous.set(key, cpuTime);
    return {
      pid: metric.pid, creationTime: metric.creationTime, type: metric.type,
      name: metric.name || null, serviceName: metric.serviceName || null,
      cumulativeCPUUsageSeconds: Number.isFinite(cpuTime) ? cpuTime : null,
      cpuTimeSecondsDelta: Number.isFinite(cpuTime) && Number.isFinite(before) ? Math.max(0, cpuTime - before) : null,
    };
  });
  const renderer = win && !win.isDestroyed() ? await win.webContents.executeJavaScript('(()=>{const cards=[...document.querySelectorAll(".session-grid .session-card[data-console-id]")],terms=document.querySelectorAll(".session-grid .terminal-instance .xterm"),skies=[...document.querySelectorAll(".session-grid canvas.panel-sky")],prior=window.__benchSkyDrawCounts||[],counts=skies.map(canvas=>Number(canvas.__benchDrawCount||0));let movingSkies=0,skyDrawCalls=0;for(let i=0;i<counts.length;i++){if(prior.length===counts.length){const delta=Math.max(0,counts[i]-prior[i]);if(delta>0)movingSkies++;skyDrawCalls+=delta}}window.__benchSkyDrawCounts=counts;const stateEffects=[...document.querySelectorAll("canvas.console-state-effect")],openings=[...document.querySelectorAll("canvas.launch-burst")],sumDraws=nodes=>nodes.reduce((sum,canvas)=>sum+Number(canvas.__benchDrawCount||0),0);return{visibilityState:document.visibilityState,cardCount:cards.length,xtermCount:terms.length,skyCanvasCount:skies.length,visibleSkyCount:skies.filter(canvas=>{const r=canvas.getBoundingClientRect(),s=getComputedStyle(canvas);return r.width&&r.height&&s.display!=="none"&&s.opacity!=="0"&&s.visibility!=="hidden"}).length,movingSkyCount:movingSkies,skyDrawCalls,stateEffectCanvasCount:stateEffects.length,stateEffectFrameCalls:sumDraws(stateEffects),openingCanvasCount:openings.length,openingFrameCalls:sumDraws(openings),ambient:document.body.dataset.ambient,openingMotion:document.body.dataset.openingMotion,stars:document.body.dataset.stars}})()') : null;
  samples.push({ at: new Date().toISOString(), elapsedSeconds, phase, windowVisible: !!win && !win.isDestroyed() && win.isVisible(), renderer, processes });
}
function queueSample(phase = currentPhase) {
  sampleTail = sampleTail.then(() => sampleMetrics(phase)).catch(error => { sampleFailure = error.stack || error.message; });
  return sampleTail;
}
async function transitionPhase(nextPhase) {
  if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; await sampleTail; await sampleMetrics(currentPhase); }
  currentPhase = 'warmup';
  await sampleMetrics('warmup');
  if (nextPhase !== 'warmup') {
    currentPhase = nextPhase;
    metricsTimer = setInterval(() => { queueSample(currentPhase); }, 1000);
  }
}
async function start() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/__bench/')) {
      try {
        if (req.method === 'GET' && url.pathname === '/__bench/status') {
          const renderer = !!win && !win.isDestroyed() ? await win.webContents.executeJavaScript('(()=>({visibilityState:document.visibilityState,cardCount:document.querySelectorAll(".session-grid .session-card[data-console-id]").length,xtermCount:document.querySelectorAll(".session-grid .terminal-instance .xterm").length,skyCanvasCount:document.querySelectorAll(".session-grid canvas.panel-sky").length,visibleSkyCount:[...document.querySelectorAll(".session-grid canvas.panel-sky")].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width&&r.height&&s.opacity!=="0"&&s.visibility!=="hidden"}).length,ambient:document.body.dataset.ambient,stars:document.body.dataset.stars}))()') : null;
          return json(res, { ready: !!win && !win.isDestroyed() && win.webContents.isLoading() === false && renderer?.cardCount === 9 && renderer?.xtermCount === 9, phase: currentPhase, windowVisible: !!win && !win.isDestroyed() && win.isVisible(), renderer, rendererErrors, externalRequests, sampleFailure });
        }
        if (req.method === 'POST' && url.pathname === '/__bench/phase') { await transitionPhase((await readBody(req)).phase); return json(res, { ok: true }); }
        if (req.method === 'POST' && url.pathname === '/__bench/state') {
          const body = await readBody(req); const changes = body.states || {};
          state = { ...state, sessions: state.sessions.map(session => ({ ...session, state: changes[session.id] || session.state })) };
          sendState(); return json(res, { ok: true });
        }
        if (req.method === 'POST' && url.pathname === '/__bench/settings') { state = { ...state, settings: { ...state.settings, ...(await readBody(req)) } }; sendState(); return json(res, { ok: true }); }
        if (req.method === 'POST' && url.pathname === '/__bench/window') {
          const body = await readBody(req); if (body.visible) win.showInactive(); else win.hide();
          await new Promise(resolve => setTimeout(resolve, 150));
          return json(res, { ok: true, windowVisible: win.isVisible(), visibilityState: await win.webContents.executeJavaScript('document.visibilityState') });
        }
        if (req.method === 'POST' && url.pathname === '/__bench/finish') {
          await transitionPhase('warmup');
          res.writeHead(200, { 'content-type':'application/json' }); res.end(JSON.stringify({ ok: true }));
          fs.writeFileSync(path.join(out, 'electron-metrics.json'), JSON.stringify({
            electronVersion: process.versions.electron, platform: process.platform,
            logicalProcessors: require('node:os').cpus().length,
            metricSource: 'app.getAppMetrics(); cumulativeCPUUsage seconds deltas keyed by PID plus creationTime; first sample establishes baseline',
            phaseDurationsRequestedSeconds: ${JSON.stringify(Object.fromEntries(phases.map(phase => [phase.id, phase.seconds])))},
            samples, rendererErrors, externalRequests, sampleFailure,
          }, null, 2));
          setTimeout(() => app.quit(), 250); return;
        }
        res.writeHead(404); res.end();
      } catch (error) { res.writeHead(500); res.end(error.message); }
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(dist, pathname === '/' ? 'index.html' : '.' + pathname);
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  localOrigin = 'http://127.0.0.1:' + port;
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (details.url.startsWith(localOrigin)) callback({});
    else { externalRequests.push(details.url); callback({ cancel: true }); }
  });
  win = new BrowserWindow({
    width: 1180, height: 780, show: false, title: 'Paddock effects CPU fixture',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.on('closed', () => server.close());
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) rendererErrors.push(message); });
  win.webContents.on('render-process-gone', (_event, details) => rendererErrors.push('Renderer exited: ' + JSON.stringify(details)));
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => { if (isMainFrame && code !== -3) rendererErrors.push('Load failed ' + code + ' ' + description + ': ' + validatedURL); });
  await win.loadURL(localOrigin + '/');
  const pageReadyDeadline = Date.now() + 20000;
  while (Date.now() < pageReadyDeadline) {
    const renderer = await win.webContents.executeJavaScript("({cards:document.querySelectorAll('.session-grid .session-card[data-console-id]').length,xterms:document.querySelectorAll('.session-grid .terminal-instance .xterm').length,skies:document.querySelectorAll('.session-grid canvas.panel-sky').length})");
    if (renderer.cards === 9 && renderer.xterms === 9 && renderer.skies === 9) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // On Windows, a never-shown BrowserWindow can keep its initial document
  // visibility flag. Establish an actual native visible/hidden transition
  // without ever taking keyboard focus before the hidden preflight.
  win.showInactive();
  await new Promise(resolve => setTimeout(resolve, 150));
  win.hide();
  await new Promise(resolve => setTimeout(resolve, 150));
  const renderer = await win.webContents.executeJavaScript("({visibilityState:document.visibilityState,cards:document.querySelectorAll('.session-grid .session-card[data-console-id]').length,xterms:document.querySelectorAll('.session-grid .terminal-instance .xterm').length,skies:document.querySelectorAll('.session-grid canvas.panel-sky').length})");
  if (renderer.cards !== 9 || renderer.xterms !== 9 || renderer.skies !== 9) throw new Error('Renderer mount check failed: ' + JSON.stringify(renderer));
  if (rendererErrors.length || externalRequests.length) throw new Error('Renderer preflight failed: ' + JSON.stringify({ rendererErrors, externalRequests }));
  await win.webContents.executeJavaScript('(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){const context=original.call(this,type,options);if(type==="2d"&&context&&!context.__benchWrapped){context.__benchWrapped=true;const clear=context.clearRect;context.clearRect=function(...args){this.canvas.__benchDrawCount=(this.canvas.__benchDrawCount||0)+1;return clear.apply(this,args)}}return context};for(const canvas of document.querySelectorAll("canvas"))canvas.getContext("2d");return true})()');
  fs.writeFileSync(readyFile, JSON.stringify({ port, pid: process.pid, electronVersion: process.versions.electron, renderer }));
}
app.whenReady().then(start).catch(error => { fs.writeFileSync(path.join(out, 'electron-error.log'), error.stack || error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
`;
  const preload = String.raw`
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dock', {
  call: (method, payload) => ipcRenderer.invoke('dock:call', method, payload),
  onState: callback => ipcRenderer.on('dock:state', (_event, state) => callback(state)),
  onOutput: callback => ipcRenderer.on('dock:output', (_event, output) => callback(output)),
  onSelect: () => {}, onNotice: () => {},
});
ipcRenderer.on('unused', () => {});
`;
  const mainPath = path.join(fixtureDir, 'main.cjs');
  const preloadPath = path.join(fixtureDir, 'preload.cjs');
  const packagePath = path.join(fixtureDir, 'package.json');
  fs.writeFileSync(mainPath, main.replaceAll('__ROOT__', root.replaceAll('\\', '\\\\')).replaceAll('__OUT__', out.replaceAll('\\', '\\\\')).replaceAll('__READY__', readyPath.replaceAll('\\', '\\\\')));
  fs.writeFileSync(preloadPath, preload);
  fs.writeFileSync(packagePath, JSON.stringify({ name: 'paddock-appearance-cpu-fixture', version: '1.0.0', main: 'main.cjs' }, null, 2));
}

function sessionState(statusByTheme) {
  return Object.fromEntries(themes.map((theme, i) => ['bench-' + (i + 1), statusByTheme(theme)]));
}
function summarize(raw) {
  const summaries = {};
  for (const phase of phases) {
    const rows = raw.samples.filter(sample => sample.phase === phase.id && sample.elapsedSeconds > 0);
    const valid = rows.map(sample => {
      const processes = sample.processes.filter(process => process.cpuTimeSecondsDelta !== null);
      const cpuSeconds = processes.reduce((sum, process) => sum + process.cpuTimeSecondsDelta, 0);
      return { sample, cpuSeconds, cores: cpuSeconds / sample.elapsedSeconds, processes };
    });
    const totalElapsed = valid.reduce((sum, row) => sum + row.sample.elapsedSeconds, 0);
    const totalCpuSeconds = valid.reduce((sum, row) => sum + row.cpuSeconds, 0);
    const sorted = valid.map(row => row.cores).sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)] : null;
    const byType = {};
    const identities = new Map();
    for (const row of valid) for (const proc of row.processes) {
      const key = proc.pid + ':' + proc.creationTime;
      identities.set(key, { pid: proc.pid, creationTime: proc.creationTime, type: proc.type, name: proc.name, serviceName: proc.serviceName });
      const type = proc.type || 'unknown';
      byType[type] = (byType[type] || 0) + proc.cpuTimeSecondsDelta;
    }
    summaries[phase.id] = {
      sampleCount: valid.length,
      observedElapsedSeconds: Number(totalElapsed.toFixed(3)),
      processCPUTimeSeconds: Number(totalCpuSeconds.toFixed(4)),
      averageCoreEquivalents: totalElapsed ? Number((totalCpuSeconds / totalElapsed).toFixed(5)) : null,
      logicalProcessorCapacityPercent: totalElapsed ? Number((totalCpuSeconds / totalElapsed / raw.logicalProcessors * 100).toFixed(4)) : null,
      p95PerIntervalCoreEquivalents: p95 === null ? null : Number(p95.toFixed(5)),
      processCPUSecondsByType: Object.fromEntries(Object.entries(byType).map(([type, seconds]) => [type, Number(seconds.toFixed(4))])),
      processIdentities: [...identities.values()],
      windowVisible: rows.every(row => row.windowVisible),
      rendererVisibilityStates: [...new Set(rows.map(row => row.renderer?.visibilityState || 'missing'))],
      rendererCardCounts: [...new Set(rows.map(row => row.renderer?.cardCount ?? null))],
      rendererXtermCounts: [...new Set(rows.map(row => row.renderer?.xtermCount ?? null))],
      skyCanvasCount: rows.length ? Math.min(...rows.map(row => row.renderer?.skyCanvasCount ?? 0)) : 0,
      visibleSkyCount: rows.length ? Math.min(...rows.map(row => row.renderer?.visibleSkyCount ?? 0)) : 0,
      movingSkyFrames: rows.reduce((sum, row) => sum + (row.renderer?.movingSkyCount || 0), 0),
      skyDrawCalls: rows.reduce((sum, row) => sum + (row.renderer?.skyDrawCalls || 0), 0),
      stateEffectCanvasSamples: rows.reduce((sum, row) => sum + (row.renderer?.stateEffectCanvasCount || 0), 0),
      stateEffectFrameCalls: rows.reduce((sum, row) => sum + (row.renderer?.stateEffectFrameCalls || 0), 0),
      openingFrameCalls: rows.reduce((sum, row) => sum + (row.renderer?.openingFrameCalls || 0), 0),
    };
  }
  return summaries;
}

async function request(base, route, body) {
  const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(route + ' returned ' + response.status + ': ' + await response.text());
  return response.json();
}
async function waitForReady() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (fs.existsSync(readyPath)) {
      const info = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
      const base = 'http://127.0.0.1:' + info.port;
      const status = await request(base, '/__bench/status').catch(() => null);
      if (status?.ready) return { info, base };
    }
    await delay(250);
  }
  throw new Error('Isolated Electron fixture did not become ready');
}

(async () => {
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build the renderer before measuring CPU.');
  if (!fs.existsSync(electronPath)) throw new Error('Local Electron executable is unavailable.');
  fs.mkdirSync(out, { recursive: true });
  for (const file of [metricsPath, readyPath]) if (fs.existsSync(file)) fs.unlinkSync(file);
  writeFixtureFiles();
  const generatedMainPath = path.join(fixtureDir, 'main.cjs');
  new (require('node:vm').Script)(fs.readFileSync(generatedMainPath, 'utf8'), { filename: generatedMainPath });
  const envNames = ['SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'ComSpec'];
  const env = Object.fromEntries(envNames.filter(name => process.env[name]).map(name => [name, process.env[name]]));
  env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  const stdout = fs.createWriteStream(path.join(out, 'electron.stdout.log'));
  const stderr = fs.createWriteStream(path.join(out, 'electron.stderr.log'));
  const child = spawn(electronPath, [fixtureDir], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(stdout); child.stderr.pipe(stderr);
  let exited = false;
  child.once('exit', () => { exited = true; });
  let control;
  try {
    control = await waitForReady();
    const { base } = control;
    const preflight = await request(base, '/__bench/status');
    // Electron's initially hidden windows report a visible page by default.
    // This is unmeasured warmup; the later explicit win.hide() phase must
    // report both a hidden page and a hidden window.
    if (!preflight.ready || preflight.windowVisible || preflight.renderer.cardCount !== 9 || preflight.renderer.xtermCount !== 9 || preflight.renderer.skyCanvasCount !== 9) throw new Error(`Initial-window mount preflight failed: ${JSON.stringify(preflight)}`);
    const shown = await request(base, '/__bench/window', { visible: true });
    if (!shown.windowVisible || shown.visibilityState !== 'visible') throw new Error(`showInactive did not produce a visible renderer: ${JSON.stringify(shown)}`);
    await delay(2500); // settle app startup; this is outside the measured phases
    await request(base, '/__bench/phase', { phase: 'idle-ambient-on' });
    await delay(phases[0].seconds * 1000);

    await request(base, '/__bench/phase', { phase: 'active-effects' });
    const activeStart = Date.now();
    const activeEnd = activeStart + phases[1].seconds * 1000;
    for (let cycle = 0; cycle < 3 && Date.now() + 2000 < activeEnd; cycle++) {
      await request(base, '/__bench/state', { states: sessionState(() => 'error') });
      await delay(600);
      await request(base, '/__bench/state', { states: sessionState(() => 'active') });
      await delay(150);
      await request(base, '/__bench/state', { states: sessionState(theme => ['blue', 'hot-pink', 'icy'].includes(theme) ? 'ready' : 'error') });
      await delay(600);
      await request(base, '/__bench/state', { states: sessionState(() => 'active') });
      const nextCycleAt = activeStart + (cycle + 1) * phases[1].seconds * 1000 / 3;
      if (Date.now() < nextCycleAt) await delay(nextCycleAt - Date.now());
    }
    if (Date.now() < activeEnd) await delay(activeEnd - Date.now());

    await request(base, '/__bench/phase', { phase: 'warmup' });
    await request(base, '/__bench/settings', { launchEffect: false, ambientMotion: false, starDensity: 0 });
    await delay(1200); // the setting transition settles in the unmeasured phase
    await request(base, '/__bench/phase', { phase: 'disabled' });
    const disabledEnd = Date.now() + phases[2].seconds * 1000;
    if (Date.now() < disabledEnd) await delay(disabledEnd - Date.now());

    await request(base, '/__bench/phase', { phase: 'warmup' });
    await request(base, '/__bench/settings', { launchEffect: true, ambientMotion: true, starDensity: 2 });
    await delay(1000);
    const shownAgain = await request(base, '/__bench/window', { visible: true });
    if (!shownAgain.windowVisible || shownAgain.visibilityState !== 'visible') throw new Error(`Fixture did not become visible before hidden comparison: ${JSON.stringify(shownAgain)}`);
    await delay(1200);
    const hidden = await request(base, '/__bench/window', { visible: false });
    if (hidden.windowVisible || hidden.visibilityState !== 'hidden') throw new Error(`Hidden comparison did not suppress renderer activity: ${JSON.stringify(hidden)}`);
    await delay(500);
    await request(base, '/__bench/phase', { phase: 'hidden' });
    await delay(phases[3].seconds * 1000);
    await request(base, '/__bench/finish', {});
    const deadline = Date.now() + 15000;
    while (!exited && Date.now() < deadline) await delay(100);
    if (!exited) throw new Error('Isolated Electron fixture did not quit after its measurement.');
    if (!fs.existsSync(metricsPath)) throw new Error('Electron did not write its process metrics.');
    const raw = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    const result = {
      date: new Date().toISOString(),
      method: 'Isolated local Electron fixture loads the stable dist renderer with nine synthetic shell sessions. Electron app.getAppMetrics() is sampled once per second; cumulativeCPUUsage deltas in CPU-seconds are keyed by PID and creationTime, divided by actual elapsed seconds. First sample establishes the baseline. No user Paddock process is sampled or stopped.',
      intervalSeconds: 1,
      platform: raw.platform,
      electronVersion: raw.electronVersion,
      rendererDistSha256: hashDist(),
      logicalProcessors: raw.logicalProcessors,
      normalization: 'Average core equivalents are total app-process CPU seconds divided by elapsed seconds. Logical processor capacity percent divides that by OS-reported logical processor count; it is a normalization, not Electron percentCPUUsage.',
      processScope: 'Every app.getAppMetrics() process associated with the isolated Electron fixture, including main, renderer, GPU and utility processes when present. PID and creationTime identify each process; process types are listed per phase.',
      frameTime: 'Not measured; CPU process metrics are not browser frame-time or whole-system CPU.',
      scenario: 'Nine live synthetic shell consoles with nine mounted xterm instances and nine sky canvases in a 3x3 grid, ambient particle density Some. Redline intentionally hides its panel sky, so eight skies are expected to be visible and moving. A fixture-only clearRect counter records actual canvas draw activity without reading pixels. Active-effects repeats bounded Ready/Error reactions across all nine panels three times; it measures state reactions, not console openings or terminal output. Disabled turns Console animations and Ambient motion off and sets star density Off, then settles during warmup before timing. Hidden hides only the isolated fixture window after a visible settle. The fixture starts hidden and uses showInactive() so it does not take keyboard focus.',
      requestedPhaseSeconds: Object.fromEntries(phases.map(phase => [phase.id, phase.seconds])),
      summaries: summarize(raw),
      rawMetrics: raw,
    };
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(result, null, 2));
    const activity = result.summaries;
    const idleRows = raw.samples.filter(sample => sample.phase === 'idle-ambient-on' && sample.elapsedSeconds > 0);
    const activeRows = raw.samples.filter(sample => sample.phase === 'active-effects' && sample.elapsedSeconds > 0);
    const disabledRows = raw.samples.filter(sample => sample.phase === 'disabled' && sample.elapsedSeconds > 0);
    const hiddenRows = raw.samples.filter(sample => sample.phase === 'hidden' && sample.elapsedSeconds > 0);
    if (raw.rendererErrors.length || raw.externalRequests.length || raw.sampleFailure) throw new Error(`Renderer or sampler errors: ${JSON.stringify({ rendererErrors: raw.rendererErrors, externalRequests: raw.externalRequests, sampleFailure: raw.sampleFailure })}`);
    if (!idleRows.every(sample => sample.renderer?.visibilityState === 'visible' && sample.windowVisible && sample.renderer.cardCount === 9 && sample.renderer.xtermCount === 9 && sample.renderer.skyCanvasCount === 9 && sample.renderer.visibleSkyCount === 8) || !idleRows.some(sample => sample.renderer.movingSkyCount > 0 && sample.renderer.skyDrawCalls > 0)) throw new Error('Idle phase did not show nine mounted consoles with eight visible skies in a visible renderer.');
    if (!activeRows.some(sample => sample.renderer.stateEffectCanvasCount > 0 && sample.renderer.stateEffectFrameCalls > 0)) throw new Error('Active phase did not capture painted state reactions.');
    if (!disabledRows.every(sample => sample.renderer?.visibilityState === 'visible' && sample.windowVisible && sample.renderer.ambient === 'off' && sample.renderer.stars === 'off' && sample.renderer.movingSkyCount === 0 && sample.renderer.stateEffectCanvasCount === 0)) throw new Error('Disabled phase still had decorative motion or state effects.');
    if (!hiddenRows.every(sample => sample.renderer?.visibilityState === 'hidden' && !sample.windowVisible)) throw new Error('Hidden phase retained a visible window or renderer.');
    if (Object.values(activity).some(phase => phase.sampleCount < 2)) throw new Error('A measured phase had fewer than two CPU samples.');
    console.log(JSON.stringify({ output: path.join(out, 'summary.json'), phases: result.summaries }, null, 2));
  } catch (error) {
    if (!exited) child.kill();
    throw error;
  } finally {
    stdout.end(); stderr.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
