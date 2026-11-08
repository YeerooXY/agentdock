'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { extractSymbols } = require('../electron/source-symbols.cjs');
const {
  extractSourceFacts,
  canClaimSafeNoCodeChange,
  EXTRACTOR,
  MAX_INPUT_BYTES,
  MAX_SYMBOLS,
} = require('../electron/source-facts.cjs');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('extractSourceFacts: preserves extractSymbols fields and keys metadata by existing symbol IDs', () => {
  const code = [
    'export function computeTotal(price: number, taxRate = 0.2): number {',
    '  return price * (1 + taxRate);',
    '}',
  ].join('\n');

  const base = extractSymbols({ path: 'src/pricing.ts', text: code });
  const facts = extractSourceFacts({ path: 'src/pricing.ts', text: code });

  assert.equal(facts.language, base.language);
  assert.equal(facts.extractor, EXTRACTOR);
  assert.equal(facts.contentHash, sha256(code));
  assert.equal(facts.symbols.length, 1);
  assert.equal(facts.coverage.status, 'complete');
  assert.equal(facts.coverage.partial, false);
  assert.equal(facts.coverage.unsupported, false);
  assert.equal(facts.coverage.parseError, false);
  assert.equal(facts.coverage.safeNoCodeChange, false);
  assert.equal(facts.safeNoCodeChange, false);
  assert.equal(facts.coverage.completeDependencyGraph, false);
  assert.equal(facts.coverage.completeCallGraph, false);
  assert.equal(facts.coverage.inferredSemantics, false);
  assert.equal(facts.coverage.inferredReturnBehavior, false);
  assert.equal(facts.coverage.inferredTypes, false);

  const symId = base.symbols[0].id;
  assert.equal(symId, 'src/pricing.ts:computeTotal:function');
  assert.equal(facts.symbols[0].id, symId);
  assert.equal(facts.symbols[0].name, base.symbols[0].name);
  assert.equal(facts.symbols[0].kind, base.symbols[0].kind);
  assert.equal(facts.symbols[0].start, base.symbols[0].start);
  assert.equal(facts.symbols[0].end, base.symbols[0].end);
  assert.equal(facts.symbols[0].startLine, base.symbols[0].startLine);
  assert.equal(facts.symbols[0].endLine, base.symbols[0].endLine);
  assert.equal(facts.symbols[0].signature, base.symbols[0].signature);
  assert.equal(facts.symbols[0].contentHash, base.symbols[0].contentHash);

  assert.deepEqual(facts.symbols[0].parameters, ['price: number', 'taxRate = 0.2']);
  assert.equal(facts.symbols[0].declaredReturnType, 'number');
  assert.match(facts.symbols[0].normalizedSyntaxHash, /^[0-9a-f]{64}$/);
  assert.match(facts.normalizedSyntaxHash, /^[0-9a-f]{64}$/);

  assert.ok(facts.symbolFacts[symId]);
  assert.deepEqual(facts.symbolFacts[symId].parameters, ['price: number', 'taxRate = 0.2']);
  assert.equal(facts.symbolFacts[symId].declaredReturnType, 'number');
  assert.equal(facts.symbolFacts[symId].normalizedSyntaxHash, facts.symbols[0].normalizedSyntaxHash);
});

test('extractSourceFacts: extracts TS nested, destructured, default and rest parameters as exact text', () => {
  const code = [
    'function configure<T extends Record<string, unknown>>(',
    '  { host = "127.0.0.1", port = 8080, nested: { retries = 3, tags = ["a", "b"] } = {} }: ServerConfig = defaultConfig(1, 2),',
    '  [primary, fallback = "none", ...extra]: [string, string, ...string[]],',
    '  transform?: (input: T, meta: { attempt: number; ok: boolean }) => Promise<[T, boolean]>,',
    '  ...flags: Array<Record<string, number | boolean>>',
    '): Promise<{ host: string; port: number }> {',
    '  return Promise.resolve({ host, port });',
    '}',
  ].join('\n');

  const result = extractSourceFacts({ path: 'src/config.ts', text: code });
  assert.equal(result.coverage.status, 'complete');
  assert.equal(result.symbols.length, 1);

  const sym = result.symbols[0];
  assert.equal(sym.id, 'src/config.ts:configure:function');
  assert.deepEqual(sym.parameters, [
    '{ host = "127.0.0.1", port = 8080, nested: { retries = 3, tags = ["a", "b"] } = {} }: ServerConfig = defaultConfig(1, 2)',
    '[primary, fallback = "none", ...extra]: [string, string, ...string[]]',
    'transform?: (input: T, meta: { attempt: number; ok: boolean }) => Promise<[T, boolean]>',
    '...flags: Array<Record<string, number | boolean>>',
  ]);
  assert.equal(sym.declaredReturnType, 'Promise<{ host: string; port: number }>');
  assert.deepEqual(result.symbolFacts[sym.id].parameters, sym.parameters);
  assert.equal(result.symbolFacts[sym.id].declaredReturnType, sym.declaredReturnType);
});

