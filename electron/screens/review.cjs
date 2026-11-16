'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { loadRegistry, selectTargets, normalizeVisibleText } = require('./capture.cjs');
const { checklistForLevel, formatChecklist } = require('./checklists.cjs');
const { reviewerLaunch, parseReply } = require('../delegation.cjs');
const { workerPrompt, workerInput } = require('../provider-workers.cjs');
const { accountModels } = require('../routing-models.cjs');
const { accountAllowance } = require('../task-routing.cjs');
const { accountFunding } = require('../account-funding.cjs');

const DEFAULT_MODELS = Object.freeze({
  quick: 'gemini-3.8-flash-high',
  thorough: 'Gemini 4 Argon',
});

const SEVERITIES = new Set(['high', 'medium', 'low']);

function formatTimestamp(ms = Date.now()) {
  if (typeof ms === 'string' && ms.trim()) return ms.trim().replace(/[:.]/g, '-');
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

function changedFilesFromGit(projectDir, exec = execFileSync) {
  try {
    const statusOut = exec('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '-uall'], {
      cwd: projectDir, encoding: 'utf8', windowsHide: true, timeout: 10000,
    });
    const files = new Set();
    for (const line of String(statusOut || '').split(/\r?\n/)) {
      if (!line || line.length < 4) continue;
      const raw = line.slice(3).trim();
      const arrow = raw.indexOf(' -> ');
      const rel = (arrow >= 0 ? raw.slice(arrow + 4) : raw).replace(/^"+|"+$/g, '').replaceAll('\\', '/');
      if (rel) files.add(rel);
    }
    return [...files];
  } catch {
    return [];
  }
}

function providerFromAccountId(accountId, fallback = 'antigravity') {
  if (typeof accountId !== 'string' || !accountId.trim()) return fallback;
  const idx = accountId.indexOf(':');
  return (idx > 0 ? accountId.slice(0, idx) : accountId).trim().toLowerCase() || fallback;
}

function listTargets(projectDir, { group, screensDir } = {}) {
  const reg = loadRegistry(projectDir);
  const targets = Array.isArray(reg) ? reg : (reg?.targets || []);
  const baseScreensDir = screensDir || path.join(projectDir, '.paddock', 'screens');
  const filtered = group ? targets.filter(t => t.group === group) : targets;
  const list = filtered.map(target => {
    const latestFile = path.join(baseScreensDir, 'latest', `${target.id}.webp`);
    let exists = false, timestamp = null;
    try {
      const stat = fs.statSync(latestFile);
      if (stat.isFile()) { exists = true; timestamp = Math.round(stat.mtimeMs); }
    } catch {}
    const latest = exists ? latestFile : null;
    return {
      id: target.id, alias: target.alias, group: target.group, kind: target.kind,
      label: target.label || target.id, latest, latestImage: latest, imagePath: latest,
      timestamp, updatedAt: timestamp ? new Date(timestamp).toISOString() : null,
    };
  });
  Object.defineProperty(list, 'targets', { value: list, enumerable: false });
  return list;
}

function resolvePreviousImage(historyDir, latestImage) {
  if (!fs.existsSync(historyDir)) return null;
  let files = [];
  try {
    files = fs.readdirSync(historyDir).filter(name => name.endsWith('.webp')).sort();
  } catch { return null; }
  if (files.length >= 2) return path.join(historyDir, files[files.length - 2]);
  if (files.length === 1) {
    const onlyFile = path.join(historyDir, files[0]);
    if (!latestImage || !fs.existsSync(latestImage)) return onlyFile;
    try {
      return Buffer.compare(fs.readFileSync(onlyFile), fs.readFileSync(latestImage)) === 0 ? null : onlyFile;
    } catch { return onlyFile; }
  }
  return null;
}

