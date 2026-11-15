'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { inspectInterface, probeInteraction } = require('./ui-rules.cjs');

function inspectPage() {
  const visible = element => !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  const body = getComputedStyle(document.body), controls = [...document.querySelectorAll('button,input,select,textarea')].filter(visible);
  const links = [...document.querySelectorAll('a[href]')].filter(visible);
  const defaults = document.createElement('iframe');
  defaults.hidden = true; document.body.append(defaults);
  const baseline = defaults.contentDocument;
  baseline.body.innerHTML = '<button>Check</button><input><a href="#">Link</a>';
  const properties = ['fontFamily', 'fontSize', 'backgroundColor', 'color', 'borderTopStyle', 'borderTopWidth', 'borderRadius', 'paddingTop', 'paddingLeft', 'appearance'];
  const same = (element, reference) => properties.every(key => getComputedStyle(element)[key] === defaults.contentWindow.getComputedStyle(reference)[key]);
  const native = controls.filter(element => {
    const ref = baseline.querySelector(element.tagName.toLowerCase());
    return ref && same(element, ref);
  });
  const unstyled = [];
  if (/^(?:"?Times(?: New Roman)?"?|serif|-webkit-standard)(?:,|$)/i.test(body.fontFamily)) unstyled.push({ id: 'default-serif', message: 'Body text uses a browser default serif family. Inspect whether this is intentional.' });
  if (native.length) unstyled.push({ id: 'native-controls', count: native.length, message: 'Visible form controls match browser defaults.' });
  const defaultLinks = links.filter(element => same(element, baseline.querySelector('a')) && getComputedStyle(element).textDecorationLine.includes('underline'));
  if (defaultLinks.length) unstyled.push({ id: 'default-links', count: defaultLinks.length, message: 'Visible links match browser default styling.' });
  if (['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].every(key => body[key] === '8px')) unstyled.push({ id: 'default-page-margin', message: 'Body retains the browser default 8px margin.' });
  const theme = [getComputedStyle(document.documentElement), body].some(style => [...style].some(key => key.startsWith('--') && CSS.supports('color', style.getPropertyValue(key).trim())));
  if (!theme) unstyled.push({ id: 'no-theme-colors', message: 'No root or body color variables were detected. Inspect the intended theme.' });
  defaults.remove();
  const textElements = [...document.querySelectorAll('body *')].filter(element => visible(element) && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName) &&
    getComputedStyle(element).visibility === 'visible' && getComputedStyle(element).opacity !== '0' &&
    ([...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) || element.matches('input,textarea,select') && (element.value || element.placeholder)));
  const typeValues = key => [...new Set(textElements.map(element => getComputedStyle(element)[key]))].sort();
  const typography = { families: typeValues('fontFamily'), sizes: typeValues('fontSize'), weights: typeValues('fontWeight'), findings: [] };
  for (const [key, limit, label] of [['families', 3, 'font stacks'], ['sizes', 8, 'font sizes'], ['weights', 5, 'font weights']]) {
    if (typography[key].length > limit) typography.findings.push({ id: 'too-many-font-' + key, count: typography[key].length, threshold: limit,
      message: `${typography[key].length} distinct ${label} on visible text. Review the typography scale and intentional exceptions.` });
  }
  return { title: document.title, url: location.href, lang: document.documentElement.lang, viewport: document.querySelector('meta[name="viewport"]')?.content || '', unstyled, typography,
    headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 80).map(x => ({ level: x.tagName, text: x.textContent.trim().slice(0, 180) })),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
    overflowElements: [...document.querySelectorAll('body *')].filter(visible).filter(x => x.getBoundingClientRect().right > innerWidth + 2).slice(0, 12).map(x => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '')),
    missingAlt: [...document.images].filter(x => !x.hasAttribute('alt')).length,
    links: [...document.querySelectorAll('a[href]')].slice(0, 200).map(x => ({ text: x.textContent.trim().slice(0, 100), url: x.href })) };
}

function reviewRuntime() {
  const packaged = path.join(process.resourcesPath || '', 'runtime', 'review');
  const bundled = fs.existsSync(path.join(packaged, 'node_modules', 'playwright-core')) ? packaged : path.join(__dirname, '..', '.build', 'runtime', 'review');
  if (fs.existsSync(path.join(bundled, 'node_modules', 'playwright-core'))) {
    const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
    try {
      process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(bundled, 'browsers', process.arch);
      return require(path.join(bundled, 'node_modules', 'playwright-core'));
    } finally {
      if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
    }
  }
  return require('playwright-core');
}

