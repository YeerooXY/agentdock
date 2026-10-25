'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { imageSettings, imageInstructions, generateImage } = require('../electron/image-generation.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Concepts } = require('../electron/concepts.cjs');
const { Results } = require('../electron/results.cjs');
const { AlertEvents } = require('../electron/alerts.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const temp = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-images-')); t.after(() => { assert.ok(path.basename(root).startsWith('dock-images-')); fs.rmSync(root, { recursive: true, force: true }); }); return root; };
const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const done = async concepts => { const end = Date.now() + 3000; while (concepts.busy && Date.now() < end) await new Promise(r => setTimeout(r, 5)); assert.equal(concepts.busy, false); };

test('Meshy preview authorization runs before reference upload or paid submission', async t => {
  const root = temp(t), results = new Results(root), alerts = new AlertEvents();
  const ref = results.add({ buffer: png, ext: '.png', title: 'Reference', kind: 'screenshot' }, { project: root, trusted: true });
  let calls = 0;
  const concepts = new Concepts(root, {}, results, {}, alerts, { getSettings: () => ({ provider: 'meshy' }), run: async () => { calls++; throw new Error('No CLI calls should run.'); }, authorizePreview: async () => { throw new Error('Blocked by your limits in Paddock'); } });
  await assert.rejects(concepts.generate({ referenceId: ref.id, requestId: 'blocked-preview' }), /Blocked by your limits/);
  assert.equal(calls, 0); assert.equal(concepts.items.length, 0); assert.equal(concepts.busy, false);
});

test('image preference persists without keys, reaches shared context and fixes official provider destinations', async t => {
  const root = temp(t), vault = { list: () => [{ id: 'image-key', label: 'Image account' }], get: () => { assert.fail('Saving settings must not resolve a key'); } };
  const hub = new SharedHub(root, vault);
  assert.match(hub.summary(), /ambiguous visual request/); assert.match(hub.summary(), /own image generation capability first/);
  hub.setImageGeneration({ provider: 'openai', keyId: 'image-key', url: 'https://attacker.invalid/', previewFirst: true });
  const restored = new SharedHub(root, vault); assert.equal(restored.config.imageGeneration.url, 'https://api.openai.com/v1/images/edits');
  assert.match(restored.summary(), /user selected openai/); assert.match(restored.summary(), /dock\/generate_preview/);
  assert.throws(() => hub.setImageGeneration({ provider: 'gemini', keyId: 'missing' }), /Paste this API key/);
  hub.setImageGeneration({ provider: 'agent', previewFirst: false }); assert.doesNotMatch(imageInstructions(hub.config.imageGeneration), /try to generate one/);
  for (const url of ['http://example.com/api', 'https://secret@example.com/api', 'https://example.com/api?key=secret', 'file:///tmp/images']) assert.throws(() => imageSettings({ provider: 'compatible', model: 'local-image', url }));
  assert.equal(imageSettings({ provider: 'compatible', model: 'local-image', url: 'http://127.0.0.1:8188/v1/images/edits' }).keyId, '');
});

test('OpenAI image edit sends the reference to the configured endpoint and returns an actual image with exact usage', async () => {
  const config = imageSettings({ provider: 'openai', keyId: 'image-key' }); let calls = 0;
  const result = await generateImage({ config, reference: png, prompt: 'Improve spacing', key: 'TEST_KEY', fetcher: async (url, options) => {
    calls++; assert.equal(url, config.url); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer TEST_KEY');
    const body = JSON.parse(options.body); assert.equal(body.n, 1); assert.equal(body.images[0].image_url, 'data:image/png;base64,' + png.toString('base64'));
    assert.equal(body.model, config.model); assert.equal(body.prompt, 'Improve spacing');
    return reply({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens: 42, output_tokens: 0, total_tokens: 42 } });
  } });
  assert.deepEqual(result.buffer, png); assert.equal(result.ext, '.png'); assert.deepEqual(result.usage, { input: 42, output: 0, total: 42 }); assert.equal(calls, 1);
});

test('Gemini image route uses stateless interactions and accepts only final image output, without invented usage', async () => {
  const result = await generateImage({ config: imageSettings({ provider: 'gemini', keyId: 'image-key' }), reference: png, prompt: 'A clearer page', key: 'TEST_KEY', fetcher: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions'); assert.equal(options.headers['x-goog-api-key'], 'TEST_KEY');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.input[1].data, png.toString('base64')); assert.equal(body.response_format.type, 'image');
    return reply({ steps: [{ type: 'thought', content: [{ type: 'image', data: 'not-a-final-image' }] }, { type: 'model_output', content: [{ type: 'image', data: png.toString('base64') }] }] });
  } });
  assert.deepEqual(result.buffer, png); assert.deepEqual(result.usage, { input: null, output: null, total: null });
});

