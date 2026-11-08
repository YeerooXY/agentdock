'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ProjectKnowledgeModule = require('../electron/project-knowledge.cjs');
const { ProjectKnowledge } = ProjectKnowledgeModule;
const fixtures = require('./fixtures/knowledge/sections.json');

const clone = value => structuredClone(value);

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-project-knowledge-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function makeSection(base, overrides = {}) {
  return { ...clone(base), ...overrides };
}

function reorderObjectKeysReverse(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reorderObjectKeysReverse);
  const out = {};
  for (const key of Object.keys(value).reverse()) {
    out[key] = reorderObjectKeysReverse(value[key]);
  }
  return out;
}

test('missing store read returns deep-frozen empty revision 0 without writing to disk', () => {
  withTempRoot(root => {
    assert.equal(ProjectKnowledgeModule, ProjectKnowledge);
    const store = new ProjectKnowledge(root);
    const knowledgeDir = path.join(root, 'knowledge');
    assert.equal(fs.existsSync(knowledgeDir), false);

    const snap = store.snapshot('proj_alpha-01');
    assert.deepEqual(snap, {
      schemaVersion: 1,
      projectId: 'proj_alpha-01',
      revision: 0,
      entries: [],
      journal: []
    });
    assert.equal(Object.isFrozen(snap), true);
    assert.equal(Object.isFrozen(snap.entries), true);
    assert.equal(Object.isFrozen(snap.journal), true);
    assert.equal(fs.existsSync(knowledgeDir), false);
  });
});

test('persists atomic section store across restarts and sequential instances without clobbering', () => {
  withTempRoot(root => {
    let clock = 1793463681000;
    const storeA = new ProjectKnowledge(root, { now: () => (clock += 10) });
    const storeB = new ProjectKnowledge(root, { now: () => (clock += 20) });
    const projectId = '32adbcd1-d636-431c-befd-98c1b4c8a4bf';

    const receipt1 = storeA.commit(projectId, {
      operationId: 'op_init_persist',
      changes: [
        {
          id: fixtures.existingObservedFact.id,
          expectedVersion: 0,
          section: clone(fixtures.existingObservedFact)
        }
      ]
    });

    assert.equal(receipt1.operationId, 'op_init_persist');
    assert.equal(receipt1.revision, 1);
    assert.equal(receipt1.updatedAt, 1793463681010);
    assert.match(receipt1.hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(receipt1.versions, [{ id: 'sec_persist', version: 1, deleted: false }]);
    assert.equal(Object.isFrozen(receipt1), true);
    assert.equal(Object.isFrozen(receipt1.versions), true);
    assert.equal(Object.isFrozen(receipt1.versions[0]), true);

    // Commit from second instance storeB must reload disk and not clobber storeA's commit
    const receipt2 = storeB.commit(projectId, {
      operationId: 'op_add_intent',
      changes: [
        {
          id: fixtures.ownerIntent.id,
          expectedVersion: 0,
          section: clone(fixtures.ownerIntent)
        }
      ]
    });
    assert.equal(receipt2.revision, 2);
    assert.equal(receipt2.updatedAt, 1793463681030);
    assert.deepEqual(receipt2.versions, [{ id: 'sec_project_worker_cap', version: 1, deleted: false }]);

    // Fresh instance after restart reads full state
    const restarted = new ProjectKnowledge(root);
    const snap = restarted.snapshot(projectId);
    assert.equal(snap.schemaVersion, 1);
    assert.equal(snap.projectId, projectId);
    assert.equal(snap.revision, 2);
    assert.equal(snap.entries.length, 2);
    assert.deepEqual(snap.entries[0], {
      id: 'sec_persist',
      version: 1,
      deleted: false,
      section: fixtures.existingObservedFact
    });
    assert.deepEqual(snap.entries[1], {
      id: 'sec_project_worker_cap',
      version: 1,
      deleted: false,
      section: fixtures.ownerIntent
    });
    assert.deepEqual(snap.journal, [receipt1, receipt2]);

    const filePath = path.join(root, 'knowledge', `${projectId}.json`);
    assert.equal(fs.existsSync(filePath), true);
    const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(onDisk, snap);
  });
});

test('returns deep-frozen isolated snapshots and receipts unaffected by caller mutation', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463682000 });
    const mutableSection = clone(fixtures.existingObservedFact);
    const mutablePayload = {
      operationId: 'op_freeze_check',
      changes: [{ id: mutableSection.id, expectedVersion: 0, section: mutableSection }]
    };

    const receipt = store.commit('proj_isolation', mutablePayload);
    mutableSection.title = 'Caller mutated after commit';
    mutableSection.provenance.reference = 'mutated';
    mutableSection.evidence[0].anchor = 'mutated';
    mutablePayload.changes.push({ id: 'sec_extra', expectedVersion: 0, section: null });

    assert.throws(() => { receipt.revision = 99; }, TypeError);
    assert.throws(() => { receipt.versions.push({ id: 'x', version: 1, deleted: false }); }, TypeError);
    assert.throws(() => { receipt.versions[0].version = 99; }, TypeError);

    const snap = store.snapshot('proj_isolation');
    assert.equal(snap.entries[0].section.title, fixtures.existingObservedFact.title);
    assert.throws(() => { snap.revision = 5; }, TypeError);
    assert.throws(() => { snap.entries.push({}); }, TypeError);
    assert.throws(() => { snap.entries[0].version = 9; }, TypeError);
    assert.throws(() => { snap.entries[0].section.title = 'mutated'; }, TypeError);
    assert.throws(() => { snap.entries[0].section.provenance.reference = 'mutated'; }, TypeError);
    assert.throws(() => { snap.entries[0].section.evidence[0].anchor = 'mutated'; }, TypeError);
    assert.throws(() => { snap.journal.push({}); }, TypeError);
    assert.throws(() => { snap.journal[0].hash = '0'.repeat(64); }, TypeError);
  });
});

