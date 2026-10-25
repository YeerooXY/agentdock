'use strict';
// Git worktrees for consoles that work in parallel on one repository. Each
// console gets its own folder and branch under Paddock's data folder, so agents
// do not overwrite each other's files. Paddock removes a worktree only when it
// has no uncommitted changes; its branch keeps every commit for merging.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { realRoot } = require('./platform.cjs');

const slug = value => String(value || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 32).replace(/^-|-$/g, '') || 'console';
const inside = (root, target) => { const r = path.relative(root, target); return !!r && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };

class Worktrees {
  constructor(root, { git = (args, options) => execFile('git', args, { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...options }) } = {}) {
    this.dir = path.join(realRoot(root), 'worktrees');
    this.git = git;
  }
  async repository(folder) {
    try { return realRoot((await this.git(['-C', folder, 'rev-parse', '--show-toplevel'])).stdout.trim()); }
    catch { return null; }
  }
  // Creates a branch and folder for one console. The console starts in the same
  // subfolder it would have used in the main checkout.
  async create(folder, name) {
    const repository = await this.repository(folder);
    if (!repository) throw new Error('This folder is not in a Git repository. Turn off the worktree option or choose a repository folder.');
    const head = (await this.git(['-C', repository, 'rev-parse', '--verify', 'HEAD']).catch(() => null))?.stdout.trim();
    if (!head) throw new Error('Make a first commit in this repository before opening a worktree.');
    const id = `${slug(name)}-${crypto.randomBytes(3).toString('hex')}`, branch = `paddock/${id}`;
    const group = `${slug(path.basename(repository))}-${crypto.createHash('sha256').update(repository).digest('hex').slice(0, 8)}`;
    const target = path.join(this.dir, group, id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await this.git(['-C', repository, 'worktree', 'add', '-b', branch, target, head]);
    const relative = path.relative(repository, realRoot(folder));
    return { repository, path: target, branch, base: head, cwd: relative && !relative.startsWith('..') ? path.join(target, relative) : target };
  }
  // Uncommitted changes and commits made on the console's branch.
  async status(worktree) {
    this.owned(worktree);
    const dirty = !!(await this.git(['-C', worktree.path, 'status', '--porcelain', '--untracked-files=normal'])).stdout.trim();
    const ahead = Number((await this.git(['-C', worktree.path, 'rev-list', '--count', `${worktree.base}..HEAD`]).catch(() => ({ stdout: '0' }))).stdout.trim()) || 0;
    return { dirty, ahead };
  }
  async remove(worktree) {
    this.owned(worktree);
    if ((await this.status(worktree)).dirty) throw new Error('This worktree has uncommitted changes. Commit or discard them first; Paddock kept the folder.');
    // Without --force, Git itself refuses to remove a worktree with changes.
    await this.git(['-C', worktree.repository, 'worktree', 'remove', worktree.path]);
  }
  owned(worktree) {
    if (!worktree || typeof worktree.path !== 'string' || !inside(this.dir, path.resolve(worktree.path))) throw new Error('This worktree is not managed by Paddock.');
  }
}

// Saved consoles carry their worktree; keep only well-formed, Paddock-owned values.
function cleanWorktree(value) {
  if (!value || typeof value !== 'object') return null;
  const { repository, path: folder, branch, base } = value;
  if (![repository, folder, branch, base].every(x => typeof x === 'string' && x.length && x.length < 2000)) return null;
  if (!/^paddock\/[\w-]+$/.test(branch) || !/^[a-f0-9]{40,64}$/i.test(base)) return null;
  return { repository, path: folder, branch, base };
}

module.exports = { Worktrees, cleanWorktree, slug };
