'use strict';
const settings = new Set(['appearance', 'console-settings', 'devices', 'api-settings', 'tools', 'instructions', 'general-settings']);
async function openPage(page, target) {
  if (target === 'settings') {
    await page.locator('.sidebar-bottom [data-page=settings]').click();
    return;
  }
  if (settings.has(target) && !await page.locator(`.settings-navigation [data-page="${target}"]`).isVisible()) {
    await page.locator('.sidebar-bottom [data-page=settings]').click();
  }
  if (!settings.has(target) && await page.locator('body[data-settings-open]').count()) {
    await page.keyboard.press('Escape');
    await page.locator('body[data-settings-open]').waitFor({ state: 'detached' });
  }
  await page.locator(`nav [data-page="${target}"]`).click();
}
module.exports = { openPage };