test('idempotent operationId retry with reordered keys returns original receipt without increment; different payload rejects', () => {
  withTempRoot(root => {
    let calls = 0;
    const store = new ProjectKnowledge(root, { now: () => 1793463683000 + (++calls) });
    const projectId = 'proj_idempotent';

    const originalPayload = {
      operationId: 'op_retry_test',
      changes: [
        {
          id: fixtures.existingObservedFact.id,
          expectedVersion: 0,
          section: clone(fixtures.existingObservedFact)
        },
        {
          id: fixtures.staleInterpretation.id,
          expectedVersion: 0,
          section: clone(fixtures.staleInterpretation)
        }
      ]
    };

    const firstReceipt = store.commit(projectId, originalPayload);
    assert.equal(firstReceipt.revision, 1);
    assert.equal(firstReceipt.updatedAt, 1793463683001);

    // Advance store with another operation so entries are at version 2
    const updatedPersist = makeSection(fixtures.existingObservedFact, {
      summary: 'Updated summary at version 2.'
    });
    store.commit(projectId, {
      operationId: 'op_second',
      changes: [{ id: updatedPersist.id, expectedVersion: 1, section: updatedPersist }]
    });

    // Retry op_retry_test with deeply reversed object key order at every level
    const reorderedPayload = reorderObjectKeysReverse(originalPayload);
    assert.notDeepEqual(
      Object.keys(reorderedPayload.changes[0].section),
      Object.keys(originalPayload.changes[0].section)
    );
    assert.notDeepEqual(
      Object.keys(reorderedPayload.changes[0].section.provenance),
      Object.keys(originalPayload.changes[0].section.provenance)
    );

    const retryReceipt = store.commit(projectId, reorderedPayload);
    assert.deepEqual(retryReceipt, firstReceipt);
    assert.equal(store.snapshot(projectId).revision, 2);
    assert.equal(store.snapshot(projectId).journal.length, 2);

    // Reusing operationId with different payload (different summary or different expectedVersion) must reject
    const differentPayload = clone(originalPayload);
    differentPayload.changes[0].section.summary = 'Different summary with reused operationId';
    assert.throws(
      () => store.commit(projectId, differentPayload),
      /already committed with a different payload/
    );
    assert.equal(store.snapshot(projectId).revision, 2);
  });
});

