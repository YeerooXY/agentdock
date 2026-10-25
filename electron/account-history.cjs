'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { inside } = require('./account-profiles.cjs');

const MAX_FILE_BYTES = 160 * 1024 * 1024;
const MAX_SCAN_ENTRIES = 50000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const canonical = value => { const result = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? result.toLowerCase() : result; };

async function checkedRoot(configDir, name) {
  const config = await fs.realpath(configDir);
  const root = path.join(config, name);
  let stat;
  try { stat = await fs.lstat(root); } catch (error) { if (error.code === 'ENOENT') return { config, root, exists: false }; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Conversation history is linked or unavailable. Keep the current console open.');
  const real = await fs.realpath(root);
  if (!inside(config, real)) throw new Error('Conversation history moved outside its account folder. Keep the current console open.');
  return { config, root: real, exists: true };
}

async function firstRecord(file) {
  const fd = await fs.open(file, 'r');
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new Error('Conversation history is too large or invalid. Keep the current console open.');
    const buffer = Buffer.alloc(Math.min(stat.size, 256 * 1024));
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const newline = bytes.indexOf(0x0a);
    if (newline < 0 && stat.size > bytesRead) throw new Error('Conversation metadata is too large to verify. Keep the current console open.');
    const firstLine = bytes.subarray(0, newline < 0 ? bytes.length : newline);
    const line = new TextDecoder('utf-8', { fatal: true }).decode(firstLine.at(-1) === 0x0d ? firstLine.subarray(0, -1) : firstLine);
    return { stat, line, fd };
  } catch (error) { await fd.close(); throw error; }
}

function matchingId(provider, line, sessionId) {
  let record; try { record = JSON.parse(line); } catch { return false; }
  if (provider === 'codex') return record?.type === 'session_meta' && record?.payload?.id === sessionId;
  return record?.sessionId === sessionId || record?.session_id === sessionId || record?.session === sessionId;
}

function hasCodexHistoryDependency(buffer) {
  const first = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString('utf8').split(/\r?\n/, 1)[0];
  try {
    const meta = JSON.parse(first);
    return meta?.type === 'session_meta' && meta.payload?.history_base != null;
  } catch { return true; }
}

async function safeRead(file, root, provider, sessionId) {
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) return null;
  const realBefore = await fs.realpath(file);
  if (!inside(root, realBefore)) return null;
  const { stat, line, fd } = await firstRecord(realBefore);
  try {
    if (!matchingId(provider, line, sessionId)) return null;
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await fd.read(buffer, 0, stat.size, 0);
    if (bytesRead !== stat.size) return null;
    const after = await fd.stat();
    const realAfter = await fs.realpath(file);
    const pathAfter = await fs.lstat(file);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino || after.dev !== stat.dev || realAfter !== realBefore || !pathAfter.isFile() || pathAfter.isSymbolicLink() || !inside(root, realAfter)) return null;
    return buffer;
  } finally { await fd.close(); }
}

async function candidates(root, provider, sessionId) {
  const matches = [], stack = [{ dir: root, relative: '' }];
  let visited = 0;
  const deadline = Date.now() + 8000;
  while (stack.length) {
    if (Date.now() > deadline || visited > MAX_SCAN_ENTRIES) throw new Error('Conversation history could not be searched safely. Keep the current console open.');
    const { dir, relative } = stack.pop();
    const handle = await fs.opendir(dir);
    for await (const entry of handle) {
      visited++;
      if (visited > MAX_SCAN_ENTRIES) throw new Error('Conversation history could not be searched safely. Keep the current console open.');
      const file = path.join(dir, entry.name), childRelative = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const stat = await fs.lstat(file);
        if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(root, await fs.realpath(file))) continue;
        stack.push({ dir: file, relative: childRelative });
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (provider === 'codex' && lower.includes(sessionId.toLowerCase()) && /\.jsonl\.(?:zst|gz|br|zip)$/.test(lower)) {
          throw new Error('This Codex history uses a compressed transcript that Paddock cannot transfer yet. Keep the current console open.');
        }
        const expected = provider === 'codex'
          ? lower.endsWith('.jsonl') && lower.includes(sessionId.toLowerCase())
          : lower === `${sessionId.toLowerCase()}.jsonl`;
        if (expected) matches.push({ file, relative: childRelative });
      }
    }
  }
  return matches;
}