function collectTargetContext(projectDir, target, registry, { screensDir, maxSiblings = 3 } = {}) {
  const targetList = Array.isArray(registry) ? registry : (registry?.targets || []);
  const baseScreensDir = screensDir || path.join(projectDir, '.paddock', 'screens');
  const latestFile = path.join(baseScreensDir, 'latest', `${target.id}.webp`);
  const latestImage = fs.existsSync(latestFile) ? latestFile : null;
  const textFile = path.join(baseScreensDir, 'latest', `${target.id}.txt`);
  let visibleText = '';
  let latestTextFile = null;
  if (fs.existsSync(textFile)) {
    try {
      visibleText = normalizeVisibleText(fs.readFileSync(textFile, 'utf8'));
      latestTextFile = textFile;
    } catch {}
  }
  const historyDir = path.join(baseScreensDir, 'history', target.id);
  const previousImage = resolvePreviousImage(historyDir, latestImage);

  const siblingEntries = [];
  for (const candidate of targetList) {
    if (candidate.id === target.id || candidate.group !== target.group) continue;
    const sibFile = path.join(baseScreensDir, 'latest', `${candidate.id}.webp`);
    if (fs.existsSync(sibFile)) {
      siblingEntries.push({ id: candidate.id, alias: candidate.alias, group: candidate.group, image: sibFile });
      if (siblingEntries.length >= maxSiblings) break;
    }
  }
  return {
    id: target.id, alias: target.alias, group: target.group, kind: target.kind,
    label: target.label || target.id, latestImage, latestTextFile, visibleText, previousImage,
    siblingImages: siblingEntries.map(s => s.image), siblings: siblingEntries,
  };
}

function pickDefaultModelForCandidate(candidate, level, now = Date.now()) {
  const desiredPattern = level === 'thorough' ? /argon/i : /flash/i;
  const discovered = accountModels(candidate, now).filter(m => m.funding !== 'metered');
  const matched = discovered.find(m => desiredPattern.test(m.id) || desiredPattern.test(m.name));
  return matched ? matched.id : (DEFAULT_MODELS[level] || DEFAULT_MODELS.quick);
}

function candidateFunding(candidate, limits, routing, now) {
  if (!candidate) return 'included';
  if (typeof candidate.funding === 'string' && candidate.funding) return candidate.funding;
  if (candidate.metered === true || candidate.apiBilling === true) return 'metered';
  const allowance = accountAllowance(candidate.id, Array.isArray(limits) ? limits : [], now);
  return accountFunding(candidate, allowance, routing);
}

function selectReviewer({ level = 'quick', reviewer = null, model = null, candidates = [], limits = [], routing = {}, now = Date.now() } = {}) {
  if (level !== 'quick' && level !== 'thorough') {
    throw new Error(`Unknown review level "${level}". Expected "quick" or "thorough".`);
  }
  const limitList = Array.isArray(limits) ? limits : [];
  const rawReviewer = typeof reviewer === 'string' ? { accountId: reviewer } : (reviewer && typeof reviewer === 'object' ? reviewer : null);
  const explicitAccountId = typeof rawReviewer?.accountId === 'string' && rawReviewer.accountId.trim() ? rawReviewer.accountId.trim() : null;
  const explicitModel = (typeof rawReviewer?.model === 'string' && rawReviewer.model.trim())
    ? rawReviewer.model.trim()
    : (typeof model === 'string' && model.trim() ? model.trim() : null);

  if (explicitAccountId) {
    const matched = Array.isArray(candidates) ? candidates.find(c => c.id === explicitAccountId) : null;
    if (matched) {
      if (matched.installed === false || matched.signedIn === false) {
        throw new Error(`Selected reviewer account "${explicitAccountId}" is not installed and signed in.`);
      }
      if (accountAllowance(matched.id, limitList, now).blocked) {
        throw new Error(`Selected reviewer account "${explicitAccountId}" has reached its account limit.`);
      }
    }
    const funding = rawReviewer?.funding || (matched ? candidateFunding(matched, limitList, routing, now) : 'included');
    if (funding === 'metered' && rawReviewer?.allowMetered === false) {
      throw new Error('Metered accounts require an explicit reviewer assignment.');
    }
    const provider = rawReviewer?.provider || matched?.provider || providerFromAccountId(explicitAccountId);
    const chosenModel = explicitModel || (matched ? pickDefaultModelForCandidate(matched, level, now) : null) || matched?.model || DEFAULT_MODELS[level];
    return { accountId: explicitAccountId, provider, model: chosenModel, executable: rawReviewer?.executable || matched?.executable || provider, funding, explicit: true };
  }

  if (rawReviewer?.funding === 'metered') throw new Error('Metered accounts require an explicit reviewer assignment.');

  if (Array.isArray(candidates) && candidates.length > 0) {
    const eligible = candidates.filter(c => c && c.installed !== false && c.signedIn !== false && !accountAllowance(c.id, limitList, now).blocked);
    const nonMetered = eligible.filter(c => candidateFunding(c, limitList, routing, now) !== 'metered');
    if (!nonMetered.length) {
      if (eligible.some(c => candidateFunding(c, limitList, routing, now) === 'metered')) {
        throw new Error('Metered accounts require an explicit reviewer assignment.');
      }
      throw new Error('No eligible signed-in reviewer account is available.');
    }
    const preferred = nonMetered.find(c => (c.provider || providerFromAccountId(c.id)) === 'antigravity') || nonMetered[0];
    const provider = preferred.provider || providerFromAccountId(preferred.id);
    const chosenModel = explicitModel || pickDefaultModelForCandidate(preferred, level, now);
    const modelRecord = accountModels(preferred, now).find(m => m.id === chosenModel);
    if (modelRecord?.funding === 'metered' && !explicitModel) {
      throw new Error('Metered models require an explicit reviewer assignment.');
    }
    return {
      accountId: preferred.id, provider, model: chosenModel,
      executable: preferred.executable || provider,
      funding: candidateFunding(preferred, limitList, routing, now), explicit: false,
    };
  }

  return {
    accountId: 'antigravity:default', provider: 'antigravity',
    model: explicitModel || DEFAULT_MODELS[level], executable: 'antigravity',
    funding: 'included', explicit: false,
  };
}

