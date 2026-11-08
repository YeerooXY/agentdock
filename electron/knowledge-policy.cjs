'use strict';

const GLOBAL_MODES = new Set(['off', 'read', 'automatic']);
const PROJECT_MODES = new Set(['inherit', 'off', 'read', 'automatic']);

function normalizeKnowledgeMode(value, { project = false } = {}) {
  if (value === undefined || value === null) {
    return project ? 'inherit' : 'off';
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid knowledge mode: expected string, got ${typeof value}.`);
  }
  if (project) {
    if (PROJECT_MODES.has(value)) {
      return value;
    }
    throw new Error(`Unknown project knowledge mode: "${value}". Supported values are 'inherit', 'off', 'read', 'automatic'.`);
  }
  if (GLOBAL_MODES.has(value)) {
    return value;
  }
  throw new Error(`Unknown global knowledge mode: "${value}". Supported values are 'off', 'read', 'automatic'.`);
}

function knowledgeMode(settings = {}, project = null) {
  if (settings !== null && settings !== undefined && (typeof settings !== 'object' || Array.isArray(settings))) {
    throw new Error('Settings must be an object.');
  }
  if (project !== null && project !== undefined && (typeof project !== 'object' || Array.isArray(project))) {
    throw new Error('Project must be an object or null.');
  }

  const effectiveSettings = settings || {};
  const globalMode = normalizeKnowledgeMode(effectiveSettings.knowledgeMode, { project: false });
  const projectOverride = normalizeKnowledgeMode(project?.knowledgeMode, { project: true });

  if (globalMode === 'off') {
    return 'off';
  }

  if (projectOverride === 'off') {
    return 'off';
  }

  return globalMode === 'automatic' && projectOverride !== 'read' ? 'automatic' : 'read';
}

function assertKnowledgeRead(settings, project) {
  const mode = knowledgeMode(settings, project);
  if (mode === 'off') {
    throw new Error('Project knowledge is off.');
  }
  return mode;
}

function normalizeKnowledgeWorker(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'accountId,funding,model' || typeof value.accountId !== 'string' || !/^(?:[a-z0-9-]{1,40}:[\w.-]{1,80}|[0-9a-f-]{36})$/i.test(value.accountId) || typeof value.model !== 'string' || !/^[\w][\w.:/-]{0,119}$/.test(value.model) || !['included', 'free', 'local'].includes(value.funding)) throw Error('Choose a documentation account, native model and free, included or local allowance.');
  return { accountId: value.accountId, model: value.model, funding: value.funding };
}

module.exports = {
  normalizeKnowledgeWorker,
  normalizeKnowledgeMode,
  knowledgeMode,
  assertKnowledgeRead
};
