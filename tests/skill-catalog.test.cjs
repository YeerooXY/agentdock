'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { catalog, ensureCatalogPack } = require('../electron/skill-catalog.cjs');

// Synthetic archives exercise extraction independently of production archive
// bytes. The checksum test below explicitly sets matching/mismatching pins.
test.beforeEach(t => {
  const pins = catalog.map(item => item.archiveSha256);
  t.after(() => catalog.forEach((item, i) => { item.archiveSha256 = pins[i]; }));
  if (!t.name.startsWith('all 4 known')) catalog.forEach(item => { item.archiveSha256 = null; });
});

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'utf8');
    const crc = crc32(dataBuf);
    const mode = file.mode !== undefined ? file.mode : 0o100644;
    const isUnix = (mode !== 0);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(file.uncompressedSize !== undefined ? file.uncompressedSize : dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localHeaders.push(local);
    localHeaders.push(dataBuf);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(isUnix ? ((3 << 8) | 20) : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(file.uncompressedSize !== undefined ? file.uncompressedSize : dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(isUnix ? ((mode << 16) >>> 0) : 0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + dataBuf.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-catalog-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const localRoot = path.join(base, 'skill-packs');
  return { base, localRoot };
}

test('all 4 known metadata entries have complete and pinned specifications', () => {
  assert.equal(catalog.length, 4);
  const byId = new Map(catalog.map(x => [x.id, x]));

  const latex = byId.get('latex-document');
  assert.ok(latex, 'latex-document item must exist');
  assert.equal(latex.repo, 'happycapy-ai/Happycapy-skills');
  assert.equal(latex.commit, '9ff72feaf2f200f81fa4557d021414f73d12ab28');
  assert.equal(latex.prefix, 'skills/latex-document/');
  assert.equal(latex.entry, 'upstream/SKILL.md');
  assert.match(latex.archiveSha256, /^[a-f0-9]{64}$/);

  const pstack = byId.get('pstack');
  assert.ok(pstack, 'pstack item must exist');
  assert.equal(pstack.repo, 'cursor/plugins');
  assert.equal(pstack.commit, '2776ddd2355d6d6c8747d3964600f28daf62f049');
  assert.equal(pstack.prefix, 'pstack/');
  assert.equal(pstack.entry, 'upstream/skills/poteto-mode/SKILL.md');
  assert.ok(typeof pstack.name === 'string' && pstack.name.length > 0);
  assert.ok(typeof pstack.description === 'string' && pstack.description.length > 0);
  assert.ok(typeof pstack.size === 'number' && pstack.size > 0);
  assert.match(pstack.archiveSha256, /^[a-f0-9]{64}$/);

  const thermo = byId.get('thermo-nuclear-code-quality-review');
  assert.ok(thermo, 'thermo review item must exist');
  assert.equal(thermo.repo, 'cursor/plugins');
  assert.equal(thermo.commit, '2776ddd2355d6d6c8747d3964600f28daf62f049');
  assert.equal(thermo.prefix, 'cursor-team-kit/skills/thermo-nuclear-code-quality-review/');
  assert.equal(thermo.entry, 'upstream/SKILL.md');
  assert.ok(typeof thermo.name === 'string' && thermo.name.length > 0);
  assert.ok(typeof thermo.description === 'string' && thermo.description.length > 0);
  assert.ok(typeof thermo.size === 'number' && thermo.size > 0);
  assert.match(thermo.archiveSha256, /^[a-f0-9]{64}$/);

  const ponytail = byId.get('ponytail');
  assert.ok(ponytail, 'ponytail item must exist');
  assert.equal(ponytail.repo, 'DietrichGebert/ponytail');
  assert.equal(ponytail.commit, '96608e078b2d5ea607c5c3b8b5a54d1c1fba6846');
  assert.equal(ponytail.prefix, 'skills/');
  assert.equal(ponytail.entry, 'upstream/ponytail/SKILL.md');
  assert.ok(typeof ponytail.name === 'string' && ponytail.name.length > 0);
  assert.ok(typeof ponytail.description === 'string' && ponytail.description.length > 0);
  assert.ok(typeof ponytail.size === 'number' && ponytail.size > 0);
  assert.match(ponytail.archiveSha256, /^[a-f0-9]{64}$/);
});

test('root adapter renders manual or automatic frontmatter and a custom entry', () => {
  const { generateRootSkill } = require('../electron/skill-catalog.cjs');
  const item = catalog.find(x => x.id === 'ponytail');
  const manual = generateRootSkill(item);
  assert.match(manual, /disable-model-invocation: true/); assert.match(manual, /Use when explicitly requested/);
  const auto = generateRootSkill(item, { automatic: true, entry: 'upstream/ponytail/SKILL.upstream.md', trigger: 'Reuse code.\nSecond line.' });
  assert.doesNotMatch(auto, /disable-model-invocation/);
  assert.match(auto, /^---\nname: ponytail\ndescription: "Use when the task matches: Reuse code\. Second line\."\n---\n/);
  assert.match(auto, /\(upstream\/ponytail\/SKILL\.upstream\.md\)/);
});

test('clean install with pinned checksum, provenance, selected tree, license and entry', async t => {
  const { localRoot } = fixture(t);
  const zipBuf = buildZip([
    { name: 'plugins-2776ddd/LICENSE', data: 'MIT License\nCopyright (c) Cursor' },
    { name: 'plugins-2776ddd/pstack/skills/poteto-mode/SKILL.md', data: '---\nname: poteto-mode\ndescription: Poteto upstream.\n---\n# Poteto\n' },
    { name: 'plugins-2776ddd/pstack/skills/poteto-mode/rules.md', data: '# Rules\n' },
    { name: 'plugins-2776ddd/unrelated/ignore.txt', data: 'Ignore me' }
  ]);
  const expectedSha = crypto.createHash('sha256').update(zipBuf).digest('hex');

  const downloadsRecorded = [];
  const downloads = {
    record: r => { downloadsRecorded.push(r); return r; }
  };

  const installedDir = await ensureCatalogPack({
    id: 'pstack',
    localRoot,
    fetchArchive: (url, item) => {
      assert.equal(url, 'https://codeload.github.com/cursor/plugins/zip/2776ddd2355d6d6c8747d3964600f28daf62f049');
      assert.equal(item.id, 'pstack');
      return zipBuf;
    },
    downloads
  });

  assert.equal(installedDir, path.join(localRoot, 'pstack'));
  assert.ok(fs.existsSync(installedDir));

  // Check selected tree files are preserved under upstream/
  assert.ok(fs.existsSync(path.join(installedDir, 'upstream', 'skills', 'poteto-mode', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(installedDir, 'upstream', 'skills', 'poteto-mode', 'rules.md')));
  assert.equal(fs.existsSync(path.join(installedDir, 'unrelated')), false);
  assert.equal(fs.existsSync(path.join(installedDir, 'upstream', 'unrelated')), false);

  // Check root LICENSE copy
  assert.ok(fs.existsSync(path.join(installedDir, 'LICENSE')));
  assert.equal(fs.readFileSync(path.join(installedDir, 'LICENSE'), 'utf8'), 'MIT License\nCopyright (c) Cursor');

  // Check root SKILL.md adapter
  const rootSkill = fs.readFileSync(path.join(installedDir, 'SKILL.md'), 'utf8');
  assert.match(rootSkill, /^---\r?\nname:\s*pstack/m);
  assert.match(rootSkill, /description:\s*"Use when explicitly requested/);
  assert.match(rootSkill, /dock\/task_candidates/);
  assert.match(rootSkill, /dock\/start_task/);
  assert.match(rootSkill, /Do not register hooks/);
  assert.match(rootSkill, /# pstack/);
  assert.match(rootSkill, /upstream\/skills\/poteto-mode\/SKILL\.md/);
  assert.match(rootSkill, /Paddock routing/);
  assert.match(rootSkill, /No API entitlement/);

  // Check SOURCE.json provenance and filehashes
  const sourceRaw = fs.readFileSync(path.join(installedDir, 'SOURCE.json'), 'utf8');
  const source = JSON.parse(sourceRaw);
  assert.equal(source.repo, 'cursor/plugins');
  assert.equal(source.commit, '2776ddd2355d6d6c8747d3964600f28daf62f049');
  assert.equal(source.archiveSHA, expectedSha);
  assert.ok(source.filehashes['LICENSE']);
  assert.ok(source.filehashes['SKILL.md']);
  assert.ok(source.filehashes['upstream/skills/poteto-mode/SKILL.md']);
  assert.ok(source.filehashes['upstream/skills/poteto-mode/rules.md']);

  // Check downloads.record was called
  assert.equal(downloadsRecorded.length, 1);
  assert.equal(downloadsRecorded[0].kind, 'project-tool');
  assert.equal(downloadsRecorded[0].name, 'pstack');
  assert.equal(downloadsRecorded[0].directory, installedDir);
  assert.equal(downloadsRecorded[0].source, 'https://github.com/cursor/plugins');
  assert.equal(downloadsRecorded[0].state, 'installed');

  // Verify no temporary staging folders left in localRoot
  const entries = fs.readdirSync(localRoot);
  assert.deepEqual(entries, ['pstack']);
});

test('installs thermo review and ponytail with correct relative tree mappings', async t => {
  const { localRoot } = fixture(t);

  // Thermo
  const thermoZip = buildZip([
    { name: 'plugins-2776ddd/LICENSE.txt', data: 'Thermo License' },
    { name: 'plugins-2776ddd/cursor-team-kit/skills/thermo-nuclear-code-quality-review/SKILL.md', data: '# Thermo\n' }
  ]);
  const thermoDir = await ensureCatalogPack({
    id: 'thermo-nuclear-code-quality-review',
    localRoot,
    fetchArchive: () => thermoZip
  });
  assert.ok(fs.existsSync(path.join(thermoDir, 'upstream', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(thermoDir, 'LICENSE')));

  // Ponytail
  const ponytailZip = buildZip([
    { name: 'ponytail-96608e0/LICENSE', data: 'Ponytail License' },
    { name: 'ponytail-96608e0/skills/ponytail/SKILL.md', data: '# Ponytail\n' }
  ]);
  const ponytailDir = await ensureCatalogPack({
    id: 'ponytail',
    localRoot,
    fetchArchive: () => ponytailZip
  });
  assert.ok(fs.existsSync(path.join(ponytailDir, 'upstream', 'ponytail', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(ponytailDir, 'LICENSE')));
});

test('checksum verification accepts matching hash and rejects mismatched hash', async t => {
  const { localRoot } = fixture(t);
  const zipBuf = buildZip([
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Flat\n' }
  ]);
  const actualSha = crypto.createHash('sha256').update(zipBuf).digest('hex');

  // Override catalog item archiveSha256 temporarily for testing
  const pstack = catalog.find(x => x.id === 'pstack');
  const originalSha = pstack.archiveSha256;

  try {
    // Mismatched checksum
    pstack.archiveSha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    await assert.rejects(
      ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => zipBuf }),
      /Archive checksum mismatch/
    );

    // Matching checksum
    pstack.archiveSha256 = actualSha;
    const dest = await ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => zipBuf });
    assert.ok(fs.existsSync(dest));
  } finally {
    pstack.archiveSha256 = originalSha;
  }
});

test('existing valid pack is returned unchanged without download or overwrite', async t => {
  const { localRoot } = fixture(t);
  const targetDir = path.join(localRoot, 'pstack');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: pstack\ndescription: Custom existing.\n---\n# pstack\n');
  fs.writeFileSync(path.join(targetDir, 'user-custom.txt'), 'do-not-delete');

  let fetchCalled = false;
  const result = await ensureCatalogPack({
    id: 'pstack',
    localRoot,
    fetchArchive: () => { fetchCalled = true; return Buffer.alloc(0); }
  });

  assert.equal(result, targetDir);
  assert.equal(fetchCalled, false, 'fetchArchive must not be called when valid pack exists');
  assert.equal(fs.readFileSync(path.join(targetDir, 'user-custom.txt'), 'utf8'), 'do-not-delete');
});

test('existing invalid or mismatched folder is rejected without overwrite', async t => {
  const { localRoot } = fixture(t);
  const targetDir = path.join(localRoot, 'pstack');

  // Missing SKILL.md
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'other.txt'), 'content');
  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => Buffer.alloc(0) }),
    /missing SKILL\.md/
  );

  // Mismatched name in SKILL.md
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: wrong-skill\ndescription: Bad.\n---\n');
  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => Buffer.alloc(0) }),
    /does not match skill name/
  );
});

