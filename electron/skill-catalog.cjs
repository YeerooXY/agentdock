'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const yauzl = require('yauzl');

const catalog = [
  {
    id: 'pstack', name: 'pstack', size: 6295660, archiveSha256: '657f25ac04b3b9f63617e3b40a4f969464645584afd2e25c245bfc767b3ab75d',
    description: 'Structured investigation, planning, implementation and verification workflows.',
    repo: 'cursor/plugins', commit: '2776ddd2355d6d6c8747d3964600f28daf62f049',
    prefix: 'pstack/', entry: 'upstream/skills/poteto-mode/SKILL.md'
  },
  {
    id: 'thermo-nuclear-code-quality-review', name: 'Thermo-Nuclear Code Quality Review', size: 12437, archiveSha256: '657f25ac04b3b9f63617e3b40a4f969464645584afd2e25c245bfc767b3ab75d',
    description: 'Strict review of maintainability, boundaries and structural complexity.',
    repo: 'cursor/plugins', commit: '2776ddd2355d6d6c8747d3964600f28daf62f049',
    prefix: 'cursor-team-kit/skills/thermo-nuclear-code-quality-review/', entry: 'upstream/SKILL.md'
  },
  {
    id: 'ponytail', name: 'Ponytail', size: 21344, archiveSha256: '4a89f180e1992ec551b3a54df257814b2647082c55512324eb4d4f9dd415a725',
    description: 'Reuse existing code and implement the smallest complete change.',
    repo: 'DietrichGebert/ponytail', commit: '96608e078b2d5ea607c5c3b8b5a54d1c1fba6846',
    prefix: 'skills/', entry: 'upstream/ponytail/SKILL.md'
  },
  {
    id: 'latex-document', name: 'LaTeX documents', size: 19235536, archiveSha256: 'b44c1f337866ac819029d770d889fb0d9a4158e725ba4c61b965dc57081b02c8',
    description: 'Create LaTeX study documents and PDFs: notes, cheat sheets, exams and PDF-to-LaTeX conversion.',
    repo: 'happycapy-ai/Happycapy-skills', commit: '9ff72feaf2f200f81fa4557d021414f73d12ab28',
    prefix: 'skills/latex-document/', entry: 'upstream/SKILL.md',
    group: 'study',
    setup: 'Compiling needs a LaTeX engine on this PC, such as MiKTeX or Tectonic; Paddock does not install one. The upstream setup script supports Linux and macOS only. No API key or automatic hooks. New agent sessions load the installed pack.'
  }
];

const ALLOWLISTED_REPOS = new Set(catalog.map(x => x.repo));
const LIMITS = { files: 1800, totalBytes: 40 * 1024 * 1024, fileBytes: 8 * 1024 * 1024, archiveBytes: 64 * 1024 * 1024 };

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  return Object.fromEntries(
    match[1].split(/\r?\n/).map(line => /^([a-z_-]+):\s*(.*)$/i.exec(line)).filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2').trim()])
  );
}

function assertNoLinkAncestors(targetPath) {
  let curr = path.resolve(targetPath);
  while (true) {
    try {
      if (fs.lstatSync(curr).isSymbolicLink()) throw new Error(`Link-like path rejected: ${curr}`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
}

function matchEntry(fileName, prefix) {
  if (fileName.endsWith('/')) return null;
  if (fileName.startsWith(prefix)) {
    const sub = fileName.slice(prefix.length);
    if (sub && !sub.endsWith('/')) return { kind: 'prefix', sub };
  }
  if (/^LICENSE(?:[.-].*)?$/i.test(fileName)) return { kind: 'license', name: fileName };
  const slash = fileName.indexOf('/');
  if (slash !== -1) {
    const afterTop = fileName.slice(slash + 1);
    if (afterTop.startsWith(prefix)) {
      const sub = afterTop.slice(prefix.length);
      if (sub && !sub.endsWith('/')) return { kind: 'prefix', sub };
    }
    if (/^LICENSE(?:[.-].*)?$/i.test(afterTop)) return { kind: 'license', name: afterTop };
  }
  return null;
}

function validateEntrySecurity(entry) {
  const raw = entry.fileNameRaw;
  if (raw && (raw.includes(0) || raw.includes(0x5c))) throw new Error('Invalid byte in entry path');
  const name = entry.fileName;
  if (typeof name !== 'string') throw new Error('Invalid entry filename');
  if (name.includes('\0') || name.includes('\\')) throw new Error('Invalid path characters in entry');
  if (/^[a-zA-Z]:/.test(name) || name.startsWith('/')) throw new Error('Absolute or drive path rejected');
  if (name.split('/').includes('..')) throw new Error('Path traversal rejected');
  if (name.replace(/\/$/, '').split('/').some(part => !part || part === '.' || part.includes(':'))) throw new Error('Non-canonical entry path rejected');
  if (entry.isEncrypted()) throw new Error('Encrypted entries are not allowed');
  if ((entry.versionMadeBy >> 8) === 3) {
    const mode = (entry.externalFileAttributes >> 16) & 0o170000;
    if (mode === 0o120000) throw new Error('Symlinks are not allowed: ' + name);
    if (mode !== 0 && mode !== 0o100000 && mode !== 0o040000) throw new Error('Non-regular file rejected: ' + name);
  }
}

function computeFileHashes(dir) {
  const hashes = {};
  const visit = rel => {
    for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const entRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink() || ent.name === 'SOURCE.json') continue;
      if (ent.isDirectory()) visit(entRel);
      else if (ent.isFile()) hashes[entRel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, entRel))).digest('hex');
    }
  };
  visit('');
  return hashes;
}

