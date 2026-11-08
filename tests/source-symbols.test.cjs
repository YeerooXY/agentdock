'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  extractSymbols,
  EXTRACTOR,
  MAX_INPUT_BYTES,
  MAX_SYMBOLS
} = require('../electron/source-symbols.cjs');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('extractSymbols: returns expected top-level structure and deterministic results', () => {
  const code = 'function add(a, b) { return a + b; }\n';
  const res1 = extractSymbols({ path: 'src/math.js', text: code });
  const res2 = extractSymbols({ path: 'src/math.js', text: code });

  assert.deepEqual(res1, res2);
  assert.equal(res1.language, 'javascript');
  assert.equal(res1.extractor, EXTRACTOR);
  assert.equal(res1.contentHash, sha256(code));
  assert.equal(res1.symbols.length, 1);
  assert.equal(res1.coverage.status, 'complete');
  assert.equal(res1.coverage.partial, false);
  assert.equal(res1.coverage.completeDependencyGraph, false);
  assert.deepEqual(res1.coverage.reasons, []);
  assert.deepEqual(res1.coverage.omissions, []);
});

test('extractSymbols: handles missing or empty options safely', () => {
  const resEmpty = extractSymbols();
  assert.equal(resEmpty.language, 'unsupported');
  assert.deepEqual(resEmpty.symbols, []);
  assert.equal(resEmpty.coverage.status, 'unsupported');
  assert.equal(resEmpty.coverage.unsupported, true);

  const resBlankPath = extractSymbols({ path: '', text: 'function ok() {}' });
  assert.equal(resBlankPath.language, 'unsupported');
  assert.deepEqual(resBlankPath.symbols, []);
});

test('extractSymbols: extracts top-level functions, classes, and class methods', () => {
  const code = [
    'function topFn(x) { return x * 2; }',
    'async function asyncFn(url) { return fetch(url); }',
    'function* genFn() { yield 1; }',
    'class Calculator {',
    '  constructor(base) { this.base = base; }',
    '  add(n) { return this.base + n; }',
    '  static create(base) { return new Calculator(base); }',
    '  get current() { return this.base; }',
    '  set current(val) { this.base = val; }',
    '  #secret() { return 42; }',
    '  ["computed-method"]() { return true; }',
    '}'
  ].join('\n');

  const result = extractSymbols({ path: 'calc.cjs', text: code });
  assert.equal(result.language, 'javascript');
  assert.equal(result.coverage.status, 'complete');

  const names = result.symbols.map(s => s.name);
  assert.deepEqual(names, [
    'topFn',
    'asyncFn',
    'genFn',
    'Calculator',
    'Calculator.constructor',
    'Calculator.add',
    'Calculator.create',
    'Calculator.current',
    'Calculator.current', // getter and setter both named current
    'Calculator.#secret',
    'Calculator.["computed-method"]'
  ]);

  const kinds = result.symbols.map(s => s.kind);
  assert.deepEqual(kinds, [
    'function',
    'function',
    'function',
    'class',
    'method',
    'method',
    'method',
    'method',
    'method',
    'method',
    'method'
  ]);

  // Check ID structure
  assert.equal(result.symbols[0].id, 'calc.cjs:topFn:function');
  assert.equal(result.symbols[3].id, 'calc.cjs:Calculator:class');
  assert.equal(result.symbols[5].id, 'calc.cjs:Calculator.add:method');
  // Disambiguated setter
  assert.equal(result.symbols[7].id, 'calc.cjs:Calculator.current:method');
  assert.equal(result.symbols[8].id, 'calc.cjs:Calculator.current:method#2');

  // Verify exact slice hashes
  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: extracts function-valued variables at top level', () => {
  const code = [
    'const double = (x) => x * 2;',
    'let worker = async function(task) { return task(); };',
    'var dispatch = () => { return 1; };',
    'const notAFunction = 42;',
    'let str = "ignored";',
    'const obj = { nested() {} };',
    'const first = () => 1, ignoredVal = 100, second = function() { return 2; };'
  ].join('\n');

  const result = extractSymbols({ path: 'vars.mjs', text: code });
  assert.equal(result.language, 'javascript');

  const names = result.symbols.map(s => s.name);
  assert.deepEqual(names, ['double', 'worker', 'dispatch', 'first', 'second']);

  for (const sym of result.symbols) {
    assert.equal(sym.kind, 'variable');
    assert.ok(sym.id.startsWith('vars.mjs:'));
    assert.ok(sym.id.endsWith(':variable'));
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }

  assert.equal(result.symbols[0].signature, 'const double = (x) =>');
  assert.equal(result.symbols[1].signature, 'let worker = async function(task)');
  assert.equal(result.symbols[2].signature, 'var dispatch = () =>');
});

