'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const {
  quick,
  thorough,
  pageItems,
  copyRules,
  focusAndErrorRules,
  checklistForLevel,
} = require('../electron/screens/checklists.cjs');
const { pageChecklist } = require('../electron/reviews.cjs');
const {
  DEFAULT_MODELS,
  listTargets,
  selectReviewer,
  buildReviewPrompt,
  parseReviewOutput,
  review,
} = require('../electron/screens/review.cjs');
const { reviewerLaunch } = require('../electron/delegation.cjs');
const { Workbench } = require('../electron/workbench.cjs');

function createFixtureProject(tmpDir) {
  const paddockScreens = path.join(tmpDir, '.paddock', 'screens');
  const latestDir = path.join(paddockScreens, 'latest');
  const historyDir = path.join(paddockScreens, 'history');
  fs.mkdirSync(latestDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });

  const registry = {
    version: 1,
    targets: [
      { id: 'main-tasks', alias: 1, label: 'Tasks', group: 'main', kind: 'page', sources: ['src/components/TaskBoard.tsx'] },
      { id: 'main-usage', alias: 2, label: 'Usage', group: 'main', kind: 'page', sources: ['src/components/UsageView.tsx'] },
      { id: 'main-tools', alias: 3, label: 'Tools', group: 'main', kind: 'page', sources: ['src/components/McpModal.tsx'] },
      { id: 'main-reviews', alias: 4, label: 'Reviews', group: 'main', kind: 'page', sources: ['src/components/ReviewsModal.tsx'] },
      { id: 'main-consoles', alias: 5, label: 'Consoles', group: 'main', kind: 'page', sources: ['src/components/TileGrid.tsx'] },
      { id: 'settings-general', alias: 6, label: 'Settings General', group: 'settings', kind: 'component', sources: ['src/components/SettingsModal.tsx'] },
    ],
  };
  fs.writeFileSync(path.join(paddockScreens, 'targets.json'), JSON.stringify(registry, null, 2), 'utf8');

  // Seed latest images and visible text for main targets (5 in 'main' group to test sibling cap of 3)
  for (const id of ['main-tasks', 'main-usage', 'main-tools', 'main-reviews', 'main-consoles']) {
    fs.writeFileSync(path.join(latestDir, `${id}.webp`), Buffer.from(`latest-${id}`));
  }
  fs.writeFileSync(path.join(latestDir, 'main-tasks.txt'), 'Tasks\nPress l to focus next pane\n', 'utf8');

  // Seed before/after history for main-tasks
  const tasksHist = path.join(historyDir, 'main-tasks');
  fs.mkdirSync(tasksHist, { recursive: true });
  fs.writeFileSync(path.join(tasksHist, '2026-11-14T10-00-00-000Z.webp'), Buffer.from('before-main-tasks'));
  fs.writeFileSync(path.join(tasksHist, '2026-11-14T11-00-00-000Z.webp'), Buffer.from('latest-main-tasks'));

  return { paddockScreens, latestDir, historyDir, registry };
}

