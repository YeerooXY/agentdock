'use strict';
// Preview panels show local development servers only. Other addresses open in
// the user's browser, never inside Paddock.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function previewUrl(value) {
  if (value === '' || value == null) return '';
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a local address, for example http://localhost:5173.');
  let text = value.trim();
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(text)) text = 'http://' + text;
  if (/^:?\d{2,5}$/.test(text)) text = 'http://localhost:' + text.replace(':', '');
  let url;
  try { url = new URL(text); } catch { throw new Error('Enter a local address, for example http://localhost:5173.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !isLocal(url) || url.username || url.password) throw new Error('Preview shows local servers only: localhost, 127.0.0.1 or [::1].');
  return url.href;
}
function isLocal(url) {
  try { const parsed = typeof url === 'string' ? new URL(url) : url; return ['http:', 'https:'].includes(parsed.protocol) && LOCAL_HOSTS.has(parsed.hostname.toLowerCase()); } catch { return false; }
}

module.exports = { previewUrl, isLocal };
