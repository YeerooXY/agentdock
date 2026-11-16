'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { parseGoModels, documentationConfig } = require('../electron/opencode-documentation.cjs');
const { TaskLoop, openCodeLaunch } = require('../electron/task-loop.cjs');
const { readOpenCodeUsage } = require('../electron/subscription-usage.cjs');
const { selectDocumentationWorker } = require('../electron/documentation-routing.cjs');

test('Go discovery accepts only distinct subscription model IDs', () => {
  const models = parseGoModels('\x1b[32mopencode-go/example-flash\x1b[0m\nopencode-go/example-flash\nopencode/paid\nnoise opencode-go/other\nopencode-go/../bad');
  assert.deepEqual(models.map(m => m.id), ['opencode-go/example-flash']);
  assert.equal(models[0].funding, 'included');
});

test('documentation isolates configuration and disables tools and additional steps', () => {
  const result = documentationConfig('C:/temporary/docs', 'opencode-go/example-flash');
  assert.deepEqual(result.config.permission, { '*': 'deny' });
  assert.deepEqual(result.config.tools, { '*': false });
  assert.equal(result.config.agent[result.agent].steps, 1);
  assert.deepEqual(result.config.enabled_providers, ['opencode-go']);
  assert.deepEqual(result.config.mcp, {}); assert.deepEqual(result.config.plugin, []);
  assert.equal(result.environment.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
  assert.equal(result.environment.OPENCODE_DISABLE_CLAUDE_CODE, '1');
  assert.equal(result.environment.XDG_DATA_HOME, undefined, 'native account authentication stays in place');
  const launch = openCodeLaunch('opencode.exe', { model: result.config.model, workFolder: 'temp', promptFile: 'prompt.txt', agent: result.agent });
  assert.ok(launch.args.includes('--pure')); assert.ok(launch.args.includes(result.agent));
});

test('Go documentation requires fresh quota and freshly discovered included models', () => {
  const now = Date.now(), model = { id: 'opencode-go/example-flash', available: true, funding: 'included', observedAt: now };
  const account = { id: 'opencode:default', provider: 'opencode', signedIn: true, models: [model] };
  const reading = { accountId: account.id, id: account.id, provider: 'opencode', observedAt: now, funding: 'included', windows: [{ usedPercent: 10, observedAt: now }] };
  const loop = Object.assign(Object.create(TaskLoop.prototype), { candidates: () => [account], getSettings: () => ({}), getLimits: () => [reading], now: () => now });
  const worker = { accountId: account.id, model: model.id };
  assert.equal(loop.documentationEligibility(worker).funding, 'included');
  assert.equal(selectDocumentationWorker(loop).model, model.id);
  assert.throws(() => loop.documentationEligibility({ ...worker, model: 'opencode/metered-model' }), /supported by this OpenCode account|Go subscription/);
  reading.windows[0].usedPercent = 100;
  assert.throws(() => loop.documentationEligibility(worker), /exhausted/);
  reading.windows[0].usedPercent = 10; model.observedAt = now - 31 * 60000;
  assert.throws(() => loop.documentationEligibility(worker), /model discovery/);
  model.observedAt = now; reading.funding = 'metered';
  assert.throws(() => loop.documentationEligibility(worker), /confirmed free/);
});

test('model discovery follows authenticated allowance and preserves quota on CLI failure', async () => {
  const commands = [];
  const options = { executable: 'opencode.exe', getCredential: () => ({ key: 'test-only' }),
    fetchUsage: async () => new Response(JSON.stringify({ usage: { rolling: { status: 'ok', percent: 5 } } })),
    run: (_exe, args, _options, done) => { commands.push(args); queueMicrotask(() => done(null, args[0] === 'models' ? 'opencode-go/example-flash' : '')); return { stdin: { end() {} } }; } };
  const result = await readOpenCodeUsage(options);
  assert.equal(result.values[0].funding, 'included');
  assert.equal(result.values[0].models[0].id, 'opencode-go/example-flash');
  commands.length = 0;
  await readOpenCodeUsage({ ...options, getCredential: () => null });
  assert.equal(commands.some(args => args[0] === 'models'), false);
  const failed = await readOpenCodeUsage({ ...options, run: (_exe, _args, _options, done) => { queueMicrotask(() => done(Error('CLI changed'))); return { stdin: { end() {} } }; } });
  assert.equal(failed.values[0].windows[0].usedPercent, 5);
  assert.match(failed.values[0].modelMessage, /discovery failed/);
});

