'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ToolPolicy, validatePolicy } = require('../electron/tool-policy.cjs');
const { McpCatalog, catalog } = require('../electron/mcp-catalog.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const root = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-policy-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const meshy = (policy) => ({ id: 'meshy', name: 'Meshy AI', policy: validatePolicy(policy, 'meshy') });

test('a model cap fills in the default and blocks anything higher', async t => {
  const policy = new ToolPolicy(root(t)), capped = meshy({ maxModel: 'meshy-6' });
  assert.deepEqual((await policy.check(capped, 'meshy_text_to_3d', { prompt: 'chair' })).args, { prompt: 'chair', ai_model: 'meshy-6' });
  assert.equal((await policy.check(capped, 'meshy_text_to_3d', { prompt: 'chair', ai_model: 'meshy-6-lite' })).args.ai_model, 'meshy-6-lite');
  for (const model of ['meshy-7.1', 'latest', 'meshy-t2']) await assert.rejects(policy.check(capped, 'meshy_image_to_3d', { ai_model: model }), /may use up to meshy-6/);
  // At the top model nothing is changed; free tools are never touched.
  assert.deepEqual((await policy.check(meshy({ maxModel: 'meshy-7.1' }), 'meshy_text_to_3d', { prompt: 'x' })).args, { prompt: 'x' });
  assert.equal((await policy.check(capped, 'meshy_check_balance', {})).counted, false);
  assert.throws(() => validatePolicy({ maxModel: 'meshy-99' }, 'meshy'), /models/);
  assert.throws(() => validatePolicy({ maxModel: 'anything' }, 'custom'), /models/);
  assert.throws(() => validatePolicy({ dailyBudget: -1 }, 'meshy'), /whole-number/);
});

test('preview access and native CLI balances enforce the shared Meshy budget', async t => {
  const policy = new ToolPolicy(root(t)), connection = meshy({ dailyBudget: 20 });
  await assert.rejects(policy.check({ ...connection, enabled: false }, 'meshy_image_to_image', {}), /is off/);
  await policy.check(connection, 'meshy_text_to_3d', {}, { balance: async () => 500 });
  await policy.check(connection, 'meshy_text_to_3d', {}, { balance: async () => 490 });
  await policy.check(connection, 'meshy_image_to_image', {}, { balance: async () => 1000, creditScope: 'preview' });
  await assert.rejects(policy.check(connection, 'meshy_image_to_image', {}, { balance: async () => 990, creditScope: 'preview' }), /budget.*used up/);
  assert.equal(policy.creditSpent('meshy'), 20);
  const ask = meshy({ access: 'ask' });
  await assert.rejects(policy.check(ask, 'meshy_image_to_image', {}, { confirm: async () => false }), /declined/);
});

test('credit budgets compare today’s balance with the first balance of the day', async t => {
  let now = Date.parse('2026-10-23T08:00:00Z'), balance = 500;
  const policy = new ToolPolicy(root(t), { now: () => now }), budget = meshy({ dailyBudget: 40 }), read = async () => balance;
  await policy.check(budget, 'meshy_text_to_3d', {}, { balance: read });
  balance = 470; await policy.check(budget, 'meshy_text_to_3d', {}, { balance: read });
  assert.match(policy.describe(budget), /budget 40 credits a day, about 30 used today/);
  balance = 460; await assert.rejects(policy.check(budget, 'meshy_text_to_3d', {}, { balance: read }), /40 credits is used up/);
  await assert.rejects(policy.check(budget, 'meshy_text_to_3d', {}, { balance: async () => { throw new Error('offline'); } }), /could not read/);
  now += 86400000; await policy.check(budget, 'meshy_text_to_3d', {}, { balance: read });
});

test('call budgets count only successful paid calls and survive a restart', async t => {
  const dir = root(t), tool = { id: 'custom', name: 'Custom', policy: validatePolicy({ dailyBudget: 2 }, 'custom') };
  const policy = new ToolPolicy(dir);
  for (let i = 0; i < 2; i++) { const { counted } = await policy.check(tool, 'do', {}); if (counted) policy.counted('custom'); }
  await assert.rejects(new ToolPolicy(dir).check(tool, 'do', {}), /2 paid calls is used up/);
});

test('Ask me first sends nothing unless the user allows that call', async t => {
  const policy = new ToolPolicy(root(t)), tool = { id: 'stripe', name: 'Stripe', policy: validatePolicy({ access: 'ask' }, 'stripe') }, asked = [];
  await assert.rejects(policy.check(tool, 'create_refund', { amount: 5 }), /declined/);
  await assert.rejects(policy.check(tool, 'create_refund', {}, { confirm: async x => { asked.push(x); return false; } }), /declined/);
  await policy.check(tool, 'create_refund', { amount: 5 }, { confirm: async () => true });
  assert.deepEqual(asked, [{ connection: 'Stripe', tool: 'create_refund', args: {} }]);
});

test('recommended tools install one pinned package without scripts and bind keys only to that tool', async t => {
  const dir = root(t), runs = [], records = [];
  const runtime = { node: process.execPath, npm: __filename };
  const run = async (command, args, cwd) => {
    runs.push(args);
    const spec = args.at(-1), name = spec.slice(0, spec.lastIndexOf('@')), version = spec.slice(spec.lastIndexOf('@') + 1), pkg = path.join(cwd, 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true }); fs.writeFileSync(path.join(pkg, 'bin', 'server.js'), '');
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name, version, bin: { other: 'bin/server.js' } }));
  };
  const store = new McpCatalog(dir, runtime, { run, downloads: { record: x => records.push(x) } });
  await assert.rejects(store.add('notion'), /Notion integration token/);
  const notion = await store.add('notion', { keyId: 'notion' });
  assert.equal(notion.type, 'stdio'); assert.deepEqual(notion.envKeys, { NOTION_TOKEN: { key: 'notion', prefix: '' } });
  assert.ok(notion.args[0].endsWith(path.join('bin', 'server.js')));
  assert.ok(runs[0].includes('--ignore-scripts') && runs[0].at(-1) === '@notionhq/notion-mcp-server@2.5.2');
  assert.equal(records.at(-1).state, undefined, 'the download is recorded for the uninstall list');
  await store.add('notion', { keyId: 'notion' }); assert.equal(runs.length, 1, 'an installed package is reused');
  const github = await store.add('github', { keyId: 'gh' });
  assert.deepEqual(github.headerKeys, { Authorization: { key: 'gh', prefix: 'Bearer ' } }); assert.equal(runs.length, 1);
  assert.equal((await store.add('stripe', { keyId: 's' })).policy.access, 'ask', 'Stripe starts as Ask me first');
  assert.ok(catalog.every(item => !item.key || item.key.env || item.key.header), 'keys never go in arguments');
});