test('extractSymbols: extracts exported declarations and default exports', () => {
  const code = [
    'export function publicApi() { return true; }',
    'export class PublicService {',
    '  serve() { return "ok"; }',
    '}',
    'export const handler = (req, res) => { res.end(); };',
    'export default function defaultFn() { return 0; }'
  ].join('\n');

  const result = extractSymbols({ path: 'api.js', text: code });
  const names = result.symbols.map(s => s.name);
  assert.deepEqual(names, [
    'publicApi',
    'PublicService',
    'PublicService.serve',
    'handler',
    'defaultFn'
  ]);

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: anonymous default functions keep exact distinct locators', () => {
  const code = 'export default function() { return 1; }\nexport default () => { return 2; };';
  const result = extractSymbols({ path: 'anon.js', text: code });
  assert.equal(result.symbols.length, 2);
  assert.deepEqual(result.symbols.map(s => s.id), ['anon.js:default:function', 'anon.js:default:function#2']);
  for (const symbol of result.symbols) assert.equal(symbol.contentHash, sha256(code.slice(symbol.start, symbol.end)));
});

test('unsupported anonymous class syntax uses explicit partial coverage without a false declaration range', () => {
  const result = extractSymbols({ path: 'anon.js', text: 'export default class { run() { return 1; } }' });
  assert.equal(result.coverage.partial, true);
  assert.deepEqual(result.symbols, []);
  assert.ok(result.coverage.omissions.includes('syntax_declarations_omitted'));
});

test('extractSymbols: handles duplicate declarations with explicit disambiguation', () => {
  const code = [
    'function handle() { return 1; }',
    'function handle() { return 2; }',
    'function handle() { return 3; }'
  ].join('\n');

  const result = extractSymbols({ path: 'dupes.js', text: code });
  assert.equal(result.symbols.length, 3);
  assert.equal(result.symbols[0].id, 'dupes.js:handle:function');
  assert.equal(result.symbols[1].id, 'dupes.js:handle:function#2');
  assert.equal(result.symbols[2].id, 'dupes.js:handle:function#3');

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: handles CRLF line endings and line calculations', () => {
  const code = [
    'function firstLine() {\r',
    '  return 1;\r',
    '}\r',
    'class SecondClass {\r',
    '  method() {\r',
    '    return 2;\r',
    '  }\r',
    '}\r',
    'const arrow = () => 3;\r',
    ''
  ].join('\n');

  const result = extractSymbols({ path: 'crlf.js', text: code });
  assert.equal(result.symbols.length, 4);

  const fn = result.symbols[0];
  assert.equal(fn.name, 'firstLine');
  assert.equal(fn.startLine, 1);
  assert.equal(fn.endLine, 3);

  const cls = result.symbols[1];
  assert.equal(cls.name, 'SecondClass');
  assert.equal(cls.startLine, 4);
  assert.equal(cls.endLine, 8);

  const m = result.symbols[2];
  assert.equal(m.name, 'SecondClass.method');
  assert.equal(m.startLine, 5);
  assert.equal(m.endLine, 7);

  const arr = result.symbols[3];
  assert.equal(arr.name, 'arrow');
  assert.equal(arr.startLine, 9);
  assert.equal(arr.endLine, 9);

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: handles Unicode identifiers and astral plane characters', () => {
  const code = [
    '// Emojis and multi-byte characters: 🚀 🌟 🌍\n',
    'function café() {\n',
    '  const greeting = "Hello ☕";\n',
    '  return greeting;\n',
    '}\n',
    'function 你好(name) {\n',
    '  return `你好，${name} 🌸`;\n',
    '}\n',
    'class Rocket🚀Launch {\n',
    '  blastOff() {\n',
    '    return "3... 2... 1... 💥";\n',
    '  }\n',
    '}\n'
  ].join('');

  const result = extractSymbols({ path: 'unicode.js', text: code });
  assert.equal(result.symbols.length, 4);

  assert.equal(result.symbols[0].name, 'café');
  assert.equal(result.symbols[1].name, '你好');
  assert.equal(result.symbols[2].name, 'Rocket🚀Launch');
  assert.equal(result.symbols[3].name, 'Rocket🚀Launch.blastOff');

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: handles nested braces, template strings, regex and strings', () => {
  const code = [
    'function complexFunction() {\n',
    '  if (true) {\n',
    '    while (false) {\n',
    '      const nestedObj = { a: { b: { c: 1 } } };\n',
    '      const str = "braces inside string: { { } } }";\n',
    '      const re = /\\{[0-9]+\\}/;\n',
    '      const template = `nested ${() => { return "{nested template}"; }}`;\n',
    '    }\n',
    '  }\n',
    '  return true;\n',
    '}\n'
  ].join('');

  const result = extractSymbols({ path: 'nested.js', text: code });
  assert.equal(result.symbols.length, 1);
  const sym = result.symbols[0];
  assert.equal(sym.name, 'complexFunction');
  assert.equal(sym.startLine, 1);
  assert.equal(sym.endLine, 11);

  const slice = code.slice(sym.start, sym.end);
  assert.ok(slice.endsWith('}'));
  assert.equal(sym.contentHash, sha256(slice));
});

