'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ToolIntegrations, unityProject, processEnvironment, BLENDER_VERSION } = require('../electron/integrations.cjs');
const { SharedHub, validateConnection } = require('../electron/shared.cjs');
const parent = path.resolve(__dirname, '..', 'test-data'); fs.mkdirSync(parent, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(parent, 'integrations-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
test('Blender setup isolates its runtime, pins the server and preserves partial add-on setup guidance', async t => {
  const root = fixture(t), calls = [];
  const integration = new ToolIntegrations(root, {}, { detect: () => ({ blender: 'blender.exe', python: 'bundled-python.exe' }), run: async (command, args, cwd) => {
    calls.push({ command, args, cwd });
    if (args.includes('venv')) { fs.mkdirSync(path.join(args.at(-1), 'Scripts'), { recursive: true }); fs.writeFileSync(path.join(args.at(-1), 'Scripts', 'python.exe'), 'fixture'); }
    if (args.includes('pip')) fs.writeFileSync(integration.blenderServer(), 'fixture');
    return 'PADDOCK_ADDON {"installed":true,"enabled":false,"lines":[]}';
  } });
  const connection = await integration.prepare('blender');
  assert.ok(calls[1].args.includes(`mcp-for-blender==${BLENDER_VERSION}`));
  assert.match(calls[2].args[1], /setup_addon\(False\)/);
  assert.ok(calls.every(x => x.cwd.startsWith(root)));
  assert.equal(connection.integration, 'blender'); assert.deepEqual(connection.envKeys, {});
  assert.equal(validateConnection(connection).integration, 'blender');
  assert.match(integration.snapshot([connection], [])[0].setupNote, /Preferences/);
  const fresh = new ToolIntegrations(root, {}, { detect: () => ({ blender: 'b', python: 'p' }) });
  assert.equal(fresh.snapshot([connection], [])[0].ready, true);
  await integration.prepare('blender');
  assert.equal(calls.filter(x => x.args.includes('venv')).length, 1);
});
test('Unity setup validates the selected project before installing and preserves the project binding', async t => {
  const root = fixture(t), calls = [], project = path.join(root, 'Unity project with spaces');
  const integration = new ToolIntegrations(root, {}, { detect: () => ({ unity: 'unity.exe' }), run: async (...args) => { calls.push(args); } });
  await assert.rejects(integration.prepare('unity', { projectPath: root }), /Unity project/); assert.equal(calls.length, 0);
  fs.mkdirSync(path.join(project, 'Packages'), { recursive: true }); fs.mkdirSync(path.join(project, 'ProjectSettings'));
  fs.writeFileSync(path.join(project, 'Packages', 'manifest.json'), '{"dependencies":{}}');
  fs.writeFileSync(path.join(project, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.19f1');
  assert.equal(unityProject(project), project);
  const connection = validateConnection(await integration.prepare('unity', { projectPath: project }));
  assert.deepEqual(calls[0], ['unity.exe', ['pipeline', 'install', '--project-path', project, '--non-interactive', '--no-banner'], project]);
  assert.equal(connection.projectPath, project);
  assert.deepEqual(integration.resolve({ ...connection, command: 'old-unity.exe' }).args, ['mcp', '--project-path', project]);
});
test('Meshy stores a vault reference and resolves a relocated bundled runtime without installing packages', async t => {
  const root = fixture(t), bundle = path.join(root, 'meshy-mcp.cjs'); fs.writeFileSync(bundle, '');
  const integration = new ToolIntegrations(root, { node: process.execPath, meshy: bundle }, { detect: () => ({}), run: () => { throw Error('Unexpected installation'); } });
  await assert.rejects(integration.prepare('meshy'), /Meshy API key/);
  const connection = validateConnection(await integration.prepare('meshy', { keyId: 'meshy' }));
  assert.deepEqual(connection.envKeys, { MESHY_API_KEY: { key: 'meshy', prefix: '' } });
  assert.equal(integration.snapshot([connection], [])[2].ready, false);
  assert.equal(integration.snapshot([connection], [{ id: 'meshy' }])[2].ready, true);
  assert.equal(integration.resolve({ ...connection, command: 'old-node.exe', args: ['old-bundle'] }).command, process.execPath);
  assert.throws(() => validateConnection({ ...connection, integration: 'unknown' }), /built-in/);
});
test('software setup does not inherit provider credentials and disables Blender telemetry', () => {
  const previous = process.env.PADDOCK_TEST_SECRET; process.env.PADDOCK_TEST_SECRET = 'do-not-inherit';
  try { const env = processEnvironment(); assert.equal(env.PADDOCK_TEST_SECRET, undefined); assert.equal(env.BLENDER_MCP_DISABLE_TELEMETRY, 'true'); }
  finally { if (previous === undefined) delete process.env.PADDOCK_TEST_SECRET; else process.env.PADDOCK_TEST_SECRET = previous; }
});
test('web guide is opt-in, reaches context when enabled and persists opt-out without overwriting instructions', async t => {
  const root = fixture(t), vault = { list: () => [] };
  fs.writeFileSync(path.join(root, 'shared.json'), JSON.stringify({ instructions: 'Keep my wording.', connections: [], profiles: [] }));
  const hub = new SharedHub(root, vault); t.after(() => hub.close());
  assert.doesNotMatch(hub.summary(), /Web design and page review/);
  hub.setGuides(['web-design']); assert.match(hub.config.instructions, /Keep my wording/);
  assert.match(hub.summary(), /full 20 page and 50 security requirements/);
  assert.doesNotMatch(hub.summary(), /20\. \*\*Data deletion requests/);
  assert.match((await hub.invoke('dock_context')).content[0].text, /dock\/website_guide/);
  assert.match(fs.readFileSync(hub.summaryPath, 'utf8'), /topics and checklist/);
  hub.setGuides([]); assert.doesNotMatch(hub.summary(), /Web design and page review/);
  assert.throws(() => hub.setGuides(['missing']), /available guide/);
  const reopened = new SharedHub(root, vault); t.after(() => reopened.close());
  assert.equal(reopened.config.instructions, 'Keep my wording.'); assert.deepEqual(reopened.config.guideIds, []);
  reopened.setGuides(['web-design']); assert.equal(reopened.snapshot().guides[0].enabled, true);
});
