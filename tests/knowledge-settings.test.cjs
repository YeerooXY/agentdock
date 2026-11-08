'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { initialSettings } = require('../electron/settings.cjs');
const { Projects } = require('../electron/projects.cjs');
const { desktopSettingsCommands } = require('../electron/desktop-settings-commands.cjs');
test('one damaged skill preference preserves the remaining owner choices', () => {
  const settings = initialSettings({ skillAuto: { pstack: true, ponytail: false, damaged: 'yes' } }, '.', {});
  assert.deepEqual(settings.skillAuto, { pstack: true, ponytail: false });
});
test('knowledge settings default safely and survive explicit setting changes', async () => {
  for (const value of [undefined, 'corrupt']) assert.equal(initialSettings({ knowledgeMode: value }, '.', {}).knowledgeMode, 'off');
  assert.equal(initialSettings({ knowledgeMode: 'read' }, '.', {}).knowledgeMode, 'read');
  let settings = initialSettings({}, '.', {}), writes = 0;
  const commands = desktopSettingsCommands({ getSettings: () => settings, persistSettings: next => { settings = next; writes++; }, publish() {} });
  // Validation rejects unsupported maintenance before any settings write.
  await assert.rejects(commands.settings({ knowledgeMode: 'always-on' }), /Unknown/); assert.equal(writes, 0);
});
test('project overrides persist independently and project edits preserve them', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-knowledge-settings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projects = new Projects(root), project = projects.save({ name: 'Knowledge setting', folders: [{ path: root }] });
  projects.setKnowledgeMode(project.id, 'off');
  assert.equal(new Projects(root).get(project.id).knowledgeMode, 'off');
  assert.equal(projects.save({ ...projects.get(project.id), name: 'Renamed' }).knowledgeMode, 'off');
  assert.throws(() => projects.setKnowledgeMode(project.id, 'always-on'), /Unknown/);
  assert.equal(projects.get(project.id).knowledgeMode, 'off');
});
