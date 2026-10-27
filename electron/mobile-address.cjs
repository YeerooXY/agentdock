'use strict';
const net = require('node:net');
function isPrivate(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 100 && b >= 64 && b <= 127;
}
function isPublic(ip) {
  if (net.isIP(ip) !== 4 || isPrivate(ip)) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return a !== 0 && a < 224 && !(a === 169 && b === 254) && !(a === 192 && b === 0 && (c === 0 || c === 2)) && !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) && !(a === 203 && b === 0 && c === 113);
}
function publicHost(value) {
  const host = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (isPublic(host)) return host;
  if (host.length > 253 || !host.includes('.') || /^[\d.]+$/.test(host) || /\.(local|localhost|lan|internal|home|invalid|test)$/.test(host) || !host.split('.').every(x => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) throw new Error('Enter a public IPv4 address or hostname, without https:// or a port.');
  return host;
}
// Tailscale gives every device on a tailnet a stable 100.64.0.0/10 address.
function isTailscale(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}
// Phones connect only through Tailscale: an encrypted private network that
// needs no open router port, and that other devices on a shared Wi-Fi cannot
// reach. Same Wi-Fi and direct internet through a router were retired.
function connectionOptions(input = {}) {
  const mode = input.mode || 'tailscale';
  if (mode === 'internet') throw new Error('Direct internet was replaced by Tailscale. Use this PC’s Tailscale address.');
  if (mode === 'local') throw new Error('Same Wi-Fi connections were removed. Use this PC’s Tailscale address.');
  if (mode !== 'tailscale') throw new Error('Phones connect through Tailscale.');
  return { mode, publicHost: '', externalPort: 47831, routerMode: 'manual', duckKeyId: '' };
}
function networkRelation(wan, observed) {
  if (wan && !isPublic(wan)) return 'upstream';
  if (isPublic(wan) && isPublic(observed)) return wan === observed ? 'direct' : 'upstream';
  return 'unknown';
}
module.exports = { isPrivate, isPublic, isTailscale, publicHost, connectionOptions, networkRelation };