function buildReviewPrompt(projectDir, { targets = 'all', level = 'quick', changedFiles, screensDir, maxSiblings = 3 } = {}) {
  const checklist = checklistForLevel(level);
  const registry = loadRegistry(projectDir);
  const isChanged = targets === 'changed' || (Array.isArray(targets) && targets.length === 1 && targets[0] === 'changed');
  const resolvedChanged = isChanged && !Array.isArray(changedFiles) ? changedFilesFromGit(projectDir) : changedFiles;
  const selectedTargets = selectTargets(registry, { targets, changedFiles: resolvedChanged });
  const targetContexts = selectedTargets.map(target => collectTargetContext(projectDir, target, registry, { screensDir, maxSiblings }));

  const imageSet = new Set();
  for (const ctx of targetContexts) {
    if (ctx.latestImage) imageSet.add(ctx.latestImage);
    if (ctx.previousImage) imageSet.add(ctx.previousImage);
    for (const sib of ctx.siblingImages) imageSet.add(sib);
  }
  const targetSections = targetContexts.map(ctx => [
    `### Target: ${ctx.id} (alias #${ctx.alias}, group: ${ctx.group}, kind: ${ctx.kind})`,
    `- Latest image (after): ${ctx.latestImage || 'not captured'}`,
    `- Previous history image (before): ${ctx.previousImage || 'none'}`,
    ctx.siblings.length
      ? `- Sibling images in group "${ctx.group}" (${ctx.siblings.length}): ${ctx.siblings.map(s => `${s.id} (${s.image})`).join(', ')}`
      : `- Sibling images in group "${ctx.group}": none`,
    ctx.visibleText
      ? `- Visible text (ground truth from DOM):\n\`\`\`text\n${ctx.visibleText}\n\`\`\``
      : '- Visible text (ground truth from DOM): not captured',
  ].join('\n'));

  const prompt = [
    `You are performing a ${level} visual screen review for Paddock.`,
    'Inspect each target screen image, compare against its previous history image when present (before/after), and check consistency against sibling images from the same group.',
    'Report text or typo issues only when the visible text confirms them; image-only glyph doubts become a low "legibility" note.',
    '',
    `## Checklist (${level} - ${checklist.length} items)`,
    formatChecklist(level),
    '',
    `## Targets (${targetContexts.length})`,
    targetSections.length ? targetSections.join('\n\n') : 'No matching targets selected.',
    '',
    '## Output Format',
    'Reply with valid JSON only in this exact shape:',
    '{"summary":"Short factual summary of visual review results.","findings":[{"target":"<target-id>","severity":"high|medium|low","issue":"Concise description of the visual or copy defect.","fix":"Concrete code/style change to resolve it.","alternative":"Optional alternative treatment."}]}',
  ].join('\n');

  return { prompt, level, checklist, targets: targetContexts, images: [...imageSet] };
}

