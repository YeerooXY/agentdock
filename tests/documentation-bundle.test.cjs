'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { build } = require('../scripts/build-documentation-tools.cjs');

test('installed helper is reproducible and runs outside Paddock without adjacent modules', async t => {
  await build({ check: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-native-docs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const helper = path.join(root, 'documentation.cjs');
  fs.copyFileSync(path.join(__dirname, '../skills/project-documentation/scripts/documentation.cjs'), helper);
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'work.ts'), 'export function work(value: number): string { return String(value); }');
  const invoke = args => {
    const result = spawnSync(process.execPath, [helper, ...args, '--root', repo], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    if (args[0] === 'context') assert.ok(Buffer.byteLength(result.stdout) <= 4096);
    return JSON.parse(result.stdout);
  };
  assert.equal(invoke(['init']).modelCalls, 0);
  invoke(['add', '--address', '1.2.1', '--title', 'Work']);
  const snapshot = invoke(['snapshot', '--paths', 'work.ts']);
  const facts = invoke(['facts', '--snapshot', snapshot.snapshotId, '--path', 'work.ts']);
  assert.match(facts.symbols[0].signature, /value: number/);
  assert.equal(facts.modelCalls, 0);
  const context = invoke(['context', '--paths', 'work.ts', '--max-bytes', '4096']);
  assert.equal(context.sources[0].text, fs.readFileSync(path.join(repo, 'work.ts'), 'utf8'));
  assert.equal(context.modelCalls, 0); assert.equal(context.semanticVerified, false);
  assert.equal(invoke(['validate', '--snapshot', snapshot.snapshotId]).valid, true);
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});