test('unknown pack id rejects before any IO or network', async t => {
  let fetchCalled = false;
  await assert.rejects(
    ensureCatalogPack({
      id: 'unknown-pack-id',
      localRoot: 'C:\\nonexistent-root',
      fetchArchive: () => { fetchCalled = true; }
    }),
    /Unknown catalog pack/
  );
  assert.equal(fetchCalled, false);
});

test('security: rejects path traversal and cleans up staging directory', async t => {
  const { localRoot } = fixture(t);
  const badZip = buildZip([
    { name: 'pstack/../traversal.txt', data: 'malicious' },
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Good\n' }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /Path traversal|invalid relative path/
  );

  const remaining = fs.readdirSync(localRoot);
  assert.deepEqual(remaining, [], 'no staging directory remains on traversal rejection');
});

test('security: rejects backslash in entry paths and cleans up staging directory', async t => {
  const { localRoot } = fixture(t);
  const badZip = buildZip([
    { name: 'pstack\\backslash.txt', data: 'malicious' },
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Good\n' }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /Invalid path characters|invalid characters in fileName/
  );

  assert.deepEqual(fs.readdirSync(localRoot), []);
});

test('security: rejects symlink entries and cleans up staging directory', async t => {
  const { localRoot } = fixture(t);
  const badZip = buildZip([
    { name: 'pstack/symlink-target', data: 'target', mode: 0o120777 },
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Good\n' }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /Symlinks are not allowed/
  );

  assert.deepEqual(fs.readdirSync(localRoot), []);
});

test('a symlink outside the selected folder is skipped, not extracted', async t => {
  const { localRoot } = fixture(t);
  const zip = buildZip([
    { name: 'other-skill/CLAUDE.md', data: 'AGENTS.md', mode: 0o120777 },
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Good\n' }
  ]);
  await ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => zip });
  assert.ok(fs.existsSync(path.join(localRoot, 'pstack', 'upstream', 'skills', 'poteto-mode', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(localRoot, 'pstack', 'upstream', 'CLAUDE.md')));
});

test('security: rejects case-insensitive duplicate files and cleans up staging directory', async t => {
  const { localRoot } = fixture(t);
  const badZip = buildZip([
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# One\n' },
    { name: 'pstack/skills/poteto-mode/skill.md', data: '# Duplicate\n' }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /Duplicate file entry/
  );

  assert.deepEqual(fs.readdirSync(localRoot), []);
});

test('security: rejects per-file decompressed size exceeding 8MiB and cleans up', async t => {
  const { localRoot } = fixture(t);
  const hugeBuf = Buffer.alloc(8 * 1024 * 1024 + 10, 'A');
  const badZip = buildZip([
    { name: 'pstack/skills/poteto-mode/SKILL.md', data: '# Good\n' },
    { name: 'pstack/skills/poteto-mode/huge.bin', data: hugeBuf }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /8MiB/
  );

  assert.deepEqual(fs.readdirSync(localRoot), []);
});

test('security: rejects total archive buffer exceeding 64MiB before extraction', async t => {
  const { localRoot } = fixture(t);
  const oversizedBuf = Buffer.alloc(64 * 1024 * 1024 + 1);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => oversizedBuf }),
    /Archive exceeds maximum allowed size of 64MiB/
  );

  assert.equal(fs.existsSync(path.join(localRoot, 'pstack')), false);
});

test('missing required entry file causes rejection and stage cleanup (noentry cleanup)', async t => {
  const { localRoot } = fixture(t);
  // Zip contains prefix files, but does NOT contain item.entry (upstream/skills/poteto-mode/SKILL.md)
  const badZip = buildZip([
    { name: 'pstack/skills/poteto-mode/other.txt', data: 'hello' },
    { name: 'pstack/LICENSE', data: 'MIT' }
  ]);

  await assert.rejects(
    ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => badZip }),
    /Required skill entry file not found/
  );

  assert.deepEqual(fs.readdirSync(localRoot), [], 'staging directory must be cleaned up');
});

