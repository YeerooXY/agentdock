'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { atomicJson, readJson } = require('./storage.cjs');
const { getScheduler } = require('./scheduler.cjs');

const terminal = new Set(['completed', 'failed', 'conflict']);
const identity = ['-c', 'user.name=Paddock', '-c', 'user.email=paddock@localhost', '-c', 'commit.gpgsign=false'];
class MergeBack {
  constructor(root, { admission = getScheduler(root), git, checks } = {}) {
    this.root = root; this.admission = admission; this.checks = checks;
    this.dir = path.join(root, 'merge-back'); fs.mkdirSync(this.dir, { recursive: true });
    const hooks = path.join(this.dir, 'hooks'); fs.mkdirSync(hooks, { recursive: true });
    this.git = git || (async (folder, args, options = {}) => (await execFile('git', ['-C', folder, '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${hooks}`, ...args], { windowsHide: true, timeout: 30000, ...options })).stdout);
    this.intents = new Map();
    for (const file of fs.readdirSync(this.dir).filter(name => /^[a-f0-9-]+\.json$/.test(name))) {
      const intent = readJson(path.join(this.dir, file), null);
      if (!intent?.id) throw Error('Cannot read a merge intent. Inspect the merge-back folder.');
      if (!terminal.has(intent.state)) {
        intent.previousState ||= intent.state; intent.state = 'interrupted';
        intent.error = 'Paddock closed during merge-back. Inspect the target and saved intent before continuing.';
        atomicJson(path.join(this.dir, file), intent);
      }
      this.intents.set(intent.id, intent);
    }
  }
  snapshot() { return [...this.intents.values()].map(intent => ({ ...intent })); }
  save(intent, state, fields = {}) {
    const next = { ...intent, ...fields, state };
    atomicJson(path.join(this.dir, `${intent.id}.json`), next);
    Object.assign(intent, next); this.intents.set(intent.id, intent);
  }
  async accept(task) {
    if (typeof task.targetBranch !== 'string' || !task.targetBranch) throw Error('This task has no saved target branch. Choose its target before accepting.');
    const repository = (await this.git(task.repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
    await this.git(task.repo, ['check-ref-format', `refs/heads/${task.targetBranch}`]);
    await this.git(task.repo, ['check-ref-format', `refs/heads/${task.branch}`]);
    if (!task.branch || task.branch === task.targetBranch) throw Error('Choose distinct source and target branches.');
    const release = await this.admission.acquire({ id: `merge:${randomUUID()}`, kind: 'merge-back', repository, target: task.targetBranch, taskId: task.id });
    if (!release) throw Error('Merge-back was cancelled.');
    try {
      const completed = this.snapshot().find(intent => intent.taskId === task.id && intent.state === 'completed');
      if (completed) return completed;
      if (this.snapshot().some(intent => intent.repository === repository && intent.target === task.targetBranch && !terminal.has(intent.state))) throw Error('An interrupted merge-back needs review. Inspect its saved intent.');
      return await this.stage(task, repository);
    } finally { release(); }
  }
  async stage(task, repository) {
    const base = (await this.git(task.repo, ['rev-parse', '--verify', `refs/heads/${task.targetBranch}`])).trim();
    const head = (await this.git(task.workFolder, ['rev-parse', '--verify', `refs/heads/${task.branch}`])).trim();
    const intent = { id: randomUUID(), taskId: task.id, repository, repo: task.repo, branch: task.branch, target: task.targetBranch, base, head, state: 'prepared' };
    intent.folder = path.join(this.dir, intent.id);
    this.save(intent, 'prepared');
    let created = false;
    try {
      await this.git(task.repo, ['worktree', 'add', '--detach', intent.folder, base]); created = true;
      const snapshot = await this.sourceSnapshot(task, intent);
      await this.combine(intent, snapshot);
      if (intent.state === 'conflict') return { ...intent };
      const merged = (await this.git(intent.folder, ['rev-parse', 'HEAD'])).trim();
      this.save(intent, 'checking', { merged });
      if (task.checks && !this.checks) throw Error('Provide a checks runner before accepting this task.');
      const result = this.checks ? await this.checks({ ...task, workFolder: intent.folder }, intent) : { code: 0 };
      this.save(intent, 'checking', { checks: result });
      if (result?.code !== 0 || result?.timedOut) throw Error('Merge-back checks failed. The target branch was kept.');
      if ((await this.git(intent.folder, ['rev-parse', 'HEAD'])).trim() !== merged || (await this.git(intent.folder, ['status', '--porcelain', '--untracked-files=all'])).trim()) throw Error('Checks changed the merged tree. The target branch was kept.');
      await this.publish(task, intent);
      return { ...intent };
    } catch (error) {
      // Publishing can finish before a storage write fails. Keep that intent
      // unresolved so startup reports it rather than offering an automatic retry.
      if (intent.state !== 'publishing') this.save(intent, 'failed', { error: error.message });
      throw error;
    } finally {
      if (created && terminal.has(intent.state)) await this.git(task.repo, ['worktree', 'remove', '--force', intent.folder]).catch(() => {});
    }
  }
  async sourceSnapshot(task, intent) {
    const current = (await this.git(task.workFolder, ['branch', '--show-current'])).trim();
    if (current !== task.branch) throw Error('The task branch changed. Inspect its work folder.');
    // An isolated index captures verified uncommitted files without staging or
    // moving the source branch or changing the owner's index.
    const index = path.join(this.dir, `${intent.id}.index`), env = { ...process.env, GIT_INDEX_FILE: index };
    try {
      await this.git(task.workFolder, ['read-tree', intent.head], { env });
      await this.git(task.workFolder, ['add', '--all', '--', '.'], { env });
      const tree = (await this.git(task.workFolder, ['write-tree'], { env })).trim();
      const snapshot = (await this.git(task.workFolder, [...identity, 'commit-tree', tree, '-p', intent.head, '-m', `Task ${task.id}`])).trim();
      this.save(intent, 'merging', { snapshot }); return snapshot;
    } finally { fs.rmSync(index, { force: true }); }
  }
  async combine(intent, head) {
    const hooks = path.join(this.dir, 'hooks'); fs.mkdirSync(hooks, { recursive: true });
    try { await this.git(intent.folder, [...identity, '-c', `core.hooksPath=${hooks}`, 'merge', '--no-ff', '--no-edit', head]); }
    catch (error) {
      const conflicts = (await this.git(intent.folder, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
      if (!conflicts.length) throw error;
      this.save(intent, 'conflict', { conflicts, error: `Merge conflict: ${conflicts.join(', ')}. The target branch was kept.` });
    }
  }
  async publish(task, intent) {
    const checkout = await this.admission.acquire({ kind: 'checkout', repository: intent.repository, checkout: true, taskId: task.id });
    if (!checkout) throw Error('Merge-back was cancelled.');
    try {
      const entries = (await this.git(task.repo, ['worktree', 'list', '--porcelain', '-z'])).split('\0\0');
      const entry = entries.find(value => value.split('\0').includes(`branch refs/heads/${intent.target}`));
      const folder = entry?.split('\0').find(value => value.startsWith('worktree '))?.slice(9);
      if ((await this.git(task.repo, ['rev-parse', `refs/heads/${intent.target}`])).trim() !== intent.base) throw Error('The target branch changed. Run merge-back again after review.');
      if (folder && (await this.git(folder, ['status', '--porcelain', '--untracked-files=all'])).trim()) throw Error('The target checkout has changes. Commit or discard them before accepting.');
      if (folder && (await this.git(folder, ['branch', '--show-current'])).trim() !== intent.target) throw Error('The target checkout changed branches. Inspect it before accepting.');
      this.save(intent, 'publishing');
      if (folder) {
        const hooks = path.join(this.dir, 'hooks');
        await this.git(folder, ['-c', `core.hooksPath=${hooks}`, 'merge', '--ff-only', '--no-edit', intent.merged]);
      } else await this.git(task.repo, ['update-ref', `refs/heads/${intent.target}`, intent.merged, intent.base]);
      this.save(intent, 'completed');
    } finally { checkout(); }
  }
}
module.exports = { MergeBack };
