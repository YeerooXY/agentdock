'use strict';
// Per-session CLI callback. Only whitelisted metadata is written; prompts and responses are discarded.
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson } = require('./storage.cjs');
const { claudeLimits } = require('./domain.cjs');
const mode = process.argv[2];
const root = mode === 'codex-session' ? process.argv[3] : process.env.AGENT_DOCK_DATA_DIR;
const session = mode === 'codex-session' ? process.argv[4] : process.env.AGENT_DOCK_SESSION_ID;
if (!root || !session || !/^[a-f0-9-]{36}$/.test(session)) process.exit(0);
async function accept(raw) {
  try {
    const input = JSON.parse(raw || '{}');
    const event = { session, at: Date.now(), providerSessionId: input['thread-id'] || input.session_id || null };
    if (mode === 'codex-session') {
      if (input.hook_event_name !== 'SessionStart' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.providerSessionId || '')) return;
      // SessionStart can arrive on the first prompt or after compaction. It
      // records identity only: never reset an active console to "open".
      atomicJson(path.join(root, 'events', `${session}.identity.json`), event);
    } else if (mode === 'statusline') {
      event.limits = claudeLimits(input);
      event.contextPercent = input.context_window?.used_percentage ?? null;
      event.model = input.model?.display_name || null;
      const u = input.context_window;
      if (u && Number.isFinite(u.total_input_tokens) && Number.isFinite(u.total_output_tokens)) event.usage = { input: u.total_input_tokens, output: u.total_output_tokens, total: u.total_input_tokens + u.total_output_tokens };
      atomicJson(path.join(root, 'events', `${session}.usage.json`), event);
      process.stdout.write(`Agent Dock | ${event.model || 'Claude'}${event.contextPercent === null ? '' : ` | context ${Math.round(event.contextPercent)}%`}`);
    } else {
      const name = input.hook_event_name || mode;
      const statuses = { 'codex-notify': 'ready', SessionStart: 'open', Stop: 'ready', UserPromptSubmit: 'active', PermissionRequest: 'attention', Notification: 'attention', StopFailure: 'error', SessionEnd: 'ended' };
      if (mode === 'codex-notify' && input.type !== 'agent-turn-complete') return;
      if (name === 'Notification' && !['permission_prompt', 'idle_prompt', 'elicitation_dialog'].includes(input.notification_type)) return;
      event.state = statuses[name] || statuses[mode];
      // Await the baseline before the agent can edit. No prompts or answers leave this helper.
      const tool = event.state === 'active' ? 'dock/start_turn' : ['ready', 'error', 'ended'].includes(event.state) ? 'dock/finish_turn' : null;
      if (tool && process.env.AGENT_DOCK_BRIDGE_URL && process.env.AGENT_DOCK_BRIDGE_TOKEN) {
        try { await fetch(process.env.AGENT_DOCK_BRIDGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.AGENT_DOCK_BRIDGE_TOKEN }, body: JSON.stringify({ name: 'dock_call', arguments: { tool, arguments: {} } }), signal: AbortSignal.timeout(12000) }); } catch {}
      }
      if (event.state) atomicJson(path.join(root, 'events', `${session}.state.json`), event);
    }
  } catch { /* A tracker failure must never prevent an agent from working. */ }
}
if (mode === 'codex-notify') accept(process.argv[3]);
else {
  let input = '';
  process.stdin.on('data', chunk => { if (input.length < 2_000_000) input += chunk; });
  process.stdin.on('end', () => accept(input));
}
