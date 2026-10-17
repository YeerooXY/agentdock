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
function internetOptions(input = {}) {
  const mode = input.mode || 'local';
  if (!['local', 'internet'].includes(mode)) throw new Error('Choose same Wi-Fi or direct internet.');
  if (mode === 'local') return { mode, publicHost: '', externalPort: 47831, routerMode: 'manual', duckKeyId: '' };
  const host = publicHost(input.publicHost), externalPort = Number(input.externalPort || 47831), routerMode = input.routerMode || 'manual';
  if (!Number.isInteger(externalPort) || externalPort < 1024 || externalPort > 65535) throw new Error('Use an outside port from 1024 to 65535.');
  if (!['automatic', 'manual'].includes(routerMode)) throw new Error('Choose automatic or manual router setup.');
  const duckKeyId = String(input.duckKeyId || '');
  if (duckKeyId && (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(duckKeyId) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$/.test(host))) throw new Error('Use your Duck DNS hostname and a saved key from Keys.');
  return { mode, publicHost: host, externalPort, routerMode, duckKeyId };
}
function networkRelation(wan, observed) {
  if (wan && !isPublic(wan)) return 'upstream';
  if (isPublic(wan) && isPublic(observed)) return wan === observed ? 'direct' : 'upstream';
  return 'unknown';
}
module.exports = { isPrivate, isPublic, publicHost, internetOptions, networkRelation };
