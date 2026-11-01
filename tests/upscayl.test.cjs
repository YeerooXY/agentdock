'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { UpscaylEngine, localEnvironment, pngSize } = require('../electron/upscayl-engine.cjs');
const { installUpscayl, extractArchive, VERSION } = require('../electron/upscayl-install.cjs');
const { ToolIntegrations } = require('../electron/integrations.cjs');
const { validateConnection } = require('../electron/shared.cjs');
const zipFixture = require('../scripts/fixtures/zip.cjs');
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-upscayl-')); t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); }); return root; }
function png(width = 8, height = 8) { const b = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(b); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); return b; }
function files(root) { const models = path.join(root, 'models'); fs.mkdirSync(models); for (const ext of ['bin', 'param']) fs.writeFileSync(path.join(models, 'high-fidelity-4x.' + ext), 'fixture'); const input = path.join(root, 'a picture & $test.png'); fs.writeFileSync(input, png(2, 2)); return { models, input, output: path.join(root, 'new picture.png') }; }
function mockProcess(write) { return (command, args, options) => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => setImmediate(() => child.emit('close', 1)); setImmediate(() => write(child, command, args, options)); return child; }; }

test('Upscayl uses argument arrays, isolates credentials and preserves originals and outputs', async t => {
  const root = fixture(t), f = files(root), original = fs.readFileSync(f.input);
  const engine = new UpscaylEngine('engine.exe', f.models, { launch: mockProcess((child, command, args, options) => {
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true); assert.equal(args[1], fs.realpathSync(f.input)); assert.ok(args.includes('high-fidelity-4x'));
    fs.writeFileSync(args[args.indexOf('-o') + 1], png()); child.emit('close', 0);
  }) });
  const result = await engine.upscale({ input: f.input, output: f.output, gpu: 0 });
  assert.deepEqual({ width: result.width, height: result.height }, { width: 8, height: 8 });
  assert.deepEqual(fs.readFileSync(f.input), original); await assert.rejects(engine.upscale({ input: f.input, output: f.output }), /already exists/);
  assert.equal(fs.readdirSync(root).some(name => name.startsWith('.upscayl-')), false);
  process.env.PADDOCK_UPSCAYL_TEST_SECRET = 'private'; t.after(() => delete process.env.PADDOCK_UPSCAYL_TEST_SECRET);
  assert.equal(localEnvironment().PADDOCK_UPSCAYL_TEST_SECRET, undefined);
});
test('Upscayl refuses malformed options before launching', async t => {
  const root = fixture(t), f = files(root), engine = new UpscaylEngine('engine', f.models, { launch: () => { throw Error('Must not run'); } });
  for (const extra of [{ model: '../escape' }, { scale: 9 }, { gpu: -1 }, { gpu: '0;run' }, { output: f.output + '.exe' }, { command: 'evil' }]) await assert.rejects(engine.upscale({ input: f.input, output: f.output, ...extra }));
  assert.equal(fs.existsSync(f.output), false);
});
test('GPU failures, timeouts and concurrent requests never publish a partial output', async t => {
  const root = fixture(t), f = files(root);
  const engine = new UpscaylEngine('engine', f.models, { timeout: 10, launch: mockProcess((child, command, args) => fs.writeFileSync(args[args.indexOf('-o') + 1], 'partial')) });
  const pending = engine.upscale({ input: f.input, output: f.output });
  await assert.rejects(engine.upscale({ input: f.input, output: f.output }), /another image/);
  await assert.rejects(pending, /exceeded/); assert.equal(engine.busy, false); assert.equal(fs.existsSync(f.output), false);
  const failed = new UpscaylEngine('engine', f.models, { launch: mockProcess(child => child.emit('close', 1)) });
  await assert.rejects(failed.upscale({ input: f.input, output: f.output }), /Vulkan/);
});
test('Upscayl refuses invalid generated PNG and output created during a run', async t => {
  const root = fixture(t), f = files(root);
  const engine = new UpscaylEngine('engine', f.models, { launch: mockProcess((child, command, args) => { fs.writeFileSync(args[args.indexOf('-o') + 1], png()); fs.writeFileSync(f.output, 'preserve'); child.emit('close', 0); }) });
  await assert.rejects(engine.upscale({ input: f.input, output: f.output }), /exist/i); assert.equal(fs.readFileSync(f.output, 'utf8'), 'preserve');
  assert.throws(() => pngSize(f.output), /valid PNG/);
});
test('archive extraction rejects traversal and keeps existing files', async t => {
  const root = fixture(t), output = path.join(root, 'unpacked'); fs.mkdirSync(output);
  const zip = path.join(root, 'archive.zip'); fs.writeFileSync(zip, zipFixture([{ name: '../escape.txt', data: 'bad' }]));
  await assert.rejects(extractArchive(zip, output)); assert.equal(fs.existsSync(path.join(root, 'escape.txt')), false);
  fs.writeFileSync(zip, zipFixture([{ name: 'safe.txt', data: 'new' }])); fs.writeFileSync(path.join(output, 'safe.txt'), 'keep');
  await assert.rejects(extractArchive(zip, output)); assert.equal(fs.readFileSync(path.join(output, 'safe.txt'), 'utf8'), 'keep');
});
test('installer rejects corrupted downloads and records the incomplete managed location', async t => {
  const root = fixture(t);
  await assert.rejects(installUpscayl(root, { platform: 'linux' }), /Windows/);
  // Use an empty simulated Windows home so no existing external Upscayl is selected.
  const saved = [process.env.LOCALAPPDATA, process.env.ProgramFiles]; process.env.LOCALAPPDATA = root; process.env.ProgramFiles = root;
  try {
    await assert.rejects(installUpscayl(root, { platform: 'win32', fetchImpl: async () => ({ ok: true, body: [Buffer.from('invalid zip')] }), extract: () => { throw Error('Must not extract'); } }), /verification failed/);
    const records = JSON.parse(fs.readFileSync(path.join(root, 'managed-downloads.json'))); assert.equal(records[0].state, 'incomplete'); assert.equal(fs.existsSync(path.join(root, 'integrations', 'upscayl', VERSION)), false);
  } finally { [process.env.LOCALAPPDATA, process.env.ProgramFiles] = saved; }
});
test('optional integration installs only on request and reuses an existing app', async t => {
  const root = fixture(t), adapter = path.join(root, 'adapter.cjs'); fs.writeFileSync(adapter, ''); let installed = null, installs = 0;
  const integration = new ToolIntegrations(root, { node: process.execPath, upscayl: adapter }, { platform: 'win32', detect: () => ({}), detectUpscayl: () => installed, installImageTool: async () => { installs++; return installed = { directory: root, engine: path.join(root, 'engine.exe'), models: path.join(root, 'models') }; } });
  assert.equal(installs, 0); assert.equal(integration.snapshot([], []).find(x => x.id === 'upscayl').ready, false);
  const connection = validateConnection(await integration.prepare('upscayl')); assert.equal(connection.integration, 'upscayl'); assert.equal(installs, 1);
  await integration.prepare('upscayl'); assert.equal(installs, 1); assert.deepEqual(integration.resolve(connection).args, [adapter, installed.engine, installed.models]);
  assert.equal(integration.snapshot([connection], []).find(x => x.id === 'upscayl').ready, true);
});
