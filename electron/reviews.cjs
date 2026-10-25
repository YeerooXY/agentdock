'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const pageChecklist = ['Privacy policy', 'Terms of service', 'Refund policy', 'Cookie policy', 'Cookie consent', 'Form consent', 'Data minimisation', 'Third-party tools', 'Dark patterns', 'Fees and pricing', 'Authentic reviews', 'Supported claims', 'Image descriptions', 'Colour contrast', 'Keyboard navigation', 'Business details', 'Children’s data', 'Email unsubscribe', 'Asset licences', 'Data deletion'];
// Items 21–70 follow the security section of guides/web-design.md, in the same order.
const securityChecklist = ['Exposed database credentials', 'Public .env files', 'Hardcoded API keys', 'Authentication', 'Authorization checks', 'Access to other users’ data', 'Open database permissions', 'Cloud storage configuration', 'Admin routes', 'Debug pages', 'Build logs', 'Verbose errors', 'Leaked repositories', 'Frontend secrets', 'Client-side-only checks', 'Input validation', 'SQL injection', 'NoSQL injection', 'Cross-site scripting', 'Cross-site request forgery', 'File uploads', 'Path traversal', 'Server-side request forgery', 'Password reset', 'Session management', 'JWT secrets', 'CORS', 'Rate limits', 'Test and staging environments', 'Default credentials', 'Webhook signatures', 'Server-side payment checks', 'Direct object references', 'Trusted IDs and roles', 'Sensitive logs', 'Source maps', 'Dependency vulnerabilities', 'Outdated packages', 'Prompt injection', 'AI tool permissions', 'Database user permissions', 'Audit logs', 'Monitoring and alerting', 'Backup and restore', 'Internal dashboards', 'Security headers', 'Cookie flags', 'Encryption of sensitive data', 'Tenant isolation', 'Generated code review'];
const checklist = [...pageChecklist, ...securityChecklist];
function pageUrl(input) {
  let url; try { url = new URL(String(input)); } catch { throw new Error('Enter a full website URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without credentials.');
  return url.href;
}
function inspectPage() {
  const visible = element => !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  return { title: document.title, url: location.href, lang: document.documentElement.lang, viewport: document.querySelector('meta[name="viewport"]')?.content || '',
    headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 80).map(x => ({ level: x.tagName, text: x.textContent.trim().slice(0, 180) })),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
    overflowElements: [...document.querySelectorAll('body *')].filter(visible).filter(x => x.getBoundingClientRect().right > innerWidth + 2).slice(0, 12).map(x => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '')),
    missingAlt: [...document.images].filter(x => !x.hasAttribute('alt')).length,
    links: [...document.querySelectorAll('a[href]')].slice(0, 200).map(x => ({ text: x.textContent.trim().slice(0, 100), url: x.href })) };
}
class Reviews extends EventEmitter {
  constructor(root, results, alerts, { BrowserWindow, session, axeSource } = {}) {
    super(); this.file = path.join(root, 'reviews.json'); this.results = results; this.alerts = alerts;
    this.BrowserWindow = BrowserWindow; this.session = session; this.axeSource = axeSource || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    this.items = readJson(this.file, []).slice(0, 100).map(x => x.state === 'running' ? { ...x, state: 'interrupted', error: 'Review stopped when Paddock closed. Run it again.' } : x)
      .map(x => Array.isArray(x.checks) && x.checks.length < checklist.length ? { ...x, checks: [...x.checks, ...checklist.slice(x.checks.length).map(title => ({ title, status: 'unreviewed', note: '' }))] } : x);
    this.active = null; this.window = null; this.stopping = false;
  }
  list() { return this.items.map(({ report, ...x }) => x); }
  save() { atomicJson(this.file, this.items); this.emit('changed'); }
  get(id) { const item = this.items.find(x => x.id === id); if (!item) throw new Error('This review was deleted.'); return item; }
  start(raw) {
    if (this.active) throw new Error('A website review is already running.');
    if (this.items.length >= 100) throw new Error('Delete an old review before starting another.');
    const item = { id: crypto.randomUUID(), url: pageUrl(raw.url), turnId: raw.turnId || '', sessionId: raw.sessionId || null, consoleKey: raw.consoleKey || null, consoleName: String(raw.consoleName || '').slice(0, 64), project: String(raw.project || '').slice(0, 1000), brief: String(raw.brief || '').slice(0, 2500), at: Date.now(), state: 'running', stage: 'Opening page', resultIds: [], checks: checklist.map(title => ({ title, status: 'unreviewed', note: '' })) };
    this.items.unshift(item); this.active = item.id; this.save();
    this.run(item).catch(error => {
      if (!this.items.includes(item)) return;
      item.state = this.stopping ? 'interrupted' : 'failed'; item.error = String(error.message || 'Review failed.').slice(0, 500); this.save();
      if (!this.stopping) this.alerts.send({ title: 'Website review needs attention', message: item.error, reviewId: item.id, sessionId: item.sessionId, kind: 'error' });
    }).finally(() => { if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = null; this.active = null; });
    return item.id;
  }
  async run(item) {
    const partition = this.session.fromPartition('review-' + item.id, { cache: false });
    partition.setPermissionRequestHandler((_, __, callback) => callback(false)); partition.setPermissionCheckHandler(() => false);
    partition.on('will-download', event => event.preventDefault());
    const hosts = new Set();
    partition.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false; try { const url = new URL(details.url); allowed = ['http:', 'https:', 'data:', 'blob:', 'about:'].includes(url.protocol); if (['http:', 'https:'].includes(url.protocol)) hosts.add(url.hostname); } catch {}
      callback({ cancel: !allowed });
    });
    const browser = this.window = new this.BrowserWindow({ show: false, width: 1440, height: 1000, useContentSize: true, webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, disableDialogs: true } });
    browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const timeout = setTimeout(() => { if (!browser.isDestroyed()) browser.destroy(); }, 90000);
    try {
      await browser.loadURL(item.url);
      const report = { url: item.url, at: new Date(item.at).toISOString(), scope: 'Chromium desktop and narrow viewport screenshots and automated checks. Safari/WebKit, Android and iPhone device profiles are not run by this tool. Physical devices and manual checks remain unreviewed.', views: [], thirdPartyHosts: [], links: [] };
      for (const [name, width, height] of [['Desktop', 1440, 1000], ['Mobile', 390, 844]]) {
        item.stage = name + ' checks'; this.save(); browser.setContentSize(width, height);
        await browser.webContents.insertCSS('*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }');
        await browser.webContents.executeJavaScript('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
        const page = await browser.webContents.executeJavaScript('(' + inspectPage.toString() + ')()');
        await browser.webContents.executeJavaScript(this.axeSource);
        const axe = await browser.webContents.executeJavaScript(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }).then(r => ({ violations: r.violations.map(x => ({ id:x.id, impact:x.impact, help:x.help, helpUrl:x.helpUrl, nodes:x.nodes.slice(0,12).map(n=>({target:n.target,summary:n.failureSummary})) })), incomplete:r.incomplete.map(x=>({id:x.id,help:x.help,count:x.nodes.length})), passes:r.passes.length }))`);
        const shot = await browser.webContents.capturePage();
        const saved = this.results.add({ title: name + ' · ' + (page.title || new URL(item.url).hostname), kind: 'screenshot', source: 'Website review', groupId: item.id, reviewId: item.id, buffer: shot.toPNG(), ext: '.png' }, { project: item.project, sessionId: item.sessionId, consoleKey: item.consoleKey, consoleName: item.consoleName, turnId: item.turnId, trusted: true });
        item.resultIds.push(saved.id); report.views.push({ name, width, height, screenshot: saved.id, page, accessibility: axe }); this.save();
      }
      const finalUrl = new URL(report.views[0].page.url);
      report.thirdPartyHosts = [...hosts].filter(host => host !== finalUrl.hostname).sort();
      item.stage = 'Checking links'; this.save();
      const links = [...new Set(report.views[0].page.links.map(x => x.url))].filter(value => { try { const url = new URL(value); return url.origin === finalUrl.origin && !url.hash && !url.username && !url.password; } catch { return false; } }).slice(0, 12);
      report.links = await Promise.all(links.map(async url => {
        try { const response = await partition.fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) }); return { url, status: response.status, result: response.status === 404 || response.status === 410 ? 'broken' : response.status >= 200 && response.status < 400 ? 'reachable' : 'needs-review' }; }
        catch { return { url, result: 'not-checked' }; }
      }));
      item.report = report; item.state = 'complete'; item.stage = '';
      const issues = report.views.reduce((n, x) => n + x.accessibility.violations.length + Number(x.page.horizontalOverflow), 0) + report.links.filter(x => x.result === 'broken').length;
      item.issues = issues;
      const saved = this.results.add({ title: 'Review · ' + new URL(item.url).hostname, kind: 'review', ext: '.json', text: JSON.stringify({ ...report, checklist: item.checks }, null, 2), source: 'Website review', groupId: item.id, reviewId: item.id, summary: `${issues} automated findings. Manual checklist still needs review.`, status: 'needs-review' }, { project: item.project, sessionId: item.sessionId, consoleKey: item.consoleKey, consoleName: item.consoleName, turnId: item.turnId, trusted: true });
      item.resultIds.push(saved.id); this.save();
      this.alerts.send({ title: 'Website review ready', message: `${new URL(item.url).hostname} · ${issues} automated findings`, reviewId: item.id, resultId: saved.id, sessionId: item.sessionId });
    } finally { clearTimeout(timeout); if (!browser.isDestroyed()) browser.destroy(); await partition.clearStorageData(); await partition.closeAllConnections(); }
  }
  check(raw) {
    const item = this.get(raw.id), check = item.checks[raw.index];
    if (!check || !['unreviewed', 'passed', 'needs-work', 'not-applicable'].includes(raw.status)) throw new Error('Choose a checklist status.');
    if (raw.status === 'not-applicable' && !String(raw.note || '').trim()) throw new Error('Add a reason for “Not applicable”.');
    check.status = raw.status; check.note = String(raw.note || '').slice(0, 1000); this.save();
    const result = this.results.items.find(x => (x.reviewId === item.id || x.groupId === item.id) && x.kind === 'review');
    if (result) this.results.updateReport(result.id, { ...item.report, checklist: item.checks });
  }
  async remove(id) {
    if (id === this.active) throw new Error('Wait for this review to finish.');
    const deleted = await this.results.remove(this.results.items.filter(x => (x.reviewId === id || x.groupId === id)).map(x => x.id));
    if (deleted.failed.length) throw new Error('Some review files could not be deleted. Try again.');
    this.items = this.items.filter(x => x.id !== id); this.save();
  }
  stop() { this.stopping = true; if (this.window && !this.window.isDestroyed()) this.window.destroy(); }
}
module.exports = { Reviews, checklist, pageChecklist, securityChecklist, pageUrl };