test('supports per-section CAS for independent edits while rejecting stale same-section edits and conflicting batches atomically', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463684000 });
    const projectId = 'proj_cas';

    // Seed two sections in revision 1
    store.commit(projectId, {
      operationId: 'op_seed',
      changes: [
        { id: fixtures.existingObservedFact.id, expectedVersion: 0, section: clone(fixtures.existingObservedFact) },
        { id: fixtures.ownerIntent.id, expectedVersion: 0, section: clone(fixtures.ownerIntent) }
      ]
    });

    // Update sec_persist -> version 2 (store revision 2)
    const persistV2 = makeSection(fixtures.existingObservedFact, { title: 'TaskLoop persistence v2' });
    const r2 = store.commit(projectId, {
      operationId: 'op_update_persist',
      changes: [{ id: 'sec_persist', expectedVersion: 1, section: persistV2 }]
    });
    assert.equal(r2.revision, 2);
    assert.deepEqual(r2.versions, [{ id: 'sec_persist', version: 2, deleted: false }]);

    // Independent section sec_project_worker_cap still at version 1 can update despite store revision 2
    const intentV2 = makeSection(fixtures.ownerIntent, {
      summary: 'Updated owner requirement for worker cap.'
    });
    const r3 = store.commit(projectId, {
      operationId: 'op_update_intent_independent',
      changes: [{ id: 'sec_project_worker_cap', expectedVersion: 1, section: intentV2 }]
    });
    assert.equal(r3.revision, 3);
    assert.deepEqual(r3.versions, [{ id: 'sec_project_worker_cap', version: 2, deleted: false }]);

    // Unrelated new section can be added at expectedVersion 0 despite store revision 3
    const r4 = store.commit(projectId, {
      operationId: 'op_add_proposed',
      changes: [{ id: fixtures.greenfieldProposed.id, expectedVersion: 0, section: clone(fixtures.greenfieldProposed) }]
    });
    assert.equal(r4.revision, 4);
    assert.deepEqual(r4.versions, [{ id: 'sec_ssh_host_registry', version: 1, deleted: false }]);

    // Stale same-section edit on sec_persist with expectedVersion 1 (actual is 2) rejects
    const stalePersist = makeSection(fixtures.existingObservedFact, { title: 'Stale overwrite' });
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_stale_persist',
        changes: [{ id: 'sec_persist', expectedVersion: 1, section: stalePersist }]
      }),
      /Version conflict for section "sec_persist": expected 1, actual 2/
    );

    // Atomic batch: valid update on sec_ssh_host_registry + conflicting expectedVersion on sec_persist must reject whole batch
    const proposedV2 = makeSection(fixtures.greenfieldProposed, { title: 'Updated SSH host registry' });
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_atomic_conflict_batch',
        changes: [
          { id: 'sec_ssh_host_registry', expectedVersion: 1, section: proposedV2 },
          { id: 'sec_persist', expectedVersion: 99, section: stalePersist }
        ]
      }),
      /Version conflict for section "sec_persist": expected 99, actual 2/
    );

    const snap = store.snapshot(projectId);
    assert.equal(snap.revision, 4);
    const sshEntry = snap.entries.find(e => e.id === 'sec_ssh_host_registry');
    assert.equal(sshEntry.version, 1);
    assert.equal(sshEntry.section.title, fixtures.greenfieldProposed.title);
  });
});

test('enforces tombstone deletion and rejects resurrection, re-deletion or ID reuse', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463685000 });
    const projectId = 'proj_tombstones';

    store.commit(projectId, {
      operationId: 'op_create',
      changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
    });

    // Wrong expectedVersion on delete rejects
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_del_bad_ver',
        changes: [{ id: 'sec_persist', expectedVersion: 2, section: null }]
      }),
      /Version conflict for section "sec_persist": expected 2, actual 1/
    );

    // Deleting non-existent section rejects
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_del_missing_0',
        changes: [{ id: 'sec_unknown', expectedVersion: 0, section: null }]
      }),
      /Cannot delete section "sec_unknown" with expectedVersion 0/
    );
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_del_missing_1',
        changes: [{ id: 'sec_unknown', expectedVersion: 1, section: null }]
      }),
      /Version conflict for missing section "sec_unknown"/
    );

    // Valid deletion creates tombstone at version 2
    const delReceipt = store.commit(projectId, {
      operationId: 'op_delete_persist',
      changes: [{ id: 'sec_persist', expectedVersion: 1, section: null }]
    });
    assert.equal(delReceipt.revision, 2);
    assert.deepEqual(delReceipt.versions, [{ id: 'sec_persist', version: 2, deleted: true }]);

    const snap = store.snapshot(projectId);
    assert.deepEqual(snap.entries, [
      { id: 'sec_persist', version: 2, deleted: true, section: null }
    ]);

    // Reject resurrection with expectedVersion 0, 1, or 2, and reject second delete
    for (const expectedVersion of [0, 1, 2]) {
      assert.throws(
        () => store.commit(projectId, {
          operationId: `op_resurrect_${expectedVersion}`,
          changes: [{ id: 'sec_persist', expectedVersion, section: clone(fixtures.existingObservedFact) }]
        }),
        /Tombstone section "sec_persist" cannot be updated, deleted or resurrected/
      );
    }
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_delete_again',
        changes: [{ id: 'sec_persist', expectedVersion: 2, section: null }]
      }),
      /Tombstone section "sec_persist" cannot be updated, deleted or resurrected/
    );
    assert.equal(store.snapshot(projectId).revision, 2);
  });
});