test('agents read which tools they have, which are allowed and at what limits', async t => {
  const hub = new SharedHub(root(t), { list: () => [], get: () => '' }); t.after(() => hub.close());
  await hub.saveConnection({ id: 'meshy', name: 'Meshy AI', type: 'stdio', command: 'node', args: [], policy: { maxModel: 'meshy-6', dailyBudget: 50 } });
  await hub.saveConnection({ id: 'stripe', name: 'Stripe', catalog: 'stripe', type: 'stdio', command: 'node', args: [], policy: { access: 'ask' } });
  await hub.saveConnection({ id: 'old', name: 'Old', type: 'stdio', command: 'node', args: [], enabled: false });
  const text = hub.summary();
  assert.match(text, /## Tool permissions/);
  assert.match(text, /- meshy: allowed · max model meshy-6 \(requests without ai_model use it\) · budget 50 credits a day/);
  assert.match(text, /- stripe: ask first: the user confirms each call/);
  assert.match(text, /Turned off by the user: old\./);
  assert.match(text, /Not added yet; the user can add these in Tools: Playwright, Chrome DevTools, Context7, Notion, GitHub\./);
  await assert.rejects(hub.saveConnection({ id: 'fake', catalog: 'playwright', type: 'stdio', command: 'node' }), /recommended/);
});

test('Paddock enforces the limits on real MCP calls before they reach the tool', async t => {
  const hub = new SharedHub(root(t), { list: () => [], get: () => '' }); t.after(() => hub.close());
  await hub.saveConnection({ id: 'meshy', name: 'Meshy AI', type: 'stdio', command: process.execPath, args: [path.join(__dirname, 'fixtures', 'meshy-like-server.cjs')], policy: { maxModel: 'meshy-6', dailyBudget: 30 } });
  const call = args => hub.invoke('dock_call', { tool: 'meshy/meshy_text_to_3d', arguments: args });
  assert.deepEqual(JSON.parse((await call({ prompt: 'chair' })).content[0].text), { prompt: 'chair', ai_model: 'meshy-6' }, 'the cap is filled in');
  await assert.rejects(call({ ai_model: 'latest' }), /may use up to meshy-6/);
  await call({ prompt: 'table' });
  await assert.rejects(call({ prompt: 'lamp' }), /30 credits is used up/, '40 of 30 credits spent today');
});