describe('screens checklists (Phase 2)', () => {
  it('defines 12 quick checklist items and builds thorough from existing page checklist and copy/focus/error guides', () => {
    assert.equal(quick.length, 12);
    const quickIds = quick.map(item => item.id);
    assert.ok(quickIds.includes('alignment-shared-edge'));
    assert.ok(quickIds.includes('control-row-heights'));
    assert.ok(quickIds.includes('button-grouping-placement'));
    assert.ok(quickIds.includes('panel-card-sibling-consistency'));
    assert.ok(quickIds.includes('spacing-rhythm'));
    assert.ok(quickIds.includes('type-scale-consistency'));
    assert.ok(quickIds.includes('label-placement'));
    assert.ok(quickIds.includes('no-floating-stray-elements'));
    assert.ok(quickIds.includes('overflow-clipping'));
    assert.ok(quickIds.includes('text-background-contrast'));
    assert.ok(quickIds.includes('empty-error-state-clarity'));
    assert.ok(quickIds.includes('icon-size-weight-consistency'));

    assert.equal(pageItems.length, pageChecklist.length);
    assert.equal(pageItems.length, 20);
    assert.equal(pageItems[0].title, pageChecklist[0]);

    const copyText = copyRules.map(item => `${item.title} ${item.description}`).join(' ');
    assert.match(copyText, /middle-dot|middle dots/i);
    assert.match(copyText, /em dashes/i);
    assert.match(copyText, /filler/i);

    const focusErrorText = focusAndErrorRules.map(item => `${item.title} ${item.description}`).join(' ');
    assert.match(focusErrorText, /focus/i);
    assert.match(focusErrorText, /error/i);

    assert.equal(thorough.length, quick.length + pageItems.length + copyRules.length + focusAndErrorRules.length);
    assert.equal(checklistForLevel('quick'), quick);
    assert.equal(checklistForLevel('thorough'), thorough);
    assert.throws(() => checklistForLevel('invalid'), /Unknown review level/);
  });
});