test('extractSourceFacts: extracts arrow functions, function expressions, classes and methods', () => {
  const code = [
    'const singleArrow = x => x * 2;',
    'const typedArrow = async (a: number, b: string = "hi"): Promise<string> => `${b}:${a}`;',
    'const fnExpr = function(items: readonly string[], sep = ","): string {',
    '  return items.join(sep);',
    '};',
    'export class SessionStore {',
    '  constructor(private readonly root: string, public maxItems: number = 100) {}',
    '  get count(): number { return 0; }',
    '  set count(val: number) {}',
    '  async save({ id, data }: { id: string; data: Uint8Array }, force = false): Promise<boolean> {',
    '    return Boolean(id && data && force);',
    '  }',
    '  isValid(candidate: unknown): candidate is SessionStore {',
    '    return candidate instanceof SessionStore;',
    '  }',
    '  #internalCheck(...codes: number[]) {',
    '    return codes.length > 0;',
    '  }',
    '}',
  ].join('\n');

  const result = extractSourceFacts({ path: 'src/session-store.ts', text: code });
  assert.equal(result.coverage.status, 'complete');

  const byId = result.symbolFacts;

  assert.deepEqual(byId['src/session-store.ts:singleArrow:variable'].parameters, ['x']);
  assert.equal(byId['src/session-store.ts:singleArrow:variable'].declaredReturnType, null);

  assert.deepEqual(byId['src/session-store.ts:typedArrow:variable'].parameters, ['a: number', 'b: string = "hi"']);
  assert.equal(byId['src/session-store.ts:typedArrow:variable'].declaredReturnType, 'Promise<string>');

  assert.deepEqual(byId['src/session-store.ts:fnExpr:variable'].parameters, ['items: readonly string[]', 'sep = ","']);
  assert.equal(byId['src/session-store.ts:fnExpr:variable'].declaredReturnType, 'string');

  assert.deepEqual(byId['src/session-store.ts:SessionStore:class'].parameters, []);
  assert.equal(byId['src/session-store.ts:SessionStore:class'].declaredReturnType, null);

  assert.deepEqual(byId['src/session-store.ts:SessionStore.constructor:method'].parameters, [
    'private readonly root: string',
    'public maxItems: number = 100',
  ]);
  assert.equal(byId['src/session-store.ts:SessionStore.constructor:method'].declaredReturnType, null);

  assert.deepEqual(byId['src/session-store.ts:SessionStore.count:method'].parameters, []);
  assert.equal(byId['src/session-store.ts:SessionStore.count:method'].declaredReturnType, 'number');

  assert.deepEqual(byId['src/session-store.ts:SessionStore.count:method#2'].parameters, ['val: number']);
  assert.equal(byId['src/session-store.ts:SessionStore.count:method#2'].declaredReturnType, null);

  assert.deepEqual(byId['src/session-store.ts:SessionStore.save:method'].parameters, [
    '{ id, data }: { id: string; data: Uint8Array }',
    'force = false',
  ]);
  assert.equal(byId['src/session-store.ts:SessionStore.save:method'].declaredReturnType, 'Promise<boolean>');

  assert.deepEqual(byId['src/session-store.ts:SessionStore.isValid:method'].parameters, ['candidate: unknown']);
  assert.equal(byId['src/session-store.ts:SessionStore.isValid:method'].declaredReturnType, 'candidate is SessionStore');

  assert.deepEqual(byId['src/session-store.ts:SessionStore.#internalCheck:method'].parameters, ['...codes: number[]']);
  assert.equal(byId['src/session-store.ts:SessionStore.#internalCheck:method'].declaredReturnType, null);
});

