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
  constructor({ script = path.join(__dirname, 'mobile-network.ps1'), program, getKey, testMode = false, platform = process.platform, helper = runHelper, fetcher = fetch, changed = () => {} } = {}) {
    Object.assign(this, { script, program, getKey, testMode, platform, helper, fetcher, changed });
    this.state = { checkedAt: 0, relation: 'unknown', error: '', routerError: '', dnsError: '', firewall: 'unknown', firewallError: '', firewallCheckedAt: 0, firewallRulePresent: false, publicAddress: '', wanAddress: '', upnp: false, gateway: '' };
    this.running = null; this.mapped = null; this.generation = 0;
    this.firewallGeneration = 0; this.firewallCheck = null; this.firewallMutation = null;
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
    // Only inspect the existing local rule. Never map ports, update DNS or
    // request administrator approval when a saved connection starts.
    await this.checkFirewall(config);
  }
  async stop() {
    this.resetFirewall();
    ++this.generation; clearInterval(this.timer); this.timer = null;
    await this.running?.catch(() => {}); this.running = null;
    const mapped = this.mapped; this.mapped = null;
    if (mapped) {
      try { await this.helper(this.script, 'unmap', mapped); this.state.routerError = ''; }
      catch { this.state.routerError = 'The router rule could not be removed. Its one-hour lease will expire unless the router ignores leases.'; }
    }
    this.state.mapped = false; this.changed();
  }
  resetFirewall() {
    ++this.firewallGeneration; this.firewallCheck = null;
    Object.assign(this.state, { firewall: 'unknown', firewallError: '', firewallCheckedAt: 0, firewallRulePresent: false });
  }
  firewallResult(result, generation) {
    if (generation !== this.firewallGeneration) return;
    const valid = ['allowed', 'missing', 'outdated'].includes(result?.firewall);
    Object.assign(this.state, { firewall: valid ? result.firewall : 'unknown', firewallRulePresent: result?.firewallRulePresent === true, firewallCheckedAt: Date.now(), firewallError: valid ? '' : result?.firewallError || 'Windows could not confirm the firewall rule. Try checking again.' });
    this.changed();
  }
  checkFirewall(config) {
    if (this.testMode || this.platform !== 'win32' || !config.host || config.host.startsWith('127.')) return Promise.resolve(this.snapshot());
    const captured = { ...config };
    const key = JSON.stringify([captured.mappingId, captured.host, captured.port, captured.mode, this.program]);
    if (this.firewallMutation) return this.firewallMutation;
    if (this.firewallCheck?.key === key) return this.firewallCheck.promise;
    const generation = ++this.firewallGeneration;
    Object.assign(this.state, { firewall: 'checking', firewallError: '', firewallCheckedAt: 0, firewallRulePresent: false }); this.changed();
    const promise = Promise.resolve().then(async () => {
      try { this.firewallResult(await this.helper(this.script, 'firewall-status', captured, { program: this.program, timeout: 15000 }), generation); }
      catch (error) { this.firewallResult({ firewallError: error.message }, generation); }
      finally { if (this.firewallCheck?.generation === generation) this.firewallCheck = null; }
      return this.snapshot();
    });
    this.firewallCheck = { key, generation, promise }; return promise;
  }
  async firewall(config, remove = false) {
    this.guard();
    if (this.firewallMutation) throw new Error('Wait for the current firewall change to finish.');
    const captured = { ...config };
    const check = this.checkFirewall(captured), checkedGeneration = this.firewallGeneration;
    const status = await check;
    if (checkedGeneration !== this.firewallGeneration) throw new Error('The connection changed during the firewall check. Check the current connection again.');
    if (!remove && status.firewall === 'allowed' || remove && status.firewall === 'missing') return status;
    if (this.firewallMutation) throw new Error('Wait for the current firewall change to finish.');
    const generation = ++this.firewallGeneration;
    Object.assign(this.state, { firewall: 'checking', firewallError: '' }); this.changed();
    const mutation = Promise.resolve().then(async () => {
      try {
        const result = await this.helper(this.script, remove ? 'firewall-remove' : 'firewall', captured, { program: this.program, timeout: 120000 });
        this.firewallResult(result, generation);
      } catch (error) { this.firewallResult({ firewallError: error.message }, generation); throw error; }
      return this.snapshot();
    });
    this.firewallMutation = mutation;
    try { return await mutation; } finally { this.firewallMutation = null; }
  }
}
module.exports = { MobileNetwork, runHelper, limitedText };
