'use strict';
const path = require('node:path');
const { execFile } = require('node:child_process');
const { isPrivate, isPublic, networkRelation } = require('./mobile-address.cjs');

function runHelper(script, action, config, { program = process.execPath, timeout = 30000 } = {}) {
  if (process.platform !== 'win32') return Promise.reject(new Error('Automatic router and firewall setup is available on Windows.'));
  const tailnet = /^100\./.test(config.host || '');
  if (!isPrivate(config.host) || config.host.startsWith('127.') || tailnet && !action.startsWith('firewall')) return Promise.reject(new Error('Choose your Wi-Fi or Ethernet address.'));
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action, '-LocalAddress', config.host];
  if (action !== 'inspect') {
    if (!/^[a-f0-9-]{36}$/.test(config.mappingId || '') || ![config.port, config.externalPort].every(x => Number.isInteger(x) && x >= 1024 && x <= 65535)) return Promise.reject(new Error('Invalid phone connection settings.'));
    args.push('-Port', String(config.port), '-ExternalPort', String(config.externalPort), '-Owner', config.mappingId, '-Mode', config.mode || 'local');
  }
  if (action.startsWith('firewall')) args.push('-Program', program);
  return new Promise((resolve, reject) => execFile('powershell.exe', args, { windowsHide: true, timeout, maxBuffer: 32768 }, (error, stdout) => {
    try { const result = JSON.parse(stdout.trim()); if (!result.ok) throw Error(result.error); resolve(result); }
    catch (failure) { reject(new Error(error?.killed ? 'The network check timed out. You can retry or use manual setup.' : failure instanceof SyntaxError ? 'The network helper could not finish. Use manual setup.' : failure.message)); }
  }));
}
async function limitedText(response, max = 2048) {
  if (!response.ok) throw new Error('The service did not respond.');
  let text = '';
  for await (const chunk of response.body) { text += Buffer.from(chunk).toString('utf8'); if (text.length > max) throw new Error('The service returned too much data.'); }
  return text.trim();
}
class MobileNetwork {
  constructor({ script = path.join(__dirname, 'mobile-network.ps1'), program, getKey, testMode = false, helper = runHelper, fetcher = fetch, changed = () => {} } = {}) {
    Object.assign(this, { script, program, getKey, testMode, helper, fetcher, changed });
    this.state = { checkedAt: 0, relation: 'unknown', error: '', routerError: '', dnsError: '', firewall: '', publicAddress: '', wanAddress: '', upnp: false, gateway: '' };
    this.running = null; this.mapped = null; this.generation = 0;
  }
  snapshot() { return { ...this.state }; }
  guard() { if (this.testMode) throw new Error('Router, firewall and DNS changes are disabled during tests.'); }
  async inspect(host) {
    this.guard();
    const results = await Promise.allSettled([
      this.helper(this.script, 'inspect', { host }),
      this.fetcher('https://api.ipify.org', { signal: AbortSignal.timeout(6000), redirect: 'error' }).then(r => limitedText(r, 80))
    ]);
    const router = results[0].status === 'fulfilled' ? results[0].value : {};
    const address = results[1].status === 'fulfilled' && isPublic(results[1].value) ? results[1].value : '';
    Object.assign(this.state, { checkedAt: Date.now(), checkedHost: host, networkProfile: router.networkProfile || 'Unknown', gateway: router.gateway || '', upnp: !!router.upnp, routerName: router.routerName || '', wanAddress: router.wanAddress || '', publicAddress: address, relation: networkRelation(router.wanAddress, address), error: results[0].status === 'rejected' ? results[0].reason.message : !address ? 'Your public address could not be checked. You can enter it yourself.' : '' });
    this.changed(); return this.snapshot();
  }
  async updateDns(config) {
    if (!config.duckKeyId) { this.state.dnsError = ''; this.state.dnsUpdatedAt = 0; return; }
    const key = this.getKey(config.duckKeyId)?.trim();
    if (!key || !/^[a-f0-9-]{36}$/i.test(key)) throw new Error('Save your Duck DNS token in Keys, then select it here.');
    const domain = config.publicHost.replace(/\.duckdns\.org$/, '');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) || !config.publicHost.endsWith('.duckdns.org')) throw new Error('Use your Duck DNS hostname.');
    // Resolve in the main process. Never include the secret URL in errors or logs.
    try {
      const query = new URLSearchParams({ domains: domain, token: key, ip: '' });
      const result = await limitedText(await this.fetcher('https://www.duckdns.org/update?' + query, { signal: AbortSignal.timeout(8000), redirect: 'error' }));
      if (result !== 'OK') throw new Error();
      this.state.dnsUpdatedAt = Date.now(); this.state.dnsError = '';
    } catch { throw new Error('Duck DNS could not update. Check the hostname and its token in Keys.'); }
  }
  async maintain(config, generation) {
    if (generation !== this.generation) return;
    if (config.routerMode === 'automatic') {
      try {
        await this.helper(this.script, 'map', config);
        this.mapped = { ...config }; this.state.routerError = ''; this.state.mapped = true;
      } catch (error) { this.state.routerError = error.message; this.state.mapped = false; }
    }
    if (generation === this.generation) {
      try { await this.updateDns(config); } catch (error) { this.state.dnsError = error.message; }
    }
    this.changed();
  }
  async start(config) {
    // Router mapping and Duck DNS were for direct internet, now replaced by Tailscale.
    return;
    const generation = ++this.generation;
    this.running = this.maintain(config, generation);
    await this.running;
    if (generation !== this.generation) return;
    this.timer = setInterval(() => {
      if (this.pending) return;
      this.pending = true; this.running = this.maintain(config, generation).finally(() => { this.pending = false; });
    }, 5 * 60 * 1000); this.timer.unref();
  }
  async stop() {
    ++this.generation; clearInterval(this.timer); this.timer = null;
    await this.running?.catch(() => {}); this.running = null;
    const mapped = this.mapped; this.mapped = null;
    if (mapped) {
      try { await this.helper(this.script, 'unmap', mapped); this.state.routerError = ''; }
      catch { this.state.routerError = 'The router rule could not be removed. Its one-hour lease will expire unless the router ignores leases.'; }
    }
    this.state.mapped = false; this.changed();
  }
  async firewall(config, remove = false) {
    this.guard();
    await this.helper(this.script, remove ? 'firewall-remove' : 'firewall', config, { program: this.program, timeout: 120000 });
    this.state.firewall = remove ? 'removed' : 'allowed'; this.changed(); return this.snapshot();
  }
}
module.exports = { MobileNetwork, runHelper, limitedText };
