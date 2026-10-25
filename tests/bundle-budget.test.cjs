'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The renderer loads every chunk of the console page at startup. Raise these
// limits deliberately, or move a page behind a dynamic import.
const APP_LIMIT = 400 * 1024, CHUNK_LIMIT = 500 * 1024;
const assets = path.join(__dirname, '..', 'dist', 'assets');

test('renderer chunks stay within the size budget', t => {
  if (!fs.existsSync(assets)) return t.skip('Run npm run build first.');
  const chunks = fs.readdirSync(assets).filter(x => x.endsWith('.js')).map(name => ({ name, size: fs.statSync(path.join(assets, name)).size }));
  const app = chunks.filter(x => x.name.startsWith('index-'));
  assert.equal(app.length, 1, 'one application chunk');
  assert.ok(app[0].size <= APP_LIMIT, `${app[0].name} is ${Math.round(app[0].size / 1024)} kB; the budget is ${APP_LIMIT / 1024} kB`);
  for (const chunk of chunks) assert.ok(chunk.size <= CHUNK_LIMIT, `${chunk.name} is ${Math.round(chunk.size / 1024)} kB; chunks stay under ${CHUNK_LIMIT / 1024} kB`);
  assert.ok(chunks.some(x => x.name.startsWith('xterm-')), 'the terminal library has its own chunk');
});
