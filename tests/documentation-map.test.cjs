'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { buildInitialMap } = require('../electron/documentation-map.cjs');
const {
  validateSection,
  CANONICAL_FIELDS,
  STABLE_ID_PATTERN,
  CONTENT_HASH_PATTERN
} = require('../electron/knowledge-contracts.cjs');

const sha256 = value => createHash('sha256').update(value).digest('hex');

function makeHash(seed) {
  return sha256(`hash_${seed}`);
}

function makeSourceId(seed) {
  return `src_${sha256(`source_${seed}`).slice(0, 32)}`;
}

function makeFile(filePath, seed = filePath) {
  return {
    path: filePath,
    contentHash: makeHash(seed),
    sourceId: makeSourceId(seed),
    symbols: []
  };
}

test('empty snapshot produces single proposed overview with sourceSnapshot null and states no selected source', () => {
  const rootId = makeHash('repo_root_empty');
  const snapshot = {
    rootId,
    snapshotId: null,
    files: [],
    coverage: { complete: true, selectionOnly: false }
  };

  const sections = buildInitialMap({ snapshot });

  assert.equal(Array.isArray(sections), true);
  assert.equal(sections.length, 1);
  const overview = sections[0];

  assert.equal(overview.id, `sec_overview_${rootId.slice(0, 24)}`);
  assert.equal(overview.kind, 'interpretation');
  assert.equal(overview.freshness, 'proposed');
  assert.equal(overview.sourceSnapshot, null);
  assert.deepEqual(overview.evidence, []);
  assert.deepEqual(overview.sourceRefs, []);
  assert.deepEqual(overview.flowRefs, []);
  assert.equal(overview.provenance.kind, 'inferred');
  assert.equal(overview.provenance.reference, `initialize:${rootId}`);
  assert.equal(overview.title, 'Overview');
  assert.match(overview.summary.toLowerCase(), /no selected source/);
  assert.ok(overview.summary.length <= 4000);

  // Schema validation
  const validated = validateSection(overview);
  assert.deepEqual(validated, overview);
  assert.deepEqual(Object.keys(overview), CANONICAL_FIELDS);
});

test('stable reorder-invariant section IDs, ordering, and evidence', () => {
  const rootId = makeHash('stable_repo');
  const snapshotId = makeHash('snapshot_stable');

  const filesA = [
    makeFile('src/utils/math.js'),
    makeFile('package.json'),
    makeFile('electron/main.cjs'),
    makeFile('src/index.js'),
    makeFile('README.md'),
    makeFile('tests/unit.test.js')
  ];

  // filesB has same files but in reversed order
  const filesB = [...filesA].reverse();

  const snapshotA = { rootId, snapshotId, files: filesA };
  const snapshotB = { rootId, snapshotId, files: filesB };

  const sectionsA = buildInitialMap({ snapshot: snapshotA });
  const sectionsB = buildInitialMap({ snapshot: snapshotB });

  assert.equal(sectionsA.length, sectionsB.length);
  assert.deepEqual(sectionsA, sectionsB);

  // Verify deterministic lexical order of area sections: '<root>', 'electron', 'src', 'tests'
  const titles = sectionsA.map(s => s.title);
  assert.deepEqual(titles, ['Overview', '<root>', 'electron', 'src', 'tests']);

  // Check section IDs
  assert.equal(sectionsA[0].id, `sec_overview_${rootId.slice(0, 24)}`);
  assert.equal(sectionsA[1].id, `sec_area_${sha256(`${rootId}\0<root>`).slice(0, 24)}`);
  assert.equal(sectionsA[2].id, `sec_area_${sha256(`${rootId}\0electron`).slice(0, 24)}`);
  assert.equal(sectionsA[3].id, `sec_area_${sha256(`${rootId}\0src`).slice(0, 24)}`);
  assert.equal(sectionsA[4].id, `sec_area_${sha256(`${rootId}\0tests`).slice(0, 24)}`);
});

test('root identity difference changes all section IDs and provenance references', () => {
  const rootId1 = makeHash('root_identity_1');
  const rootId2 = makeHash('root_identity_2');
  const snapshotId = makeHash('shared_snapshot');

  const files = [
    makeFile('README.md'),
    makeFile('src/main.js')
  ];

  const map1 = buildInitialMap({ snapshot: { rootId: rootId1, snapshotId, files } });
  const map2 = buildInitialMap({ snapshot: { rootId: rootId2, snapshotId, files } });

  assert.equal(map1.length, 3);
  assert.equal(map2.length, 3);

  // Overview IDs differ
  assert.notEqual(map1[0].id, map2[0].id);
  assert.equal(map1[0].id, `sec_overview_${rootId1.slice(0, 24)}`);
  assert.equal(map2[0].id, `sec_overview_${rootId2.slice(0, 24)}`);

  // Area IDs differ
  assert.notEqual(map1[1].id, map2[1].id);
  assert.notEqual(map1[2].id, map2[2].id);

  // Provenance references differ
  assert.equal(map1[0].provenance.reference, `initialize:${rootId1}`);
  assert.equal(map2[0].provenance.reference, `initialize:${rootId2}`);
  assert.equal(map1[1].provenance.reference, `initialize:${rootId1}`);
  assert.equal(map2[1].provenance.reference, `initialize:${rootId2}`);
});

