#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { capture } = require('../electron/screens/capture.cjs');

function changedFilesFromGit(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).filter(Boolean).map(line => line.slice(3).trim().split(' -> ').pop());
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const targets = [];
  let profiles = null, projectDir = path.resolve(__dirname, '..'), changedFiles = null;
  for (const arg of argv) {
    if (arg.startsWith('--profiles=')) {
      profiles = arg.slice('--profiles='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--project=')) {
      projectDir = path.resolve(arg.slice('--project='.length));
    } else if (arg.startsWith('--changed-files=')) {
      changedFiles = arg.slice('--changed-files='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (!arg.startsWith('--')) {
      targets.push(arg);
    }
  }
  const selection = !targets.length || (targets.length === 1 && targets[0] === 'all')
    ? 'all'
    : (targets.length === 1 && targets[0] === 'changed') ? 'changed' : targets;
  return { projectDir, targets: selection, profiles, changedFiles };
}

if (require.main === module) {
  (async () => {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.targets === 'changed' && !opts.changedFiles) opts.changedFiles = changedFilesFromGit(opts.projectDir);
    const summary = await capture(opts.projectDir, opts);
    console.log(JSON.stringify(summary));
    if (summary.failed.length) process.exitCode = 1;
  })().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, changedFilesFromGit };