// Root adapter. `automatic` selects model-invocable frontmatter; `entry` lets an
// installed copy point at its renamed upstream entry.
function generateRootSkill(item, { automatic = false, entry = item.entry, trigger = item.description } = {}) {
  const head = automatic
    ? `---\nname: ${item.id}\ndescription: ${JSON.stringify('Use when the task matches: ' + String(trigger).replace(/\s+/g, ' ').trim())}\n---\n`
    : `---\nname: ${item.id}\ndescription: ${JSON.stringify('Use when explicitly requested. ' + item.description)}\ndisable-model-invocation: true\n---\n`;
  return head + `# ${item.name}\n\n` +
    `Read [the upstream skill](${entry}). Resolve its references from that file, and load only relevant references.\n\n` +
    "Project scope and instructions take precedence over upstream defaults. When Paddock tools are available, follow Paddock routing: discover accounts with dock/task_candidates and delegate through dock/start_task. Outside Paddock, use the explicitly selected native CLI/model and available native tools; do not request Paddock, invent its tools or change provider settings. Do not create another provider/model setup file or use upstream hard-coded model defaults. No API entitlement follows from a model name.\n\n" +
    'Do not register hooks, dashboards, provider plugins, background loops or external installers by loading this pack. Report unavailable host-specific capabilities. Reviews return findings; fixes stay within authorized scope. New sessions discover the installed pack.\n';
}

function defaultFetchArchive(url) {
  return new Promise((resolve, reject) => {
    let settled = false, deadline;
    const done = (error, data) => {
      if (settled) return;
      settled = true; clearTimeout(deadline);
      if (error) reject(error); else resolve(data);
    };
    let u;
    try { u = new URL(url); } catch { return reject(new Error('Invalid archive URL')); }
    if (u.protocol !== 'https:' || u.origin !== 'https://codeload.github.com') return reject(new Error('Only https://codeload.github.com archive downloads are allowed'));
    const req = https.get(u, { timeout: 60000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return done(new Error(`Archive download failed: HTTP ${res.statusCode}`)); }
      const len = Number(res.headers['content-length']);
      if (len && len > LIMITS.archiveBytes) { res.destroy(); return done(new Error('Archive exceeds maximum allowed size of 64MiB')); }
      const chunks = []; let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total > LIMITS.archiveBytes) { res.destroy(); return done(new Error('Archive exceeds maximum allowed size of 64MiB')); }
        chunks.push(chunk);
      });
      res.on('end', () => done(null, Buffer.concat(chunks)));
      res.on('error', done);
      res.on('aborted', () => done(new Error('Archive download was interrupted')));
    });
    deadline = setTimeout(() => { req.destroy(); done(new Error('Archive download deadline exceeded')); }, 120000);
    req.on('timeout', () => { req.destroy(); done(new Error('Archive download timed out')); });
    req.on('error', done);
  });
}