test('API failures do not retry or leak provider errors; URL-only and nonimage responses are rejected', async () => {
  const args = { config: imageSettings({ provider: 'openai', keyId: 'key' }), reference: png, prompt: 'Preview', key: 'SECRET_TEST_KEY' }; let calls = 0;
  await assert.rejects(generateImage({ ...args, fetcher: async () => { calls++; return new Response('SECRET_TEST_KEY and provider detail', { status: 401 }); } }), error => /401/.test(error.message) && !/SECRET_TEST_KEY/.test(error.message));
  assert.equal(calls, 1);
  await assert.rejects(generateImage({ ...args, fetcher: async () => { throw Error('SECRET_TEST_KEY'); } }), error => /not retry/.test(error.message) && !/SECRET_TEST_KEY/.test(error.message));
  await assert.rejects(generateImage({ ...args, fetcher: async () => reply({ data: [{ url: 'http://localhost/private' }] }) }), /URL-only/);
  await assert.rejects(generateImage({ ...args, fetcher: async () => reply({ data: [{ b64_json: Buffer.from('<html>Not an image</html>').toString('base64') }] }) }), /PNG/);
  await assert.rejects(generateImage({ ...args, fetcher: async () => reply({ data: [{ b64_json: 'x'.repeat(31 * 1024 * 1024) }] }) }), /30 MB/);
});

test('preview jobs save individual images in the source turn, notify once, and deduplicate through restart and deletion', async t => {
  const root = temp(t), project = path.join(root, 'game'); fs.mkdirSync(project);
  const results = new Results(root, { trash: async file => { assert.ok(file.startsWith(root + path.sep)); fs.rmSync(file, { recursive: true, force: true }); } }), alerts = new AlertEvents();
  const context = { project, sessionId: 'console', consoleKey: 'permanent-console', consoleName: 'Game', turnId: 'turn-one' };
  const ref = results.add({ buffer: png, ext: '.png', title: 'Current screen', kind: 'screenshot' }, { ...context, trusted: true });
  let requests = 0, config = imageSettings({ provider: 'openai', keyId: 'key' });
  const options = { getSettings: () => config, getKey: id => { assert.equal(id, 'key'); return 'SECRET_TEST_KEY'; }, imageRequest: async ({ key }) => { requests++; assert.equal(key, 'SECRET_TEST_KEY'); return { buffer: png, ext: '.png', usage: { input: 100, output: 50, total: 150 } }; } };
  const notices = []; alerts.on('notification', item => notices.push(item));
  const concepts = new Concepts(root, {}, results, {}, alerts, options), raw = { referenceId: ref.id, requestId: 'idea-1', prompt: 'Make this screen clearer' };
  const job = await concepts.generate(raw, context); const retry = await concepts.generate(raw, context); assert.equal(retry.id, job.id); await done(concepts);
  assert.equal(requests, 1); const saved = results.items.find(x => x.kind === 'concept'); assert.equal(saved.groupId, context.turnId); assert.equal(saved.consoleName, 'Game'); assert.deepEqual(fs.readFileSync(results.path(saved.id)), png);
  assert.equal(notices.length, 1); assert.equal(notices[0].resultId, saved.id); assert.equal(concepts.usage[0].usage.input, 100);
  assert.ok(!fs.readFileSync(concepts.file, 'utf8').includes('SECRET_TEST_KEY')); assert.ok(!JSON.stringify(concepts.list()).includes('SECRET_TEST_KEY'));
  const restored = new Concepts(root, {}, results, {}, alerts, options); assert.equal((await restored.generate(raw, context)).resultId, saved.id);
  await restored.remove(job.id); await results.remove([saved.id]); await restored.generate(raw, context); assert.equal(requests, 1, 'deleting a job must not turn a tool retry into another paid request');
  await assert.rejects(restored.generate({ ...raw, requestId: 'other-project' }, { ...context, project: path.join(root, 'elsewhere') }), /this console/);
  await assert.rejects(restored.generate({ ...raw, requestId: 'other-api-project' }, { project: path.join(root, 'elsewhere') }), /this console/);
  config = { provider: 'agent' }; assert.equal((await restored.generate({ requestId: 'native' }, context)).mode, 'agent'); assert.equal(requests, 1);
  const guarded = new Concepts(root, {}, results, {}, alerts, { ...options, testMode: true }); config = imageSettings({ provider: 'openai', keyId: 'key' });
  await assert.rejects(guarded.generate({ ...raw, requestId: 'guard' }, context), /disabled/);
});

test('interrupted image jobs are not silently resubmitted', async t => {
  const root = temp(t), results = new Results(root), alerts = new AlertEvents(), project = path.join(root, 'project'); fs.mkdirSync(project);
  const ref = results.add({ buffer: png, ext: '.png', title: 'Screen', kind: 'screenshot' }, { project, trusted: true }); let calls = 0;
  const options = { getSettings: () => imageSettings({ provider: 'compatible', url: 'http://localhost:12345/images/edits', model: 'local' }), imageRequest: async () => { calls++; throw Error('Request interrupted.'); } };
  const concepts = new Concepts(root, {}, results, {}, alerts, options), raw = { requestId: 'only-once', referenceId: ref.id };
  await concepts.generate(raw); await done(concepts); assert.equal(concepts.items[0].state, 'failed');
  const restored = new Concepts(root, {}, results, {}, alerts, options); await restored.generate(raw); assert.equal(calls, 1); assert.equal(restored.usage[0].usage, null);
  // Simulate an exit while the provider request is pending. The usage view must
  // show interruption too, so removing its saved job is not disabled forever.
  restored.items[0].state = 'submitting'; restored.save();
  const interrupted = new Concepts(root, {}, results, {}, alerts, options);
  assert.equal(interrupted.items[0].state, 'interrupted'); assert.equal(interrupted.usage[0].state, 'interrupted');
  assert.equal((await interrupted.generate(raw)).state, 'interrupted'); assert.equal(calls, 1);
});