function normalizeSeverity(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (SEVERITIES.has(clean)) return clean;
  if (['critical', 'blocker', 'error', 'severe', 'p0', 'p1'].includes(clean)) return 'high';
  if (['warn', 'warning', 'moderate', 'p2'].includes(clean)) return 'medium';
  if (['minor', 'info', 'nit', 'cosmetic', 'p3'].includes(clean)) return 'low';
  return 'medium';
}

function normalizeFinding(raw, validTargetIds = []) {
  if (!raw || typeof raw !== 'object') return null;
  const issue = String(raw.issue ?? raw.problem ?? raw.description ?? raw.message ?? '').trim();
  const fix = String(raw.fix ?? raw.suggestion ?? raw.recommendation ?? raw.resolution ?? '').trim();
  if (!issue && !fix) return null;
  const fallbackTarget = validTargetIds[0] || 'unknown';
  const finding = {
    target: String(raw.target ?? raw.targetId ?? raw.id ?? fallbackTarget).trim() || fallbackTarget,
    severity: normalizeSeverity(raw.severity),
    issue: issue || 'Visual issue detected.',
    fix: fix || 'Adjust layout or styling to match checklist requirements.',
  };
  if (typeof raw.alternative === 'string' && raw.alternative.trim()) finding.alternative = raw.alternative.trim();
  return finding;
}

function extractJsonCandidate(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objStart = text.indexOf('{'), arrStart = text.indexOf('[');
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    const objEnd = text.lastIndexOf('}');
    if (objEnd > objStart) return text.slice(objStart, objEnd + 1);
  }
  if (arrStart >= 0) {
    const arrEnd = text.lastIndexOf(']');
    if (arrEnd > arrStart) return text.slice(arrStart, arrEnd + 1);
  }
  return text;
}

function parseReviewOutput(rawText, validTargetIds = []) {
  const text = String(rawText ?? '').trim();
  if (!text) return { findings: [], summary: 'Reviewer returned empty output.', parseError: true };
  for (const candidate of [text, extractJsonCandidate(text)]) {
    try {
      const parsed = JSON.parse(candidate);
      const rawFindings = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.findings) ? parsed.findings : []);
      const findings = rawFindings.map(item => normalizeFinding(item, validTargetIds)).filter(Boolean);
      const summary = typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : (findings.length ? `${findings.length} visual finding(s) reported.` : 'No visual findings reported.');
      return { findings, summary, parseError: false };
    } catch {}
  }
  return {
    findings: [],
    summary: `Reviewer output was not valid JSON: ${text.replace(/\s+/g, ' ').slice(0, 200)}`,
    parseError: true,
  };
}

function formatMarkdownSummary(report) {
  const lines = [
    `# Visual Screen Review (${report.level})`, '',
    `- Timestamp: ${report.timestamp}`,
    `- Reviewer: ${report.reviewer.accountId} (${report.reviewer.model})`,
    `- Targets reviewed: ${report.targets.length}`,
    `- Findings: ${report.findings.length}`, '',
    '## Summary', report.summary || 'No summary provided.', '', '## Findings',
  ];
  if (!report.findings.length) lines.push('- None');
  else for (const f of report.findings) {
    lines.push(`- **[${f.severity}] ${f.target}**: ${f.issue} -> Fix: ${f.fix}${f.alternative ? ` (Alternative: ${f.alternative})` : ''}`);
  }
  return lines.join('\n') + '\n';
}

async function runAdapterProcess({ projectDir, reviewer, assembled, spawnProcess = spawn, prepareAccount, releaseAccount, environment, timeoutMs = 600_000 }) {
  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-screen-review-'));
  const outFile = path.join(tempFolder, 'reply.md');
  const provider = reviewer.provider || providerFromAccountId(reviewer.accountId);
  let prepared = false;
  try {
    const promptFile = workerPrompt(provider, tempFolder, assembled.prompt);
    const launch = reviewerLaunch(provider, reviewer.executable || provider, {
      outFile, model: reviewer.model, workFolder: projectDir, promptFile, images: assembled.images,
    });
    const input = workerInput(provider, assembled.prompt);
    if (typeof prepareAccount === 'function') { await prepareAccount(reviewer.accountId, provider); prepared = true; }
    const env = typeof environment === 'function' ? (environment(reviewer.accountId, provider) || process.env) : process.env;
    const stdout = await new Promise((resolve, reject) => {
      const child = spawnProcess(launch.executable, launch.args, {
        cwd: projectDir, env: { ...env, ...launch.env }, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '', err = '';
      const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('Visual screen review timed out.')); }, timeoutMs);
      child.stdout?.on('data', chunk => { out += String(chunk); });
      child.stderr?.on('data', chunk => { err += String(chunk); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) return reject(new Error(err.trim() || `Reviewer exited with code ${code}.`));
        resolve(out);
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(input);
    });
    const reply = parseReply(provider, stdout, outFile);
    return { text: reply.text, usage: reply.usage || null, launch };
  } finally {
    if (prepared && typeof releaseAccount === 'function') { try { releaseAccount(reviewer.accountId, provider); } catch {} }
    try { fs.rmSync(tempFolder, { recursive: true, force: true }); } catch {}
  }
}

