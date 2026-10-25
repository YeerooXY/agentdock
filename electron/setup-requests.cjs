'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { readJson, atomicJson, validateKeyId } = require('./storage.cjs');
const { validateConnection, validateProfile } = require('./shared.cjs');
const { imageSettings } = require('./image-generation.cjs');
class SetupRequests {
  constructor(root, { getHub, getAgents, onChange = () => {} } = {}) {
    this.file = path.join(root, 'setup-requests.json');
    Object.assign(this, { getHub, getAgents, onChange });
    const saved = readJson(this.file, []);
    this.items = Array.isArray(saved) ? saved.filter(x => x?.id && x.config && ['tool','api','key','image'].includes(x.kind)).slice(0, 20) : [];
  }
  status() {
    const hub = this.getHub();
    return { agents: this.getAgents(), keys: hub.vault.list(), connections: hub.config.connections, apis: hub.config.profiles, imageGeneration: hub.config.imageGeneration, pending: this.items, help: 'Prepare tool, API or image generator settings with dock/prepare_setup. Use kind key to request direct entry in Keys; never ask for the value in chat. Built-in Blender, Unity, Meshy, REA and MiroFish setup is on Tools. CLI account sign-in stays in the provider console.' };
  }
  prepare({ kind, config }, context) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Provide the connection settings.');
    // An agent can prepare configuration, never accept a secret value through this tool.
    const allowed = kind === 'tool' ? ['id','name','description','type','enabled','command','args','cwd','url','method','envKeys','headerKeys','queryKeys','inputSchema'] : kind === 'api' ? ['id','name','protocol','url','keyId'] : kind === 'image' ? ['provider','model','url','keyId','previewFirst'] : kind === 'key' ? ['id','name'] : [];
    if (!allowed.length || Object.keys(config).some(key => !allowed.includes(key))) throw new Error('Use connection fields and vault key IDs only. Enter secret values directly in Keys.');
    const clean = kind === 'tool' ? validateConnection(config) : kind === 'api' ? validateProfile(config) : kind === 'image' ? imageSettings(config) : { id: validateKeyId(config.id), name: String(config.name || config.id).slice(0, 70) };
    const serialized = JSON.stringify(clean);
    const redacted = JSON.stringify(this.getHub().redact(clean));
    if (serialized !== redacted) throw new Error('This contains a saved credential. Use its vault key ID instead.');
    if (serialized.length > 24000) throw new Error('Keep setup requests under 24,000 characters.');
    const item = { id: randomUUID(), kind, config: clean, consoleName: context.consoleName || 'API', at: Date.now() };
    const next = [item, ...this.items.filter(x => x.kind !== kind || x.config.id !== clean.id)].slice(0, 20);
    this.save(next);
    return { id: item.id, destination: 'Tools', message: kind === 'key' ? 'Open Tools and paste the key in the request card.' : 'Settings are ready in Tools. Review and apply them there.' };
  }
  save(items) { atomicJson(this.file, items); this.items = items; this.onChange(); }
  remove(id) { this.save(this.items.filter(x => x.id !== id)); }
  async apply(id) {
    const item = this.items.find(x => x.id === id);
    if (!item) throw new Error('This setup request is no longer available.');
    const hub = this.getHub();
    if (item.kind === 'key') throw new Error('Paste this key in its Tools card.');
    const ids = ['api','image'].includes(item.kind) ? [item.config.keyId].filter(Boolean) : ['envKeys','headerKeys','queryKeys'].flatMap(field => Object.values(item.config[field] || {}).map(x => x.key));
    const saved = new Set(hub.vault.list().map(x => x.id));
    if (ids.some(key => !saved.has(key))) throw new Error('Paste the requested key in Tools first, then apply these settings.');
    if (item.kind === 'tool') await hub.saveConnection(item.config); else if (item.kind === 'image') hub.setImageGeneration(item.config); else hub.saveProfile(item.config);
    this.remove(id);
  }
}
module.exports = { SetupRequests };