function extractArchive({ buffer, item, stage }) {
  return new Promise((resolve, reject) => {
    let closed = false, finished = false;
    let selectedCount = 0, totalEntries = 0, totalBytes = 0;
    const seenPaths = new Set();
    const activeStreams = new Set();

    yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true }, (err, zipfile) => {
      if (err) return reject(err);
      const closeZip = () => { if (!closed && zipfile.isOpen) { closed = true; try { zipfile.close(); } catch {} } };
      const fail = error => {
        if (finished) return;
        finished = true; closeZip();
        // Close file handles before removing staging on Windows.
        Promise.all([...activeStreams].map(stream => new Promise(resolve => {
          if (stream.closed) return resolve();
          stream.once('close', resolve); stream.destroy();
        }))).then(() => reject(error));
      };
      zipfile.on('error', fail);
      zipfile.on('entry', entry => {
        if (finished) return;
        try {
          if (++totalEntries > 50000) return fail(new Error('Archive contains too many entries'));
          // Unselected entries are never written, so only selected ones need validation.
          const matched = matchEntry(entry.fileName, item.prefix);
          if (!matched) return zipfile.readEntry();
          validateEntrySecurity(entry);

          if (++selectedCount > LIMITS.files) return fail(new Error(`Exceeded maximum allowed files (${LIMITS.files})`));
          const targetRel = matched.kind === 'license' ? 'LICENSE' : `upstream/${matched.sub}`;
          const lower = targetRel.toLowerCase();
          if (seenPaths.has(lower)) return fail(new Error(`Duplicate file entry: ${targetRel}`));
          seenPaths.add(lower);
          if (entry.uncompressedSize > LIMITS.fileBytes) return fail(new Error(`File exceeds maximum size of 8MiB: ${targetRel}`));

          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr) return fail(streamErr);
            if (finished) { readStream.destroy(); return; }
            try {
            let fileBytes = 0;
            const fullPath = path.join(stage, ...targetRel.split('/'));
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            const writeStream = fs.createWriteStream(fullPath);
            for (const stream of [readStream, writeStream]) {
              activeStreams.add(stream); stream.once('close', () => activeStreams.delete(stream));
            }

            readStream.on('data', chunk => {
              fileBytes += chunk.length; totalBytes += chunk.length;
              if (fileBytes > LIMITS.fileBytes) readStream.destroy(new Error(`File decompressed size exceeds 8MiB: ${targetRel}`));
              else if (totalBytes > LIMITS.totalBytes) readStream.destroy(new Error('Total decompressed bytes exceed 40MiB'));
            });
            readStream.on('error', e => { writeStream.destroy(); fail(e); });
            writeStream.on('error', e => { readStream.destroy(); fail(e); });
            writeStream.on('finish', () => { if (finished) return; zipfile.readEntry(); });
            readStream.pipe(writeStream);
            } catch (error) { readStream.destroy(); fail(error); }
          });
        } catch (e) { fail(e); }
      });
      zipfile.on('end', () => { if (finished) return; finished = true; closeZip(); resolve({ selectedCount, totalBytes }); });
      zipfile.readEntry();
    });
  });
}

async function ensureCatalogPack({ id, localRoot, fetchArchive, downloads }) {
  const item = catalog.find(x => x.id === id);
  if (!item) throw new Error(`Unknown catalog pack: ${id}`);
  if (typeof localRoot !== 'string' || !localRoot.trim() || !path.isAbsolute(localRoot)) {
    throw new Error('A valid absolute localRoot directory is required');
  }
  assertNoLinkAncestors(localRoot);
  const dest = path.join(localRoot, item.id);
  assertNoLinkAncestors(dest);

  if (fs.existsSync(dest)) {
    const stat = fs.lstatSync(dest);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Existing destination is not a valid directory: ${dest}`);
    const skillFile = path.join(dest, 'SKILL.md');
    if (!fs.existsSync(skillFile)) throw new Error(`Existing pack missing SKILL.md: ${dest}`);
    const meta = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
    if (meta.name !== item.id && meta.name !== item.name) throw new Error(`Existing pack does not match skill name: ${dest}`);
    return dest;
  }

  if (!ALLOWLISTED_REPOS.has(item.repo)) throw new Error(`Repository is not allowlisted: ${item.repo}`);

  const archiveUrl = `https://codeload.github.com/${item.repo}/zip/${item.commit}`;
  let buffer;
  if (fetchArchive) {
    const res = await fetchArchive(archiveUrl, item);
    buffer = Buffer.isBuffer(res) ? res : Buffer.from(res);
  } else {
    buffer = await defaultFetchArchive(archiveUrl);
  }

  if (buffer.length > LIMITS.archiveBytes) throw new Error('Archive exceeds maximum allowed size of 64MiB');

  const archiveSha = crypto.createHash('sha256').update(buffer).digest('hex');
  if (item.archiveSha256 && archiveSha.toLowerCase() !== item.archiveSha256.toLowerCase()) {
    throw new Error(`Archive checksum mismatch: expected ${item.archiveSha256}, got ${archiveSha}`);
  }

  assertNoLinkAncestors(localRoot);
  fs.mkdirSync(localRoot, { recursive: true });
  const stage = fs.mkdtempSync(path.join(localRoot, `.tmp-${item.id}-`));

  try {
    await extractArchive({ buffer, item, stage });
    const entryPath = path.join(stage, ...item.entry.split('/'));
    if (!fs.existsSync(entryPath)) throw new Error(`Required skill entry file not found: ${item.entry}`);

    fs.writeFileSync(path.join(stage, 'SKILL.md'), generateRootSkill(item), 'utf8');
    const sourceData = {
      repo: item.repo, commit: item.commit, archiveSHA: archiveSha, archiveSha: archiveSha, filehashes: computeFileHashes(stage)
    };
    fs.writeFileSync(path.join(stage, 'SOURCE.json'), JSON.stringify(sourceData, null, 2) + '\n', 'utf8');
    assertNoLinkAncestors(dest);
    if (fs.existsSync(dest)) throw new Error('Destination appeared during download; existing files were preserved.');
    fs.renameSync(stage, dest);

    downloads?.record?.({
      name: item.name || item.id, kind: 'project-tool', source: `https://github.com/${item.repo}`, directory: dest, state: 'installed'
    });

    return dest;
  } catch (err) {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

module.exports = { catalog, ensureCatalogPack, generateRootSkill };
