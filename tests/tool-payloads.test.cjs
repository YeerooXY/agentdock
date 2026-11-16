'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Workbench } = require('../electron/workbench.cjs');
const { SetupRequests } = require('../electron/setup-requests.cjs');
const { SharedHub } = require('../electron/shared.cjs');

test('review listing returns identifiers and progress while details retain the checklist', async () => {
  const reviews = Array.from({ length: 4 }, (_, i) => ({ id: `review-${i}`, url: 'http://localhost:4173/', state: 'complete', issues: 0,
    checks: Array.from({ length: 70 }, () => ({ title: 'Checklist item', note: 'Long evidence '.repeat(50), status: 'passed' })), report: { evidence: 'Full report' } }));
  const workbench = Object.assign(Object.create(Workbench.prototype), { getProject: () => '', reviews: { list: () => reviews, get: id => reviews.find(item => item.id === id) }, results: { items: [] } });
  const list = await workbench.invoke('dock/list_reviews', {});
  assert.deepEqual(list[0], { id: 'review-0', url: 'http://localhost:4173/', state: 'complete', issues: 0 });
  assert.ok(JSON.stringify(list).length < 1000);
  const detail = await workbench.invoke('dock/review_details', { id: 'review-0' });
  assert.equal(detail.checks.length, 70);
  assert.equal(detail.report.evidence, 'Full report');
});

test('setup overview omits installation/configuration payloads and retains full detail on request', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-setup-summary-'));
  const hub = new SharedHub(root, { list: () => [{ id: 'test_key', label: 'Test key' }] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const agents = Array.from({ length: 13 }, (_, i) => ({ id: `agent-${i}`, name: `Agent ${i}`, installed: true, install: { script: 'https://example.invalid/install' }, docs: 'https://example.invalid/docs', flags: ['long-config-flag'] }));
  const setup = new SetupRequests(root, { getHub: () => hub, getAgents: () => agents });
  setup.prepare({ kind: 'key', config: { id: 'request_key', name: 'Requested key' } }, {});
  const compact = setup.status();
  assert.deepEqual(compact.agents[0], { id: 'agent-0', name: 'Agent 0', installed: true });
  assert.deepEqual(compact.keys, [{ id: 'test_key', label: 'Test key' }]);
  assert.equal(compact.pending[0].name, 'Requested key');
  assert.equal(compact.pending[0].config, undefined);
  assert.doesNotMatch(JSON.stringify(compact), /install\/|long-config-flag|install.*script/);
  const detail = setup.status({ detail: true });
  assert.equal(detail.agents[0].flags[0], 'long-config-flag');
  assert.equal(detail.pending[0].config.id, 'request_key');
});

test('review details store shared page data once and identify missing screenshot references', async () => {
  const common = { title: 'Page', links: [{ text: 'Home', url: 'https://example.invalid/' }] };
  const review = { id: 'review', report: { views: [
    { name: 'Desktop', screenshot: 'missing-desktop', page: { ...common, horizontalOverflow: false } },
    { name: 'Mobile', screenshot: 'missing-mobile', page: { ...common, horizontalOverflow: true } },
  ] } };
  const original = JSON.stringify(review);
  const workbench = Object.assign(Object.create(Workbench.prototype), { getProject: () => '', reviews: { get: () => review }, results: { items: [] } });
  const compact = await workbench.invoke('dock/review_details', { id: review.id });
  assert.deepEqual(compact.report.commonPage, common);
  for (let i = 0; i < 2; i++) assert.deepEqual({ ...compact.report.commonPage, ...compact.report.views[i].page }, review.report.views[i].page);
  assert.deepEqual(compact.screenshots.map(item => [item.id, item.file, item.status]), [['missing-desktop', null, 'missing'], ['missing-mobile', null, 'missing']]);
  const detail = await workbench.invoke('dock/review_details', { id: review.id, detail: true });
  assert.deepEqual(detail.report, review.report);
  assert.equal(JSON.stringify(review), original);
});
