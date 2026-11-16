'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { reviewRuntime } = require('../electron/review-browser.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/delegate-composer.js'), 'utf8').replace('export function', 'function');

async function setup(page) {
  await page.setContent(`<article class="session-card"><header class="console-panel-header"><button class="console-grip">Move</button><button data-action="toggle-console">Expand</button></header><div class="console-panel-body"></div></article>`);
  await page.addScriptTag({ content: source + `
    window.calls = []; window.opened = []; window.toasts = [];
    window.reply = { id: 'plan-1', state: 'plan-ready', plan: { subtasks: [{ kind: 'code' }, { kind: 'code' }, { kind: 'question' }] } };
    window.composer = delegateComposer({ escape: s => String(s), toast: m => toasts.push(m), openTask: job => opened.push(job.id), icon: () => '<svg></svg>',
      call: async (name, args) => { calls.push([name, args]); if (name === 'tasks.planMessage') { await new Promise(r => window.release = r); return window.reply; } return true; } });
    window.session = { id: 's1', consoleKey: 'k1', name: 'Console 1', cwd: 'C:/repo', alive: true };
    window.card = document.querySelector('.session-card');
    composer.sync(card, session);` });
}
const launch = () => reviewRuntime().chromium.launch({ headless: true, chromiumSandbox: true });
const focusIs = (page, selector) => page.evaluate(s => document.activeElement === document.querySelector(s), selector);

test('Plan mode is hidden until its header button opens it; Escape closes it and returns focus to the button', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(); await setup(page);
    assert.equal(await page.locator('.delegate-composer').isHidden(), true);
    const toggle = page.locator('[data-delegate-toggle]');
    assert.equal(await toggle.getAttribute('title'), 'Plan mode');
    assert.equal(await page.evaluate(() => document.querySelector('[data-delegate-toggle]').nextElementSibling.dataset.action), 'toggle-console', 'button sits before Expand');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await focusIs(page, '.delegate-composer textarea'), true);
    assert.equal(await page.locator('.delegate-composer textarea').getAttribute('placeholder'), 'Plan a longer task');
    await page.keyboard.type('Draft');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.delegate-composer').isHidden(), true);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(await focusIs(page, '[data-delegate-toggle]'), true);
    for (let i = 0; i < 3; i++) await page.evaluate(() => composer.sync(card, { ...session, state: 'busy' }));
    assert.equal(await page.locator('.delegate-composer').isHidden(), true, 'stays closed through re-renders');
    await toggle.click();
    assert.equal(await page.locator('.delegate-composer textarea').inputValue(), 'Draft', 'draft kept');
  } finally { await browser.close(); }
});

test('Enter sends to the dispatcher, Shift+Enter adds a line, and the plan can be approved', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(); await setup(page);
    await page.locator('[data-delegate-toggle]').click();
    const box = page.locator('.delegate-composer textarea');
    await box.type('Split server stats'); await page.keyboard.press('Shift+Enter'); await box.type('into its own view');
    assert.equal(await page.evaluate(() => calls.length), 0);
    for (let i = 0; i < 3; i++) await page.evaluate(() => composer.sync(card, { ...session, state: 'busy' }));
    assert.equal(await page.locator('.delegate-composer').count(), 1);
    assert.equal(await focusIs(page, '.delegate-composer textarea'), true);

    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => calls[0]), ['tasks.planMessage', { text: 'Split server stats\ninto its own view', repo: 'C:/repo', executionMode: 'serial' }]);
    assert.equal(await page.locator('.delegate-composer [role=status]').textContent(), 'Planning…');
    assert.equal(await page.evaluate(() => document.querySelector('[data-delegate-toggle]').classList.contains('has-plan')), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => calls.length), 1, 'no second send while planning');

    await page.evaluate(() => release());
    await page.waitForFunction(() => !document.querySelector('.delegate-actions').hidden);
    assert.equal(await page.locator('.delegate-composer [role=status]').textContent(), 'Plan ready: 2 tasks.');
    assert.equal(await box.inputValue(), '');
    assert.equal(await focusIs(page, '.delegate-composer textarea'), true, 'focus stays in the field after planning');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.delegate), 'approve', 'Approve is the next Tab stop');

    await page.locator('[data-delegate=review]').click();
    assert.deepEqual(await page.evaluate(() => opened), ['plan-1']);
    await page.locator('[data-delegate=approve]').click();
    await page.waitForFunction(() => document.querySelector('.delegate-actions').hidden);
    assert.deepEqual(await page.evaluate(() => calls[1]), ['tasks.approveMessage', { id: 'plan-1' }]);
    assert.equal(await page.locator('.delegate-composer [role=status]').textContent(), 'Approved. 2 tasks queued.');
    assert.equal(await focusIs(page, '.delegate-composer textarea'), true, 'focus returns to the field');
    assert.equal(await page.evaluate(() => document.querySelector('[data-delegate-toggle]').classList.contains('has-plan')), false);
  } finally { await browser.close(); }
});

test('worker and closed consoles get no Plan mode; removing a focused control moves focus to the console grip', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(); await setup(page);
    await page.locator('[data-delegate-toggle]').focus();
    await page.evaluate(() => composer.sync(card, { ...session, taskId: 't1' }));
    assert.equal(await page.locator('.delegate-composer, [data-delegate-toggle]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'console-grip');
    await page.evaluate(() => composer.sync(card, { ...session, alive: false }));
    assert.equal(await page.locator('[data-delegate-toggle]').count(), 0);
    await page.evaluate(() => composer.sync(card, session));
    assert.equal(await page.locator('[data-delegate-toggle]').count(), 1);
  } finally { await browser.close(); }
});

test('a failed plan keeps the message and shows the dispatcher error', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(); await setup(page);
    await page.evaluate(() => { window.reply = { id: 'plan-2', state: 'failed', error: 'Pi does not offer the selected model.' }; });
    await page.locator('[data-delegate-toggle]').click();
    const box = page.locator('.delegate-composer textarea');
    await box.fill('Do the thing'); await box.press('Enter'); await page.evaluate(() => release());
    await page.waitForFunction(() => document.querySelector('.delegate-composer [role=status]').textContent.includes('selected model'));
    assert.equal(await box.inputValue(), 'Do the thing');
    assert.equal(await page.locator('.delegate-actions').isHidden(), true);
  } finally { await browser.close(); }
});
