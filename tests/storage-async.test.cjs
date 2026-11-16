'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { atomicJsonAsync, readJson } = require('../electron/storage.cjs');

test('async durable save replaces a complete record and preserves it when serialization fails', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-async-save-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'tasks', 'task.json');
  await atomicJsonAsync(file, { state: 'planning' });
  await atomicJsonAsync(file, { state: 'ready' });
  const circular = {}; circular.self = circular;
  await assert.rejects(atomicJsonAsync(file, circular));
  assert.deepEqual(readJson(file), { state: 'ready' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['task.json']);
});
