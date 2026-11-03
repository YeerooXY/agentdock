'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { measure, functions, providerBranches, compare } = require('../scripts/code-health.cjs');

function repo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); }
  return root;
}
const block = prefix => Array.from({ length: 9 }, (_, i) => `  const ${prefix}${i} = compute(${i});`).join('\n');

test('repeated 8-line blocks are counted across files, braces ignored', t => {
  const root = repo(t, { 'electron/a.cjs': `function a() {\n${block('x')}\n}\n`, 'electron/b.cjs': `function b() {\n${block('x')}\n}\n`, 'electron/c.cjs': `function c() {\n${block('y')}\n}\n` });
  const report = measure(root);
  assert.equal(report.summary.duplicateWindows, 2, 'nine shared lines give two shared 8-line windows');
  assert.ok(report.duplicates[0].places.some(place => place.startsWith('electron/b.cjs')));
});

test('provider names count outside the adapters only', t => {
  const root = repo(t, { 'electron/providers/codex.cjs': "id: 'codex', other: 'claude'", 'electron/x.cjs': "if (p === 'codex' || p === \"kiro\") use('copilot'); const codexy = 'codexish';", 'tests/y.cjs': "'codex'" });
  assert.equal(measure(root).summary.providerBranches, 3);
  assert.equal(providerBranches("'pi' 'pie' \"gemini\""), 2);
});

test('function length follows the matching brace', () => {
  const lines = ['function outer() {', '  if (x) {', "    const s = '}';", '  }', '}', 'const arrow = async (a) => {', '  return a;', '};', 'if (y) {', '}'];
  assert.deepEqual(functions(lines).map(fn => [fn.name, fn.line, fn.length]), [['outer', 1, 5], ['arrow', 6, 3]]);
});

test('compare reports the change for each number', () => {
  const text = compare({ lines: 10, largeFiles: 1, longFunctions: 2, duplicateWindows: 3, providerBranches: 4 }, { lines: 12, largeFiles: 1, longFunctions: 1, duplicateWindows: 3, providerBranches: 9 });
  assert.match(text, /lines: 12 to 10 \(-2\)/); assert.match(text, /functions over 80 lines: 1 to 2 \(\+1\)/); assert.match(text, /provider branches outside adapters: 9 to 4 \(-5\)/);
});
