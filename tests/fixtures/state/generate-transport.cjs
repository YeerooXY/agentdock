'use strict';
// Regenerates tests/fixtures/state/transport.json (chunk reassembly cases for
// the desktop and phone clients). Run: node tests/fixtures/state/generate-transport.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chunkFrames } = require('../../../electron/state-sync.cjs');

const changes = { type: 'changes', epoch: 'epoch-a', subscription: 'sub-1', batch: 1, changes: [
  { kind: 'reset', slice: 'projects', rev: 2, value: { byId: { p1: { id: 'p1', name: 'Paddock', color: null, status: 'active', progress: null, lastActiveAt: null } }, order: ['p1'], meta: {} } },
] };
const parts = chunkFrames(JSON.stringify(changes), { subscription: 'sub-1', batch: 1, chunkBytes: 64 });
const cases = [
  { name: 'complete in order', chunks: parts, expect: [...parts.slice(1).map(() => 'partial'), 'complete'], message: changes },
  { name: 'missing part', chunks: [parts[0], parts[2]], expect: ['partial', 'reconnect'] },
  { name: 'part without its first part', chunks: [parts[1]], expect: ['reconnect'] },
  { name: 'a new first part replaces an abandoned batch', chunks: [parts[0], parts[1], ...parts], expect: ['partial', 'partial', ...parts.slice(1).map(() => 'partial'), 'complete'], message: changes },
  { name: 'unknown field', chunks: [{ ...parts[0], extra: true }], expect: ['reconnect'] },
];
const file = path.join(__dirname, 'transport.json');
fs.writeFileSync(file, JSON.stringify({ limits: { highWater: 524288, lowWater: 131072, chunkBytes: 131072, maxParts: 512, maxTotal: 33554432, pingSeconds: 15, missedPings: 8 }, chunks: cases }, null, 2) + '\n');