test('rejects Windows alternate streams and non-canonical paths', async t => {
  for (const sub of ['file.txt:stream', './entry.md', 'nested//entry.md']) {
    const { localRoot } = fixture(t);
    await assert.rejects(ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => buildZip([{ name: `pstack/${sub}`, data: 'bad' }]) }), /path|character/i);
    assert.ok(!fs.existsSync(localRoot) || fs.readdirSync(localRoot).length === 0);
  }
});

test('file-directory collisions reject without an uncaught filesystem exception', async t => {
  const { localRoot } = fixture(t);
  const zip = buildZip([{name:'pstack/conflict',data:'file'}, {name:'pstack/conflict/child.md',data:'child'}]);
  await assert.rejects(ensureCatalogPack({ id: 'pstack', localRoot, fetchArchive: () => zip }), /EEXIST|ENOTDIR/);
  assert.deepEqual(fs.readdirSync(localRoot), []);
});

test('a progressing but unfinished HTTP response still hits the overall deadline', async t => {
  const { EventEmitter } = require('node:events');
  const https = require('node:https'), previousGet = https.get, previousTimer = global.setTimeout;
  const { localRoot } = fixture(t); let destroyed = false;
  https.get = (url, options, receive) => {
    const request = new EventEmitter(); request.destroy = () => { destroyed = true; };
    queueMicrotask(() => { const response = new EventEmitter(); response.statusCode = 200; response.headers = {}; receive(response); response.emit('data', Buffer.from('slow')); });
    return request;
  };
  global.setTimeout = (callback, delay, ...args) => previousTimer(callback, delay === 120000 ? 5 : delay, ...args);
  try {
    await assert.rejects(ensureCatalogPack({ id: 'pstack', localRoot }), /deadline/);
    assert.equal(destroyed, true); assert.equal(fs.existsSync(localRoot), false);
  } finally { https.get = previousGet; global.setTimeout = previousTimer; }
});

test('failed writes close their streams before staging cleanup finishes', async t => {
  const { Writable } = require('node:stream');
  const { localRoot } = fixture(t), previous = fs.createWriteStream; let closed = false;
  fs.createWriteStream = () => {
    const stream = new Writable({ write(chunk, encoding, done) { done(Error('Injected write error')); }, destroy(error, done) { setTimeout(() => done(error), 10); } });
    stream.once('close', () => { closed = true; }); return stream;
  };
  try {
    await assert.rejects(ensureCatalogPack({id:'pstack', localRoot, fetchArchive:()=>buildZip([{name:'pstack/entry.md',data:'source'}])}), /Injected write error/);
    assert.equal(closed, true); assert.deepEqual(fs.readdirSync(localRoot), []);
  } finally { fs.createWriteStream = previous; }
});
