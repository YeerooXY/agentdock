'use strict';
// Per-session CLI callback. Only whitelisted metadata is written; prompts and responses are discarded.
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson, readJson } = require('./storage.cjs');
const { claudeLimits } = require('./domain.cjs');
const mode = process.argv[2];
const root = mode === 'codex-session' ? process.argv[3] : process.env.PADDOCK_DATA_DIR;
const session = mode === 'codex-session' ? process.argv[4] : process.env.PADDOCK_SESSION_ID;
const launchId = mode === 'codex-session' ? process.argv[5] : process.env.PADDOCK_LAUNCH_ID;
const accountId = process.env.PADDOCK_ACCOUNT_ID || null;
if (!root || !session || !/^[a-f0-9-]{36}$/i.test(session) || !/^[a-f0-9-]{36}$/i.test(launchId || '')) process.exit(0);
const eventFile = kind => path.join(root, 'events', `${session}.${launchId}.${kind}.json`);
async function accept(raw) {
  try {
    const input = JSON.parse(raw || '{}');
    const event = { session, launchId, accountId, at: Date.now(), providerSessionId: input['thread-id'] || input.session_id || null };
    if (mode === 'codex-session') {
      if (input.hook_event_name !== 'SessionStart' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.providerSessionId || '')) return;
      // SessionStart can arrive on the first prompt or after compaction. It
      // records identity only: never reset an active console to "open".
      atomicJson(eventFile('identity'), event);
    } else if (mode === 'statusline') {
      event.limits = claudeLimits(input, event.at, accountId || 'claude:default');
      event.contextPercent = input.context_window?.used_percentage ?? null;
      event.model = input.model?.display_name || null;
      event.modelId = input.model?.id || null;
      const effort = input.effort?.level || process.env.CLAUDE_EFFORT;
      event.effort = /^(low|medium|high|xhigh|max)$/.test(effort || '') ? effort : null;
      const u = input.context_window;
      if (u && Number.isFinite(u.total_input_tokens) && Number.isFinite(u.total_output_tokens)) event.usage = { input: u.total_input_tokens, output: u.total_output_tokens, total: u.total_input_tokens + u.total_output_tokens };
      atomicJson(eventFile('usage'), event);
      process.stdout.write(`Paddock | ${event.model || 'Claude'}${event.contextPercent === null ? '' : ` | context ${Math.round(event.contextPercent)}%`}`);
    } else {
      const name = input.hook_event_name || mode;
      const statuses = { 'codex-notify': 'ready', SessionStart: 'open', Stop: 'ready', UserPromptSubmit: 'active', PermissionRequest: 'attention', Notification: 'attention', StopFailure: 'error', SessionEnd: 'ended' };
      if (mode === 'codex-notify' && input.type !== 'agent-turn-complete') return;
      if (name === 'Notification' && !['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(input.notification_type)) return;
      event.state = statuses[name] || statuses[mode];
      if (name === 'UserPromptSubmit') {
        try {
          const reading = readJson(eventFile('usage'), {});
          const windows = event.at >= reading.at && event.at - reading.at <= 120000 && reading.providerSessionId === event.providerSessionId ? reading.limits?.windows || [] : [];
          atomicJson(eventFile('quota-start'), { at: event.at, launchId, providerSessionId: event.providerSessionId, windows });
        } catch {}
      }
      if (['Stop', 'StopFailure'].includes(name) && input.transcript_path) {
        try {
          const { claudeMessage, quotaChange } = require('./message-usage.cjs');
          const message = claudeMessage(input.transcript_path);
          if (message) {
            const before = readJson(eventFile('quota-start'), {});
            const after = readJson(eventFile('usage'), {});
            const matches = before.providerSessionId === event.providerSessionId && after.providerSessionId === event.providerSessionId && Math.abs(message.at - before.at) <= 10000 && after.at >= before.at && after.at <= event.at && event.at - after.at <= 120000;
            event.messageUsage = { ...message, finishedAt: event.at, quota: matches ? quotaChange(before.windows, after.limits?.windows) : [], status: name === 'StopFailure' ? 'failed' : 'completed' };
          }
        } catch {}
      }
      // Await the baseline before the agent can edit. No prompts or answers leave this helper.
      const tool = event.state === 'active' ? 'dock/start_turn' : ['ready', 'error', 'ended'].includes(event.state) ? 'dock/finish_turn' : null;
      if (tool && process.env.PADDOCK_BRIDGE_URL && process.env.PADDOCK_BRIDGE_TOKEN) {
        try {
          const response = await fetch(process.env.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.PADDOCK_BRIDGE_TOKEN }, body: JSON.stringify({ name: 'dock_call', arguments: { tool, arguments: {} } }), signal: AbortSignal.timeout(12000) });
          if (response.ok && tool === 'dock/finish_turn') {
            const result = await response.json();
            const value = !result.isError && JSON.parse(result.content?.find(x => x.type === 'text')?.text || '{}');
            if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value?.turnId || '')) event.turnId = value.turnId;
          }
        } catch {}
      }
      if (event.state) atomicJson(eventFile('state'), event);
    }
  } catch { /* A tracker failure must never prevent an agent from working. */ }
}
if (mode === 'codex-notify') accept(process.argv[3]);
else {
  let input = '';
  process.stdin.on('data', chunk => { if (input.length < 2_000_000) input += chunk; });
  process.stdin.on('end', () => accept(input));
}
