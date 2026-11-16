'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const sharp = require('sharp');
const { slicesFromLegacy } = require('../projections.cjs');

const KINDS = new Set(['page', 'component', 'state']);
const STEP_KEYS = new Set(['click', 'hover', 'fill', 'press', 'wait']);
const PROFILE_NAMES = new Set(['desktop', 'pc-chromium', 'mac-webkit', 'android', 'iphone']);
const MAX_VISIBLE_TEXT = 4000;

function normalizeVisibleText(text, maxChars = MAX_VISIBLE_TEXT) {
  return String(text ?? '').trim().slice(0, maxChars);
}
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

function normalizePath(file) {
  return String(file || '').replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function validateStep(step, targetId, index) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error(`Target "${targetId}" step ${index + 1} must be an object.`);
  const keys = Object.keys(step).filter(key => STEP_KEYS.has(key));
  if (keys.length !== 1) throw new Error(`Target "${targetId}" step ${index + 1} must specify one action (${[...STEP_KEYS].join(', ')}).`);
  const action = keys[0];
  if (action === 'wait') {
    if (typeof step.wait !== 'number' && (typeof step.wait !== 'string' || !step.wait.trim())) {
      throw new Error(`Target "${targetId}" step ${index + 1} wait must be milliseconds or a selector.`);
    }
    return { wait: step.wait };
  }
  if (action === 'fill') {
    const selector = typeof step.fill === 'string' ? step.fill : step.fill?.selector || step.selector;
    const value = typeof step.fill === 'object' && step.fill !== null ? step.fill.value : step.value;
    if (typeof selector !== 'string' || !selector.trim() || typeof value !== 'string') {
      throw new Error(`Target "${targetId}" step ${index + 1} fill requires selector and string value.`);
    }
    return { fill: selector.trim(), value };
  }
  if (typeof step[action] !== 'string' || !step[action].trim()) {
    throw new Error(`Target "${targetId}" step ${index + 1} ${action} requires a non-empty string.`);
  }
  return { [action]: step[action].trim(), ...(step.selector ? { selector: String(step.selector) } : {}) };
}

