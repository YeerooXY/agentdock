'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeKnowledgeMode,
  knowledgeMode,
  assertKnowledgeRead
} = require('../electron/knowledge-policy.cjs');

test('normalizeKnowledgeMode: handles global modes and missing values', () => {
  // Missing or unset values default to 'off' for global settings
  assert.equal(normalizeKnowledgeMode(), 'off');
  assert.equal(normalizeKnowledgeMode(undefined), 'off');
  assert.equal(normalizeKnowledgeMode(null), 'off');
  assert.equal(normalizeKnowledgeMode(undefined, { project: false }), 'off');
  assert.equal(normalizeKnowledgeMode(null, { project: false }), 'off');

  // Supported global values
  assert.equal(normalizeKnowledgeMode('off'), 'off');
  assert.equal(normalizeKnowledgeMode('read'), 'read');
  assert.equal(normalizeKnowledgeMode('off', { project: false }), 'off');
  assert.equal(normalizeKnowledgeMode('read', { project: false }), 'read');

  // Global settings do not support 'inherit'
  assert.throws(() => normalizeKnowledgeMode('inherit'), /Unknown global knowledge mode/);
  assert.throws(() => normalizeKnowledgeMode('inherit', { project: false }), /Unknown global knowledge mode/);
});

test('normalizeKnowledgeMode: handles project overrides and missing values', () => {
  // Missing or unset values default to 'inherit' for project overrides
  assert.equal(normalizeKnowledgeMode(undefined, { project: true }), 'inherit');
  assert.equal(normalizeKnowledgeMode(null, { project: true }), 'inherit');

  // Supported project override values
  assert.equal(normalizeKnowledgeMode('inherit', { project: true }), 'inherit');
  assert.equal(normalizeKnowledgeMode('off', { project: true }), 'off');
  assert.equal(normalizeKnowledgeMode('read', { project: true }), 'read');
});

test('automatic mode respects the global switch and project on-demand override', () => {
  assert.equal(normalizeKnowledgeMode('automatic'), 'automatic');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, { knowledgeMode: 'automatic' }), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'read' }, { knowledgeMode: 'automatic' }), 'read');
  assert.equal(knowledgeMode({ knowledgeMode: 'automatic' }, { knowledgeMode: 'read' }), 'read');
  assert.equal(knowledgeMode({ knowledgeMode: 'automatic' }, { knowledgeMode: 'inherit' }), 'automatic');
});

test('normalizeKnowledgeMode: rejects unknown, malformed, or non-string values', () => {
  const invalidValues = ['auto', 'write', 'enabled', 'disabled', '', ' ', 'off ', 'read\n', 'READ', 'OFF', 0, 1, true, false, {}, []];
  for (const val of invalidValues) {
    assert.throws(() => normalizeKnowledgeMode(val), /Invalid|Unknown/);
    assert.throws(() => normalizeKnowledgeMode(val, { project: true }), /Invalid|Unknown/);
  }
});

test('knowledgeMode: global mode "off" acts as master switch', () => {
  // When global mode is explicitly 'off', effective mode is 'off' regardless of project override
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, null), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, {}), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, { knowledgeMode: 'inherit' }), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, { knowledgeMode: 'off' }), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, { knowledgeMode: 'read' }), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: 'off' }, { knowledgeMode: null }), 'off');
});

test('knowledgeMode: global mode missing defaults to "off"', () => {
  // When settings are omitted, empty, or missing knowledgeMode, global defaults to 'off'
  assert.equal(knowledgeMode(), 'off');
  assert.equal(knowledgeMode({}), 'off');
  assert.equal(knowledgeMode(null, null), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: undefined }, null), 'off');
  assert.equal(knowledgeMode({ knowledgeMode: null }, null), 'off');
  assert.equal(knowledgeMode({}, { knowledgeMode: 'read' }), 'off');
  assert.equal(knowledgeMode({}, { knowledgeMode: 'inherit' }), 'off');
  assert.equal(knowledgeMode({}, { knowledgeMode: 'off' }), 'off');
});