test('validates all changes before IO: duplicate targets, section.id mismatch, invalid section contracts', () => {
  withTempRoot(root => {
    let writeCalls = 0;
    const store = new ProjectKnowledge(root, {
      now: () => 1793463686000,
      writeJson: () => { writeCalls++; }
    });
    const projectId = 'proj_pre_io_validation';

    // Duplicate targets in same batch
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_dup_targets',
        changes: [
          { id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) },
          { id: 'sec_persist', expectedVersion: 1, section: null }
        ]
      }),
      /Duplicate section target "sec_persist"/
    );

    // section.id does not match change.id
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_id_mismatch',
        changes: [
          { id: 'sec_other_id', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }
        ]
      }),
      /Section id "sec_persist" does not match target id "sec_other_id"/
    );

    // Invalid section contract in second batch item rejects before any IO
    const badSection = clone(fixtures.ownerIntent);
    badSection.provenance.kind = 'inferred';
    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_bad_contract',
        changes: [
          { id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) },
          { id: badSection.id, expectedVersion: 0, section: badSection }
        ]
      }),
      /intent sections require owner provenance/
    );

    assert.equal(writeCalls, 0);
    assert.equal(fs.existsSync(path.join(root, 'knowledge')), false);
  });
});

test('rejects unsafe IDs, prototype keys, path traversal and symlink directories or files', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root);
    const badProjectOrOpIds = [
      '',
      '.',
      '..',
      '../escape',
      'nested/id',
      'nested\\id',
      'id with spaces',
      'id.json',
      'a'.repeat(101),
      '__proto__',
      'prototype',
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty'
    ];

    for (const badId of badProjectOrOpIds) {
      assert.throws(() => store.snapshot(badId), /Invalid projectId/);
      assert.throws(
        () => store.commit(badId, {
          operationId: 'op_valid',
          changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
        }),
        /Invalid projectId/
      );
      assert.throws(
        () => store.commit('proj_valid', {
          operationId: badId,
          changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
        }),
        /Invalid operationId/
      );
    }

    for (const protoKey of ['__proto__', 'prototype', 'constructor', 'toString']) {
      const sec = makeSection(fixtures.greenfieldProposed, { id: protoKey });
      assert.throws(
        () => store.commit('proj_valid', {
          operationId: 'op_proto_sec',
          changes: [{ id: protoKey, expectedVersion: 0, section: sec }]
        }),
        /Invalid changes\[0\]\.id/
      );
    }
  });

  // Symlink protection for root, knowledge directory, target file and dangling symlinks
  withTempRoot(tempBase => {
    const realDir = path.join(tempBase, 'real');
    const outsideDir = path.join(tempBase, 'outside');
    fs.mkdirSync(realDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    const outsideFile = path.join(outsideDir, 'target.json');
    fs.writeFileSync(outsideFile, '{"outside":true}', 'utf8');

    // 1. Symlinked root directory
    const symRoot = path.join(tempBase, 'sym_root');
    fs.symlinkSync(realDir, symRoot, 'junction');
    const symRootStore = new ProjectKnowledge(symRoot);
    assert.throws(() => symRootStore.snapshot('proj_1'), /symbolic link/i);
    assert.throws(
      () => symRootStore.commit('proj_1', {
        operationId: 'op_1',
        changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
      }),
      /symbolic link/i
    );

    // 2. Symlinked <root>/knowledge directory
    const rootWithSymKnowledge = path.join(tempBase, 'root_sym_knowledge');
    fs.mkdirSync(rootWithSymKnowledge, { recursive: true });
    fs.symlinkSync(outsideDir, path.join(rootWithSymKnowledge, 'knowledge'), 'junction');
    const symDirStore = new ProjectKnowledge(rootWithSymKnowledge);
    assert.throws(() => symDirStore.snapshot('proj_1'), /symbolic link/i);
    assert.throws(
      () => symDirStore.commit('proj_1', {
        operationId: 'op_1',
        changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
      }),
      /symbolic link/i
    );

    // 3. Symlinked <root>/knowledge/<projectId>.json file (only if file symlinks are permitted by OS)
    const rootWithSymFile = path.join(tempBase, 'root_sym_file');
    const knowledgeSubdir = path.join(rootWithSymFile, 'knowledge');
    fs.mkdirSync(knowledgeSubdir, { recursive: true });
    const symFilePath = path.join(knowledgeSubdir, 'proj_1.json');
    let createdFileSymlink = false;
    try {
      fs.symlinkSync(outsideFile, symFilePath, 'file');
      createdFileSymlink = true;
    } catch (err) {
      if (err.code !== 'EPERM') throw err;
    }
    if (createdFileSymlink) {
      const symFileStore = new ProjectKnowledge(rootWithSymFile);
      assert.throws(() => symFileStore.snapshot('proj_1'), /symbolic link/i);
      assert.throws(
        () => symFileStore.commit('proj_1', {
          operationId: 'op_1',
          changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
        }),
        /symbolic link/i
      );
      assert.equal(fs.readFileSync(outsideFile, 'utf8'), '{"outside":true}');
    }
  });
});

