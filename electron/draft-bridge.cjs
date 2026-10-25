'use strict';
const crypto = require('node:crypto');
const http = require('node:http');

class DraftBridge {
  constructor({ timeout = 12000, maxBytes = 1024 * 1024 } = {}) {
    this.timeout = timeout;
    this.maxBytes = maxBytes;
    this.server = null;
    this.port = 0;
    this.tokens = new Map();
    this.pending = new Map();
    this.blocked = new Set();
  }
  async start() {
    if (this.server) return;
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.requestTimeout = 15000;
    this.server.headersTimeout = 5000;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
  }
  register(sessionId, launchId, { node, helper, editorCommand, editorRoots = [], provider = null }) {
    if (!this.server) throw new Error('Draft support is unavailable.');
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.set(token, { sessionId, launchId });
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    return {
      sessionId, launchId, token, editorCommand: editorCommand || '', editorRoots, provider,
      url: `http://127.0.0.1:${this.port}/draft`,
      command: `${quote(node)} ${quote(helper)}`
    };
  }
  unregister(sessionId, launchId) {
    for (const [token, owner] of this.tokens) if (owner.sessionId === sessionId && owner.launchId === launchId) this.tokens.delete(token);
    const key = this.key(sessionId, launchId), pending = this.pending.get(key);
    if (pending) { clearTimeout(pending.timer); this.pending.delete(key); pending.reject(new Error('Draft bridge closed.')); }
  }
  key(sessionId, launchId) { return `${sessionId}:${launchId}`; }
  request(sessionId, launchId, mode, text = undefined) {
    if (!['capture', 'restore'].includes(mode)) return Promise.reject(new Error('Draft action is unavailable.'));
    const key = this.key(sessionId, launchId);
    if (this.blocked.has(key)) return Promise.reject(new Error('Draft verification timed out. Restart this console before switching accounts again.'));
    if (this.pending.has(key)) return Promise.reject(new Error('A draft action is already running.'));
    return new Promise((resolve, reject) => {
      const pending = { mode, text, operationId: null, resolve, reject, timer: null, claimed: false };
      pending.timer = setTimeout(() => {
        if (this.pending.get(key) !== pending) return;
        this.pending.delete(key);
        this.blocked.add(key);
        reject(new Error('Paddock could not verify the CLI draft. Keep this console open and try again from its message prompt.'));
      }, this.timeout);
      this.pending.set(key, pending);
    });
  }
  async handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.origin || req.headers.host !== `127.0.0.1:${this.port}` || req.method !== 'POST' || req.url !== '/draft') {
      res.writeHead(403); res.end(); return;
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const owner = this.tokens.get(token);
    if (!owner) { res.writeHead(403); res.end(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > this.maxBytes + 4096) throw new Error('Draft is too large to switch safely.'); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (value.sessionId !== owner.sessionId || value.launchId !== owner.launchId) throw new Error('Draft launch changed.');
      const key = this.key(owner.sessionId, owner.launchId), pending = this.pending.get(key);
      if (value.action === 'prepare') {
        if (!pending || pending.claimed || !/^[a-f0-9-]{36}$/i.test(value.operationId || '')) { res.end(JSON.stringify({ mode: 'delegate' })); return; }
        pending.operationId = value.operationId;
        pending.claimed = true;
        const result = { mode: pending.mode, operationId: pending.operationId };
        if (pending.text !== undefined) result.text = pending.text;
        res.end(JSON.stringify(result)); return;
      }
      if (value.action === 'complete' && pending && pending.claimed && value.operationId === pending.operationId) {
        let result = true;
        if (pending.mode === 'capture') {
          if (typeof value.text !== 'string' || Buffer.byteLength(value.text, 'utf8') > this.maxBytes) throw new Error('The CLI draft is too large to switch safely.');
          const bytes = Buffer.from(value.text, 'utf8');
          if (bytes.toString('utf8') !== value.text) throw new Error('The CLI draft encoding changed. Keep this console open.');
          result = value.text;
        }
        clearTimeout(pending.timer); this.pending.delete(key); pending.resolve(result);
        res.end(JSON.stringify({ ok: true })); return;
      }
      if (value.action === 'fail' && pending && pending.claimed && value.operationId === pending.operationId) {
        const messages = {
          'claude-editor-context': 'Turn off “Show last response in external editor” in Claude Code before switching. The original console and draft are still running.',
          'draft-unsupported': 'This draft contains an attachment or control sequence that Paddock cannot restore safely. Keep the original console open.',
          'draft-invalid': 'The CLI draft could not be preserved exactly. Keep the original console open.'
        };
        clearTimeout(pending.timer); this.pending.delete(key);
        pending.reject(new Error(messages[value.reason] || 'Paddock could not verify the CLI draft file. Keep this console open and check the CLI editor settings.'));
        res.end(JSON.stringify({ ok: true })); return;
      }
      res.writeHead(410); res.end(JSON.stringify({ error: 'Draft request expired.' }));
    } catch (error) {
      res.writeHead(400); res.end(JSON.stringify({ error: error.message }));
    }
  }
  async close() {
    for (const token of this.tokens.keys()) this.tokens.delete(token);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Draft bridge closed.')); }
    this.pending.clear();
    const server = this.server; this.server = null;
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
  }
}

module.exports = { DraftBridge };
