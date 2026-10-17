'use strict';
const fs = require('node:fs'), path = require('node:path');
const { readJson, atomicJson } = require('./storage.cjs');
const { normalizeUsage } = require('./domain.cjs');
const valid = n => Number.isFinite(n) && n >= 0;
const totals = raw => {
  if (!raw || !valid(raw.input_tokens) || !valid(raw.output_tokens)) return null;
  const input = raw.input_tokens, output = raw.output_tokens, cached = raw.cached_input_tokens;
  return { input, output, cached: valid(cached) ? Math.min(cached, input) : 0, total: input + output };
};
function codexMessages(lines, { complete = false } = {}) {
  let previous = complete ? { input: 0, output: 0, cached: 0, total: 0 } : null, current, model;
  const messages = [];
  for (const line of lines) {
    let entry; try { entry = typeof line === 'string' ? JSON.parse(line) : line; } catch { continue; }
    const p = entry.payload || {};
    if (entry.type === 'turn_context') model = p.model || model;
    if (entry.type !== 'event_msg') continue;
    if (p.type === 'task_started') current = { id: p.turn_id || entry.timestamp, at: Date.parse(entry.timestamp), baseline: previous, sawUsage: false };
    if (p.type === 'token_count') {
      const next = totals(p.info?.total_token_usage);
      if (next) { previous = next; if (current) current.sawUsage = true; }
    }
    if (['task_complete','task_completed','turn_complete','turn_aborted'].includes(p.type) && current) {
      if (p.turn_id && current.id !== p.turn_id) { current = null; continue; }
      let usage = null;
      if (current.baseline && previous && current.sawUsage) {
        const delta = Object.fromEntries(['input','output','cached','total'].map(key => [key, previous[key] - current.baseline[key]]));
        if (Object.values(delta).every(valid)) usage = delta;
      }
      if (current.id && valid(current.at)) messages.push({ id: String(current.id).slice(0, 150), at: current.at, finishedAt: Date.parse(entry.timestamp), model: model || null, usage, status: p.type === 'turn_aborted' ? 'interrupted' : 'completed' });
      current = null;
    }
  }
  return messages;
}
function claudeMessage(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const fd = fs.openSync(file, 'r'); let lines;
  try { const stat = fs.fstatSync(fd), offset = Math.max(0, stat.size - 2 * 1024 * 1024), buffer = Buffer.alloc(Math.min(stat.size, 2 * 1024 * 1024)); fs.readSync(fd, buffer, 0, buffer.length, offset); lines = buffer.toString('utf8').split('\n'); if (offset) lines.shift(); }
  finally { fs.closeSync(fd); }
  let current = null; const calls = new Map();
  for (const line of lines) {
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    const user = entry.type === 'user' && !entry.isMeta && !entry.isCompactSummary && message?.role === 'user' && (typeof message.content === 'string' || Array.isArray(message.content) && message.content.some(x => x.type === 'text') && !message.content.some(x => x.type === 'tool_result'));
    if (user) { current = { id: entry.uuid, at: Date.parse(entry.timestamp) }; calls.clear(); }
    if (current && entry.type === 'assistant' && message?.id) {
      const usage = normalizeUsage('anthropic', message.usage);
      const old = calls.get(message.id);
      // A streamed message may appear several times. Keep its latest counters.
      calls.set(message.id, { usage: usage || old?.usage || null, model: message.model || old?.model });
    }
  }
  if (!current?.id || !valid(current.at) || !calls.size) return null;
  const values = [...calls.values()];
  const usage = values.every(x => x.usage) ? Object.fromEntries(['input','output','cached','cacheWrite','uncached','total'].map(key => [key, values.reduce((sum, x) => sum + (x.usage[key] || 0), 0)])) : null;
  return { ...current, model: [...new Set(values.map(x => x.model).filter(Boolean))].join(', '), usage, status: 'completed', source: 'Claude transcript · main agent' };
}
class MessageUsage {
  constructor(root) { this.file = path.join(root, 'message-usage.json'); this.items = readJson(this.file, []); }
  record(session, messages) {
    let changed = false; const map = new Map(this.items.map(x => [x.id, x]));
    for (const message of messages || []) {
      if (!message?.id || !valid(message.at)) continue;
      const id = `${session.provider}:${session.providerSessionId || session.id}:${String(message.id).slice(0, 150)}`;
      const usage = message.usage && ['input','output','total'].every(x => valid(message.usage[x])) ? Object.fromEntries(['input','output','total','cached','cacheWrite'].filter(x => valid(message.usage[x])).map(x => [x, message.usage[x]])) : null;
      const row = { id, at: message.at, provider: session.provider, model: String(message.model || session.model || session.launchModel || '').slice(0, 200), consoleName: session.name, projectId: session.projectId || null, usage, estimatedCost: null, status: message.status, source: String(message.source || 'Codex log').slice(0, 100) };
      if (JSON.stringify(map.get(id)) !== JSON.stringify(row)) { map.set(id, row); changed = true; }
    }
    if (changed) { const items = [...map.values()].sort((a,b) => b.at - a.at).slice(0, 5000); atomicJson(this.file, items); this.items = items; }
  }
}
function apiMessages(entries) {
  const groups = new Map();
  for (const entry of entries) { const id = entry.messageId || entry.id; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(entry); }
  return [...groups].map(([id, rows]) => ({ id, at: Math.min(...rows.map(x => x.at)), provider: rows[0].provider, model: rows[0].model, projectId: rows[0].projectId, consoleName: rows[0].consoleName || 'API', steps: rows.length, source: 'Dock API', status: rows.some(x => x.status !== 'completed') ? 'check request' : 'completed', usage: rows.every(x => x.usage) ? Object.fromEntries(['input','output','total','cached','cacheWrite'].map(key => [key, rows.reduce((sum, x) => sum + (x.usage[key] || 0), 0)])) : null, estimatedCost: rows.every(x => valid(x.estimatedCost)) ? rows.reduce((sum,x) => sum + x.estimatedCost, 0) : null }));
}
module.exports = { codexMessages, claudeMessage, MessageUsage, apiMessages };