test('strictly rejects corrupt JSON and unsupported schemas while preserving original file on disk', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463687000 });
    const knowledgeDir = path.join(root, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });

    const assertPreservedFailure = (projectId, rawContent, expectedPattern) => {
      const filePath = path.join(knowledgeDir, `${projectId}.json`);
      fs.writeFileSync(filePath, rawContent, 'utf8');
      assert.throws(() => store.snapshot(projectId), expectedPattern);
      assert.throws(
        () => store.commit(projectId, {
          operationId: 'op_attempt',
          changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
        }),
        expectedPattern
      );
      assert.equal(fs.readFileSync(filePath, 'utf8'), rawContent);
    };

    // Malformed JSON
    assertPreservedFailure('proj_corrupt_json', '{ "schemaVersion": 1, broken ', /Cannot read proj_corrupt_json\.json\. The file was preserved\./);

    // Unsupported schemaVersion
    assertPreservedFailure(
      'proj_bad_schema',
      JSON.stringify({ schemaVersion: 2, projectId: 'proj_bad_schema', revision: 0, entries: [], journal: [] }),
      /Unsupported knowledge store schemaVersion 2/
    );

    // Mismatched projectId
    assertPreservedFailure(
      'proj_mismatch',
      JSON.stringify({ schemaVersion: 1, projectId: 'other_proj', revision: 0, entries: [], journal: [] }),
      /projectId "other_proj" does not match "proj_mismatch"/
    );

    // Corrupt entry with invalid section
    assertPreservedFailure(
      'proj_bad_entry',
      JSON.stringify({
        schemaVersion: 1,
        projectId: 'proj_bad_entry',
        revision: 1,
        entries: [{ id: 'sec_persist', version: 1, deleted: false, section: { bad: true } }],
        journal: [{ operationId: 'op_1', hash: 'a'.repeat(64), revision: 1, updatedAt: 1, versions: [{ id: 'sec_persist', version: 1, deleted: false }] }]
      }),
      /Knowledge section/
    );

    // Corrupt tombstone with non-null section
    assertPreservedFailure(
      'proj_bad_tombstone',
      JSON.stringify({
        schemaVersion: 1,
        projectId: 'proj_bad_tombstone',
        revision: 1,
        entries: [{ id: 'sec_persist', version: 1, deleted: true, section: fixtures.existingObservedFact }],
        journal: [{ operationId: 'op_1', hash: 'a'.repeat(64), revision: 1, updatedAt: 1, versions: [{ id: 'sec_persist', version: 1, deleted: false }] }]
      }),
      /tombstone "sec_persist" must have null section/
    );
  });
});

