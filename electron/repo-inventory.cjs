'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const EXCLUDED = new Set(['.git', '.hg', '.svn', 'node_modules', '.dart_tool', '.gradle', '.idea', '.vscode', '.build', 'build', 'dist', 'target', 'out', 'coverage', 'vendor', '.ssh', '.aws', '.azure', '.kube', '.gnupg', '.agentdock', '.codex', '.claude', '.openai', '.wrangler', '.cache', '.next', '.nuxt', '.svelte-kit', '.pytest_cache', '.mypy_cache', '.ruff_cache', '__pycache__', '.venv', 'venv', '.tox', '.nox', 'library', 'temp', 'obj', 'bin', 'logs']);
const SOURCE = new Set(['js', 'cjs', 'mjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'go', 'rs', 'dart', 'cs', 'c', 'h', 'cpp', 'hpp', 'cc', 'java', 'kt', 'swift', 'sh', 'ps1', 'cmd', 'bat', 'rb', 'php', 'lua', 'sql', 'html', 'vue', 'svelte']);
const ASSET = new Set(['css', 'scss', 'sass', 'less', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'ttf', 'woff', 'woff2', 'wav', 'mp3', 'ogg', 'mp4', 'glb', 'fbx', 'blend', 'unity', 'prefab', 'mat']);
const PRIVATE_FILES = ['.npmrc', '.pypirc', '.netrc', '.git-credentials', '.pgpass', 'vault.json', 'auth.json'];
const PRIVATE_PATTERNS = [/^\.env/i, /^(secrets?|credentials?|private)/i, /^id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i, /^client_secret/i, /\.(pem|key|pfx|p12|jks|keystore)$/i];
const PRIVATE_DIRS = new Set(['.ssh', '.aws', '.azure', '.kube', '.gnupg', '.codex', '.claude', '.openai', '.wrangler', '.agentdock']);
const POLICY = 'default-exclusions-only-v1:' + createHash('sha256').update(JSON.stringify({ excluded: [...EXCLUDED].sort(), privateFiles: PRIVATE_FILES, privateDirectories: [...PRIVATE_DIRS].sort(), privatePatterns: PRIVATE_PATTERNS.map(String), buildDirectoryPattern: '^build[-_]', source: [...SOURCE].sort(), asset: [...ASSET].sort(), classificationVersion: 1 })).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function privateName(name) {
  return PRIVATE_FILES.includes(name.toLowerCase()) || PRIVATE_PATTERNS.some(pattern => pattern.test(name));
}
function kindFor(relative) {
  const lower = relative.toLowerCase(), name = path.posix.basename(lower), ext = path.posix.extname(name).slice(1);
  if (lower.split('/').some(part => ['test', 'tests', '__tests__', 'spec', 'specs'].includes(part)) || /(^test_|[._-](test|spec)\.)/.test(name)) return 'test';
  if (['md', 'rst', 'adoc', 'tex'].includes(ext) || /^(readme|license|copying|authors)(\.|$)/.test(name)) return 'docs';
  if (/^(package(-lock)?\.json|pubspec\.(yaml|lock)|cargo\.(toml|lock)|pyproject\.toml|cmakelists\.txt|makefile|dockerfile|go\.(mod|sum)|requirements.*\.txt|.*\.config\..*|tsconfig.*\.json)$/.test(name) || ['yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext)) return 'config';
  if (SOURCE.has(ext)) return 'source';
  if (ASSET.has(ext)) return 'asset';
  if (['json', 'jsonl', 'csv', 'tsv', 'txt', 'xml', 'ipynb'].includes(ext)) return 'data';
  return 'other';
}
// Explicit source selections need not traverse an asset-heavy repository first.
// Apply the same private/excluded-name policy to every ancestor before safeRead.
function sourcePathAllowed(value) {
  if (typeof value !== 'string' || !value || value.length > 1000 || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/')) return false;
  const parts = value.split('/');
  if (parts.length > 32 || parts.some(part => !part || part === '.' || part === '..' || privateName(part) || PRIVATE_DIRS.has(part.toLowerCase()))) return false;
  if (parts.slice(0, -1).some(part => EXCLUDED.has(part.toLowerCase()) || /^build[-_]/i.test(part))) return false;
  return ['source', 'config', 'docs'].includes(kindFor(value));
}
function inventoryOptions(options = {}) {
  const { maxEntries = 10000, maxDepth = 12 } = options || {};
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 20000 || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new Error('Invalid inventory bounds.');
  return { maxEntries, maxDepth };
}
function inventoryRepository(root, options) {
  const { maxEntries, maxDepth } = inventoryOptions(options);
  if (typeof root !== 'string' || root.includes('\0') || !path.isAbsolute(root)) throw new Error('Choose an absolute repository directory.');
  let canonical, identity;
  try {
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
    canonical = fs.realpathSync(root); identity = stat;
  } catch { throw new Error('Repository root must be an existing directory without a root link.'); }
  const files = [], reasons = new Set();
  let examined = 0, excluded = 0, unreadable = 0, symlinks = 0, truncated = false, lookaheadEntries = 0;
  const excludedByRule = {}, excludedDirectories = [];
  function exclude(rule, relative) { excluded++; excludedByRule[rule] = (excludedByRule[rule] || 0) + 1; if (relative) excludedDirectories.push({ path: relative, rule }); }
  const inside = actual => { const rel = path.relative(canonical, actual); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  function walk(directory, relative, depth) {
    let handle, before;
    const names = [];
    try {
      before = fs.lstatSync(directory);
      if (before.isSymbolicLink() || !before.isDirectory() || !inside(fs.realpathSync(directory))) { reasons.add('changed-directory'); return; }
      handle = fs.opendirSync(directory);
      while (examined < maxEntries) {
        const entry = handle.readSync(); if (!entry) break;
        examined++; names.push(entry.name);
      }
      if (examined >= maxEntries && handle.readSync()) { lookaheadEntries++; truncated = true; reasons.add('entry-limit'); }
    } catch { unreadable++; reasons.add('unreadable-directory'); return; }
    finally { try { handle?.closeSync(); } catch { reasons.add('directory-close-failed'); } }
    const start = files.length;
    for (const name of names.sort(compare)) {
      const child = path.join(directory, name), rel = relative ? relative + '/' + name : name;
      if (privateName(name) || PRIVATE_DIRS.has(name.toLowerCase())) { exclude('private-name'); continue; }
      try {
        const stat = fs.lstatSync(child);
        if (stat.isSymbolicLink()) { symlinks++; reasons.add('symlink-skipped'); continue; }
        if (!inside(fs.realpathSync(child))) { reasons.add('outside-root'); continue; }
        if (stat.isDirectory()) {
          if (EXCLUDED.has(name.toLowerCase())) { exclude('directory-name-hint', rel); continue; }
          if (/^build[-_]/i.test(name)) { exclude('build-prefix-directory-hint', rel); continue; }
          if (depth >= maxDepth) { truncated = true; reasons.add('depth-limit'); }
          else walk(child, rel, depth + 1);
        } else if (stat.isFile()) {
          if (['.git', '.hg', '.svn'].includes(name.toLowerCase())) { exclude('version-control-marker'); continue; }
          const after = fs.lstatSync(child);
          if (!after.isFile() || after.isSymbolicLink() || !same(stat, after) || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) { reasons.add('changed-file'); continue; }
          files.push({ path: rel, size: stat.size, mtimeMs: stat.mtimeMs, kind: kindFor(rel), languageHint: SOURCE.has(path.extname(name).slice(1).toLowerCase()) || /\.(css|scss|sass|less)$/i.test(name) ? path.extname(name).slice(1).toLowerCase() : null });
        } else reasons.add('nonregular-skipped');
      } catch { unreadable++; reasons.add('unreadable-entry'); }
    }
    try {
      const after = fs.lstatSync(directory);
      if (after.isSymbolicLink() || !after.isDirectory() || !same(before, after) || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !inside(fs.realpathSync(directory))) { files.splice(start); reasons.add('changed-directory'); }
    } catch { files.splice(start); unreadable++; reasons.add('changed-directory'); }
  }
  walk(canonical, '', 0);
  try {
    const after = fs.lstatSync(root);
    if (after.isSymbolicLink() || !same(identity, after) || fs.realpathSync(root) !== canonical) { files.length = 0; reasons.add('changed-root'); }
  } catch { files.length = 0; reasons.add('changed-root'); }
  files.sort((a, b) => compare(a.path, b.path));
  const counts = { source: 0, test: 0, docs: 0, config: 0, asset: 0, data: 0, other: 0 };
  for (const file of files) counts[file.kind]++;
  const result = { schemaVersion: 1, policy: POLICY, contentHashed: false, sourceSnapshot: null,
    consistency: 'live-metadata-not-atomic', options: { maxEntries, maxDepth }, files, counts,
    coverage: { complete: reasons.size === 0, truncated, reasons: [...reasons].sort(compare), examined, lookaheadEntries, excluded, excludedByRule, excludedDirectories: excludedDirectories.sort((a,b) => compare(a.path,b.path)), unreadable, symlinks } };
  const inventoryId = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return { inventoryId, ...result };
}
module.exports = { inventoryRepository, inventoryOptions, sourcePathAllowed };
