'use strict';
const http = require('node:http');
const https = require('node:https');

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT = 30000;

// A panel grants access to one loopback origin, never to a phone-supplied URL.
function targetFor(panel, raw) {
  let origin, decoded;
  try {
    origin = new URL(panel.url);
    const path = raw.split('?')[0];
    decoded = decodeURIComponent(path);
    if (!path.startsWith('/') || decoded.startsWith('//') || /[\\%\x00-\x1f\x7f]/.test(decoded) || decoded.split('/').some(x => x === '.' || x === '..') || /^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  } catch { return null; }
  if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1'].includes(origin.hostname.toLowerCase()) || origin.username || origin.password) return null;
  try {
    const target = new URL(raw, origin.origin);
    return target.origin === origin.origin ? target : null;
  } catch { return null; }
}

class MobilePreview {
  constructor(sessions, { maxBytes = MAX_BYTES, timeout = TIMEOUT, request } = {}) {
    this.sessions = sessions; this.maxBytes = maxBytes; this.timeout = timeout; this.request = request; this.active = 0;
  }
  handle(req, res) {
    const match = /^\/v1\/preview\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(req.url);
    if (!match) return this.fail(res, 400);
    const id = match[1], panel = this.sessions.items.get(id);
    if (!panel?.alive || panel.kind !== 'web' || panel.phoneAllowed !== true || !panel.url) return this.fail(res, 403);
    const target = targetFor(panel, (match[2] || '/') + (match[3] || ''));
    if (!target) return this.fail(res, 400);
    if (this.active >= 4) return this.fail(res, 429);
    this.active++;
    const originalUrl = panel.url, prefix = `/v1/preview/${id}`;
    let done = false, upstream;
    const finish = (status, headers, body) => {
      if (done) return; done = true; clearTimeout(timer); this.active--;
      if (!res.destroyed) { res.writeHead(status, headers); res.end(body); }
    };
    const timer = setTimeout(() => { upstream?.destroy(); finish(504, {}, ''); }, this.timeout);
    const options = { protocol: target.protocol, hostname: '127.0.0.1', port: target.port || (target.protocol === 'https:' ? 443 : 80), path: target.pathname + target.search, method: 'GET', headers: { host: target.host }, ...(target.protocol === 'https:' ? { servername: target.hostname } : {}) };
    try {
      upstream = (this.request || (target.protocol === 'https:' ? https.request : http.request))(options, response => {
        const status = response.statusCode || 502, location = response.headers.location;
        if (status >= 300 && status < 400 && location) {
          let redirect;
          try { redirect = new URL(location, target); } catch { response.resume(); return finish(502, {}, ''); }
          if (redirect.origin !== target.origin || !targetFor(panel, redirect.pathname + redirect.search)) { response.resume(); return finish(502, {}, ''); }
          const current = this.sessions.items.get(id);
          if (current !== panel || !current.alive || !current.phoneAllowed || current.url !== originalUrl) { response.resume(); return finish(403, {}, ''); }
          response.resume(); return finish(status, { Location: prefix + redirect.pathname + redirect.search }, '');
        }
        const length = Number(response.headers['content-length']);
        if (Number.isFinite(length) && length > this.maxBytes) { response.destroy(); return finish(502, {}, ''); }
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > this.maxBytes) { response.destroy(); finish(502, {}, ''); } else chunks.push(chunk); });
        response.on('error', () => finish(502, {}, ''));
        response.on('end', () => {
          const current = this.sessions.items.get(id);
          if (current !== panel || !current.alive || !current.phoneAllowed || current.url !== originalUrl) return finish(403, {}, '');
          const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
          for (const name of ['content-type', 'content-encoding', 'content-language']) if (response.headers[name]) headers[name] = response.headers[name];
          finish(status, headers, Buffer.concat(chunks));
        });
      });
      upstream.on('error', () => finish(502, {}, ''));
      res.on('close', () => { if (!done) { upstream.destroy(); finish(502, {}, ''); } });
      upstream.end();
    } catch { finish(502, {}, ''); }
  }
  fail(res, status) { res.writeHead(status); res.end(''); }
}
module.exports = { MobilePreview, targetFor, MAX_BYTES, TIMEOUT };