function journalForSeedEntries(entries) {
  return Array.from({ length: Math.ceil(entries.length / 32) }, (_, i) => ({
    operationId: `op_seed_${i}`, hash: 'b'.repeat(64), revision: i + 1, updatedAt: 1793463688000,
    versions: entries.slice(i * 32, (i + 1) * 32).map(({ id, version, deleted }) => ({ id, version, deleted }))
  }));
}

test('enforces pilot limits: batch 32, entries 1000, journal 1000 and 8 MiB UTF-8 document without truncation', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463688000 });

    // 1. Batch size > 32 rejected before IO
    const oversizedBatch = Array.from({ length: 33 }, (_, i) => {
      const id = `sec_batch_${i}`;
      return {
        id,
        expectedVersion: 0,
        section: makeSection(fixtures.greenfieldProposed, { id })
      };
    });
    assert.throws(
      () => store.commit('proj_batch_limit', { operationId: 'op_33', changes: oversizedBatch }),
      /batch size 33 exceeds limit of 32/
    );

    // Exactly 32 succeeds
    const batch32 = oversizedBatch.slice(0, 32);
    const r32 = store.commit('proj_batch_limit', { operationId: 'op_32', changes: batch32 });
    assert.equal(r32.versions.length, 32);

    // 2. Entries > 1000 rejected without truncation
    const knowledgeDir = path.join(root, 'knowledge');
    const entries1000 = Array.from({ length: 1000 }, (_, i) => {
      const id = `sec_item_${i}`;
      return {
        id,
        version: 1,
        deleted: false,
        section: makeSection(fixtures.greenfieldProposed, { id })
      };
    });
    const doc1000Entries = {
      schemaVersion: 1,
      projectId: 'proj_entries_limit',
      revision: Math.ceil(entries1000.length / 32),
      entries: entries1000,
      journal: journalForSeedEntries(entries1000)
    };
    fs.writeFileSync(path.join(knowledgeDir, 'proj_entries_limit.json'), JSON.stringify(doc1000Entries), 'utf8');
    assert.equal(store.snapshot('proj_entries_limit').entries.length, 1000);

    // Adding 1001st entry rejects
    assert.throws(
      () => store.commit('proj_entries_limit', {
        operationId: 'op_entry_1001',
        changes: [
          {
            id: 'sec_item_1000',
            expectedVersion: 0,
            section: makeSection(fixtures.greenfieldProposed, { id: 'sec_item_1000' })
          }
        ]
      }),
      /entries count 1001 exceeds limit of 1000/
    );
    assert.equal(store.snapshot('proj_entries_limit').entries.length, 1000);

    // 3. Journal > 1000 rejected without truncation
    const journal1000 = Array.from({ length: 1000 }, (_, i) => ({
      operationId: `op_j_${i}`,
      hash: 'c'.repeat(64),
      revision: i + 1,
      updatedAt: 1793463688000 + i,
      versions: [{ id: 'sec_persist', version: i + 1, deleted: false }]
    }));
    const doc1000Journal = {
      schemaVersion: 1,
      projectId: 'proj_journal_limit',
      revision: 1000,
      entries: [
        {
          id: 'sec_persist',
          version: 1000,
          deleted: false,
          section: clone(fixtures.existingObservedFact)
        }
      ],
      journal: journal1000
    };
    fs.writeFileSync(path.join(knowledgeDir, 'proj_journal_limit.json'), JSON.stringify(doc1000Journal), 'utf8');
    assert.equal(store.snapshot('proj_journal_limit').journal.length, 1000);

    assert.throws(
      () => store.commit('proj_journal_limit', {
        operationId: 'op_j_1000',
        changes: [{ id: 'sec_persist', expectedVersion: 1000, section: null }]
      }),
      /journal count 1001 exceeds limit of 1000/
    );
    assert.equal(store.snapshot('proj_journal_limit').journal.length, 1000);

    // 4. Document > 8 MiB UTF-8 rejected on commit and on load
    const makeHeavyEntry = index => {
      const id = `sec_heavy_${index}`;
      return {
        id,
        version: 1,
        deleted: false,
        section: {
          schemaVersion: 1,
          id,
          kind: 'fact',
          title: 't'.repeat(240),
          summary: 'x'.repeat(8192),
          sourceSnapshot: 'f3fadec67553d7dbf3df256836ccd536fae90b44',
          freshness: 'current',
          provenance: { kind: 'observed', reference: 'r'.repeat(512) },
          evidence: Array.from({ length: 16 }, (_, idx) => ({
            sourceId: `src_ev_${idx}`,
            contentHash: String(idx).padStart(64, '0'),
            anchor: `anchor_${'a'.repeat(480)}_${idx}`
          })),
          sourceRefs: [],
          flowRefs: []
        }
      };
    };

    const indentedEntryBytes = Buffer.byteLength(
      JSON.stringify(makeHeavyEntry(0), null, 2).replace(/\n/g, '\n    '),
      'utf8'
    ) + 6;
    const seedCount = Math.floor((ProjectKnowledge.MAX_DOCUMENT_BYTES - indentedEntryBytes * 8) / indentedEntryBytes);
    const seedEntries = Array.from({ length: seedCount }, (_, i) => makeHeavyEntry(i));

    const near8MbDoc = {
      schemaVersion: 1,
      projectId: 'proj_size_limit',
      revision: Math.ceil(seedEntries.length / 32),
      entries: seedEntries,
      journal: journalForSeedEntries(seedEntries)
    };
    const near8MbPath = path.join(knowledgeDir, 'proj_size_limit.json');
    const beforeBytes = JSON.stringify(near8MbDoc, null, 2);
    const beforeByteLen = Buffer.byteLength(beforeBytes, 'utf8');
    assert.ok(beforeByteLen < ProjectKnowledge.MAX_DOCUMENT_BYTES);
    assert.ok(beforeByteLen + indentedEntryBytes * 16 > ProjectKnowledge.MAX_DOCUMENT_BYTES);
    fs.writeFileSync(near8MbPath, beforeBytes, 'utf8');

    const overflowBatch = Array.from({ length: 16 }, (_, i) => {
      const item = makeHeavyEntry(seedCount + i);
      return { id: item.id, expectedVersion: 0, section: item.section };
    });
    assert.throws(
      () => store.commit('proj_size_limit', { operationId: 'op_overflow_8mb', changes: overflowBatch }),
      /exceeds limit of 8388608 bytes/
    );
    assert.equal(fs.readFileSync(near8MbPath, 'utf8'), beforeBytes);

    // Oversized file already on disk is rejected on snapshot and commit without modification
    const over8MbPath = path.join(knowledgeDir, 'proj_over_8mb.json');
    const over8MbContent = ' '.repeat(ProjectKnowledge.MAX_DOCUMENT_BYTES + 64);
    fs.writeFileSync(over8MbPath, over8MbContent, 'utf8');
    assert.throws(() => store.snapshot('proj_over_8mb'), /exceeds limit of 8388608 bytes/);
    assert.equal(fs.statSync(over8MbPath).size, ProjectKnowledge.MAX_DOCUMENT_BYTES + 64);
  });
});

