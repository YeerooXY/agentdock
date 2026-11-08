#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { scaffold, addSection, rootPath, checkedPath, readJson } = require('../electron/documentation-scaffold.cjs');
const { SourceSnapshots } = require('../electron/source-snapshots.cjs');
const { extractSourceFacts } = require('../electron/source-facts.cjs');
const { inventoryRepository } = require('../electron/repo-inventory.cjs');
const { planChanges } = require('../electron/documentation-changes.cjs');
const { portableContext } = require('../electron/documentation-context.cjs');
const { validateMap } = require('../electron/documentation-validation.cjs');
const HELP = 'Usage: node documentation.cjs <init|add|directory|context|snapshot|facts|extract|diff|validate> --root <repository> [options]. No model calls. See references/deterministic-tools.md.';
const options = {
  init: ['root', 'folders'], add: ['root', 'address', 'title', 'id'],
  directory: ['root', 'address'], context: ['root', 'snapshot', 'paths', 'symbol', 'query', 'max-bytes'],
  snapshot: ['root', 'paths'], facts: ['root', 'snapshot', 'path'],
  extract: ['root', 'snapshot', 'path', 'symbol'], diff: ['root', 'base', 'target'], validate: ['root', 'snapshot']
};
function parse(args) {
  const [command, ...rest] = args;
  if (!options[command]) throw Error(HELP);
  const values = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].startsWith('--') ? rest[i].slice(2) : '';
    if (!options[command].includes(key) || Object.hasOwn(values, key)) throw Error('Unknown or repeated option: ' + rest[i]);
    if (key === 'folders') values[key] = true;
    else {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw Error('Missing value: ' + rest[i]);
      values[key] = rest[++i];
    }
  }
  if (!values.root) throw Error('Choose --root explicitly.');
  return { command, values };
}
function run(args) {
  const { command, values: v } = parse(args), root = rootPath(path.resolve(v.root));
  const sources = new SourceSnapshots(checkedPath(root, '.build/documentation'), { extract: extractSourceFacts });
  if (command === 'init') return scaffold(root, { folders: !!v.folders });
  if (command === 'add') return addSection(root, v);
  if (command === 'context') {
    if (v.symbol && (!v.paths || v.paths.includes(','))) throw Error('Choose one --paths value for --symbol.');
    return portableContext(root, sources, { ...(v.snapshot ? { snapshotId: v.snapshot } : {}), ...(v.query ? { query: v.query } : {}), ...(v.paths ? { targets: v.paths.split(',').map(p => ({ path: p, ...(v.symbol ? { symbolId: v.symbol } : {}) })) } : {}), ...(v['max-bytes'] ? { maxBytes: Number(v['max-bytes']) } : {}) });
  }
  if (command === 'directory') {
    if (v.address !== undefined && !/^[0-7](?:\.[1-9]\d{0,3}){0,2}$/.test(v.address)) throw Error('Invalid directory address.');
    const data = readJson(root, 'docs/knowledge/map.json');
    if (data.schemaVersion !== 1 || !Array.isArray(data.sections) || data.sections.length > 500) throw Error('Invalid documentation map.');
    return { taxonomyVersion: data.taxonomyVersion, sections: data.sections.filter(s => v.address === undefined || s.address === v.address || s.address.startsWith(v.address + '.')), modelCalls: 0 };
  }
  if (command === 'snapshot') {
    const inventory = inventoryRepository(root);
    const paths = v.paths === undefined ? inventory.files.filter(f => ['source', 'config'].includes(f.kind)).slice(0, 512).map(f => f.path) : v.paths.split(',');
    const result = sources.capture('standalone', root, { paths, maxFiles: Math.max(1, paths.length) });
    return { ...result, inventoryCoverage: inventory.coverage, defaultSelectionTruncated: !v.paths && inventory.files.filter(f => ['source', 'config'].includes(f.kind)).length > 512, modelCalls: 0 };
  }
  if (command === 'extract') {
    if (!v.path) throw Error('Choose --path from the snapshot.');
    return sources.read('standalone', { snapshotId: v.snapshot, path: v.path, ...(v.symbol ? { symbolId: v.symbol } : {}) });
  }
  if (command === 'facts') {
    const snapshot = sources.load('standalone', v.snapshot), file = snapshot.files.find(f => f.path === v.path);
    if (!file) throw Error('Choose --path from the snapshot.');
    const facts = extractSourceFacts({ path: file.path, text: file.text });
    delete facts.symbolFacts; // Symbols already carry these fields, keyed by id.
    if (Buffer.byteLength(JSON.stringify(facts)) > 65536) throw Error('Facts exceed 64 KiB; extract individual declarations instead.');
    return { snapshotId: v.snapshot, path: file.path, ...facts, modelCalls: 0 };
  }
  if (command === 'diff') {
    const map = readJson(root, 'docs/knowledge/map.json');
    if (map.schemaVersion !== 1 || map.taxonomyVersion !== 1 || !Array.isArray(map.sections) || map.sections.length > 500) throw Error('Invalid documentation map.');
    return planChanges(sources.load('standalone', v.base), sources.load('standalone', v.target), map.sections);
  }
  return validateMap(root, v.snapshot ? sources.load('standalone', v.snapshot) : undefined);
}
if (require.main === module) {
  try {
    const result = run(process.argv.slice(2));
    const output = process.argv[2] === 'context' ? JSON.stringify(result) : JSON.stringify(result, null, 2);
    if (Buffer.byteLength(output) > 262144) throw Error('Response exceeds 256 KiB. Select fewer source paths or extract one declaration.');
    console.log(output);
    if (result.valid === false) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { run, parse };
