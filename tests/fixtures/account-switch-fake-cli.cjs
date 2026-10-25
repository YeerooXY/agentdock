'use strict';
// Isolated fixture CLI. It records only profile roots, public launch IDs, and
// the harmless Codex resume/cwd/model arguments used by account-switch tests.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const resumeAt = args.indexOf('resume');
const providerSessionId = resumeAt >= 0 ? args[resumeAt + 1] : '12345678-1234-4234-8234-123456789abc';
const safeArgs = [];
for (let index = 0; index < args.length; index++) {
  const value = args[index];
  if (value === '--no-daemon') safeArgs.push(value);
  else if (value === 'resume') safeArgs.push('resume', args[++index]);
  else if (value === '--cd') safeArgs.push('--cd', path.basename(args[++index]));
  else if (value === '--model') safeArgs.push('--model', args[++index]);
  else if (value.startsWith('sqlite_home=')) {
    const raw = value.slice('sqlite_home='.length);
    safeArgs.push('sqlite_home=' + (raw.startsWith('"') ? JSON.parse(raw) : raw));
  }
}
const allowedEnv = ['CODEX_HOME', 'CODEX_SQLITE_HOME', 'CLAUDE_CONFIG_DIR', 'PADDOCK_SESSION_ID', 'PADDOCK_LAUNCH_ID', 'PADDOCK_ACCOUNT_ID'];
const publicEnv = Object.fromEntries(allowedEnv.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const record = {
  args: safeArgs,
  env: publicEnv,
  providerOverridesAbsent: !['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'].some(key =>
    Object.keys(process.env).some(actual => actual.toLowerCase() === key.toLowerCase()))
};
const log = path.join(process.env.FAKE_CLI_RECORD_DIR, `${process.env.PADDOCK_LAUNCH_ID}.json`);
fs.mkdirSync(path.dirname(log), { recursive: true });
fs.writeFileSync(log, JSON.stringify(record));

const eventRoot = path.join(process.env.PADDOCK_DATA_DIR, 'events');
fs.mkdirSync(eventRoot, { recursive: true });
fs.writeFileSync(path.join(eventRoot, `${process.env.PADDOCK_SESSION_ID}.${process.env.PADDOCK_LAUNCH_ID}.identity.json`), JSON.stringify({
  session: process.env.PADDOCK_SESSION_ID,
  launchId: process.env.PADDOCK_LAUNCH_ID,
  providerSessionId
}));

const sessionsRoot = path.join(process.env.CODEX_HOME, 'sessions', '2026', '10', '25');
const transcript = path.join(sessionsRoot, `rollout-2026-10-25T00-00-00-${providerSessionId}.jsonl`);
fs.mkdirSync(sessionsRoot, { recursive: true });
if (!fs.existsSync(transcript)) {
  fs.writeFileSync(transcript, `${JSON.stringify({ timestamp: '2026-10-25T00:00:00Z', type: 'session_meta', payload: { id: providerSessionId, cwd: process.cwd() } })}\n{"type":"event_msg","payload":{"text":"fixture turn one"}}\n`);
} else if (resumeAt >= 0) {
  fs.appendFileSync(transcript, `{"type":"event_msg","payload":{"text":"fixture resumed turn"}}\n`);
}
if (process.env.FAKE_CLI_FAIL_RESUME === '1' && resumeAt >= 0) process.exitCode = 7;