test('failed atomic write via mocked fs.renameSync retains prior state on disk and cleans up temp file', t => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root, { now: () => 1793463689000 });
    const projectId = 'proj_atomic_fail';

    const r1 = store.commit(projectId, {
      operationId: 'op_initial',
      changes: [{ id: 'sec_persist', expectedVersion: 0, section: clone(fixtures.existingObservedFact) }]
    });
    assert.equal(r1.revision, 1);

    const knowledgeDir = path.join(root, 'knowledge');
    const filePath = path.join(knowledgeDir, `${projectId}.json`);
    const priorContent = fs.readFileSync(filePath, 'utf8');

    const renameMock = t.mock.method(fs, 'renameSync', () => {
      const err = new Error('Simulated EIO during atomic rename');
      err.code = 'EIO';
      throw err;
    });

    assert.throws(
      () => store.commit(projectId, {
        operationId: 'op_failed_write',
        changes: [{ id: 'sec_project_worker_cap', expectedVersion: 0, section: clone(fixtures.ownerIntent) }]
      }),
      /Simulated EIO during atomic rename/
    );

    assert.equal(renameMock.mock.callCount(), 1);
    renameMock.mock.restore();

    // Prior file content is completely intact and no .tmp files remain
    assert.equal(fs.readFileSync(filePath, 'utf8'), priorContent);
    assert.deepEqual(fs.readdirSync(knowledgeDir), [`${projectId}.json`]);

    const snapAfterFailure = store.snapshot(projectId);
    assert.equal(snapAfterFailure.revision, 1);
    assert.equal(snapAfterFailure.entries.length, 1);
    assert.equal(snapAfterFailure.entries[0].id, 'sec_persist');
  });
});

