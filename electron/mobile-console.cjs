'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { catalog } = require('./cli-catalog.cjs');

function consoleChoices(sessions, defaults) {
  const installed = new Set((sessions.cliSetup?.snapshot() || []).filter(x => x.installed).map(x => x.id));
  for (const session of sessions.items.values()) if (session.alive) installed.add(session.provider);
  if (sessions.claude) installed.add('claude');
  return {
    defaultProvider: defaults.provider || '',
    defaultFolder: defaults.cwd || '',
    agents: catalog.map(({ id, name }) => ({ id, name, installed: installed.has(id) })),
  };
}

function mobileLaunch(sessions, defaults, payload) {
  const options = { ...defaults, name: typeof payload.name === 'string' ? payload.name.slice(0, 64) : defaults.name };
  // Older clients send only a name. No client-supplied paths, commands, model
  // IDs or permission overrides are accepted.
  if (payload.agent !== undefined) {
    const choice = consoleChoices(sessions, defaults).agents.find(x => x.id === payload.agent && x.installed);
    if (!choice) throw new Error('Choose an agent installed on this PC.');
    options.provider = choice.id;
    if (choice.id !== defaults.provider) {
      options.model = '';
      options.command = '';
    }
  }
  return options;
}

const excluded = new Set(['.git', '.agentdock', '.ssh', '.aws', '.azure', '.gnupg', 'node_modules', '.venv']);
function safeName(name) {
  return !excluded.has(name.toLowerCase()) &&
    !/^\.env(?:\.|$)/i.test(name) &&
    !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069\\:]/.test(name);
}
function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function consoleFiles(session, payload) {
  const directory = payload.directory ?? '';
  const query = payload.query ?? '';
  if (typeof directory !== 'string' || directory.length > 1500 ||
      typeof query !== 'string' || query.length > 120 ||
      directory.includes('\\') || directory.includes(':') ||
      directory.startsWith('/') ||
      directory.split('/').some(part => part === '..' || part === '.' || (part && !safeName(part)))) {
    throw new Error('Choose a folder inside this console’s working folder.');
  }
  const root = await fs.realpath(session.cwd);
  const target = path.resolve(root, directory);
  if (!within(root, target)) throw new Error('Choose a folder inside this console’s working folder.');
  // Refuse symlinks/junctions at every level, even when the link points back
  // inside the workspace. Never walk outside the selected launch directory.
  let current = root;
  for (const part of directory.split('/').filter(Boolean)) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Linked folders are not available here.');
  }
  if (!within(root, await fs.realpath(target))) throw new Error('This folder moved outside the console’s working folder.');
  const entries = [];
  let scanned = 0, truncated = false;
  const dir = await fs.opendir(target);
  for await (const entry of dir) {
    if (++scanned > 5000) { truncated = true; break; }
    if (!safeName(entry.name) || entry.isSymbolicLink() ||
        (!entry.isDirectory() && !entry.isFile()) ||
        !entry.name.toLowerCase().includes(query.toLowerCase())) continue;
    entries.push({ name: entry.name, directory: entry.isDirectory(), path: [directory, entry.name].filter(Boolean).join('/') });
    if (entries.length === 200) { truncated = true; break; }
  }
  entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  return { directory, entries, truncated };
}

module.exports = { consoleChoices, mobileLaunch, consoleFiles };
