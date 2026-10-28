'use strict';
// One plain line for an alert: what the agent said or asks for, not the whole answer.
const fs = require('node:fs'), path = require('node:path');
const MAX = 180;

function summarize(text) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+\.\s+|>\s*)/gm, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= MAX) return plain;
  const cut = plain.slice(0, MAX - 1), space = cut.lastIndexOf(' ');
  return (space > MAX * .6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '') + '…';
}

// The last assistant text in a Claude Code transcript (JSON lines). Reads the tail only.
function claudeLastText(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return '';
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size, length = Math.min(size, 512 * 1024), buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      for (const line of buffer.toString('utf8').split('\n')) {
        let entry; try { entry = JSON.parse(line); } catch { continue; }
        const content = entry.type === 'assistant' && entry.message?.content;
        const parts = Array.isArray(content) ? content.filter(x => x?.type === 'text' && x.text).map(x => x.text) : typeof content === 'string' ? [content] : [];
        if (parts.length) text = parts.join(' ');
      }
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
  return text;
}

function hookSummary(name, input = {}) {
  if (name === 'codex-notify') return summarize(input['last-assistant-message']);
  if (name === 'Notification') return summarize(input.message);
  if (name === 'PermissionRequest') return summarize(input.tool_name ? `Wants to use ${input.tool_name}` : input.message);
  if (name === 'Stop' || name === 'StopFailure') return summarize(input.last_assistant_message || claudeLastText(input.transcript_path));
  return '';
}

module.exports = { summarize, claudeLastText, hookSummary };
