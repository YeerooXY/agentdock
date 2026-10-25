'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SharedHub } = require('../electron/shared.cjs');
const { Workbench } = require('../electron/workbench.cjs');
const { websiteGuide, topics } = require('../electron/website-guide.cjs');

test('bundled research is discoverable and readable through the authenticated agent bridge', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-website-guide-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sessions = { items: new Map([['designer', { id: 'designer', alive: true, cwd: root }]]) };
  const workbench = new Workbench(root, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => sessions, getProject: () => root });
  const hub = new SharedHub(root, { list: () => [] }, { workbench });
  await hub.start(); t.after(() => hub.close());
  const grant = hub.grant('designer');
  const invoke = async (name, args) => {
    const response = await fetch(grant.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.PADDOCK_BRIDGE_TOKEN }, body: JSON.stringify({ name, arguments: args }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const discovery = await invoke('dock_tools', { connection: 'dock' });
  assert.match(JSON.stringify(discovery), /dock\/website_guide/);
  for (const topic of Object.keys(topics)) {
    const result = await invoke('dock_call', { tool: 'dock/website_guide', arguments: { topic } });
    assert.equal(result.isError, undefined, topic);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.topic, topic);
    assert.equal(payload.content, fs.readFileSync(topic === 'checklist' ? path.join(__dirname, '..', 'guides', 'web-design.md') : path.join(__dirname, '..', 'skills', 'web-ux-ui', 'references', `${topic}.md`), 'utf8'));
  }
  const defaults = await invoke('dock_call', { tool: 'dock/website_guide', arguments: {} });
  assert.equal(JSON.parse(defaults.content[0].text).topic, 'overview');
  for (const args of [{ topic: '../../shared' }, { topic: '__proto__' }, { topic: 4 }, { file: 'shared.json' }]) {
    const result = await invoke('dock_call', { tool: 'dock/website_guide', arguments: args });
    assert.equal(result.isError, true);
  }
  hub.setGuides(['web-design']);
  assert.match(hub.summary(), /dock\/website_guide/);
  hub.setGuides([]);
  assert.doesNotMatch(hub.summary(), /dock\/website_guide/);
  hub.revoke('designer');
});

test('direct callers cannot select a file path or inherited property', () => {
  for (const value of ['constructor', '__proto__', '../web-design', null, {}, []]) assert.throws(() => websiteGuide(value), /available website guide topic/);
});