describe('screens review (Phase 2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-screens-review-test-'));
    createFixtureProject(tmpDir);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('assembles prompt with latest image, previous history image, up to 3 siblings from same group, and level checklist', () => {
    const quickAssembled = buildReviewPrompt(tmpDir, {
      targets: ['main-tasks'],
      level: 'quick',
    });
    assert.equal(quickAssembled.checklist.length, 12);
    assert.equal(quickAssembled.targets.length, 1);

    const targetCtx = quickAssembled.targets[0];
    assert.equal(targetCtx.id, 'main-tasks');
    assert.ok(targetCtx.latestImage.endsWith(path.join('latest', 'main-tasks.webp')));
    assert.ok(targetCtx.latestTextFile.endsWith(path.join('latest', 'main-tasks.txt')));
    assert.equal(targetCtx.visibleText, 'Tasks\nPress l to focus next pane');
    assert.ok(targetCtx.previousImage.endsWith(path.join('history', 'main-tasks', '2026-11-14T10-00-00-000Z.webp')));
    assert.equal(targetCtx.siblingImages.length, 3);
    assert.deepEqual(
      targetCtx.siblings.map(s => s.id),
      ['main-usage', 'main-tools', 'main-reviews']
    );

    assert.match(quickAssembled.prompt, /Checklist \(quick - 12 items\)/);
    assert.match(quickAssembled.prompt, /report text or typo issues only when the visible text confirms them/i);
    assert.match(quickAssembled.prompt, /legibility/i);
    assert.match(quickAssembled.prompt, /Press l to focus next pane/);
    assert.ok(quickAssembled.prompt.includes(targetCtx.latestImage));
    assert.ok(quickAssembled.prompt.includes(targetCtx.previousImage));
    for (const sibImg of targetCtx.siblingImages) {
      assert.ok(quickAssembled.prompt.includes(sibImg));
    }

    const thoroughAssembled = buildReviewPrompt(tmpDir, {
      targets: ['settings-general'],
      level: 'thorough',
    });
    assert.equal(thoroughAssembled.checklist.length, thorough.length);
    assert.equal(thoroughAssembled.targets[0].previousImage, null);
    assert.equal(thoroughAssembled.targets[0].siblingImages.length, 0);
    assert.match(thoroughAssembled.prompt, new RegExp(`Checklist \\(thorough - ${thorough.length} items\\)`));
  });

  it('selects targets by id, numeric alias, changed files, and all', () => {
    const byId = buildReviewPrompt(tmpDir, { targets: ['main-usage'] });
    assert.deepEqual(byId.targets.map(t => t.id), ['main-usage']);

    const byAlias = buildReviewPrompt(tmpDir, { targets: [3, '6'] });
    assert.deepEqual(byAlias.targets.map(t => t.id), ['main-tools', 'settings-general']);

    const byChanged = buildReviewPrompt(tmpDir, {
      targets: 'changed',
      changedFiles: ['src/components/UsageView.tsx'],
    });
    assert.deepEqual(byChanged.targets.map(t => t.id), ['main-usage']);

    const all = buildReviewPrompt(tmpDir, { targets: 'all' });
    assert.equal(all.targets.length, 6);
  });

  it('selects default Antigravity Flash for quick, Gemini 4 Argon for thorough, allows explicit override, and rejects metered without explicit assignment', () => {
    const quickDefault = selectReviewer({ level: 'quick' });
    assert.equal(quickDefault.accountId, 'antigravity:default');
    assert.equal(quickDefault.provider, 'antigravity');
    assert.match(quickDefault.model, /flash/i);
    assert.equal(quickDefault.model, DEFAULT_MODELS.quick);

    const thoroughDefault = selectReviewer({ level: 'thorough' });
    assert.equal(thoroughDefault.accountId, 'antigravity:default');
    assert.equal(thoroughDefault.provider, 'antigravity');
    assert.match(thoroughDefault.model, /argon/i);
    assert.equal(thoroughDefault.model, DEFAULT_MODELS.thorough);

    // Rejects when only metered candidates are available and no explicit reviewer is assigned
    const meteredOnly = [
      { id: 'codex:api', provider: 'codex', installed: true, signedIn: true, funding: 'metered', executable: 'codex' },
    ];
    assert.throws(
      () => selectReviewer({ level: 'quick', candidates: meteredOnly }),
      /Metered accounts require an explicit reviewer assignment/
    );

    // Skips metered candidate and chooses non-metered candidate automatically
    const mixedCandidates = [
      { id: 'codex:api', provider: 'codex', installed: true, signedIn: true, funding: 'metered', executable: 'codex' },
      { id: 'antigravity:work', provider: 'antigravity', installed: true, signedIn: true, funding: 'included', executable: 'agy' },
    ];
    const autoPicked = selectReviewer({ level: 'quick', candidates: mixedCandidates });
    assert.equal(autoPicked.accountId, 'antigravity:work');
    assert.equal(autoPicked.funding, 'included');

    // Explicit override allowed
    const explicit = selectReviewer({
      level: 'thorough',
      reviewer: { accountId: 'claude:team', model: 'claude-sonnet-4-6' },
    });
    assert.equal(explicit.accountId, 'claude:team');
    assert.equal(explicit.provider, 'claude');
    assert.equal(explicit.model, 'claude-sonnet-4-6');
    assert.equal(explicit.explicit, true);
  });

  it('attaches images to reviewerLaunch for codex and native workers', () => {
    const imgA = path.join(tmpDir, '.paddock', 'screens', 'latest', 'main-tasks.webp');
    const codexLaunch = reviewerLaunch('codex', '/usr/bin/codex.exe', {
      outFile: path.join(tmpDir, 'out.txt'),
      model: 'gpt-5',
      workFolder: tmpDir,
      images: [imgA],
    });
    assert.ok(codexLaunch.args.includes('-i'));
    assert.ok(codexLaunch.args.includes(imgA));
    assert.deepEqual(codexLaunch.images, [imgA]);

    const externalImg = path.join(os.tmpdir(), 'outside-screen.webp');
    const agyLaunch = reviewerLaunch('antigravity', '/usr/bin/agy.exe', {
      outFile: path.join(tmpDir, 'out.txt'),
      model: DEFAULT_MODELS.quick,
      workFolder: tmpDir,
      images: [imgA, externalImg],
    });
    assert.deepEqual(agyLaunch.images, [imgA, externalImg]);
    const settingsIdx = agyLaunch.args.indexOf('--settings');
    const settings = JSON.parse(agyLaunch.args[settingsIdx + 1]);
    assert.ok(settings.permissions.allow.includes(`read_file(${path.resolve(externalImg)})`));
  });

  it('parses valid, fenced, and malformed reviewer output without throwing and writes json + md review artifacts', async () => {
    const malformed = parseReviewOutput('Wait, I could not format JSON { broken: [', ['main-tasks']);
    assert.equal(malformed.parseError, true);
    assert.deepEqual(malformed.findings, []);
    assert.match(malformed.summary, /not valid JSON/i);

    const fenced = parseReviewOutput(
      'Here is my review:\n```json\n{"summary":"Spacing issue on Tasks.","findings":[{"target":"main-tasks","severity":"HIGH","issue":"Header button row height mismatch","fix":"Set h-8 on filter buttons","alternative":"Use compact icon buttons"}]}\n```',
      ['main-tasks']
    );
    assert.equal(fenced.parseError, false);
    assert.equal(fenced.summary, 'Spacing issue on Tasks.');
    assert.equal(fenced.findings.length, 1);
    assert.deepEqual(fenced.findings[0], {
      target: 'main-tasks',
      severity: 'high',
      issue: 'Header button row height mismatch',
      fix: 'Set h-8 on filter buttons',
      alternative: 'Use compact icon buttons',
    });

    // Full review() call using mocked spawnProcess through reviewer adapter path (no network calls)
    let spawned = null;
    const fakeSpawn = (executable, args, opts) => {
      spawned = { executable, args, opts, stdinText: '' };
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        on() {},
        end(data) {
          spawned.stdinText = String(data || '');
          process.nextTick(() => {
            const payload = JSON.stringify({
              summary: 'One alignment defect found.',
              findings: [
                {
                  target: 'main-tasks',
                  severity: 'medium',
                  issue: 'Filter bar right edge sits 4px inset from task cards.',
                  fix: 'Remove extra pr-1 from filter toolbar container.',
                },
              ],
            });
            const eventLine = JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: payload } }) + '\n';
            child.stdout.emit('data', Buffer.from(eventLine));
            child.emit('close', 0);
          });
        },
      };
      return child;
    };

    const result = await review(tmpDir, {
      targets: [1],
      level: 'quick',
      timestamp: '2026-11-14T18-00-00-000Z',
      spawnProcess: fakeSpawn,
    });

    assert.ok(spawned);
    assert.match(spawned.stdinText, /main-tasks/);
    assert.equal(result.level, 'quick');
    assert.equal(result.reviewer.accountId, 'antigravity:default');
    assert.equal(result.reviewer.model, DEFAULT_MODELS.quick);
    assert.equal(result.summary, 'One alignment defect found.');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].target, 'main-tasks');
    assert.equal(result.findings[0].severity, 'medium');

    assert.ok(fs.existsSync(result.jsonFile));
    assert.ok(fs.existsSync(result.markdownFile));
    assert.ok(result.jsonFile.endsWith(path.join('.paddock', 'screens', 'reviews', '2026-11-14T18-00-00-000Z-quick.json')));
    assert.ok(result.markdownFile.endsWith(path.join('.paddock', 'screens', 'reviews', '2026-11-14T18-00-00-000Z-quick.md')));

    const savedJson = JSON.parse(fs.readFileSync(result.jsonFile, 'utf8'));
    assert.equal(savedJson.summary, result.summary);
    assert.deepEqual(savedJson.findings, result.findings);

    const savedMd = fs.readFileSync(result.markdownFile, 'utf8');
    assert.match(savedMd, /# Visual Screen Review \(quick\)/);
    assert.match(savedMd, /Filter bar right edge sits 4px inset/);
  });
});

