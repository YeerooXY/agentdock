#!/usr/bin/env node
'use strict';
// E4: checks every provider adapter's launch flags against the installed CLI's
// own --help (and subcommand help where the flags live). No prompts are sent.
//   node scripts/verify-cli-flags.cjs [--json out.json]
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { adapters } = require('../electron/providers/index.cjs');
const { CliSetup } = require('../electron/cli-setup.cjs');

const dataRoot = path.join(process.env.APPDATA || '', 'Paddock');
// Flags that take a value or follow a subcommand are matched by their name only.
const flagName = value => String(value).split('=')[0];

function help(executable, args) {
  // .cmd launchers run through cmd.exe with the command line passed verbatim;
  // some CLIs print help on stderr, so both streams are read.
  const shell = /\.(cmd|bat)$/i.test(executable);
  const result = spawnSync(shell ? 'cmd.exe' : executable, shell ? ['/d', '/s', '/c', `""${executable}" ${args.join(' ')}"`] : args,
    { encoding: 'utf8', timeout: 30000, windowsHide: true, windowsVerbatimArguments: shell, env: { ...process.env, NO_COLOR: '1' } });
  return String(result.stdout || '') + String(result.stderr || '');
}

function main() {
  const setup = new CliSetup(dataRoot, {}, { testMode: false, deferDetection: true });
  const rows = [];
  for (const adapter of adapters) {
    if (!adapter.catalog) continue;
    const executable = (() => { try { return setup.executable(adapter.id); } catch { return null; } })();
    const flags = [adapter.launch.modelFlag, ...(adapter.launch.unrestricted || [])].filter(Boolean).filter(flag => flag.startsWith('-')).map(flagName);
    if (!executable) { rows.push({ provider: adapter.id, installed: false, flags, missing: [] }); continue; }
    const subcommand = adapter.launch.args?.[0];
    const text = help(executable, ['--help']) + (subcommand ? help(executable, [subcommand, '--help']) : '');
    const missing = flags.filter(flag => !new RegExp(`(^|[\\s,\\[])${flag.replace(/[-]/g, '\\-')}(?![\\w-])`, 'm').test(text));
    rows.push({ provider: adapter.id, installed: true, flags, missing, helpBytes: text.length });
  }
  for (const row of rows) console.log(`${row.provider.padEnd(12)} ${!row.installed ? 'not installed' : row.helpBytes < 40 ? 'no help output' : row.missing.length ? 'MISSING ' + row.missing.join(', ') : 'ok'}  (${row.flags.join(' ') || 'no flags'})`);
  const out = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
  process.exitCode = rows.some(row => row.installed && (row.missing.length || row.helpBytes < 40)) ? 1 : 0;
}
main();
