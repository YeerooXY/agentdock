'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { workerCheckCommand } = require('../electron/worker-checks.cjs');
const { implementerLaunch } = require('../electron/task-loop.cjs');
const { workerLaunch } = require('../electron/provider-workers.cjs');

test('check permissions accept literal commands and retain shell operators and patterns in the host verification phase', () => {
  assert.equal(workerCheckCommand(' npm test '), 'npm test');
  for (const command of ['npm test && whoami', 'npm test; whoami', 'npm test | cat', 'npm test > file', 'npm test *', 'npm test $(whoami)', 'node "test file.js"', 'npm test\nwhoami']) assert.equal(workerCheckCommand(command), '', command);
  assert.equal(workerCheckCommand('npm test', { review: true }), '');
  assert.equal(workerCheckCommand('npm test', { textOnly: true }), '');
  const claude = implementerLaunch('claude', 'claude.exe', { checks: 'npm test' });
  assert.ok(claude.args.includes('Bash(npm test)'));
  assert.ok(claude.args.includes('Read,Grep,Glob,Edit,Write,Bash'));
  const launch = review => workerLaunch('antigravity', 'agy.exe', { checks: 'npm test', review, workFolder: '/work' });
  const settings = review => { const args = launch(review).args; return JSON.parse(args[args.indexOf('--settings') + 1]); };
  assert.ok(settings(false).permissions.allow.includes('command(npm test)'));
  assert.ok(!settings(false).permissions.deny.includes('command(*)'));
  assert.ok(settings(true).permissions.deny.includes('command(*)'));
  assert.ok(settings(false).permissions.deny.includes('mcp(*)'));
});
