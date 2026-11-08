'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
test('Usage does not recreate removed accounts from cached checks, limits or visibility settings', () => {
  const code = require('esbuild').buildSync({ entryPoints: [require('node:path').join(__dirname, '../src/pages/usage-page.js')], bundle: true, platform: 'node', format: 'cjs', write: false, loader: { '.png': 'dataurl', '.svg': 'dataurl' } }).outputFiles[0].text;
  const module = { exports: {} };
  require('node:vm').runInNewContext(code, { module, exports: module.exports, document: { addEventListener() {} } });
  const { usagePage } = module.exports;
  const removed = 'cb75b00b-2caf-4295-8256-0d28514a1531';
  const state = { accounts: [{ id: 'codex:default', provider: 'codex' }], usageAccounts: [{ id: 'codex:default', provider: 'codex', hasUsage: true }, { id: removed, provider: 'codex', label: 'Removed account', hasUsage: true }],
    limits: [{ id: 'old', accountId: removed, provider: 'codex', windows: [] }], usageChecks: [], settings: { usageShown: [removed] }, ledger: [], agents: [] };
  const page = usagePage({ getState: () => state, providerName: name => name });
  const html = page.render();
  assert.ok(html.includes('data-usage-account-id="codex:default"'));
  assert.ok(!html.includes(removed));
  assert.ok(!html.includes('Removed account'));
});