test('extractSymbols: extracts TypeScript parameters, generics and overloads', () => {
  const code = [
    'function query<T extends object>(endpoint: string, options?: { timeout?: number }): Promise<T> {',
    '  return Promise.resolve({} as T);',
    '}',
    'function overload(x: string): string;',
    'function overload(x: number): number;',
    'function overload(x: any): any { return x; }',
    'abstract class BaseService<T> {',
    '  constructor(protected readonly id: string) {}',
    '  abstract execute(arg: T): Promise<void>;',
    '  status(): string { return "active"; }',
    '}'
  ].join('\n');

  const result = extractSymbols({ path: 'service.ts', text: code });
  assert.equal(result.language, 'typescript');
  assert.equal(result.coverage.status, 'complete');

  const names = result.symbols.map(s => s.name);
  assert.deepEqual(names, [
    'query',
    'overload',
    'overload',
    'overload',
    'BaseService',
    'BaseService.constructor',
    'BaseService.execute',
    'BaseService.status'
  ]);

  // Check signatures
  assert.equal(
    result.symbols[0].signature,
    'function query<T extends object>(endpoint: string, options?: { timeout?: number }): Promise<T>'
  );
  assert.equal(result.symbols[1].signature, 'function overload(x: string): string');
  assert.equal(result.symbols[2].signature, 'function overload(x: number): number');
  assert.equal(result.symbols[3].signature, 'function overload(x: any): any');
  assert.equal(result.symbols[4].signature, 'abstract class BaseService<T>');
  assert.equal(result.symbols[6].signature, 'abstract execute(arg: T): Promise<void>');

  // Check overload IDs
  assert.equal(result.symbols[1].id, 'service.ts:overload:function');
  assert.equal(result.symbols[2].id, 'service.ts:overload:function#2');
  assert.equal(result.symbols[3].id, 'service.ts:overload:function#3');

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: supports JSX and TSX files', () => {
  const jsxCode = [
    'export const Button = ({ label, onClick }) => {',
    '  return <button onClick={onClick}>{label}</button>;',
    '};',
    'function Card({ children }) {',
    '  return <div className="card">{children}</div>;',
    '}'
  ].join('\n');

  const jsxResult = extractSymbols({ path: 'components/Button.jsx', text: jsxCode });
  assert.equal(jsxResult.language, 'jsx');
  assert.equal(jsxResult.coverage.status, 'complete');
  assert.equal(jsxResult.symbols.length, 2);
  assert.equal(jsxResult.symbols[0].name, 'Button');
  assert.equal(jsxResult.symbols[1].name, 'Card');

  const tsxCode = [
    'interface Props { title: string; }',
    'export const Header = (props: Props): JSX.Element => {',
    '  return <header><h1>{props.title}</h1></header>;',
    '};'
  ].join('\n');

  const tsxResult = extractSymbols({ path: 'components/Header.tsx', text: tsxCode });
  assert.equal(tsxResult.language, 'tsx');
  assert.equal(tsxResult.coverage.status, 'complete');
  assert.equal(tsxResult.symbols.length, 1);
  assert.equal(tsxResult.symbols[0].name, 'Header');
});

test('extractSymbols: malformed input reports partial coverage with reasons', () => {
  const malformed = 'function good() { return 1; }\nfunction broken( {\nclass Bad {';
  const result = extractSymbols({ path: 'broken.js', text: malformed });

  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.partial, true);
  assert.equal(result.coverage.completeDependencyGraph, false);
  assert.ok(result.coverage.reasons.length > 0);
  assert.ok(result.coverage.reasons.some(r => r.includes('Syntax error')));

  // Good declaration is still captured if parsed before the error
  assert.ok(result.symbols.some(s => s.name === 'good'));
});