test('handles >14 groups explicitly with overflow into Other selected source', () => {
  const rootId = makeHash('root_overflow');
  const snapshotId = makeHash('snapshot_overflow');

  // Create files across 16 different directory areas: dir01 to dir16
  const files = [];
  for (let i = 1; i <= 16; i++) {
    const num = String(i).padStart(2, '0');
    files.push(makeFile(`dir${num}/file.js`));
  }

  const sections = buildInitialMap({
    snapshot: {
      rootId,
      snapshotId,
      files,
      coverage: { complete: false, selectionOnly: true, omittedCount: 0 }
    }
  });

  // 1 overview + 14 bucketed directories + 1 overflow ('Other selected source') = 16 sections (<=16)
  assert.equal(sections.length, 16);

  const titles = sections.map(s => s.title);
  assert.equal(titles[0], 'Overview');

  // First 14 directory buckets
  for (let i = 1; i <= 14; i++) {
    const num = String(i).padStart(2, '0');
    assert.equal(titles[i], `dir${num}`);
    assert.equal(sections[i].id, `sec_area_${sha256(`${rootId}\0dir${num}`).slice(0, 24)}`);
  }

  // 15th area section is the overflow bucket
  const overflowSection = sections[15];
  assert.equal(overflowSection.title, 'Other selected source');
  assert.equal(overflowSection.id, `sec_area_${sha256(`${rootId}\0Other selected source`).slice(0, 24)}`);

  // Overflow contains evidence for both dir15 and dir16
  assert.equal(overflowSection.evidence.length, 2);
  assert.deepEqual(
    overflowSection.sourceRefs,
    [files[14].sourceId, files[15].sourceId]
  );

  // Every section has evidence and refs <= 128
  for (const sec of sections) {
    assert.ok(sec.evidence.length <= 128);
    assert.ok(sec.sourceRefs.length <= 128);
    assert.ok(sec.summary.length <= 4000);
    assert.ok(sec.title.length <= 240);
    assert.ok(sec.id.length < 96);
  }
});

test('exact file evidence anchors file:<contentHash> and sourceRefs match', () => {
  const rootId = makeHash('root_anchors');
  const snapshotId = makeHash('snapshot_anchors');

  const file1 = makeFile('src/app.js');
  const file2 = makeFile('README.md');

  const sections = buildInitialMap({
    snapshot: { rootId, snapshotId, files: [file1, file2] }
  });

  for (const section of sections) {
    assert.equal(section.sourceSnapshot, snapshotId);
    assert.equal(section.freshness, 'current');
    assert.equal(section.kind, 'fact');
    assert.equal(section.provenance.kind, 'observed');
    assert.equal(section.provenance.reference, `initialize:${rootId}`);

    for (const ev of section.evidence) {
      assert.equal(ev.anchor, `file:${ev.contentHash}`);
      assert.ok(CONTENT_HASH_PATTERN.test(ev.contentHash));
      assert.ok(STABLE_ID_PATTERN.test(ev.sourceId));
    }
  }
});

test('input is never mutated and returned sections are frozen canonical contracts', () => {
  const rootId = makeHash('root_immutability');
  const snapshotId = makeHash('snapshot_immutability');

  const file = makeFile('src/app.js');
  const files = [file];
  const snapshot = { rootId, snapshotId, files };

  const originalSnapshotJson = JSON.stringify(snapshot);
  const sections = buildInitialMap({ snapshot });

  // Input snapshot was not mutated
  assert.equal(JSON.stringify(snapshot), originalSnapshotJson);
  assert.equal(files.length, 1);
  assert.equal(files[0], file);

  // Return value is frozen
  assert.equal(Object.isFrozen(sections), true);
  for (const sec of sections) {
    assert.equal(Object.isFrozen(sec), true);
    assert.equal(Object.isFrozen(sec.evidence), true);
    assert.equal(Object.isFrozen(sec.sourceRefs), true);
    assert.equal(Object.isFrozen(sec.flowRefs), true);
    assert.equal(Object.isFrozen(sec.provenance), true);
    assert.throws(() => { sec.title = 'mutated'; }, TypeError);
    assert.throws(() => { sec.evidence.push({}); }, TypeError);
  }
});