test('knowledgeMode: global mode "read" respects project overrides', () => {
  const settings = { knowledgeMode: 'read' };

  // Project overrides 'off' -> effective 'off'
  assert.equal(knowledgeMode(settings, { knowledgeMode: 'off' }), 'off');

  // Project 'inherit', 'read', or missing/null/empty project -> effective 'read'
  assert.equal(knowledgeMode(settings, { knowledgeMode: 'inherit' }), 'read');
  assert.equal(knowledgeMode(settings, { knowledgeMode: 'read' }), 'read');
  assert.equal(knowledgeMode(settings, null), 'read');
  assert.equal(knowledgeMode(settings, undefined), 'read');
  assert.equal(knowledgeMode(settings, {}), 'read');
  assert.equal(knowledgeMode(settings, { knowledgeMode: null }), 'read');
  assert.equal(knowledgeMode(settings, { knowledgeMode: undefined }), 'read');
});

test('knowledgeMode: rejects invalid settings and project inputs', () => {
  // Invalid global modes in settings
  assert.equal(knowledgeMode({ knowledgeMode: 'automatic' }), 'automatic');
  assert.throws(() => knowledgeMode({ knowledgeMode: 'inherit' }), /Unknown global knowledge mode/);
  assert.throws(() => knowledgeMode({ knowledgeMode: 'invalid' }), /Unknown global knowledge mode/);
  assert.throws(() => knowledgeMode({ knowledgeMode: 123 }), /Invalid knowledge mode/);

  // Invalid project overrides
  assert.equal(knowledgeMode({ knowledgeMode: 'read' }, { knowledgeMode: 'automatic' }), 'read');
  assert.throws(() => knowledgeMode({ knowledgeMode: 'read' }, { knowledgeMode: 'invalid' }), /Unknown project knowledge mode/);
  assert.throws(() => knowledgeMode({ knowledgeMode: 'read' }, { knowledgeMode: 456 }), /Invalid knowledge mode/);

  // Invalid settings argument types
  assert.throws(() => knowledgeMode('read'), /Settings must be an object/);
  assert.throws(() => knowledgeMode(123), /Settings must be an object/);
  assert.throws(() => knowledgeMode([]), /Settings must be an object/);

  // Invalid project argument types
  assert.throws(() => knowledgeMode({}, 'read'), /Project must be an object or null/);
  assert.throws(() => knowledgeMode({}, 123), /Project must be an object or null/);
  assert.throws(() => knowledgeMode({}, []), /Project must be an object or null/);
});

test('knowledgeMode and assertKnowledgeRead: do not mutate supplied objects', () => {
  const settings = Object.freeze({ knowledgeMode: 'read' });
  const project = Object.freeze({ knowledgeMode: 'inherit', name: 'Alpha' });

  assert.equal(knowledgeMode(settings, project), 'read');
  assert.equal(assertKnowledgeRead(settings, project), 'read');

  const settingsOff = Object.freeze({ knowledgeMode: 'off' });
  const projectRead = Object.freeze({ knowledgeMode: 'read' });

  assert.equal(knowledgeMode(settingsOff, projectRead), 'off');
  assert.throws(() => assertKnowledgeRead(settingsOff, projectRead), /Project knowledge is off\./);
});

test('assertKnowledgeRead: throws exact message when effective mode is off', () => {
  const expectedError = { name: 'Error', message: 'Project knowledge is off.' };

  assert.throws(() => assertKnowledgeRead(), expectedError);
  assert.throws(() => assertKnowledgeRead({}), expectedError);
  assert.throws(() => assertKnowledgeRead({ knowledgeMode: 'off' }, null), expectedError);
  assert.throws(() => assertKnowledgeRead({ knowledgeMode: 'off' }, { knowledgeMode: 'read' }), expectedError);
  assert.throws(() => assertKnowledgeRead({ knowledgeMode: 'off' }, { knowledgeMode: 'inherit' }), expectedError);
  assert.throws(() => assertKnowledgeRead({ knowledgeMode: 'read' }, { knowledgeMode: 'off' }), expectedError);
});

test('assertKnowledgeRead: returns "read" when effective mode is read', () => {
  assert.equal(assertKnowledgeRead({ knowledgeMode: 'read' }, null), 'read');
  assert.equal(assertKnowledgeRead({ knowledgeMode: 'read' }), 'read');
  assert.equal(assertKnowledgeRead({ knowledgeMode: 'read' }, {}), 'read');
  assert.equal(assertKnowledgeRead({ knowledgeMode: 'read' }, { knowledgeMode: 'inherit' }), 'read');
  assert.equal(assertKnowledgeRead({ knowledgeMode: 'read' }, { knowledgeMode: 'read' }), 'read');
});