test('preserves valid JSON with omitted operations, orphan entries or inconsistent section versions', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root), projectId = 'journal_corruption';
    for (const id of ['sec_a', 'sec_b']) store.commit(projectId, { operationId: id, changes: [{ id, expectedVersion: 0, section: makeSection(fixtures.greenfieldProposed, { id }) }] });
    const file = path.join(root, 'knowledge', projectId + '.json'), original = JSON.parse(fs.readFileSync(file));
    const cases = [
      doc => doc.journal.shift(),
      doc => { doc.entries.push({ id: 'sec_phantom', version: 1, deleted: false, section: makeSection(fixtures.greenfieldProposed, { id: 'sec_phantom' }) }); },
      doc => { doc.entries[0].version = 2; },
      doc => { doc.journal[1].versions[0].version = 2; doc.entries[1].version = 2; },
      doc => { doc.journal[0].revision = 2; },
      doc => { doc.entries[0].deleted = true; doc.entries[0].section = null; },
      doc => { doc.journal[0].versions = [{ id: 'sec_b', version: 1, deleted: false }]; }
    ];
    for (const mutate of cases) {
      const doc = structuredClone(original); mutate(doc); const raw = JSON.stringify(doc); fs.writeFileSync(file, raw);
      assert.throws(() => store.snapshot(projectId), /Corrupt knowledge store/);
      assert.throws(() => store.commit(projectId, { operationId: 'later', changes: [{ id: 'sec_a', expectedVersion: 1, section: null }] }), /Corrupt knowledge store/);
      assert.equal(fs.readFileSync(file, 'utf8'), raw);
    }
  });
});

test('journal deletion state prevents tombstone flips and subsequent reuse', () => {
  withTempRoot(root => {
    const store = new ProjectKnowledge(root), projectId = 'deletion_corruption';
    const id = 'sec_a', section = makeSection(fixtures.greenfieldProposed, { id });
    store.commit(projectId, { operationId: 'create', changes: [{ id, expectedVersion: 0, section }] });
    store.commit(projectId, { operationId: 'update', changes: [{ id, expectedVersion: 1, section }] });
    const file = path.join(root, 'knowledge', projectId + '.json');
    const active = JSON.parse(fs.readFileSync(file));
    const flipped = structuredClone(active); flipped.entries[0].deleted = true; flipped.entries[0].section = null;
    fs.writeFileSync(file, JSON.stringify(flipped)); assert.throws(() => store.snapshot(projectId), /Corrupt knowledge store/);
    fs.writeFileSync(file, JSON.stringify(active));
    store.commit(projectId, { operationId: 'delete', changes: [{ id, expectedVersion: 2, section: null }] });
    const retired = JSON.parse(fs.readFileSync(file));
    const resurrected = structuredClone(retired); resurrected.entries[0].deleted = false; resurrected.entries[0].section = section;
    fs.writeFileSync(file, JSON.stringify(resurrected)); assert.throws(() => store.snapshot(projectId), /Corrupt knowledge store/);
    const afterDelete = structuredClone(retired); afterDelete.revision++;
    afterDelete.journal.push({ operationId: 'reuse', hash: 'a'.repeat(64), revision: 4, updatedAt: 1, versions: [{ id, version: 4, deleted: false }] });
    afterDelete.entries[0] = { id, version: 4, deleted: false, section };
    const raw = JSON.stringify(afterDelete); fs.writeFileSync(file, raw);
    assert.throws(() => store.snapshot(projectId), /deletion history/); assert.equal(fs.readFileSync(file, 'utf8'), raw);
  });
});