async function review(projectDir, options = {}) {
  const {
    targets = 'all', level = 'quick', reviewer: reviewerArg = null, model = null,
    changedFiles, screensDir, candidates = [], limits = [], routing = {},
    now = Date.now, timestamp, runReviewer, spawnProcess, prepareAccount, releaseAccount, environment,
  } = options;
  const nowMs = typeof now === 'function' ? now() : now;
  const chosenReviewer = selectReviewer({ level, reviewer: reviewerArg, model, candidates, limits, routing, now: nowMs });
  const assembled = buildReviewPrompt(projectDir, { targets, level, changedFiles, screensDir });

  let rawReplyText = '', usage = null;
  if (typeof runReviewer === 'function') {
    const mockTemp = path.join(os.tmpdir(), 'paddock-screen-review-preview');
    const provider = chosenReviewer.provider || providerFromAccountId(chosenReviewer.accountId);
    const launch = reviewerLaunch(provider, chosenReviewer.executable || provider, {
      outFile: path.join(mockTemp, 'reply.md'), model: chosenReviewer.model,
      workFolder: projectDir, promptFile: path.join(mockTemp, 'prompt.txt'), images: assembled.images,
    });
    const res = await runReviewer({
      projectDir, level, reviewer: chosenReviewer, prompt: assembled.prompt,
      checklist: assembled.checklist, targets: assembled.targets, images: assembled.images,
      launch, input: workerInput(provider, assembled.prompt),
    });
    if (typeof res === 'string') rawReplyText = res;
    else if (res && typeof res === 'object') {
      rawReplyText = typeof res.text === 'string' ? res.text : JSON.stringify(res);
      usage = res.usage || null;
    }
  } else {
    const adapterRes = await runAdapterProcess({
      projectDir, reviewer: chosenReviewer, assembled, spawnProcess, prepareAccount, releaseAccount, environment,
    });
    rawReplyText = adapterRes.text;
    usage = adapterRes.usage;
  }

  const parsed = parseReviewOutput(rawReplyText, assembled.targets.map(t => t.id));
  const stamp = formatTimestamp(timestamp ?? nowMs);
  const reviewsDir = path.join(screensDir || path.join(projectDir, '.paddock', 'screens'), 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  const baseName = `${stamp}-${level}`;
  const jsonFile = path.join(reviewsDir, `${baseName}.json`);
  const markdownFile = path.join(reviewsDir, `${baseName}.md`);

  const result = {
    id: randomUUID(), timestamp: stamp, createdAt: typeof nowMs === 'number' ? nowMs : Date.now(), level,
    reviewer: { accountId: chosenReviewer.accountId, provider: chosenReviewer.provider, model: chosenReviewer.model, funding: chosenReviewer.funding },
    targets: assembled.targets.map(t => ({
      id: t.id, alias: t.alias, group: t.group, kind: t.kind,
      latestImage: t.latestImage, previousImage: t.previousImage, siblingImages: t.siblingImages,
    })),
    findings: parsed.findings, summary: parsed.summary, parseError: parsed.parseError,
    usage, jsonFile, markdownFile,
  };
  fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2) + '\n', 'utf8');
  fs.writeFileSync(markdownFile, formatMarkdownSummary(result), 'utf8');
  return result;
}

module.exports = {
  DEFAULT_MODELS, formatTimestamp, changedFilesFromGit, listTargets, collectTargetContext,
  selectReviewer, buildReviewPrompt, parseReviewOutput, formatMarkdownSummary, review,
};
