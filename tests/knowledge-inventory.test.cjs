'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { survey, saveSurveyReport } = require('../scripts/knowledge-inventory.cjs');
test('survey inventories explicit roots and distinguishes missing roots and filename language hints', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-survey-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests')); fs.writeFileSync(path.join(root, 'tests', 'fixture.json'), '{}'); fs.writeFileSync(path.join(root, 'run.py'), '');
  const [good, missing] = survey([{ path: root, label: 'Fixture' }, { path: path.join(root, 'missing'), label: 'Unavailable' }]);
  assert.equal(good.summary.fileCount, 2); assert.deepEqual(good.summary.languages, { py: 1 });
  assert.equal(missing.status, 'unavailable'); assert.equal(good.inventory.coverage.complete, true);
  assert.throws(() => survey([])); assert.throws(() => survey([{ label: 'Bad' }]));
  assert.throws(() => survey([{ path: root, label: 'Fixture' }], { maxEntries: NaN }), /bounds/);
});
test('report writes cannot reach source roots through lexical paths or parent links', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-survey-report-')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'a.js'), 'source');
  const roots = [{ path: root, label: 'Fixture' }];
  assert.throws(() => saveSurveyReport(roots, path.join(root, 'nested', 'report.json')), /outside/);
  assert.equal(fs.existsSync(path.join(root, 'nested')), false);
  const link = path.join(base, 'redirect'); fs.symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => saveSurveyReport(roots, path.join(link, 'report.json')), /outside/);
  assert.equal(fs.existsSync(path.join(root, 'report.json')), false);
  const destination = path.join(base, 'reports', 'inventory.json');
  saveSurveyReport(roots, destination);
  assert.equal(JSON.parse(fs.readFileSync(destination)).results[0].summary.fileCount, 1);
  assert.equal(fs.readFileSync(path.join(root, 'a.js'), 'utf8'), 'source');
  assert.throws(() => saveSurveyReport([{ path: path.join(link, 'missing'), label: 'Missing' }], path.join(root, 'missing', 'report.json')), /outside/);
  assert.equal(fs.existsSync(path.join(root, 'missing')), false);
});
test('native alias normalization and directory identity protect report destinations', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-survey-alias-')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'), alias = path.join(base, 'alias'); fs.mkdirSync(root); fs.mkdirSync(alias);
  const native = fs.realpathSync.native;
  t.mock.method(fs.realpathSync, 'native', value => value === alias ? native(root) : native(value));
  assert.throws(() => saveSurveyReport([{ path: root, label: 'Fixture' }], path.join(alias, 'report.json')), /outside/);
  assert.deepEqual(fs.readdirSync(alias), []);
});
test('missing roots produce a report and nonzero CLI status; link outputs are rejected', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-survey-cli-')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo'); fs.mkdirSync(root);
  const catalog = path.join(base, 'catalog.json'), report = path.join(base, 'report.json');
  fs.writeFileSync(catalog, JSON.stringify([{ path: root, label: 'Good' }, { path: path.join(base, 'missing'), label: 'Missing' }]));
  assert.throws(() => require('node:child_process').execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/knowledge-inventory.cjs'), '--catalog', catalog, '--out', report], { windowsHide: true, stdio: 'pipe' }), error => error.status === 1);
  assert.equal(JSON.parse(fs.readFileSync(report)).results[1].status, 'unavailable');
  const link = path.join(base, 'link.json'); fs.symlinkSync(path.join(base, 'absent.json'), link, process.platform === 'win32' ? 'junction' : 'file');
  assert.throws(() => saveSurveyReport([{ path: root, label: 'Good' }], link));
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});
