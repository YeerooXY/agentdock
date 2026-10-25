'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { validateDraftText } = require('./draft-policy.cjs');

const MAX_BYTES = 1024 * 1024;
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function canonical(value) { const result = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? result.toLowerCase() : result; }
function editorArgs(raw) {
  const text = String(raw || '').trim();
  const args = []; let value = '', quoted = false, slashes = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') { slashes++; continue; }
    if (char === '"') {
      value += '\\'.repeat(Math.floor(slashes / 2));
      if (slashes % 2) value += '"'; else quoted = !quoted;
      slashes = 0; continue;
    }
    value += '\\'.repeat(slashes); slashes = 0;
    if (/\s/.test(char) && !quoted) { if (value) { args.push(value); value = ''; } }
    else value += char;
  }
  value += '\\'.repeat(slashes);
  if (value) args.push(value);
  if (quoted || !args.length) throw new Error('The configured text editor command is invalid.');
  return args;
}
function draftFile(raw, allowedRoots = []) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) throw new Error('The CLI editor did not provide a safe temporary draft file.');
  if (!Array.isArray(allowedRoots) || !allowedRoots.length) throw new Error('This CLI version does not expose a verified draft folder. Keep the console open.');
  const roots = allowedRoots.map(root => {
    const info = fs.lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The CLI editor folder cannot be verified. Keep the console open.');
    const real = fs.realpathSync(root);
    if (canonical(path.resolve(root)) !== canonical(real)) throw new Error('The CLI editor folder cannot be verified. Keep the console open.');
    return real;
  });
  const info = fs.lstatSync(raw);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('The CLI draft file cannot be handled safely.');
  const real = fs.realpathSync(raw);
  if (!roots.some(root => inside(root, real))) throw new Error('The CLI draft file is outside its verified editor folder. Keep the console open.');
  const finalInfo = fs.lstatSync(real);
  if (!finalInfo.isFile() || finalInfo.isSymbolicLink() || finalInfo.size > MAX_BYTES) throw new Error('The CLI draft file changed. Keep the console open.');
  return real;
}
function post(action, operationId, fields = {}) {
  return fetch(process.env.PADDOCK_DRAFT_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.PADDOCK_DRAFT_TOKEN}` },
    body: JSON.stringify({ action, operationId, sessionId: process.env.PADDOCK_DRAFT_SESSION, launchId: process.env.PADDOCK_DRAFT_LAUNCH, ...fields }),
    signal: AbortSignal.timeout(5000)
  }).then(async response => {
    if (!response.ok) throw new Error('The account switch draft bridge is unavailable.');
    return response.json();
  });
}
function resolveWindowsShim(executable, env = process.env) {
  if (process.platform !== 'win32' || path.extname(executable)) return executable;
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const hasDirectory = path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\');
  const directories = hasDirectory ? [path.dirname(executable)] : (env.PATH || '').split(path.delimiter).filter(Boolean);
  const name = hasDirectory ? path.basename(executable) : executable;
  for (const directory of directories) for (const extension of extensions) {
    const candidate = path.join(directory, name + extension.toLowerCase());
    if (fs.existsSync(candidate)) return candidate;
  }
  return executable;
}
function powershellLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function runEditor(args) {
  const configured = process.env.PADDOCK_REAL_EDITOR;
  if (!configured?.trim()) throw new Error(`Set VISUAL or EDITOR in ${process.platform === 'win32' ? 'Windows' : 'your shell profile'} before using Ctrl+G. The composer was left unchanged.`);
  const commandLine = editorArgs(configured);
  const executable = commandLine.shift(), commandArgs = [...commandLine, ...args];
  const resolved = resolveWindowsShim(executable);
  const usePowerShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(resolved);
  const command = usePowerShell
    ? process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe'
    : resolved;
  const childArgs = usePowerShell
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `& ${[resolved, ...commandArgs].map(powershellLiteral).join(' ')}; if (-not $?) { exit 1 }; if ($LASTEXITCODE -is [int]) { exit $LASTEXITCODE } else { exit 0 }`]
    : commandArgs;
  return new Promise((resolve, reject) => {
    const child = spawn(command, childArgs, { stdio: 'inherit', windowsHide: false, shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}
async function run() {
  const operationId = crypto.randomUUID();
  let prepared = null;
  try {
    if (!process.env.PADDOCK_DRAFT_URL || !process.env.PADDOCK_DRAFT_TOKEN || !process.env.PADDOCK_DRAFT_SESSION || !process.env.PADDOCK_DRAFT_LAUNCH) {
      throw new Error('Paddock draft support is unavailable.');
    }
    const args = process.argv.slice(2); prepared = await post('prepare', operationId);
    if (prepared.mode === 'delegate') { process.exitCode = await runEditor(args); return; }
    if (prepared.operationId !== operationId) throw new Error('The draft operation changed. Keep the console open.');
    const roots = JSON.parse(process.env.PADDOCK_DRAFT_ROOTS || '[]');
    const file = draftFile(args.at(-1), roots);
    if (prepared.mode === 'capture') {
      const bytes = fs.readFileSync(file), text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('The CLI draft encoding changed. Keep the console open.');
      validateDraftText(text, process.env.PADDOCK_DRAFT_PROVIDER);
      const marker = prepared.text;
      if (typeof marker !== 'string' || !/^PDK[a-f0-9]{32}$/.test(marker) || text.includes(marker)) throw new Error('The CLI draft could not be marked safely. Keep the console open.');
      // Codex trims trailing whitespace after a successful editor exit. Put a
      // private suffix after the draft, then let Sessions remove it with one
      // verified backspace sequence. This keeps capture exact without leaving
      // the native composer unchanged through an error exit.
      fs.appendFileSync(file, marker, { flag: 'a' });
      await post('complete', operationId, { text });
      process.exitCode = 0;
    } else if (prepared.mode === 'restore') {
      if (typeof prepared.text !== 'string' || Buffer.byteLength(prepared.text, 'utf8') > MAX_BYTES) throw new Error('The saved draft is too large to restore.');
      if (Buffer.from(prepared.text, 'utf8').toString('utf8') !== prepared.text) throw new Error('The saved draft encoding changed. Keep the console open.');
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('The CLI draft file changed. Keep the console open.');
      const fd = fs.openSync(file, 'r+');
      try { fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, Buffer.from(prepared.text, 'utf8')); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      await post('complete', operationId);
    } else throw new Error('The account switch draft action is invalid.');
  } catch (error) {
    if (prepared?.mode && prepared.mode !== 'delegate') {
      const reason = ['claude-editor-context', 'draft-unsupported', 'draft-invalid'].includes(error.code) ? error.code : undefined;
      await post('fail', operationId, reason ? { reason } : {}).catch(() => {});
    }
    // Never print the draft or the configured editor command to the terminal.
    process.stderr.write(`Paddock could not preserve this draft: ${error.message}\n`);
    process.exitCode = 1;
  }
}
if (require.main === module) run();
module.exports = { editorArgs, draftFile, inside, resolveWindowsShim, runEditor };