test('extractSourceFacts: JS and untyped TS functions return null declaredReturnType without inferring return types', () => {
  const jsCode = [
    '/**',
    ' * @param {number} a',
    ' * @param {number} b',
    ' * @returns {number}',
    ' */',
    'function sum(a, b = 10, ...rest) {',
    '  return a + b + rest.length;',
    '}',
    'const makeLabel = ({ prefix = "id" }, index) => `${prefix}_${index}`;',
    'class Counter {',
    '  increment(step = 1) {',
    '    return step;',
    '  }',
    '}',
  ].join('\n');

  const result = extractSourceFacts({ path: 'src/counter.js', text: jsCode });
  assert.equal(result.language, 'javascript');
  assert.equal(result.coverage.status, 'complete');

  assert.deepEqual(result.symbolFacts['src/counter.js:sum:function'].parameters, ['a', 'b = 10', '...rest']);
  assert.equal(result.symbolFacts['src/counter.js:sum:function'].declaredReturnType, null);

  assert.deepEqual(result.symbolFacts['src/counter.js:makeLabel:variable'].parameters, ['{ prefix = "id" }', 'index']);
  assert.equal(result.symbolFacts['src/counter.js:makeLabel:variable'].declaredReturnType, null);

  assert.deepEqual(result.symbolFacts['src/counter.js:Counter.increment:method'].parameters, ['step = 1']);
  assert.equal(result.symbolFacts['src/counter.js:Counter.increment:method'].declaredReturnType, null);
});

test('extractSourceFacts: normalizedSyntaxHash ignores whitespace and comments but changes on string literal or token edits', () => {
  const baseCode = [
    'export function formatGreeting(name: string, punctuation = "!"): string {',
    '  const prefix = "Hello, ";',
    '  return `${prefix}${name}${punctuation}`;',
    '}',
  ].join('\n');

  const commentAndWhitespaceCode = [
    '// Header comment before export',
    'export   function   formatGreeting (',
    '  /* param 1 */ name: string ,',
    '  punctuation = "!" // default punctuation',
    ') : /* return annotation */ string',
    '{',
    '  /* multi-line',
    '     block comment with "quoted text" and () {} ;',
    '  */',
    '  const   prefix = "Hello, " ;',
    '  return `${ prefix /* inline comment */ }${ name }${ punctuation }` ;',
    '}',
  ].join('\r\n');

  const changedStringLiteralCode = [
    'export function formatGreeting(name: string, punctuation = "!"): string {',
    '  const prefix = "Hello,  ";',
    '  return `${prefix}${name}${punctuation}`;',
    '}',
  ].join('\n');

  const changedTemplateLiteralCode = [
    'export function formatGreeting(name: string, punctuation = "!"): string {',
    '  const prefix = "Hello, ";',
    '  return ` ${prefix}${name}${punctuation}`;',
    '}',
  ].join('\n');

  const changedIdentifierCode = [
    'export function formatGreeting(name: string, punctuation = "!"): string {',
    '  const label = "Hello, ";',
    '  return `${label}${name}${punctuation}`;',
    '}',
  ].join('\n');

  const changedTokenOrderCode = [
    'export function formatGreeting(name: string, punctuation = "!"): string {',
    '  const prefix = "Hello, ";',
    '  return `${name}${prefix}${punctuation}`;',
    '}',
  ].join('\n');

  const resBase = extractSourceFacts({ path: 'src/greet.ts', text: baseCode });
  const resComments = extractSourceFacts({ path: 'src/greet.ts', text: commentAndWhitespaceCode });
  const resChangedStr = extractSourceFacts({ path: 'src/greet.ts', text: changedStringLiteralCode });
  const resChangedTpl = extractSourceFacts({ path: 'src/greet.ts', text: changedTemplateLiteralCode });
  const resChangedIdent = extractSourceFacts({ path: 'src/greet.ts', text: changedIdentifierCode });
  const resChangedOrder = extractSourceFacts({ path: 'src/greet.ts', text: changedTokenOrderCode });

  const symId = 'src/greet.ts:formatGreeting:function';

  // Exact contentHash differs when comments/whitespace are added, but normalizedSyntaxHash is identical
  assert.notEqual(resBase.contentHash, resComments.contentHash);
  assert.notEqual(resBase.symbolFacts[symId].contentHash, resComments.symbolFacts[symId].contentHash);
  assert.equal(resBase.normalizedSyntaxHash, resComments.normalizedSyntaxHash);
  assert.equal(
    resBase.symbolFacts[symId].normalizedSyntaxHash,
    resComments.symbolFacts[symId].normalizedSyntaxHash
  );
  assert.deepEqual(resComments.symbolFacts[symId].parameters, ['name: string', 'punctuation = "!" // default punctuation']);
  assert.equal(resBase.symbolFacts[symId].declaredReturnType, resComments.symbolFacts[symId].declaredReturnType);
  assert.equal(canClaimSafeNoCodeChange(resBase, resComments), false);

  // String literal, template literal, identifier, and token order changes MUST change normalizedSyntaxHash
  assert.notEqual(resBase.normalizedSyntaxHash, resChangedStr.normalizedSyntaxHash);
  assert.notEqual(
    resBase.symbolFacts[symId].normalizedSyntaxHash,
    resChangedStr.symbolFacts[symId].normalizedSyntaxHash
  );
  assert.equal(canClaimSafeNoCodeChange(resBase, resChangedStr), false);

  assert.notEqual(resBase.normalizedSyntaxHash, resChangedTpl.normalizedSyntaxHash);
  assert.notEqual(
    resBase.symbolFacts[symId].normalizedSyntaxHash,
    resChangedTpl.symbolFacts[symId].normalizedSyntaxHash
  );
  assert.equal(canClaimSafeNoCodeChange(resBase, resChangedTpl), false);

  assert.notEqual(resBase.normalizedSyntaxHash, resChangedIdent.normalizedSyntaxHash);
  assert.equal(canClaimSafeNoCodeChange(resBase, resChangedIdent), false);

  assert.notEqual(resBase.normalizedSyntaxHash, resChangedOrder.normalizedSyntaxHash);
  assert.equal(canClaimSafeNoCodeChange(resBase, resChangedOrder), false);
});

