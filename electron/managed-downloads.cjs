'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readJson, atomicJson } = require('./storage.cjs');

function repositoryUrl(value) {
  let url; try { url = new URL(value); } catch { throw Error('Use a public GitHub repository URL.'); }
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(url.pathname)) throw Error('Use a public GitHub repository URL without credentials or extra paths.');
  const [owner, name] = url.pathname.replace(/\/$/, '').replace(/\.git$/, '').slice(1).split('/');
  if (name === '.' || name === '..') throw Error('Choose a repository name.');
  return { source: `https://github.com/${owner}/${name}`, folder: `${owner}-${name}` };
}
function cloneRepository(source, destination, cwd, launch = spawn) {
  return new Promise((resolve, reject) => {
    const env = {};
    for (const key of ['PATH','Path','PATHEXT','SystemRoot','COMSPEC','TEMP','TMP','USERPROFILE','HOME']) if (process.env[key]) env[key] = process.env[key];
    env.GIT_TERMINAL_PROMPT = '0'; env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = path.join(cwd, 'empty-gitconfig');
    fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '');
    const hooks = path.join(cwd, 'disabled-git-hooks'); fs.mkdirSync(hooks, { recursive: true });
    const child = launch('git', ['-c', `core.hooksPath=${hooks}`, 'clone', '--depth', '1', '--', source, destination], { cwd, env, shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(Error('Repository download timed out. Its location remains in the download list for review.')); }, 90000);
    child.once('error', () => { clearTimeout(timer); reject(Error('Could not start Git. Install Git or use an official release instead.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Repository download failed. Check the public repository URL and your connection.')); });
  });
}
class ManagedDownloads {
  constructor(root, { clone = cloneRepository } = {}) {
    this.root = root; this.directory = path.join(root, 'downloads'); this.file = path.join(root, 'managed-downloads.json');
    this.report = path.join(root, 'managed-downloads.txt'); this.clone = clone; this.busy = new Set();
    this.writeReport();
  }
  list() { const items = readJson(this.file, []); if (!Array.isArray(items)) throw Error('The managed-download list is invalid. It was preserved.'); return items; }
  record({ name, kind, source, directory, executable, state = 'installed' }) {
    if (!['git','npm','python','installer','project-tool'].includes(kind) || !['installing','installed','downloaded','incomplete'].includes(state) || typeof name !== 'string' || !name.trim() || !path.isAbsolute(directory)) throw Error('Invalid managed-download record.');
    if (executable !== undefined && (typeof executable !== 'string' || !path.isAbsolute(executable))) throw Error('Use an absolute executable path.');
    let url; try { url = new URL(source); } catch { throw Error('Use a public source URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Keep credentials out of download sources.');
    const target = path.resolve(directory), previous = this.list();
    const item = { name: name.slice(0, 120), kind, source: url.href, directory: target, ...(executable ? { executable: path.resolve(executable) } : {}), state, recordedAt: Date.now() };
    atomicJson(this.file, [...previous.filter(x => x.directory !== target || x.kind !== kind), item]); this.writeReport(); return item;
  }
  writeReport() {
    const items = this.list();
    let skills = []; try { skills = readJson(path.join(this.root, 'skill-packs.json'), []); } catch {}
    if (!Array.isArray(skills)) skills = [];
    const sections = [
      'Paddock — downloaded tools and repositories',
      'These entries were recorded by Paddock setup or its tool-download helper.',
      'They remain after uninstall. No downloaded repository or tool is deleted automatically.',
      'Review the locations below and remove files manually only if you no longer need them.',
      'Keep user projects, changes and shared dependencies. Existing external tools are not listed as Paddock downloads.',
      '',
      ...(items.length ? items.flatMap(x => [`${x.name} [${x.kind}; ${x.state}]`, `Location: ${x.directory}`, ...(x.executable ? [`Installed executable: ${x.executable}`] : []), `Source: ${x.source}`, '']) : ['No managed downloads have been recorded.']),
      ...(skills.length ? ['', 'Skill packs installed for your agents', 'Remove them in Paddock under Instructions → Skill packs before uninstalling, or delete these folders:', ...skills.map(x => `${x.pack}: ${x.directory}`)] : []),
      '', `Paddock profile (kept after uninstall): ${this.root}`,
      'Manual Git commands outside Paddock’s download helper cannot be tracked automatically.'
    ];
    fs.mkdirSync(this.root, { recursive: true }); const temporary = this.report + '.tmp';
    fs.writeFileSync(temporary, '\ufeff' + sections.join('\r\n') + '\r\n', { mode: 0o600 }); fs.renameSync(temporary, this.report);
  }
  async download({ source, name }) {
    const repo = repositoryUrl(source); fs.mkdirSync(this.directory, { recursive: true });
    const destination = path.join(this.directory, repo.folder);
    if (fs.existsSync(destination) || this.busy.has(destination)) throw Error('This tool download location already exists. Review it before downloading another copy.');
    this.busy.add(destination);
    const entry = { name: name || repo.folder, source: repo.source, directory: destination, kind: 'git' };
    try {
      this.record({ ...entry, state: 'installing' });
      await this.clone(repo.source, destination, this.root);
      if (!fs.existsSync(path.join(destination, '.git'))) throw Error('Git did not report a complete checkout.');
      return this.record({ ...entry, state: 'downloaded' });
    } catch (error) { this.record({ ...entry, state: 'incomplete' }); throw error; }
    finally { this.busy.delete(destination); }
  }
}
module.exports = { ManagedDownloads, repositoryUrl, cloneRepository };
