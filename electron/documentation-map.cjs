'use strict';

const { createHash } = require('node:crypto');
const {
  validateSection,
  STABLE_ID_PATTERN,
  CONTENT_HASH_PATTERN
} = require('./knowledge-contracts.cjs');

const MAX_SNAPSHOT_FILES = 128;
const MAX_BUCKET_GROUPS = 14;
const MAX_SUMMARY_CHARS = 4000;
const OVERFLOW_AREA = 'Other selected source';
const ROOT_AREA = '<root>';

const HEX_ID_PATTERN = /^[0-9a-f]{24,64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function validateFile(file, index) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new TypeError(`snapshot.files[${index}] must be a plain object`);
  }
  const { path: filePath, sourceId, contentHash } = file;

  if (typeof filePath !== 'string') {
    throw new TypeError(`snapshot.files[${index}].path must be a string`);
  }
  if (
    filePath.length === 0 ||
    filePath.length > 1000 ||
    filePath.includes('\\') ||
    filePath.startsWith('/') ||
    filePath.includes('\0') ||
    /[\x00-\x1f]/.test(filePath) ||
    filePath.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new TypeError(`snapshot.files[${index}].path is an invalid relative path: "${filePath}"`);
  }

  if (typeof contentHash !== 'string' || !CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new TypeError(`snapshot.files[${index}].contentHash must be a 64-character lowercase hex sha256`);
  }

  if (typeof sourceId !== 'string' || !STABLE_ID_PATTERN.test(sourceId)) {
    throw new TypeError(`snapshot.files[${index}].sourceId must match stable ID pattern`);
  }
}

function buildAreaSummary(area, groupFiles) {
  const count = groupFiles.length;
  const fileWord = count === 1 ? 'file' : 'files';
  const prefix = `Observed ${count} selected source ${fileWord} in ${area}. Files: `;
  const pathItems = [];
  let currentLen = prefix.length;
  for (const f of groupFiles) {
    const item = (pathItems.length === 0 ? '' : ', ') + f.path;
    if (currentLen + item.length + 30 > MAX_SUMMARY_CHARS) {
      break;
    }
    pathItems.push(f.path);
    currentLen += item.length;
  }
  let summary = prefix + pathItems.join(', ');
  if (pathItems.length < count) {
    summary += `, and ${count - pathItems.length} more`;
  }
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS);
  }
  return summary;
}

function buildOverviewSummary(allFiles, groups, coverage) {
  const count = allFiles.length;
  const fileWord = count === 1 ? 'file' : 'files';
  const areaWord = groups.length === 1 ? 'area' : 'areas';
  const parts = [`Observed ${count} selected source ${fileWord} across ${groups.length} ${areaWord}.`];

  if (coverage && typeof coverage === 'object') {
    const limits = [];
    if (typeof coverage.complete === 'boolean') limits.push(`complete=${coverage.complete}`);
    if (typeof coverage.selectionOnly === 'boolean') limits.push(`selectionOnly=${coverage.selectionOnly}`);
    if (typeof coverage.omittedCount === 'number') limits.push(`omittedCount=${coverage.omittedCount}`);
    if (typeof coverage.deferredCount === 'number') limits.push(`deferredCount=${coverage.deferredCount}`);
    if (limits.length > 0) {
      parts.push(`Coverage limits: ${limits.join(', ')}.`);
    }
  }

  const groupDesc = groups.map(g => `${g.area} (${g.files.length})`).join(', ');
  parts.push(`Areas: ${groupDesc}.`);

  const prefix = 'Files: ';
  const pathItems = [];
  const baseText = parts.join(' ') + ' ' + prefix;
  let currentLen = baseText.length;
  for (const f of allFiles) {
    const item = (pathItems.length === 0 ? '' : ', ') + f.path;
    if (currentLen + item.length + 30 > MAX_SUMMARY_CHARS) {
      break;
    }
    pathItems.push(f.path);
    currentLen += item.length;
  }
  let pathText = prefix + pathItems.join(', ');
  if (pathItems.length < count) {
    pathText += `, and ${count - pathItems.length} more`;
  }
  parts.push(pathText);

  let summary = parts.join(' ');
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS);
  }
  return summary;
}

