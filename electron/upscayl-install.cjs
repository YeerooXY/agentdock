'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');
const { ManagedDownloads } = require('./managed-downloads.cjs');

const VERSION = '2.15.0';
const URL = `https://github.com/upscayl/upscayl/releases/download/v${VERSION}/upscayl-${VERSION}-win.zip`;
// Official portable release downloaded over HTTPS and hashed on 31 October 2026.
const SHA256 = '6aa2f137ce45bac3877c5634bb0829f398ed757cbf4a72ccdef12b7473407823';
const SIZE = 304247780;
const managedFolder = root => path.join(root, 'integrations', 'upscayl');
function installation(directory) {
  const executable = path.join(directory, 'Upscayl.exe'), engine = path.join(directory, 'resources', 'bin', 'upscayl-bin.exe'), models = path.join(directory, 'resources', 'models');
  return fs.existsSync(executable) && fs.existsSync(engine) && fs.existsSync(models) ? { directory, executable, engine, models } : null;
}
function discoverUpscayl(root, platform = process.platform) {
  if (platform !== 'win32') return null;
  const folders = [path.join(managedFolder(root), VERSION), path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Upscayl'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Upscayl')];
  return folders.map(installation).find(Boolean) || null;
}
async function hashFile(file) { const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
// The caller supplies a fresh directory. Reject traversal, links and archive bombs.
function extractArchive(file, destination) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      let count = 0, total = 0, done = false;
      const fail = error => { if (!done) { done = true; zip.close(); reject(error); } };
      zip.on('error', fail); zip.on('end', () => { if (!done) { done = true; resolve(); } });
      zip.on('entry', entry => {
        const parts = entry.fileName.split('/'), target = path.resolve(destination, ...parts);
        if (++count > 10000 || (total += entry.uncompressedSize) > 2 * 1024 ** 3 || entry.generalPurposeBitFlag & 1 || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000 || parts.some(p => p === '..' || p.includes(':') || p.includes('\\')) || !target.startsWith(path.resolve(destination) + path.sep)) return fail(Error('Unsafe or oversized Upscayl archive.'));
        if (entry.fileName.endsWith('/')) { try { fs.mkdirSync(target, { recursive: true }); zip.readEntry(); } catch (e) { fail(e); } return; }
        try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch (e) { return fail(e); }
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          pipeline(stream, fs.createWriteStream(target, { flags: 'wx' })).then(() => { if (!done) zip.readEntry(); }, fail);
        });
      });
      zip.readEntry();
    });
  });
}
async function installUpscayl(root, { platform = process.platform, fetchImpl = fetch, progress = () => {}, extract = extractArchive } = {}) {
  if (platform !== 'win32') throw Error('Paddock’s Upscayl installer currently supports Windows. Use the official download for other systems.');
  const existing = discoverUpscayl(root, platform); if (existing) return existing;
  const directory = managedFolder(root), destination = path.join(directory, VERSION), archive = path.join(directory, `upscayl-${VERSION}-win.zip`);
  const downloads = new ManagedDownloads(root), record = { name: `Upscayl ${VERSION} (portable)`, kind: 'installer', source: URL, directory };
  if (fs.existsSync(destination)) throw Error('The Upscayl installation folder is incomplete. Review it before reinstalling.');
  fs.mkdirSync(directory, { recursive: true }); downloads.record({ ...record, state: 'installing' });
  let staging;
  try {
    if (!fs.existsSync(archive) || await hashFile(archive) !== SHA256) {
      progress('Downloading Upscayl (290 MB)…');
      const response = await fetchImpl(URL, { signal: AbortSignal.timeout(300000) });
      if (!response.ok) throw Error(`Upscayl download failed (HTTP ${response.status}).`);
      const partial = archive + '.partial', handle = fs.openSync(partial, 'w'); let bytes = 0;
      try { for await (const chunk of response.body) { bytes += chunk.length; if (bytes > SIZE) throw Error('Upscayl download is larger than expected.'); fs.writeSync(handle, chunk); } } finally { fs.closeSync(handle); }
      if (bytes !== SIZE || await hashFile(partial) !== SHA256) throw Error('Upscayl download verification failed. Nothing was installed.');
      fs.renameSync(partial, archive);
    }
    progress('Installing Upscayl…');
    staging = fs.mkdtempSync(path.join(directory, '.install-')); await extract(archive, staging);
    if (!installation(staging)) throw Error('The Upscayl archive is missing its application, engine or models.');
    fs.renameSync(staging, destination); staging = null;
    const installed = installation(destination); downloads.record({ ...record, executable: installed.executable }); return installed;
  } catch (error) { downloads.record({ ...record, state: 'incomplete' }); throw error; }
  finally {
    if (staging && path.dirname(fs.realpathSync(staging)) === fs.realpathSync(directory) && path.basename(staging).startsWith('.install-')) fs.rmSync(staging, { recursive: true });
  }
}
module.exports = { VERSION, URL, SHA256, SIZE, managedFolder, installation, discoverUpscayl, installUpscayl, extractArchive, hashFile };
