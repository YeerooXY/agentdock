'use strict';
// Explicit read-only pilot inputs. Output goes to the caller-selected report file.
const fs = require('node:fs'), path = require('node:path');
const { inventoryRepository, inventoryOptions } = require('../electron/repo-inventory.cjs');
const { atomicJson } = require('../electron/storage.cjs');
function survey(roots, options) {
  options = inventoryOptions(options);
  if (!Array.isArray(roots) || !roots.length || roots.length > 30) throw new Error('Choose 1 to 30 repository inputs.');
  return roots.map(entry => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.label !== 'string') throw new Error('Invalid inventory input.');
    const label = entry.label.split(': ')[0];
    try {
      const inventory = inventoryRepository(entry.path, options), languages = {}, areas = {};
      for (const file of inventory.files) {
        if (file.languageHint) {
          const ext = file.languageHint;
          languages[ext] = (languages[ext] || 0) + 1;
        }
        const area = file.path.includes('/') ? file.path.split('/')[0] : '<root>';
        areas[area] = (areas[area] || 0) + 1;
      }
      return { label, rootName: path.basename(entry.path), inventory, summary: {
        fileCount: inventory.files.length, bytes: inventory.files.reduce((n, file) => n + file.size, 0),
        languages, areas, manifestHints: inventory.files.filter(file => /(^|\/)(package\.json|pubspec\.yaml|Cargo\.toml|pyproject\.toml|CMakeLists\.txt|go\.mod|.*\.csproj)$/.test(file.path)).map(file => file.path)
      } };
    } catch { return { label, rootName: path.basename(entry.path), status: 'unavailable', coverage: 'No inventory produced; root access or metadata scan failed.' }; }
  });
}
function projectedPath(file) {
  const absolute = path.resolve(file); let parent = absolute;
  while (!fs.lstatSync(parent, { throwIfNoEntry: false })) {
    const next = path.dirname(parent); if (next === parent) throw new Error('Path ancestor is unavailable.');
    parent = next;
  }
  return path.join(fs.realpathSync.native(parent), path.relative(parent, absolute));
}
function saveSurveyReport(roots, output) {
  const results = survey(roots), destination = path.resolve(output);
  if (fs.lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Report destination cannot be a link.');
  const physicalDestination = projectedPath(destination);
  const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
  const ancestorIds = [];
  for (let parent = path.dirname(destination);;) {
    const stat = fs.statSync(parent, { throwIfNoEntry: false });
    if (stat) ancestorIds.push({ dev: stat.dev, ino: stat.ino });
    const next = path.dirname(parent); if (next === parent) break; parent = next;
  }
  if (roots.some(entry => {
    const root = path.resolve(entry.path), physical = projectedPath(root);
    const stat = fs.statSync(root, { throwIfNoEntry: false });
    return inside(root, destination) || inside(physical, physicalDestination) || (stat && ancestorIds.some(id => id.dev === stat.dev && id.ino === stat.ino));
  })) throw new Error('Choose a report location outside all input repositories.');
  atomicJson(destination, { schemaVersion: 1, observedAt: new Date().toISOString(), results });
  return results;
}
if (require.main === module) {
  const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
  const input = arg('--catalog'), output = arg('--out');
  if (!input || !output) { console.error('Usage: node scripts/knowledge-inventory.cjs --catalog roots.json --out report.json'); process.exitCode = 1; }
  else {
    const roots = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
    const results = saveSurveyReport(roots, output);
    if (results.some(item => item.status === 'unavailable')) process.exitCode = 1;
    for (const item of results) console.log(JSON.stringify({ label: item.label, files: item.summary?.fileCount, counts: item.inventory?.counts, coverage: item.inventory?.coverage, languages: item.summary?.languages, status: item.status }));
  }
}
module.exports = { survey, saveSurveyReport };