test('extractSymbols: unsupported file extensions return empty symbols and explicit coverage', () => {
  const unsupportedFiles = ['doc.md', 'notes.txt', 'config.json', 'script.py', 'code.rs', 'no_extension'];
  for (const file of unsupportedFiles) {
    const result = extractSymbols({ path: file, text: 'some content' });
    assert.equal(result.language, 'unsupported', file);
    assert.deepEqual(result.symbols, [], file);
    assert.equal(result.coverage.status, 'unsupported', file);
    assert.equal(result.coverage.unsupported, true, file);
    assert.equal(result.coverage.partial, false, file);
    assert.equal(result.coverage.completeDependencyGraph, false, file);
    assert.ok(result.coverage.reasons.length > 0, file);
  }
});

test('extractSymbols: bounds input at 256KiB and reports explicit omission', () => {
  // 256KiB is 262144 bytes. Generate 262145 bytes.
  const largeText = 'function foo() {}\n' + ' '.repeat(MAX_INPUT_BYTES);
  assert.ok(Buffer.byteLength(largeText, 'utf8') > MAX_INPUT_BYTES);

  const result = extractSymbols({ path: 'large.js', text: largeText });
  assert.deepEqual(result.symbols, []);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.partial, true);
  assert.deepEqual(result.coverage.omissions, ['input_size_exceeded']);
  assert.ok(result.coverage.reasons.some(r => r.includes('256KiB')));
});

test('extractSymbols: bounds symbol count at 1000 and reports explicit omission', () => {
  // Generate 1050 functions
  const count = 1050;
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(`function fn${i}() { return ${i}; }`);
  }
  const code = parts.join('\n');

  const result = extractSymbols({ path: 'many.js', text: code });
  assert.equal(result.symbols.length, MAX_SYMBOLS);
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.coverage.partial, true);
  assert.deepEqual(result.coverage.omissions, ['symbol_count_exceeded']);
  assert.ok(result.coverage.reasons.some(r => r.includes('1000')));

  // Verify all 1000 symbols have valid exact hashes
  for (let i = 0; i < MAX_SYMBOLS; i++) {
    const sym = result.symbols[i];
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});

test('extractSymbols: matches TaskLoop.persist fixture pattern and qualified method naming', () => {
  const code = [
    'class TaskLoop {',
    '  persist(job) {',
    '    const owner = job?.parentId ? this.jobs.get(job.parentId) : job;',
    '    return true;',
    '  }',
    '}'
  ].join('\n');

  const result = extractSymbols({ path: 'electron/task-loop.cjs', text: code });
  assert.equal(result.symbols.length, 2);

  const cls = result.symbols[0];
  assert.equal(cls.name, 'TaskLoop');
  assert.equal(cls.kind, 'class');
  assert.equal(cls.id, 'electron/task-loop.cjs:TaskLoop:class');
  assert.equal(cls.signature, 'class TaskLoop');

  const method = result.symbols[1];
  assert.equal(method.name, 'TaskLoop.persist');
  assert.equal(method.kind, 'method');
  assert.equal(method.id, 'electron/task-loop.cjs:TaskLoop.persist:method');
  assert.equal(method.signature, 'persist(job)');
  assert.equal(method.startLine, 2);
  assert.equal(method.endLine, 5);

  const slice = code.slice(method.start, method.end);
  assert.equal(method.contentHash, sha256(slice));
});

test('extractSymbols: extracts TypeScript ambient declarations', () => {
  const code = [
    'declare function ambientGlobal(): string;',
    'export declare function exportedAmbient(arg: number): boolean;',
    'declare class AmbientWorker {',
    '  work(): void;',
    '}'
  ].join('\n');

  const result = extractSymbols({ path: 'ambient.d.ts', text: code });
  assert.equal(result.language, 'typescript');
  assert.equal(result.coverage.status, 'complete');

  const names = result.symbols.map(s => s.name);
  assert.deepEqual(names, [
    'ambientGlobal',
    'exportedAmbient',
    'AmbientWorker',
    'AmbientWorker.work'
  ]);

  assert.equal(result.symbols[0].signature, 'declare function ambientGlobal(): string');
  assert.equal(result.symbols[1].signature, 'export declare function exportedAmbient(arg: number): boolean');
  assert.equal(result.symbols[2].signature, 'declare class AmbientWorker');
  assert.equal(result.symbols[3].signature, 'work(): void');

  for (const sym of result.symbols) {
    const slice = code.slice(sym.start, sym.end);
    assert.equal(sym.contentHash, sha256(slice));
  }
});
