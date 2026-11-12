'use strict';
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const commitPattern = /^[a-f0-9]{40,64}$/i;

function cleanGit(value) {
  if (!value || typeof value !== 'object') return null;
  const branch = typeof value.branch === 'string' ? value.branch.replace(/[\x00-\x1f]/g, '').slice(0, 250) || null : null;
  const commit = commitPattern.test(value.commit || '') ? value.commit : null;
  if (!branch && !commit) return null;
  return { branch, commit, detached: value.detached === true && !branch,
    ...(value.unborn === true ? { unborn: true } : {}),
    ...(typeof value.repository === 'string' ? { repository: value.repository.slice(0, 1000) } : {}),
    dirty: typeof value.dirty === 'boolean' ? value.dirty : null };
}

async function gitInfo(folder, { run = exec } = {}) {
  if (!folder) return null;
  try {
    // One status observation supplies HEAD, branch and working-tree state together.
    // Disable optional locks so reading status never refreshes Git's index.
    const options = { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 3000 };
    // Both processes must settle even outside a repository. Returning after the
    // first rejection can leave the other process holding a folder on Windows.
    const probes = await Promise.allSettled([
      run('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', folder, 'status', '--porcelain=v2', '--branch', '--untracked-files=normal', '-z'], options),
      run('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', folder, 'rev-parse', '--show-toplevel'], options)
    ]);
    if (probes.some(probe => probe.status !== 'fulfilled')) return null;
    const [status, root] = probes.map(probe => probe.value);
    const records = status.stdout.split('\0').filter(Boolean);
    const head = records.find(x => x.startsWith('# branch.head '))?.slice(14);
    const commit = records.find(x => x.startsWith('# branch.oid '))?.slice(13);
    return cleanGit({ branch: head === '(detached)' ? null : head, commit, detached: head === '(detached)', unborn: commit === '(initial)',
      repository: await fs.realpath(root.stdout.trim()), dirty: records.some(x => !x.startsWith('# ')) });
  } catch { return null; }
}

module.exports = { gitInfo, cleanGit };