function validateRegistry(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.targets) ? raw.targets : null;
  if (!list || !list.length) throw new Error('Screen targets registry must be a non-empty array.');
  const ids = new Set();
  return list.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Target at index ${index} must be an object.`);
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id)) throw new Error(`Invalid target id at index ${index}: "${item.id}".`);
    if (ids.has(id)) throw new Error(`Duplicate target id "${id}".`);
    ids.add(id);
    if (!KINDS.has(item.kind)) throw new Error(`Target "${id}" has invalid kind "${item.kind}".`);
    if (typeof item.group !== 'string' || !item.group.trim()) throw new Error(`Target "${id}" requires a group.`);
    const reach = item.reach || {};
    if (typeof reach !== 'object' || Array.isArray(reach)) throw new Error(`Target "${id}" reach must be an object.`);
    const url = reach.url === undefined ? '/' : String(reach.url).trim();
    if (!url) throw new Error(`Target "${id}" reach.url must not be empty.`);
    if (reach.steps !== undefined && !Array.isArray(reach.steps)) throw new Error(`Target "${id}" reach.steps must be an array.`);
    const steps = (reach.steps || []).map((step, i) => validateStep(step, id, i));
    if (item.selector !== undefined && item.selector !== null && (typeof item.selector !== 'string' || !item.selector.trim())) {
      throw new Error(`Target "${id}" selector must be a non-empty string when set.`);
    }
    if (!Array.isArray(item.sources) || !item.sources.length || item.sources.some(src => typeof src !== 'string' || !src.trim())) {
      throw new Error(`Target "${id}" requires a non-empty sources array.`);
    }
    const profiles = item.profiles === undefined ? ['desktop'] : item.profiles;
    if (!Array.isArray(profiles) || !profiles.length || profiles.some(p => !PROFILE_NAMES.has(p))) {
      throw new Error(`Target "${id}" has invalid profiles.`);
    }
    const alias = item.alias !== undefined ? Number(item.alias) : index + 1;
    if (!Number.isInteger(alias) || alias < 1) throw new Error(`Target "${id}" alias must be a positive integer.`);
    return {
      alias,
      id,
      kind: item.kind,
      group: item.group.trim(),
      reach: { url, steps },
      selector: item.selector ? item.selector.trim() : null,
      state: typeof item.state === 'string' && item.state.trim() ? item.state.trim() : 'default',
      fixture: typeof item.fixture === 'string' && item.fixture.trim() ? item.fixture.trim() : 'artifacts/console-layout/fixture.json',
      fullHeight: item.fullHeight === true,
      sources: item.sources.map(normalizePath),
      profiles: [...profiles]
    };
  });
}

function loadRegistry(projectDir) {
  const file = path.join(projectDir, '.paddock', 'screens', 'targets.json');
  return validateRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function selectTargets(registry, { targets = 'all', changedFiles = [] } = {}) {
  if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) return [...registry];
  if (targets === 'changed' || (Array.isArray(targets) && targets.length === 1 && targets[0] === 'changed')) {
    const changed = new Set((changedFiles || []).map(normalizePath).filter(Boolean));
    if (!changed.size) return [];
    return registry.filter(target => target.sources.some(src => changed.has(src)));
  }
  const requested = Array.isArray(targets) ? targets : [targets];
  const out = [], seen = new Set();
  for (const token of requested) {
    const key = String(token).trim();
    if (!key) continue;
    const match = registry.find(item => item.id === key || String(item.alias) === key);
    if (!match) throw new Error(`Unknown screen target "${key}".`);
    if (!seen.has(match.id)) { seen.add(match.id); out.push(match); }
  }
  return out;
}

async function diffImages(beforeInput, afterInput, { threshold = 0.001, channelDelta = 16 } = {}) {
  const [before, after] = await Promise.all([
    sharp(beforeInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(afterInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  if (before.info.width !== after.info.width || before.info.height !== after.info.height) {
    const total = Math.max(before.info.width * before.info.height, after.info.width * after.info.height, 1);
    return { changed: true, diffPixels: total, totalPixels: total, ratio: 1 };
  }
  const totalPixels = before.info.width * before.info.height;
  const a = before.data, b = after.data;
  let diffPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > channelDelta ||
      Math.abs(a[i + 1] - b[i + 1]) > channelDelta ||
      Math.abs(a[i + 2] - b[i + 2]) > channelDelta ||
      Math.abs(a[i + 3] - b[i + 3]) > channelDelta
    ) diffPixels++;
  }
  const ratio = totalPixels ? diffPixels / totalPixels : 0;
  return { changed: ratio > threshold, diffPixels, totalPixels, ratio };
}

function pruneHistory(historyTargetDir, keep = 3) {
  if (!fs.existsSync(historyTargetDir)) return [];
  const files = fs.readdirSync(historyTargetDir)
    .filter(name => name.endsWith('.webp'))
    .sort();
  while (files.length > keep) {
    const oldest = files.shift();
    fs.rmSync(path.join(historyTargetDir, oldest), { force: true });
    fs.rmSync(path.join(historyTargetDir, oldest.replace(/\.webp$/, '.txt')), { force: true });
  }
  return files;
}

async function storeCapture(screensDir, key, pngOrWebpBuffer, { timestamp = Date.now(), keep = 3, threshold = 0.001, text = '' } = {}) {
  const latestDir = path.join(screensDir, 'latest');
  const historyDir = path.join(screensDir, 'history', key);
  fs.mkdirSync(latestDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });
  const webpBuffer = await sharp(pngOrWebpBuffer).webp({ quality: 86 }).toBuffer();
  const visibleText = normalizeVisibleText(text);
  const latestFile = path.join(latestDir, `${key}.webp`);
  const latestTextFile = path.join(latestDir, `${key}.txt`);
  let changed = true;
  if (fs.existsSync(latestFile)) {
    const previous = fs.readFileSync(latestFile);
    const diff = await diffImages(previous, webpBuffer, { threshold });
    changed = diff.changed;
  }
  fs.writeFileSync(latestFile, webpBuffer);
  fs.writeFileSync(latestTextFile, visibleText, 'utf8');
  const stamp = String(timestamp).replace(/[^0-9A-Za-z_-]/g, '');
  const historyFile = path.join(historyDir, `${stamp}.webp`);
  const historyTextFile = path.join(historyDir, `${stamp}.txt`);
  fs.writeFileSync(historyFile, webpBuffer);
  fs.writeFileSync(historyTextFile, visibleText, 'utf8');
  pruneHistory(historyDir, keep);
  return { changed, latestFile, latestTextFile, historyFile, historyTextFile };
}

function resolveProfiles(runtime, profileNames = ['desktop']) {
  const devices = runtime.devices || {};
  const map = {
    desktop: { name: 'desktop', engine: 'chromium', options: { viewport: { width: 1440, height: 1000 } } },
    'pc-chromium': { name: 'pc-chromium', engine: 'chromium', options: { viewport: { width: 1440, height: 1000 } } },
    'mac-webkit': { name: 'mac-webkit', engine: 'webkit', options: { ...(devices['Desktop Safari'] || {}), viewport: { width: 1440, height: 1000 } } },
    android: { name: 'android', engine: 'chromium', options: devices['Pixel 7'] || { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
    iphone: { name: 'iphone', engine: 'webkit', options: devices['iPhone 13'] || { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  };
  return profileNames.map(name => {
    if (!map[name]) throw new Error(`Unknown capture profile "${name}".`);
    return map[name];
  });
}

function serveDist(distDir) {
  const root = path.resolve(distDir);
  const server = http.createServer((req, res) => {
    const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader('Content-Type', MIME_TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(r => server.close(r))
    }));
  });
}

async function installDockFixture(context, getState) {
  await context.exposeFunction('fixtureStateValues', raw => slicesFromLegacy(raw));
  await context.exposeFunction('fixtureCall', (method, payload) => {
    const state = getState();
    if (method === 'settings' && payload && typeof payload === 'object') Object.assign(state.settings, payload);
    if (method === 'state') return { ok: true, value: state };
    if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
    if (method === 'settings') return { ok: true, value: state.settings };
    if (method === 'tasks.candidates') return { ok: true, value: { accounts: state.accounts || [], implementers: [], reviewers: [] } };
    if (method === 'tasks.list') return { ok: true, value: state.tasks || [] };
    if (method === 'skills.refresh') return { ok: true, value: state.skills?.packs || [] };
    if (method === 'mobile.status' || method === 'mobile.check-firewall') return { ok: true, value: state.mobile };
    return { ok: true, value: [] };
  });
  await context.addInitScript(() => {
    let receive, slices = [], batch = 0, subscribed = false, pending = Promise.resolve();
    function publish(raw) {
      if (!subscribed) return;
      pending = pending.then(async () => {
        const values = await window.fixtureStateValues(raw);
        receive({
          type: 'changes', epoch: 'fixture', subscription: 'fixture', batch: ++batch,
          changes: slices.map(slice => ({ slice, kind: 'reset', rev: batch, value: values[slice] }))
        });
      });
      return pending;
    }
    window.fixtureStateTransport = {
      publish,
      async send(message) {
        if (message.type !== 'hello') return;
        slices = message.slices; batch = 0; subscribed = true;
        receive({ type: 'welcome', epoch: 'fixture', subscription: 'fixture', slices });
        const reply = await window.dock.call('state');
        if (!reply.ok) throw new Error(reply.error);
        await publish(reply.value);
      },
      onMessage(callback) { receive = callback; return () => { subscribed = false; }; }
    };
    window.fixtureState = window.fixtureReceive = window.fixtureStateListener = publish;
    window.dock = {
      call: (m, p) => window.fixtureCall(m, p),
      get state() { return window.fixtureStateTransport; },
      onOutput: () => {},
      onSelect: () => {},
      onNotice: () => {}
    };
  });
}

async function runSteps(page, steps) {
  for (const step of steps) {
    if (step.click) await page.locator(step.click).first().click();
    else if (step.hover) await page.locator(step.hover).first().hover();
    else if (step.fill) await page.locator(step.fill).first().fill(step.value);
    else if (step.press) {
      if (step.selector) await page.locator(step.selector).first().press(step.press);
      else await page.keyboard.press(step.press);
    } else if (step.wait !== undefined) {
      if (typeof step.wait === 'number') await page.waitForTimeout(step.wait);
      else await page.locator(step.wait).first().waitFor({ state: 'visible' });
    }
  }
}

function prepareFixtureState(base, target) {
  const state = structuredClone(base);
  state.mode = 'dashboard';
  state.platform = 'win32';
  Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false });
  if (!Array.isArray(state.projects) || !state.projects.length) {
    state.projects = [{
      id: 'proj-paddock',
      name: 'Paddock',
      category: 'Desktop app',
      color: '#8bd6b0',
      status: 'active',
      knowledgeMode: 'read',
      folders: [{ label: 'Desktop and Android app', path: 'C:\\Projects\\agent-dock' }]
    }];
  }
  if (!Array.isArray(state.tasks) || !state.tasks.length) {
    state.tasks = [{
      id: 'task-sample-1',
      projectId: 'proj-paddock',
      title: 'Visual review capture engine',
      state: 'building',
      workflow: 'current',
      branch: 'main',
      repo: 'C:\\Projects\\agent-dock',
      workFolder: 'C:\\Projects\\agent-dock',
      sourceRevision: 'f3fadec67553',
      criteria: 'Capture key screens and components headlessly and diff against latest.',
      implementer: { accountId: 'antigravity:default', provider: 'antigravity', label: 'Default Google Antigravity', model: 'Gemini 4 Argon' },
      reviewer: { accountId: 'codex:default', provider: 'codex', label: 'Default Codex', model: 'gpt-6.1-terra' },
      why: { implementer: 'Included visual quota.', reviewer: 'Configured default reviewer.' },
      checks: 'npm test',
      maxRounds: 2,
      timeLimitMinutes: 30,
      startedAt: 1793895700000,
      elapsedMs: 42000,
      unresolved: [],
      rounds: [{
        number: 1,
        elapsedMs: 42000,
        implement: { state: 'done', elapsedMs: 38000, label: 'Default Google Antigravity', model: 'Gemini 4 Argon', summary: 'Implemented screen capture engine and seeded targets.', changedFiles: ['electron/screens/capture.cjs'] },
        check: { state: 'passed', outcome: 'passed', exitCode: 0, elapsedMs: 4000, output: 'PASS all checks' }
      }],
      log: ['Starting round 1', 'Running checks']
    }];
  }
  if (target.state === 'connected-tools') {
    state.shared.connections = [{
      id: 'playwright',
      name: 'Playwright',
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp'],
      enabled: true,
      catalog: 'playwright',
      description: 'Open pages in a real browser, click, fill forms, read the page and take screenshots.',
      status: { ok: true, count: 14 }
    }];
  }
  return state;
}

async function capture(projectDir, options = {}) {
  const root = path.resolve(projectDir || path.join(__dirname, '..', '..'));
  const registry = options.registry ? validateRegistry(options.registry) : loadRegistry(root);
  const selected = selectTargets(registry, options);
  const screensDir = options.screensDir || path.join(root, '.paddock', 'screens');
  const result = { captured: [], changed: [], unchanged: [], failed: [] };
  if (!selected.length) return result;

  const runtime = options.runtime || require('playwright');
  const requestedProfiles = options.profiles?.length ? options.profiles : null;
  const distServer = await serveDist(options.distDir || path.join(root, 'dist'));
  const fixtureCache = new Map();
  const loadFixture = rel => {
    const file = path.resolve(root, rel);
    if (!fixtureCache.has(file)) fixtureCache.set(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    return fixtureCache.get(file);
  };

  const browsers = new Map();
  try {
    for (const target of selected) {
      const profileNames = requestedProfiles || target.profiles || ['desktop'];
      const profiles = resolveProfiles(runtime, profileNames);
      for (const profile of profiles) {
        const key = profileNames.length === 1 && profile.name === 'desktop' ? target.id : `${target.id}--${profile.name}`;
        let context;
        try {
          let browser = browsers.get(profile.engine);
          if (!browser) {
            browser = await runtime[profile.engine].launch({ headless: true });
            browsers.set(profile.engine, browser);
          }
          const baseViewport = profile.options.viewport || { width: 1440, height: 1000 };
          let currentState = prepareFixtureState(loadFixture(target.fixture), target);
          context = await browser.newContext({ ...profile.options, viewport: baseViewport });
          await installDockFixture(context, () => currentState);
          const page = await context.newPage();
          const targetUrl = /^https?:\/\//i.test(target.reach.url) ? target.reach.url : `${distServer.url}${target.reach.url.startsWith('/') ? '' : '/'}${target.reach.url}`;
          await page.goto(targetUrl, { waitUntil: 'load', timeout: 15000 });
          await page.addStyleTag({ content: '*,*::before,*::after { animation-duration:0s!important; animation-delay:0s!important; transition-duration:0s!important; transition-delay:0s!important; caret-color:transparent!important; }' });
          await runSteps(page, target.reach.steps);
          await page.evaluate(() => Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 500))]));
          if (target.fullHeight && profile.name === 'desktop') {
            const height = await page.evaluate(sel => {
              const el = (sel && document.querySelector(sel)) || document.querySelector('.settings-content') || document.querySelector('#content');
              return Math.min(6000, Math.max(1000, (el?.scrollHeight || 1000) + 120));
            }, target.selector);
            if (height > baseViewport.height) {
              await page.setViewportSize({ width: baseViewport.width, height });
              await page.waitForTimeout(50);
            }
          }
          let buffer, text = '';
          if (target.selector) {
            const locator = page.locator(target.selector).first();
            await locator.waitFor({ state: 'visible', timeout: 10000 });
            buffer = await locator.screenshot({ animations: 'disabled' });
            text = await locator.innerText().catch(() => '');
          } else {
            buffer = await page.screenshot({ animations: 'disabled' });
            text = await page.locator('body').innerText().catch(() => '');
          }
          const saved = await storeCapture(screensDir, key, buffer, { threshold: options.threshold, text });
          result.captured.push(key);
          if (saved.changed) result.changed.push(key);
          else result.unchanged.push(key);
        } catch (error) {
          result.failed.push({ id: key, error: error.message });
        } finally {
          await context?.close().catch(() => {});
        }
      }
    }
  } finally {
    await Promise.all([...browsers.values()].map(b => b.close().catch(() => {})));
    await distServer.close().catch(() => {});
  }
  return result;
}

module.exports = {
  MAX_VISIBLE_TEXT,
  normalizeVisibleText,
  validateRegistry,
  loadRegistry,
  selectTargets,
  diffImages,
  pruneHistory,
  storeCapture,
  resolveProfiles,
  capture
};