function buildInitialMap(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Expected an options object with snapshot property');
  }
  const snapshot = ('snapshot' in options) ? options.snapshot : options;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('Expected snapshot to be a plain object');
  }

  const { rootId, files, snapshotId, coverage } = snapshot;

  if (typeof rootId !== 'string' || !HEX_ID_PATTERN.test(rootId)) {
    throw new TypeError('snapshot.rootId must be a 24 to 64 character lowercase hex string');
  }

  if (!Array.isArray(files)) {
    throw new TypeError('snapshot.files must be an array');
  }

  if (files.length > MAX_SNAPSHOT_FILES) {
    throw new RangeError(`snapshot.files exceeds maximum limit of ${MAX_SNAPSHOT_FILES} files (got ${files.length})`);
  }

  const seenPaths = new Set();
  const seenSourceIds = new Set();
  for (let i = 0; i < files.length; i++) {
    validateFile(files[i], i);
    const p = files[i].path;
    const sId = files[i].sourceId;
    if (seenPaths.has(p)) {
      throw new TypeError(`duplicate file path in snapshot: "${p}"`);
    }
    seenPaths.add(p);
    if (seenSourceIds.has(sId)) {
      throw new TypeError(`duplicate sourceId in snapshot: "${sId}"`);
    }
    seenSourceIds.add(sId);
  }

  if (coverage !== undefined && coverage !== null && (typeof coverage !== 'object' || Array.isArray(coverage))) {
    throw new TypeError('snapshot.coverage must be a plain object');
  }

  const first24Root = rootId.slice(0, 24);
  const overviewId = `sec_overview_${first24Root}`;

  if (files.length === 0) {
    if (snapshotId !== undefined && snapshotId !== null && (typeof snapshotId !== 'string' || !HEX_ID_PATTERN.test(snapshotId))) {
      throw new TypeError('snapshot.snapshotId must be a hex string or null/undefined for empty snapshot');
    }

    const emptySection = validateSection({
      schemaVersion: 1,
      id: overviewId,
      kind: 'interpretation',
      title: 'Overview',
      summary: 'No selected source files in snapshot.',
      sourceSnapshot: null,
      freshness: 'proposed',
      provenance: {
        kind: 'inferred',
        reference: `initialize:${rootId}`
      },
      evidence: [],
      sourceRefs: [],
      flowRefs: []
    });

    return Object.freeze([emptySection]);
  }

  if (typeof snapshotId !== 'string' || !HEX_ID_PATTERN.test(snapshotId)) {
    throw new TypeError('snapshot.snapshotId must be a 24 to 64 character lowercase hex string when files are nonempty');
  }

  const sortedFiles = [...files].sort((a, b) => compare(a.path, b.path));

  const dirMap = new Map();
  for (const file of sortedFiles) {
    const slashIndex = file.path.indexOf('/');
    const firstDir = slashIndex === -1 ? ROOT_AREA : file.path.slice(0, slashIndex);
    let list = dirMap.get(firstDir);
    if (!list) {
      list = [];
      dirMap.set(firstDir, list);
    }
    list.push(file);
  }

  const sortedDirs = [...dirMap.keys()].sort(compare);
  const groups = [];

  if (sortedDirs.length <= MAX_BUCKET_GROUPS) {
    for (const dir of sortedDirs) {
      groups.push({
        area: dir,
        files: dirMap.get(dir)
      });
    }
  } else {
    for (let i = 0; i < MAX_BUCKET_GROUPS; i++) {
      const dir = sortedDirs[i];
      groups.push({
        area: dir,
        files: dirMap.get(dir)
      });
    }
    const overflowFiles = [];
    for (let i = MAX_BUCKET_GROUPS; i < sortedDirs.length; i++) {
      const dir = sortedDirs[i];
      overflowFiles.push(...dirMap.get(dir));
    }
    overflowFiles.sort((a, b) => compare(a.path, b.path));
    groups.push({
      area: OVERFLOW_AREA,
      files: overflowFiles
    });
  }

  const commonProvenance = Object.freeze({
    kind: 'observed',
    reference: `initialize:${rootId}`
  });

  const overviewEvidence = Object.freeze(sortedFiles.map(f => Object.freeze({
    sourceId: f.sourceId,
    contentHash: f.contentHash,
    anchor: `file:${f.contentHash}`
  })));

  const overviewSourceRefs = Object.freeze(sortedFiles.map(f => f.sourceId));

  const overviewSection = validateSection({
    schemaVersion: 1,
    id: overviewId,
    kind: 'fact',
    title: 'Overview',
    summary: buildOverviewSummary(sortedFiles, groups, coverage),
    sourceSnapshot: snapshotId,
    freshness: 'current',
    provenance: commonProvenance,
    evidence: overviewEvidence,
    sourceRefs: overviewSourceRefs,
    flowRefs: []
  });

  const sections = [overviewSection];

  for (const group of groups) {
    const areaHash = sha256(`${rootId}\0${group.area}`).slice(0, 24);
    const areaId = `sec_area_${areaHash}`;

    const areaEvidence = Object.freeze(group.files.map(f => Object.freeze({
      sourceId: f.sourceId,
      contentHash: f.contentHash,
      anchor: `file:${f.contentHash}`
    })));

    const areaSourceRefs = Object.freeze(group.files.map(f => f.sourceId));

    const areaSection = validateSection({
      schemaVersion: 1,
      id: areaId,
      kind: 'fact',
      title: group.area,
      summary: buildAreaSummary(group.area, group.files),
      sourceSnapshot: snapshotId,
      freshness: 'current',
      provenance: commonProvenance,
      evidence: areaEvidence,
      sourceRefs: areaSourceRefs,
      flowRefs: []
    });

    sections.push(areaSection);
  }

  return Object.freeze(sections);
}

module.exports = Object.freeze({
  buildInitialMap
});
