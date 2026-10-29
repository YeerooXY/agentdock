'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { validatePlan, parsePlan, ownsFile, readySubtasks } = require('../electron/task-plan.cjs');
const sub = (id, owns = [`src/${id}/**`], dependsOn = []) => ({ id, title: id, criteria: 'Implement the criteria.', owns, dependsOn, size: 'small' });
const plan = (...subtasks) => ({ contracts: 'Use milliseconds.', subtasks: subtasks.length ? subtasks : [sub('one'), sub('two')] });
const errors = value => validatePlan(value).errors.join('\n');

test('validates and parses fenced plans without mutating input', () => {
  const value = plan(); const before = JSON.stringify(value);
  assert.deepEqual(validatePlan(value), { plan: value, errors: [] });
  assert.equal(JSON.stringify(value), before);
  assert.deepEqual(parsePlan('```json\n' + before + '\n```').plan, value);
  assert.match(parsePlan(before).errors[0], /fenced/);
  assert.match(parsePlan('```json\n{bad}\n```').errors[0], /invalid/);
});
test('rejects cycles, unknown dependencies, duplicate and bad ids', () => {
  assert.match(errors(plan(sub('one', undefined, ['two']), sub('two', undefined, ['one']))), /cycle/);
  assert.match(errors(plan(sub('one', undefined, ['absent']), sub('two'))), /unknown dependency absent/);
  assert.match(errors(plan(sub('one'), sub('one'))), /duplicate/);
  for (const id of ['', 'Upper', '../one', 'a'.repeat(33)]) assert.match(errors(plan(sub(id), sub('two'))), /id matching/);
  assert.match(errors(plan(sub('one', undefined, ['one']), sub('two'))), /cycle/);
});
test('rejects unsafe and malformed globs', () => {
  for (const glob of ['../app.js', 'src/../app.js', 'file..js', '/tmp/x', 'C:/x', 'C:\\x', '\\\\server\\share', '.git/config', 'src/.GiT/**', 'src//x', './x', '', 'src/[', 'src/{x', '!src/**']) assert.match(errors(plan(sub('one', [glob]), sub('two'))), /relative globs/, glob);
  for (const owns of [[], Array(31).fill('src/one/**')]) assert.match(errors(plan(sub('one', owns), sub('two'))), /1 to 30/);
});
test('requires ordering for conservative ownership overlap, including transitive ordering', () => {
  assert.match(errors(plan(sub('one', ['src/**']), sub('two', ['src/two.js']))), /ownership can overlap/);
  assert.equal(errors(plan(sub('one', ['src/**']), sub('two', ['src/two.js'], ['one']))), '');
  assert.equal(errors(plan(sub('one', ['src/**']), sub('middle', ['tests/middle.cjs'], ['one']), sub('two', ['src/two.js'], ['middle']))), '');
  assert.match(errors(plan(sub('one', ['**/*.js']), sub('two', ['tests/*.cjs']))), /overlap/);
  assert.match(errors(plan(sub('one', ['SRC/one.js']), sub('two', ['src/one.js']))), /overlap/);
});
test('enforces plan size limits', () => {
  assert.match(errors(plan(sub('one'))), /2 to 8/);
  assert.match(errors(plan(...Array.from({ length: 9 }, (_, i) => sub(`s-${i}`)))), /2 to 8/);
  assert.equal(errors({ ...plan(), contracts: 'x'.repeat(12000) }), '');
  assert.match(errors({ ...plan(), contracts: 'x'.repeat(12001) }), /12,000/);
  const value = plan(); value.subtasks[0].criteria = 'x'.repeat(4000); assert.equal(errors(value), '');
  value.subtasks[0].criteria += 'x'; assert.match(errors(value), /4,000/);
  for (const value of [null, [], { subtasks: [null, {}] }]) assert.ok(validatePlan(value).errors.length);
});
test('ownership matching handles paths, globstars, braces and classes', () => {
  const owner = sub('one', ['src/**/file?.{js,cjs}', 'tests/[ab].cjs']);
  for (const file of ['src/file1.js', 'src/deep/file2.cjs', 'tests/a.cjs']) assert.equal(ownsFile(owner, file), true, file);
  for (const file of ['src/deep/other.js', 'tests/c.cjs', 'elsewhere/file1.js']) assert.equal(ownsFile(owner, file), false, file);
});
test('scheduler releases only queued subtasks with merged dependencies', () => {
  const subtasks = [{ ...sub('one'), subtaskId: 'one', state: 'merged' }, { ...sub('two', undefined, ['one']), subtaskId: 'two', state: 'queued' }, { ...sub('three', undefined, ['two']), subtaskId: 'three', state: 'queued' }];
  assert.deepEqual(readySubtasks(subtasks).map(sub => sub.subtaskId), ['two']);
  subtasks[1].state = 'implementing'; assert.deepEqual(readySubtasks(subtasks), []);
});