test('no semantic claims, no backend/frontend inference, no complete architecture', () => {
  const rootId = makeHash('root_no_claims');
  const snapshotId = makeHash('snapshot_no_claims');

  const files = [
    makeFile('electron/main.cjs'),
    makeFile('src/ui/component.js'),
    makeFile('server/api.js')
  ];

  const sections = buildInitialMap({ snapshot: { rootId, snapshotId, files } });

  for (const section of sections) {
    assert.doesNotMatch(section.summary.toLowerCase(), /complete architecture/);
    assert.doesNotMatch(section.summary.toLowerCase(), /intended to/);
    assert.doesNotMatch(section.summary.toLowerCase(), /owner intent/);
    assert.doesNotMatch(section.title.toLowerCase(), /backend/);
    assert.doesNotMatch(section.title.toLowerCase(), /frontend/);
  }
});

test('bound max 128 snapshot files and summary length under 4000 chars', () => {
  const rootId = makeHash('root_bounds');
  const snapshotId = makeHash('snapshot_bounds');

  // Snapshot with 128 files
  const files128 = [];
  for (let i = 0; i < 128; i++) {
    files128.push(makeFile(`pkg/sub/very/long/nested/path/to/source_file_${i}.js`));
  }

  const sections = buildInitialMap({ snapshot: { rootId, snapshotId, files: files128 } });
  assert.equal(sections.length, 2); // Overview + pkg
  assert.ok(sections[0].summary.length <= 4000);
  assert.ok(sections[1].summary.length <= 4000);
  assert.equal(sections[0].evidence.length, 128);
  assert.equal(sections[1].evidence.length, 128);

  // Snapshot with 129 files should be rejected
  const files129 = [...files128, makeFile('extra.js')];
  assert.throws(
    () => buildInitialMap({ snapshot: { rootId, snapshotId, files: files129 } }),
    /exceeds maximum limit of 128 files/
  );
});

test('rejects invalid shapes, invalid paths, and malformed hash IDs', () => {
  const validRootId = makeHash('valid_root');
  const validSnapshotId = makeHash('valid_snapshot');
  const validFile = makeFile('src/index.js');

  // Missing or non-object arguments
  assert.throws(() => buildInitialMap(), /Expected an options object/);
  assert.throws(() => buildInitialMap(null), /Expected an options object/);
  assert.throws(() => buildInitialMap('invalid'), /Expected an options object/);
  assert.throws(() => buildInitialMap([]), /Expected an options object/);
  assert.throws(() => buildInitialMap({ snapshot: null }), /Expected snapshot to be a plain object/);

  // Invalid rootId
  assert.throws(() => buildInitialMap({ snapshot: { rootId: '', snapshotId: validSnapshotId, files: [] } }), /snapshot\.rootId/);
  assert.throws(() => buildInitialMap({ snapshot: { rootId: 'short', snapshotId: validSnapshotId, files: [] } }), /snapshot\.rootId/);
  assert.throws(() => buildInitialMap({ snapshot: { rootId: 'Z'.repeat(64), snapshotId: validSnapshotId, files: [] } }), /snapshot\.rootId/);

  // Invalid snapshotId when files present
  assert.throws(() => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: null, files: [validFile] } }), /snapshot\.snapshotId/);
  assert.throws(() => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: 'has space', files: [validFile] } }), /snapshot\.snapshotId/);
  assert.throws(() => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: 12345, files: [validFile] } }), /snapshot\.snapshotId/);

  // Invalid paths
  const badPaths = [
    '../escape.js',
    '/leading_slash.js',
    'src\\backslash.js',
    '',
    'a/./b.js',
    'a/../b.js',
    'null\0byte.js',
    'control\x01char.js'
  ];
  for (const badPath of badPaths) {
    const f = { path: badPath, contentHash: makeHash('h'), sourceId: makeSourceId('s') };
    assert.throws(
      () => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: validSnapshotId, files: [f] } }),
      /invalid relative path/
    );
  }

  // Duplicate file paths
  assert.throws(
    () => buildInitialMap({
      snapshot: {
        rootId: validRootId,
        snapshotId: validSnapshotId,
        files: [makeFile('src/a.js'), makeFile('src/a.js')]
      }
    }),
    /duplicate file path/
  );

  // Duplicate sourceId
  const dupSourceFile1 = makeFile('src/a.js');
  const dupSourceFile2 = { ...makeFile('src/b.js'), sourceId: dupSourceFile1.sourceId };
  assert.throws(
    () => buildInitialMap({
      snapshot: {
        rootId: validRootId,
        snapshotId: validSnapshotId,
        files: [dupSourceFile1, dupSourceFile2]
      }
    }),
    /duplicate sourceId/
  );

  // Invalid contentHash
  const badHashFile = { path: 'src/a.js', contentHash: 'not_a_hex_hash', sourceId: makeSourceId('s') };
  assert.throws(
    () => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: validSnapshotId, files: [badHashFile] } }),
    /64-character lowercase hex/
  );

  // Invalid sourceId
  const badSourceIdFile = { path: 'src/a.js', contentHash: makeHash('h'), sourceId: 'Bad Source ID!' };
  assert.throws(
    () => buildInitialMap({ snapshot: { rootId: validRootId, snapshotId: validSnapshotId, files: [badSourceIdFile] } }),
    /stable ID pattern/
  );
});
