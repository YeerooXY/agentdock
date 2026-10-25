'use strict';

const MAX_DRAFT_BYTES = 1024 * 1024;
const CLAUDE_EDITOR_CONTEXT = /^# ─── Claude's last response \(for reference; removed on save\) ───\r?$/m;

function hasClaudeEditorContext(text) { return CLAUDE_EDITOR_CONTEXT.test(String(text || '')); }

function validateDraftText(text, provider) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_DRAFT_BYTES || Buffer.from(text, 'utf8').toString('utf8') !== text) {
    const error = new Error('The CLI draft could not be preserved exactly. Keep the current console open.');
    error.code = 'draft-invalid'; throw error;
  }
  if (provider === 'claude' && hasClaudeEditorContext(text)) {
    const error = new Error('Turn off “Show last response in external editor” in Claude Code before switching. The current console and draft are still running.');
    error.code = 'claude-editor-context'; throw error;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || /\[(?:pasted\s+)?(?:image|attachment)\s*#?\d+[^\]]*\]/i.test(text) || /\x1b\[(?:200|201)~/.test(text)) {
    const error = new Error('This draft contains an attachment or control sequence that Paddock cannot restore safely. Keep the current console open.');
    error.code = 'draft-unsupported'; throw error;
  }
  return text;
}

module.exports = { MAX_DRAFT_BYTES, hasClaudeEditorContext, validateDraftText };