async function findConversation(configDir, provider, sessionId) {
  if (!['codex', 'claude'].includes(provider) || !UUID.test(sessionId || '')) throw new Error('This console has no resumable conversation ID.');
  const name = provider === 'codex' ? 'sessions' : 'projects';
  const { root, exists } = await checkedRoot(configDir, name);
  if (!exists) throw new Error('The selected conversation history was not found. Keep the current console open.');
  const files = await candidates(root, provider, sessionId);
  const valid = [];
  for (const candidate of files) {
    const buffer = await safeRead(candidate.file, root, provider, sessionId);
    if (buffer) valid.push({ ...candidate, buffer });
  }
  if (valid.length !== 1) throw new Error(valid.length ? 'More than one matching conversation was found. Keep the current console open.' : 'The selected conversation could not be verified. Keep the current console open.');
  if (provider === 'codex' && hasCodexHistoryDependency(valid[0].buffer)) throw new Error('This Codex history depends on another rollout file. Keep the current console open.');
  return { root, ...valid[0] };
}

async function ensureSafeDirectories(root, relative) {
  const segments = relative.split(path.sep);
  if (!segments.length || segments.some(x => !x || x === '.' || x === '..')) throw new Error('Conversation history path is invalid.');
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current), real = await fs.realpath(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(root, real)) throw new Error('Conversation history path is linked or unavailable. Keep the current console open.');
    current = real;
  }
  return path.join(current, segments.at(-1));
}

async function atomicTranscript(root, relative, buffer, provider, sessionId, isTargetInUse = () => false) {
  const file = await ensureSafeDirectories(root, relative);
  const parent = await fs.realpath(path.dirname(file));
  if (!inside(root, parent)) throw new Error('Conversation history path moved outside its account folder. Keep the current console open.');
  let initialState = 'missing', initialHash = null;
  try {
    const stat = await fs.lstat(file);
    const existing = stat.isFile() && !stat.isSymbolicLink() ? await safeRead(file, root, provider, sessionId) : null;
    if (existing?.equals(buffer)) return;
    if (!existing || existing.length >= buffer.length || !buffer.subarray(0, existing.length).equals(existing) || existing.at(-1) !== 0x0a) {
      throw new Error('The target account already has different history for this conversation. Keep the current console open.');
    }
    if (isTargetInUse()) throw new Error('Another console is using this conversation in the target account. Keep both consoles open.');
    initialState = 'prefix'; initialHash = crypto.createHash('sha256').update(existing).digest('hex');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = path.join(parent, `.${path.basename(file)}.${crypto.randomUUID()}.paddock-tmp`);
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(buffer); await handle.sync(); }
  finally { await handle.close(); }
  try {
    const currentParent = await fs.realpath(path.dirname(file));
    if (canonical(currentParent) !== canonical(parent) || !inside(root, currentParent)) throw new Error('Conversation history path changed. Keep the current console open.');
    let current;
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The target conversation changed. Keep the current console open.');
      current = await safeRead(file, root, provider, sessionId);
      if (!current) throw new Error('The target conversation changed. Keep the current console open.');
      if (current.equals(buffer)) { await fs.rm(temp, { force: true }); return; }
      if (initialState !== 'prefix' || crypto.createHash('sha256').update(current).digest('hex') !== initialHash || current.length >= buffer.length || current.at(-1) !== 0x0a || !buffer.subarray(0, current.length).equals(current)) throw new Error('The target account already has different history for this conversation. Keep the current console open.');
      if (isTargetInUse()) throw new Error('Another console is using this conversation in the target account. Keep both consoles open.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  const after = await fs.lstat(file), real = await fs.realpath(file);
  if (!after.isFile() || after.isSymbolicLink() || !inside(root, real) || !(await safeRead(file, root, provider, sessionId))) {
    throw new Error('The copied conversation could not be verified. Keep the current console open.');
  }
}

async function copyConversation({ sourceConfig, targetConfig, provider, sessionId, isTargetInUse }) {
  const found = await findConversation(sourceConfig, provider, sessionId);
  const name = provider === 'codex' ? 'sessions' : 'projects';
  const targetRoot = path.join(await fs.realpath(targetConfig), name);
  try { await fs.mkdir(targetRoot); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const targetStat = await fs.lstat(targetRoot), targetReal = await fs.realpath(targetRoot), targetConfigReal = await fs.realpath(targetConfig);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink() || !inside(targetConfigReal, targetReal)) throw new Error('The target account history folder is linked or unavailable. Keep the current console open.');
  await atomicTranscript(targetReal, found.relative, found.buffer, provider, sessionId, isTargetInUse);
  return { path: found.relative, bytes: found.buffer.length };
}

module.exports = { copyConversation, findConversation, matchingId, safeRead, hasCodexHistoryDependency, inside };