test('extractSourceFacts: unsupported languages and partial/parse-error coverage are explicit and disable safe-no-code-change claims', () => {
  // 1. Unsupported file extensions
  for (const file of ['README.md', 'script.py', 'data.json', 'main.rs', 'no_ext']) {
    const res1 = extractSourceFacts({ path: file, text: '# some content\n' });
    const res2 = extractSourceFacts({ path: file, text: '# some content\n' });
    assert.equal(res1.language, 'unsupported', file);
    assert.equal(res1.coverage.status, 'unsupported', file);
    assert.equal(res1.coverage.unsupported, true, file);
    assert.equal(res1.coverage.partial, false, file);
    assert.equal(res1.coverage.safeNoCodeChange, false, file);
    assert.equal(res1.safeNoCodeChange, false, file);
    assert.equal(res1.normalizedSyntaxHash, null, file);
    assert.deepEqual(res1.symbols, [], file);
    assert.deepEqual(res1.symbolFacts, {}, file);
    assert.equal(canClaimSafeNoCodeChange(res1, res2), false, file);
  }

  // 2. Parse error / malformed syntax
  const malformed1 = 'function good(x: number): number { return x; }\nfunction broken( {\n';
  const malformed2 = '// comment added\nfunction good(x: number): number { return x; }\nfunction broken( {\n';
  const brokenRes1 = extractSourceFacts({ path: 'src/broken.ts', text: malformed1 });
  const brokenRes2 = extractSourceFacts({ path: 'src/broken.ts', text: malformed2 });

  assert.equal(brokenRes1.coverage.status, 'partial');
  assert.equal(brokenRes1.coverage.partial, true);
  assert.equal(brokenRes1.coverage.parseError, true);
  assert.equal(brokenRes1.coverage.safeNoCodeChange, false);
  assert.equal(brokenRes1.safeNoCodeChange, false);
  assert.equal(brokenRes1.normalizedSyntaxHash, null);
  assert.equal(canClaimSafeNoCodeChange(brokenRes1, brokenRes2), false);

  // Valid symbol before the error still keeps its per-symbol facts keyed by ID
  assert.ok(brokenRes1.symbolFacts['src/broken.ts:good:function']);
  assert.deepEqual(brokenRes1.symbolFacts['src/broken.ts:good:function'].parameters, ['x: number']);
  assert.equal(brokenRes1.symbolFacts['src/broken.ts:good:function'].declaredReturnType, 'number');

  // 3. Unsupported anonymous default class syntax
  const anonClass = extractSourceFacts({ path: 'src/anon.js', text: 'export default class { run() { return 1; } }' });
  assert.equal(anonClass.coverage.status, 'partial');
  assert.equal(anonClass.coverage.partial, true);
  assert.equal(anonClass.coverage.safeNoCodeChange, false);
  assert.equal(anonClass.safeNoCodeChange, false);
  assert.equal(anonClass.normalizedSyntaxHash, null);
  assert.equal(canClaimSafeNoCodeChange(anonClass, anonClass), false);

  // 4. Input size bound exceeded (> 256KiB)
  const oversizedText = 'function ok() {}\n' + ' '.repeat(MAX_INPUT_BYTES);
  const oversizedRes = extractSourceFacts({ path: 'src/oversized.js', text: oversizedText });
  assert.equal(oversizedRes.coverage.status, 'partial');
  assert.equal(oversizedRes.coverage.partial, true);
  assert.equal(oversizedRes.coverage.safeNoCodeChange, false);
  assert.equal(oversizedRes.safeNoCodeChange, false);
  assert.equal(oversizedRes.normalizedSyntaxHash, null);
  assert.ok(oversizedRes.coverage.omissions.includes('input_size_exceeded'));
  assert.equal(canClaimSafeNoCodeChange(oversizedRes, oversizedRes), false);

  // 5. Symbol count bound exceeded (> 1000 symbols)
  const manyParts = [];
  for (let i = 0; i < MAX_SYMBOLS + 10; i++) {
    manyParts.push(`function f${i}(a) { return a; }`);
  }
  const manyRes = extractSourceFacts({ path: 'src/many.js', text: manyParts.join('\n') });
  assert.equal(manyRes.symbols.length, MAX_SYMBOLS);
  assert.equal(manyRes.coverage.status, 'partial');
  assert.equal(manyRes.coverage.partial, true);
  assert.equal(manyRes.coverage.safeNoCodeChange, false);
  assert.equal(manyRes.safeNoCodeChange, false);
  assert.equal(manyRes.normalizedSyntaxHash, null);
  assert.ok(manyRes.coverage.omissions.includes('symbol_count_exceeded'));
  assert.equal(canClaimSafeNoCodeChange(manyRes, manyRes), false);
});


