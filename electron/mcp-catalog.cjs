'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readJson, atomicJson } = require('./storage.cjs');

// Recommended tools from their own makers, pinned to versions checked on
// 23 October 2026. Adding one installs only that npm package into Paddock's
// folder (scripts disabled) or, for hosted servers, saves the address.
// Keys are pasted on the tool's card, encrypted, and reach only that tool's process or requests.
const catalog = [
  { id: 'playwright', name: 'Playwright', maker: 'Microsoft', license: 'Apache-2.0', package: '@playwright/mcp', version: '0.0.83', bin: 'playwright-mcp',
    description: 'Open pages in a real browser, click, fill forms, read the page and take screenshots.', docs: 'https://github.com/microsoft/playwright-mcp' },
  { id: 'chrome-devtools', name: 'Chrome DevTools', maker: 'Google Chrome', license: 'Apache-2.0', package: 'chrome-devtools-mcp', version: '1.12.0', bin: 'chrome-devtools-mcp',
    description: 'Inspect a live Chrome tab: console, network, performance traces and screenshots. Needs Google Chrome.', docs: 'https://github.com/ChromeDevTools/chrome-devtools-mcp' },
  { id: 'context7', name: 'Context7', maker: 'Upstash', license: 'MIT', package: '@upstash/context7-mcp', version: '4.4.4',
    description: 'Current library and framework documentation, so agents stop guessing at old APIs.', docs: 'https://github.com/upstash/context7' },
  { id: 'notion', name: 'Notion', maker: 'Notion', license: 'MIT', package: '@notionhq/notion-mcp-server', version: '2.5.2', key: { env: 'NOTION_TOKEN', label: 'Notion integration token' },
    description: 'Search, read and edit the Notion pages and databases you share with your integration.', docs: 'https://github.com/makenotion/notion-mcp-server' },
  { id: 'stripe', name: 'Stripe', maker: 'Stripe', license: 'MIT', package: '@stripe/mcp', version: '0.3.3', key: { env: 'STRIPE_SECRET_KEY', label: 'Stripe secret or restricted key' }, access: 'ask',
    description: 'Work with customers, products, invoices and payments. Starts as Ask me first because calls can move real money.', docs: 'https://github.com/stripe/ai' },
  { id: 'github', name: 'GitHub', maker: 'GitHub', license: 'MIT', type: 'http', url: 'https://api.githubcopilot.com/mcp/', key: { header: 'Authorization', prefix: 'Bearer ', label: 'GitHub personal access token' },
    description: 'Issues, pull requests, code search and repository files through GitHub’s hosted server.', docs: 'https://github.com/github/github-mcp-server' },
];
const byId = new Map(catalog.map(x => [x.id, x]));

class McpCatalog {
  constructor(root, runtime, { run, downloads, onChange = () => {} } = {}) {
    this.root = path.join(root, 'integrations', 'catalog'); this.runtime = runtime; this.run = run; this.downloads = downloads; this.onChange = onChange;
    this.jobs = new Map(); this.file = path.join(this.root, 'installed.json'); this.installed = readJson(this.file, {});
  }
  folder(item) { return path.join(this.root, item.id, item.version); }
  // The package's own bin entry, read from its installed package.json.
  server(item) {
    const dir = path.join(this.folder(item), 'node_modules', ...item.package.split('/')), meta = readJson(path.join(dir, 'package.json'), null);
    if (!meta || meta.version !== item.version) return null;
    const bin = typeof meta.bin === 'string' ? meta.bin : meta.bin?.[item.bin] || Object.values(meta.bin || {})[0];
    const file = bin && path.resolve(dir, bin);
    return file && file.startsWith(dir + path.sep) && fs.existsSync(file) ? file : null;
  }
  ready(item) { return item.type === 'http' || (this.installed[item.id] === item.version && !!this.server(item)); }
  snapshot(connections) {
    return catalog.map(item => ({ ...item, added: connections.some(x => x.catalog === item.id), ready: this.ready(item), job: this.jobs.get(item.id) || null }));
  }
  async add(id, { keyId } = {}) {
    const item = byId.get(id);
    if (!item) throw new Error('Unknown recommended tool.');
    if (item.key && !keyId) throw new Error(`Paste your ${item.key.label}, then add the tool.`);
    if (this.jobs.get(id)?.busy) throw new Error('This tool is already being added.');
    const progress = message => { this.jobs.set(id, { busy: true, message }); this.onChange(); };
    try {
      const base = { id: item.id, name: item.name, description: item.description, catalog: item.id, enabled: true, policy: { access: item.access || 'allowed' } };
      if (item.type === 'http') { this.jobs.delete(id); return { ...base, type: 'http', url: item.url, headerKeys: { [item.key.header]: { key: keyId, prefix: item.key.prefix } } }; }
      if (!this.runtime.node || !fs.existsSync(this.runtime.npm || '')) throw new Error('Paddock’s Node/npm runtime is missing. Reinstall Paddock.');
      if (!this.ready(item)) {
        const folder = this.folder(item), userConfig = path.join(folder, 'npmrc'), globalConfig = path.join(folder, 'global-npmrc');
        fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(userConfig, ''); fs.writeFileSync(globalConfig, '');
        progress(`Installing ${item.name} ${item.version}…`);
        const source = 'https://www.npmjs.com/package/' + item.package;
        this.downloads?.record({ name: item.name, kind: 'npm', source, directory: folder, state: 'installing' });
        await this.run(this.runtime.node, [this.runtime.npm, 'install', '--prefix', folder, '--userconfig', userConfig, '--globalconfig', globalConfig, '--registry=https://registry.npmjs.org', '--no-audit', '--no-fund', '--ignore-scripts', '--save-exact', `${item.package}@${item.version}`], folder);
        if (!this.server(item)) throw new Error(`${item.name} did not install completely. Try again.`);
        this.installed = { ...this.installed, [id]: item.version }; atomicJson(this.file, this.installed);
        this.downloads?.record({ name: item.name, kind: 'npm', source, directory: folder });
      }
      this.jobs.delete(id);
      return { ...base, type: 'stdio', command: this.runtime.node, args: [this.server(item)], cwd: this.folder(item), envKeys: item.key ? { [item.key.env]: { key: keyId, prefix: '' } } : {} };
    } catch (error) { this.jobs.set(id, { busy: false, message: error.message }); throw error; }
    finally { this.onChange(); }
  }
}
module.exports = { McpCatalog, catalog, byId };