describe('workbench dock/screens_* tools (Phase 3)', () => {
  let tmpDir;
  let wbRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-wb-screens-proj-'));
    wbRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-wb-screens-root-'));
    createFixtureProject(tmpDir);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(wbRoot, { recursive: true, force: true }); } catch {}
  });

  it('registers schemas and routes dock/screens_list, dock/screens_capture, and dock/screens_review using calling console projectDir', async () => {
    const sessions = new Map([
      ['console-1', { id: 'console-1', alive: true, cwd: tmpDir, name: 'Builder Console' }],
    ]);
    const wb = new Workbench(
      wbRoot,
      {},
      { nativeImage: { createFromPath: () => ({ isEmpty: () => true }) } },
      {
        testMode: true,
        onChange: () => {},
        getSessions: () => ({ items: sessions }),
        getProject: () => null,
      }
    );

    const toolList = wb.tools('console-1');
    const listTool = toolList.find(t => t.name === 'dock/screens_list');
    const captureTool = toolList.find(t => t.name === 'dock/screens_capture');
    const reviewTool = toolList.find(t => t.name === 'dock/screens_review');
    const startTaskTool = toolList.find(t => t.name === 'dock/start_task');

    assert.ok(listTool, 'dock/screens_list should be registered');
    assert.ok(captureTool, 'dock/screens_capture should be registered');
    assert.ok(reviewTool, 'dock/screens_review should be registered');
    assert.equal(startTaskTool.inputSchema.properties.visualReview.type, 'boolean');

    assert.ok(listTool.inputSchema.properties.group);
    assert.ok(captureTool.inputSchema.properties.targets);
    assert.ok(captureTool.inputSchema.properties.profiles);
    assert.deepEqual(reviewTool.inputSchema.properties.level.enum, ['quick', 'thorough']);
    assert.ok(reviewTool.inputSchema.properties.reviewer);
    assert.ok(reviewTool.inputSchema.properties.model);

    // 1. dock/screens_list
    const listedMain = await wb.invoke('dock/screens_list', { group: 'main' }, 'console-1');
    assert.equal(listedMain.length, 5);
    assert.equal(listedMain[0].id, 'main-tasks');
    assert.equal(listedMain[0].alias, 1);
    assert.equal(listedMain[0].group, 'main');
    assert.equal(listedMain[0].kind, 'page');
    assert.ok(listedMain[0].latest.endsWith(path.join('latest', 'main-tasks.webp')));
    assert.equal(typeof listedMain[0].timestamp, 'number');

    const listedSettings = await wb.invoke('dock/screens_list', { group: 'settings' }, 'console-1');
    assert.equal(listedSettings.length, 1);
    assert.equal(listedSettings[0].id, 'settings-general');
    assert.equal(listedSettings[0].latest, null);
    assert.equal(listedSettings[0].timestamp, null);

    // 2. dock/screens_capture
    let capturedCall = null;
    wb.captureScreens = async (projectDir, opts) => {
      capturedCall = { projectDir, opts };
      return { totalTargets: 1, captured: 1, changed: 1, results: [{ id: 'main-tasks', changed: true }] };
    };
    const captureRes = await wb.invoke('dock/screens_capture', { targets: ['main-tasks'], profiles: ['desktop'] }, 'console-1');
    assert.equal(capturedCall.projectDir, tmpDir);
    assert.deepEqual(capturedCall.opts.targets, ['main-tasks']);
    assert.deepEqual(capturedCall.opts.profiles, ['desktop']);
    assert.equal(captureRes.captured, 1);

    // 3. dock/screens_review
    wb.screenReviewRunner = async ({ projectDir, level, reviewer, targets }) => {
      assert.equal(projectDir, tmpDir);
      assert.equal(level, 'quick');
      assert.equal(reviewer.accountId, 'antigravity:default');
      assert.equal(targets.length, 1);
      return JSON.stringify({
        summary: 'Clean layout on Tasks tab.',
        findings: [],
      });
    };
    const started = await wb.invoke('dock/screens_review', { targets: ['main-tasks'], level: 'quick' }, 'console-1');
    assert.ok(started.id);
    assert.equal(started.state, 'running');
    await new Promise(resolve => setImmediate(resolve));
    const reviewJob = await wb.invoke('dock/screens_review', { id: started.id }, 'console-1');
    assert.equal(reviewJob.state, 'done');
    assert.equal(reviewJob.summary, 'Clean layout on Tasks tab.');
    assert.deepEqual(reviewJob.findings, []);
    assert.equal(wb.screenReviews.get(reviewJob.id).state, 'done');
  });
});
