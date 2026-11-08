#!/usr/bin/env node
'use strict';
// Static source imports only. Vite, Node and Flutter validate syntax and assets.
const fs = require('node:fs');
const path = require('node:path');
function check(root, extension, bootstrap, name) {
  const graph = new Map();
  const failures = [];
  const label = file => path.relative(root, file).replaceAll('\\', '/');

  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (file.endsWith(extension)) graph.set(file, []);
    }
  }
  collect(root);
  for (const [file, imports] of graph) {
    const source = fs.readFileSync(file, 'utf8');
    // Match complete static import/export statements at statement boundaries.
    // Dynamic imports are runtime dependencies and intentionally excluded.
    const statements = extension === '.cjs' ? /require\(['"](\.[^'"]+)['"]\)/g
      : extension === '.dart' ? /(?:import|export)\s+['"]([^'"]+)['"]/g
      : /(?:^|[;\n])\s*(?:import\s+(?!\()(?:(?:[^;'"\n]+|\n)*?\s+from\s*)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(statements)) {
      if (match[1].includes(':')) continue;
      const suffix = path.extname(match[1]);
      if (suffix && suffix !== extension) continue;
      if (extension === '.js' && !match[1].startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), match[1]);
      const target = suffix ? resolved :
        graph.has(resolved + extension) ? resolved + extension : path.join(resolved, 'index' + extension);
      if (!graph.has(target)) failures.push(`${label(file)} imports missing module ${match[1]}`);
      else imports.push(target);
      if (target === path.join(root, bootstrap)) failures.push(`${label(file)} imports the app bootstrap`);
    }
  }

  const visited = new Set(), active = new Set(), stack = [];
  function visit(file) {
    if (active.has(file)) {
      failures.push(`Import cycle: ${[...stack.slice(stack.indexOf(file)), file].map(label).join(' -> ')}`);
      return;
    }
    if (visited.has(file)) return;
    active.add(file); stack.push(file);
    for (const target of graph.get(file) || []) visit(target);
    stack.pop(); active.delete(file); visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`PASS ${name} boundaries: ${graph.size} modules, no static import cycles or bootstrap imports`);
}

check(path.resolve(__dirname, '..', 'src'), '.js', 'app.js', 'renderer');
check(path.resolve(__dirname, '..', 'mobile', 'lib'), '.dart', 'main.dart', 'mobile');
check(path.resolve(__dirname, '..', 'electron'), '.cjs', 'main.cjs', 'backend');