test('changed return-line structure and compiler comments never receive an unchanged-source certificate', () => {
  const plain = { path: 'asi.js', text: 'function f(){return 1}' };
  const newline = { path: 'asi.js', text: 'function f(){return\n1}' };
  const directive = { path: 'asi.js', text: '/* @__PURE__ */ function f(){return 1}' };
  assert.notEqual(extractSourceFacts(plain).normalizedSyntaxHash, extractSourceFacts(newline).normalizedSyntaxHash);
  assert.equal(canClaimSafeNoCodeChange(plain, newline), false);
  assert.equal(canClaimSafeNoCodeChange(plain, directive), false);
  assert.equal(canClaimSafeNoCodeChange(plain, plain), true);
});


test('valid TypeScript outside parser grammar remains an explicit coverage gap', () => {
  const result = extractSourceFacts({ path: 'tuple.ts', text: 'function f([a,b]: [string, string?]) { return a; }' });
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.parseError, true);
  assert.equal(result.normalizedSyntaxHash, null);
});

test('parse coverage does not imply exhaustive CommonJS, class-field or type declaration coverage', () => {
  for (const text of ['module.exports = function(a) {};', 'exports.run = (a) => a;', 'class A { h = (x) => x; }', 'export default (x => x);', 'type T = string;', 'namespace N { export function f(a) {} }']) {
    const result = extractSourceFacts({ path: 'scope.ts', text });
    assert.equal(result.coverage.declarationCoverage, 'partial', text);
    assert.ok(result.coverage.unsupportedForms.length || result.coverage.partial, text);
  }
  assert.equal(canClaimSafeNoCodeChange({ path: 'a.cjs', text: 'function f(){}' }, { path: 'a.mjs', text: 'function f(){}' }), false);
  assert.equal(canClaimSafeNoCodeChange({ coverage: { status: 'complete' }, contentHash: 'a'.repeat(64) }, { coverage: { status: 'complete' }, contentHash: 'a'.repeat(64) }), false);
});
