'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ToolIntegrations, REA_VERSION } = require('../electron/integrations.cjs');
const { SharedHub } = require('../electron/shared.cjs');
test('REA installation records completion only after a pinned successful install; context and 2020-12 schemas reach agents', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-rea-')), npm = path.join(root, 'npm-cli.js'); fs.writeFileSync(npm, '');
  let fail = true, installs = 0;
  const integration = new ToolIntegrations(root, { node: process.execPath, npm }, { detect: () => ({}), run: async (_, args) => {
    installs++; assert.ok(args.includes(`rea-agents@${REA_VERSION}`)); assert.ok(args.includes('--ignore-scripts'));
    fs.mkdirSync(path.dirname(integration.reaServer()), { recursive: true });
    fs.writeFileSync(integration.reaServer(), `import { createRequire } from 'node:module'; createRequire(import.meta.url)(${JSON.stringify(path.join(__dirname, 'fixtures/mcp-2020-server.cjs'))});`);
    fs.writeFileSync(path.join(path.dirname(path.dirname(integration.reaServer())), 'package.json'), JSON.stringify({ version: REA_VERSION }));
    if (fail) throw Error('offline');
  } });
  const hub = new SharedHub(root, { list: () => [] }, { integrations: integration });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await assert.rejects(integration.prepare('rea'), /offline/); assert.equal(integration.reaReady(), false);
  fail = false; const connection = await integration.prepare('rea'); await integration.prepare('rea'); assert.equal(installs, 2);
  assert.equal(new ToolIntegrations(root, integration.runtime, { detect: () => ({}) }).reaReady(), true);
  await hub.saveConnection(connection); assert.match(hub.summary(), /## Investigating existing software/);
  assert.equal((await hub.test('rea')).count, 1);
  const value = await hub.invoke('dock_call', { tool: 'rea/echo', arguments: { tuple: [1] } }); assert.deepEqual(JSON.parse(value.content[0].text), { tuple: [1] });
  await assert.rejects(hub.invoke('dock_call', { tool: 'rea/echo', arguments: { tuple: ['bad'] } }), /input schema/);
  await hub.saveConnection({ ...connection, enabled: false }); assert.deepEqual(await hub.list('rea'), []); assert.doesNotMatch(hub.summary(), /## Investigating existing software/);
});
