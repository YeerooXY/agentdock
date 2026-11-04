#!/usr/bin/env node
'use strict';
// Code health numbers for Paddock: file sizes, long functions, duplicated
// blocks and provider-specific branches outside the provider adapters.
// Raw counts only, no weighting. Usage:
//   node scripts/code-health.cjs [--root dir] [--json out.json] [--compare earlier.json]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROVIDERS = ['codex', 'claude', 'antigravity', 'copilot', 'opencode', 'cursor', 'grok', 'kiro', 'qwen', 'kimi', 'cline', 'droid', 'pi', 'gemini', 'strata'];
const SOURCES = [['electron', /\.(cjs|mjs)$/], ['src', /\.(js|css)$/], ['mobile/lib', /\.dart$/]];
const SKIP = new Set(['node_modules', 'dist', '.build', 'release', 'tests', 'test']);
const WINDOW = 8, LONG_FUNCTION = 80, LARGE_FILE = 1000;

function walk(dir, pattern, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pattern, out);
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

const FUNCTION_START = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(|^\s*(?:static\s+)?(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{\s*$|^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'else']);
// Brace matching from each definition line. Strings and comments are skipped
// roughly; good enough to rank long functions, not a parser.
function functions(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const match = FUNCTION_START.exec(lines[i]);
    const name = match && (match[1] || match[2] || match[3]);
    if (!name || KEYWORDS.has(name)) continue;
    let depth = 0, opened = false, end = i;
    for (let j = i; j < lines.length; j++) {
      const code = lines[j].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '');
      for (const char of code) {
        if (char === '{') { depth++; opened = true; } else if (char === '}') depth--;
      }
      if (opened && depth <= 0) { end = j; break; }
      end = j;
    }
    if (opened) found.push({ name, line: i + 1, length: end - i + 1 });
  }
  return found;
}

const trivial = line => /^[\s{}()[\];,]*$/.test(line);
function windows(lines) {
  const kept = [];
  lines.forEach((line, index) => { const text = line.trim(); if (text && !trivial(text)) kept.push({ text, line: index + 1 }); });
  const out = [];
  for (let i = 0; i + WINDOW <= kept.length; i++) {
    const block = kept.slice(i, i + WINDOW);
    out.push({ hash: crypto.createHash('sha1').update(block.map(item => item.text).join('\n')).digest('hex'), line: block[0].line, preview: block[0].text.slice(0, 80) });
  }
  return out;
}

const PROVIDER_LITERAL = new RegExp(`(['"])(${PROVIDERS.join('|')})\\1`, 'g');
function providerBranches(text) { return [...text.matchAll(PROVIDER_LITERAL)].length; }

function measure(root) {
  const files = SOURCES.flatMap(([dir, pattern]) => walk(path.join(root, dir), pattern));
  const report = { root, files: [], functions: [], duplicates: [], providers: [] };
  const seen = new Map();
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8'), lines = text.split(/\r?\n/);
    report.files.push({ file: relative, lines: lines.length });
    if (/\.(cjs|mjs|js)$/.test(file)) for (const fn of functions(lines)) report.functions.push({ file: relative, ...fn });
    if (!/\.css$/.test(file)) for (const block of windows(lines)) {
      if (!seen.has(block.hash)) seen.set(block.hash, { preview: block.preview, places: [] });
      seen.get(block.hash).places.push(`${relative}:${block.line}`);
    }
    if (!relative.startsWith('electron/providers/') && !/\.css$/.test(file)) {
      const count = providerBranches(text);
      if (count) report.providers.push({ file: relative, count });
    }
  }
  report.duplicates = [...seen.values()].filter(item => item.places.length > 1).sort((a, b) => b.places.length - a.places.length);
  report.files.sort((a, b) => b.lines - a.lines);
  report.functions.sort((a, b) => b.length - a.length);
  report.providers.sort((a, b) => b.count - a.count);
  report.summary = {
    lines: report.files.reduce((sum, item) => sum + item.lines, 0),
    largeFiles: report.files.filter(item => item.lines > LARGE_FILE).length,
    longFunctions: report.functions.filter(item => item.length > LONG_FUNCTION).length,
    duplicateWindows: report.duplicates.reduce((sum, item) => sum + item.places.length - 1, 0),
    providerBranches: report.providers.reduce((sum, item) => sum + item.count, 0)
  };
  return report;
}

const LABELS = { lines: 'lines', largeFiles: `files over ${LARGE_FILE} lines`, longFunctions: `functions over ${LONG_FUNCTION} lines`, duplicateWindows: 'duplicate windows', providerBranches: 'provider branches outside adapters' };
function summaryLine(summary) { return 'Health: ' + Object.keys(LABELS).map(key => `${LABELS[key]} ${summary[key]}`).join(', '); }
function format(report) {
  const out = ['Largest files'];
  for (const item of report.files.slice(0, 15)) out.push(`  ${String(item.lines).padStart(6)}  ${item.file}`);
  out.push('', 'Longest functions');
  for (const item of report.functions.slice(0, 15)) out.push(`  ${String(item.length).padStart(6)}  ${item.name}  ${item.file}:${item.line}`);
  out.push('', `Repeated ${WINDOW}-line blocks`);
  for (const item of report.duplicates.slice(0, 10)) out.push(`  ${item.places.length}x  ${item.preview}`, `       ${item.places.slice(0, 4).join(', ')}${item.places.length > 4 ? ' and more' : ''}`);
  out.push('', 'Provider names outside the adapters');
  for (const item of report.providers.slice(0, 10)) out.push(`  ${String(item.count).padStart(6)}  ${item.file}`);
  out.push('', summaryLine(report.summary));
  return out.join('\n');
}
function compare(now, before) {
  return ['Change since the earlier report'].concat(Object.keys(LABELS).map(key => {
    const delta = now[key] - (before?.[key] ?? 0);
    return `  ${LABELS[key]}: ${before?.[key] ?? 'unknown'} to ${now[key]} (${delta > 0 ? '+' : ''}${delta})`;
  })).join('\n');
}

function main(argv) {
  const option = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
  const root = path.resolve(option('--root') || path.join(__dirname, '..'));
  const report = measure(root);
  console.log(format(report));
  const earlier = option('--compare');
  if (earlier) console.log('\n' + compare(report.summary, JSON.parse(fs.readFileSync(earlier, 'utf8')).summary));
  const out = option('--json') || path.join(root, '.build', 'code-health.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), summary: report.summary, files: report.files, functions: report.functions.slice(0, 50), duplicates: report.duplicates.slice(0, 50), providers: report.providers }, null, 2));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { measure, functions, windows, providerBranches, compare, summaryLine };
