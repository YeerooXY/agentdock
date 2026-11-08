'use strict';
// Read native account metadata only. No generation or authentication changes.
const fs = require('node:fs'), path = require('node:path');
const { AccountProfiles } = require('../electron/account-profiles.cjs');
const { CodexAccount } = require('../electron/adapters.cjs');
const { usageEnvironment } = require('../electron/subscription-usage.cjs');
const root = path.join(process.env.APPDATA, 'Paddock');
const profiles = new AccountProfiles(root);
(async () => {
  const rows = [];
  for (const choice of profiles.choices('codex')) {
    if (choice.profile && !choice.loginCompletedAt) continue;
    const reader = new CodexAccount(() => {}, { accountId: choice.id, env: usageEnvironment(profiles.environment(choice.id, 'codex', { baseEnv: process.env })) });
    try { rows.push({ accountId: choice.id, provider: 'codex', observedAt: Date.now(), models: await reader.models(), limits: await reader.refresh() }); }
    catch { rows.push({ accountId: choice.id, error: 'Native model discovery unavailable' }); }
    finally { reader.stop(); }
  }
  const out = path.join(__dirname, '../artifacts/agent-matrix/codex-models.json');
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows));
})().catch(() => { process.exitCode = 1; });
