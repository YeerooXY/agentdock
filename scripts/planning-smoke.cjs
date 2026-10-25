'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts', 'planning');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'planning-')), folder = path.join(profile, 'Learning app'); fs.mkdirSync(folder);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, notifications: false, autoSaveResults: false, suggestProjects: false, consoleDefaults: { provider: 'shell', cwd: folder } }));
let app, page; const errors = [], checks = [];
const call = (method, payload) => page.evaluate(async ([method, payload]) => { const r = await window.dock.call(method, payload); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
const current = async () => (await call('state')).projects[0];
const capture = async name => { await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish())); await page.screenshot({ path: path.join(out, name + '.png') }); };
async function start() { app = await electron.launch({ args: [root, '--smoke-test', '--data-dir=' + profile] }); page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message)); await page.locator('.session-grid').waitFor(); await page.setViewportSize({ width: 1440, height: 900 }); }
async function until(fn) { const end = Date.now() + 15000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 60)); } throw Error('Planning fixture timed out'); }
const sheet = () => page.locator('#project-plan');
const step = name => sheet().locator(`[data-plan-step=${name}]`);
(async () => {
  await start(); await page.locator('[data-page=projects]').click(); await page.locator('.page-heading [data-project-new]').click();
  const create = page.locator('#project-form'); await create.locator('[name=name]').fill('Learning application'); await create.locator('[name=category]').fill('Education');
  await create.locator('[name=goals]').fill('Practice class notes with short quizzes'); await create.locator('[name=audience]').fill('University students revising their own notes');
  await create.locator('[name=milestones]').fill('Import notes | Notes can be reopened\nPractice session | Complete a quiz from imported notes');
  await create.locator('[type=submit]').click(); await sheet().waitFor();
  let p = await current(); assert.equal(p.status, 'planning'); assert.equal(Object.keys(p.plan.approvals).length, 0);
  assert.match(await sheet().locator('.plan-body').textContent(), /Practice class notes/); assert.equal(await sheet().locator('.plan-body textarea').count(), 0, 'Read mode shows text, not empty boxes');
  assert.equal(await sheet().locator('[data-plan-add=success]').count(), 1, 'Empty optional field is a single Add line');
  await capture('desktop-brief-read');
  // Draft survives switching sections and closing.
  await sheet().locator('[data-plan-add=success]').click(); await sheet().locator('[name=success]').fill('Finish one practice session');
  await step('infrastructure').click(); await step('brief').click(); assert.equal(await sheet().locator('[name=success]').inputValue(), 'Finish one practice session');
  await page.keyboard.press('Escape'); await page.locator('[data-project-plan]').click(); await step('brief').click(); assert.equal(await sheet().locator('[name=success]').inputValue(), 'Finish one practice session');
  await capture('desktop-brief-edit');
  await sheet().locator('#project-plan-form [value=save]').click(); await until(async () => (await current()).plan.brief.success === 'Finish one practice session');
  checks.push('Read mode with Add lines, draft kept across sections and closing, Save draft');
  // Research not needed; Setup approved with only the tools field.
  await step('research').click(); await sheet().locator('[data-plan-skip]').click(); await until(async () => !!(await current()).plan.skipped.research);
  assert.match(await step('research').textContent(), /Not needed/);
  await step('infrastructure').click(); await sheet().locator('[data-plan-approve]').click(); await sheet().locator('.plan-error').filter({ hasText: 'Add the tools' }).waitFor();
  await sheet().locator('[data-plan-edit]').click(); await sheet().locator('[name=platform]').selectOption('desktop'); await sheet().locator('[data-plan-suggest]').click();
  assert.ok((await sheet().locator('[name=stack]').inputValue()).length > 20); await capture('desktop-setup-edit');
  await sheet().locator('#project-plan-form [value=approve]').click(); await until(async () => !!(await current()).plan.approvals.infrastructure);
  checks.push('Not needed, actionable approval error, suggested tools, independent approval');
  // References.
  const shot = path.join(profile, 'mockup.png'); fs.copyFileSync(path.join(root, 'assets', 'icon.png'), shot);
  p = await current(); await call('projects.plan.reference.add', { id: p.id, revision: p.plan.revision, kind: 'file', value: shot });
  await sheet().locator('#plan-link').fill('https://example.org/notes-app'); await sheet().locator('[data-plan-link-form] button').click();
  await until(async () => (await current()).plan.references?.length === 2);
  await sheet().locator('.plan-ref.image img[src^="data:"]').waitFor();
  // Roadmap: approve directly even though Brief is not approved.
  await step('roadmap').click(); assert.match(await sheet().locator('.plan-notes').textContent(), /Brief: not reviewed/);
  await sheet().locator('[data-plan-edit]').click();
  await sheet().locator('[name=scope]').fill('Import text notes and complete one local quiz.'); await sheet().locator('[name=excluded]').fill('Accounts, sharing and cloud sync.');
  await sheet().locator('[data-plan-milestone-add]').click(); const rows = sheet().locator('.plan-milestone-row');
  await rows.last().locator('[name=milestoneText]').fill('Release check'); await rows.last().locator('[name=milestoneDone]').fill('Tests and a backup restore pass');
  await rows.last().locator('[data-plan-move="-1"]').click(); assert.equal(await rows.nth(1).locator('[name=milestoneText]').inputValue(), 'Release check');
  await capture('desktop-roadmap-edit');
  await sheet().locator('#project-plan-form [value=approve]').click(); await until(async () => (await current()).status === 'active');
  p = await current(); assert.deepEqual(p.milestones.map(m => m.text), ['Import notes', 'Release check', 'Practice session']); assert.equal(p.plan.excluded, 'Accounts, sharing and cloud sync.');
  await sheet().locator('#plan-later').fill('Shared class libraries'); await sheet().locator('[data-plan-later-form] button').click(); await until(async () => (await current()).plan.laterFeatures.length === 1);
  await capture('desktop-roadmap-read');
  checks.push('References (file copy with thumbnail, link), roadmap approved without earlier sections, milestone editor, not included, later features');
  // Proposals for two sections at once through the real MCP bridge.
  await page.keyboard.press('Escape');
  const s = await call('session.create', { provider: 'shell', projectId: p.id, cwd: folder, name: 'Planning fixture' });
  const grantFile = path.join(profile, 'test-bridge.json');
  await call('session.input', { id: s.id, data: `@{url=$env:PADDOCK_BRIDGE_URL;token=$env:PADDOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${grantFile.replaceAll("'", "''")}'\r` });
  await until(() => fs.existsSync(grantFile)); const grant = JSON.parse(fs.readFileSync(grantFile, 'utf8').replace(/^﻿/, ''));
  const bridge = async (tool, args = {}) => { const response = await fetch(grant.url, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'dock_call', arguments: { tool, arguments: args } }) }); const result = await response.json(); if (result.isError) throw Error(JSON.stringify(result)); return JSON.parse(result.content[0].text); };
  let context = await bridge('dock/project_plan', { section: 'brief' });
  assert.equal(context.references.length, 2);
  await bridge('dock/propose_project_plan', { revision: context.revision, section: 'brief', changes: { audience: 'Students preparing for exams' } });
  context = await bridge('dock/project_plan', { section: 'roadmap' });
  await bridge('dock/propose_project_plan', { revision: context.revision, section: 'roadmap', changes: { milestones: [...p.milestones, { text: 'Export results', acceptance: 'A CSV opens in a spreadsheet', done: false }] } });
  await page.locator('[data-page=projects]').click(); await page.locator('[data-project-plan]').click(); await sheet().locator('.plan-proposal').waitFor();
  assert.match(await step('brief').textContent(), /Proposal/); assert.match(await step('roadmap').textContent(), /Proposal/);
  await capture('desktop-proposal');
  await sheet().locator('[data-plan-accept]').click(); await until(async () => (await current()).plan.brief.audience === 'Students preparing for exams');
  await step('roadmap').click(); assert.match(await sheet().locator('.plan-proposal').textContent(), /Export results/);
  await sheet().locator('[data-plan-reject]').click(); await until(async () => !(await current()).plan.proposals.roadmap);
  assert.equal((await current()).status, 'active');
  checks.push('Real MCP proposals for two sections, before/after diff, accept and reject');
  // Narrow window.
  await page.setViewportSize({ width: 760, height: 900 }); await capture('narrow-roadmap');
  const overflow = await page.evaluate(() => document.querySelector('#project-plan').scrollWidth > document.querySelector('#project-plan').clientWidth + 1);
  assert.equal(overflow, false, 'No horizontal overflow at 760 px');
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(await call('state')));
  await page.keyboard.press('Escape'); await call('quit'); await app.close(); app = null;
  await start(); p = await current(); assert.equal(p.status, 'active'); assert.equal(p.plan.references.length, 2); assert.equal(p.plan.laterFeatures.length, 1);
  assert.deepEqual(errors, []); checks.push('Plan, references and approvals survive restart; no page errors');
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ passed: true, checks, paidRequests: 0 }, null, 2));
  console.log('PASS plan sheet: ' + checks.join(' | '));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await app?.close().catch(() => {}); assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); });
