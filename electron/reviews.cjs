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
const { reviewBrowserProfiles, reviewFindings } = require('./review-browser.cjs');
class Reviews extends EventEmitter {
  constructor(root, results, alerts, { axeSource } = {}) {
    super(); this.file = path.join(root, 'reviews.json'); this.results = results; this.alerts = alerts;
    this.axeSource = axeSource || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    this.items = readJson(this.file, []).slice(0, 100).map(x => x.state === 'running' ? { ...x, state: 'interrupted', error: 'Review stopped when Paddock closed. Run it again.' } : x)
      .map(x => Array.isArray(x.checks) && x.checks.length < checklist.length ? { ...x, checks: [...x.checks, ...checklist.slice(x.checks.length).map(title => ({ title, status: 'unreviewed', note: '' }))] } : x)
      .map(x => { if (!x.report?.views?.length) return x; const issueSummary = reviewFindings(x.report); return { ...x, issues: issueSummary.total, report: { ...x.report, issueSummary } }; });
    this.active = null; this.controller = null; this.stopping = false;
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
    }).finally(() => { this.active = null; });
    return item.id;
  }
  async run(item) {
    const controller = this.controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const report = await reviewBrowserProfiles({ url: item.url, axeSource: this.axeSource, signal: controller.signal,
        onStage: stage => { item.stage = stage; this.save(); },
        onView: (view, buffer) => {
          const saved = this.results.add({ title: view.name + ': ' + (view.page.title || new URL(item.url).hostname), kind: 'screenshot', source: 'Website review', groupId: item.id, reviewId: item.id, buffer, ext: '.png' }, { project: item.project, sessionId: item.sessionId, consoleKey: item.consoleKey, consoleName: item.consoleName, turnId: item.turnId, trusted: true });
          view.screenshot = saved.id; item.resultIds.push(saved.id); this.save();
        } });
      report.url = item.url; report.at = new Date(item.at).toISOString();
      item.report = report; item.state = 'complete'; item.stage = '';
      report.issueSummary = reviewFindings(report);
      const issues = report.issueSummary.total;
      item.issues = issues;
      const saved = this.results.add({ title: 'Review: ' + new URL(item.url).hostname, kind: 'review', ext: '.json', text: JSON.stringify({ ...report, checklist: item.checks }, null, 2), source: 'Website review', groupId: item.id, reviewId: item.id, summary: `${issues} automated findings. Manual checklist still needs review.`, status: 'needs-review' }, { project: item.project, sessionId: item.sessionId, consoleKey: item.consoleKey, consoleName: item.consoleName, turnId: item.turnId, trusted: true });
      item.resultIds.push(saved.id); this.save();
      this.alerts.send({ title: 'Website review ready', message: `${new URL(item.url).hostname}: ${issues} automated findings`, reviewId: item.id, resultId: saved.id, sessionId: item.sessionId });
    } finally { clearTimeout(timeout); this.controller = null; }
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
  stop() { this.stopping = true; this.controller?.abort(); }
}
module.exports = { Reviews, checklist, pageChecklist, securityChecklist, pageUrl };