async function reviewBrowserProfiles({ url, axeSource, signal, onView, onStage, runtime = reviewRuntime() }) {
  const profiles = [
    { name: 'Desktop', engine: 'chromium', options: { viewport: { width: 1440, height: 1000 } } },
    { name: 'Mac WebKit', engine: 'webkit', options: { ...runtime.devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
    { name: 'Android Chrome', engine: 'chromium', options: runtime.devices['Pixel 7'] },
    { name: 'iPhone WebKit', engine: 'webkit', options: runtime.devices['iPhone 13'] }
  ];
  const report = { scope: 'Chromium desktop, WebKit desktop, Android Chrome and iPhone WebKit emulation. Physical devices, native shell integration and manual checks remain unreviewed. Unstyled findings are inspection hints.', profiles: [], views: [], thirdPartyHosts: [], links: [] };
  const hosts = new Set(), browsers = new Map();
  const stop = () => { for (const browser of browsers.values()) void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    for (const profile of profiles) {
      if (signal?.aborted) throw Error('Review stopped.');
      onStage(profile.name + ' checks');
      let browser = browsers.get(profile.engine), context, captured;
      try {
        if (!browser) { browser = await runtime[profile.engine].launch({ headless: true, chromiumSandbox: true, timeout: 15000 }); browsers.set(profile.engine, browser); }
        if (signal?.aborted) throw Error('Review stopped.');
        context = await browser.newContext({ ...profile.options, acceptDownloads: false, serviceWorkers: 'block' });
        await context.clearPermissions();
        await context.route('**/*', async route => {
          const request = new URL(route.request().url());
          if (!['http:', 'https:', 'data:', 'blob:', 'about:'].includes(request.protocol)) return route.abort();
          if (['http:', 'https:'].includes(request.protocol)) hosts.add(request.hostname);
          return route.continue();
        });
        context.on('page', popup => { if (context.pages().length > 1) void popup.close(); });
        const page = await context.newPage();
        page.on('dialog', dialog => void dialog.dismiss());
        await page.goto(url, { waitUntil: 'load', timeout: 15000 });
        // Measure motion before the review freezes animations for stable screenshots.
        const ui = await page.evaluate(inspectInterface);
        await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }' });
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
        const inspected = await page.evaluate(inspectPage);
        await page.evaluate(axeSource);
        const accessibility = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(r => ({
          violations: r.violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, helpUrl: x.helpUrl, nodes: x.nodes.slice(0, 12).map(n => ({ target: n.target, summary: n.failureSummary })) })),
          incomplete: r.incomplete.map(x => ({ id: x.id, help: x.help, count: x.nodes.length })), passes: r.passes.length })));
        const view = { name: profile.name, engine: profile.engine, ...page.viewportSize(), page: inspected, accessibility, interface: ui };
        captured = { view, buffer: await page.screenshot() };
        if (profile.name === 'Desktop') view.interaction = await probeInteraction(page);
      } catch (error) {
        if (signal?.aborted) throw Error('Review stopped.');
        report.profiles.push({ name: profile.name, engine: profile.engine, status: 'not-run', reason: /Executable doesn't exist/.test(error.message) ? 'Browser runtime is missing. Reinstall Paddock or install the matching Playwright browsers in a development checkout.' : 'Profile could not complete. Check the page and browser runtime.' });
      } finally { await context?.close().catch(() => {}); }
      if (captured) {
        await onView(captured.view, captured.buffer); report.views.push(captured.view);
        report.profiles.push({ name: profile.name, engine: profile.engine, status: 'complete' });
      }
    }
    if (!report.views.length) throw Error('No browser profile completed. Check the URL and installed browser runtimes.');
    const origin = new URL(report.views[0].page.url);
    report.thirdPartyHosts = [...hosts].filter(host => host !== origin.hostname).sort();
    const links = [...new Set(report.views[0].page.links.map(x => x.url))].filter(value => { try { const link = new URL(value); return link.origin === origin.origin && !link.hash && !link.username && !link.password; } catch { return false; } }).slice(0, 12);
    const request = await runtime.request.newContext();
    try {
      report.links = await Promise.all(links.map(async link => {
        try { const response = await request.head(link, { maxRedirects: 0, timeout: 5000 }); const status = response.status(); return { url: link, status, result: [404, 410].includes(status) ? 'broken' : status >= 200 && status < 400 ? 'reachable' : 'needs-review' }; }
        catch { return { url: link, result: 'not-checked' }; }
      }));
    } finally { await request.dispose(); }
    return report;
  } finally { signal?.removeEventListener('abort', stop); await Promise.all([...browsers.values()].map(browser => browser.close().catch(() => {}))); }
}

function reviewFindings(report) {
  const groups = new Map();
  const add = (category, id, message, profile) => {
    const key = JSON.stringify([category, id]);
    if (!groups.has(key)) groups.set(key, { category, id, message, profiles: [] });
    const item = groups.get(key);
    if (profile && !item.profiles.includes(profile)) item.profiles.push(profile);
  };
  for (const view of report.views || []) {
    for (const finding of view.page?.unstyled || []) add('unstyled', finding.id, finding.message, view.name);
    for (const finding of view.page?.typography?.findings || []) add('typography', finding.id, finding.message, view.name);
    for (const finding of view.accessibility?.violations || []) add('accessibility', finding.id, finding.help, view.name);
    for (const finding of [...view.interface?.findings || [], ...view.interaction?.findings || []]) add('interface', finding.id, finding.message, view.name);
    if (view.page?.horizontalOverflow) add('layout', 'horizontal-overflow', 'Content exceeds the viewport width.', view.name);
  }
  for (const link of report.links || []) if (link.result === 'broken') add('links', link.url, 'Broken link: ' + link.url);
  for (const profile of report.profiles || []) if (profile.status !== 'complete') add('coverage', profile.name, profile.reason, profile.name);
  const findings = [...groups.values()];
  return { total: findings.length, byCategory: Object.fromEntries(['unstyled', 'typography', 'interface', 'accessibility', 'layout', 'links', 'coverage'].map(category => [category, findings.filter(f => f.category === category).length])),
    counting: 'Unique rule or broken URL, grouped across profiles. Inspect each affected profile for its nodes and measurements.', findings };
}

module.exports = { inspectPage, reviewBrowserProfiles, reviewRuntime, reviewFindings };
