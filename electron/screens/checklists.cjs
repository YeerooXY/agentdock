'use strict';
const { pageChecklist } = require('../reviews.cjs');
const { websiteGuide } = require('../website-guide.cjs');

function item(id, category, title, description) {
  return Object.freeze({
    id,
    category,
    label: title,
    title,
    description,
    toString() { return `${title}: ${description}`; },
  });
}

function readGuideContent(topic) {
  try {
    return String(websiteGuide(topic)?.content || '');
  } catch {
    return '';
  }
}

function loadPageChecklistItems() {
  const guideText = readGuideContent('checklist');
  const guideLines = guideText
    .split(/\r?\n/)
    .map(line => line.match(/^\d+\.\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
  const source = pageChecklist.length ? pageChecklist : guideLines;
  return Object.freeze(source.map((entry, index) => {
    const detail = guideLines[index] || entry;
    return item(`page-${index + 1}`, 'page', entry, detail);
  }));
}

function loadCopyAndStateItems() {
  const contentGuide = readGuideContent('content');
  const workerGuide = readGuideContent('worker');
  const verificationGuide = readGuideContent('verification');
  const combinedCopy = `${contentGuide}\n${workerGuide}`;

  const noSeparators = /no decorative em dashes or middle-dot separators/i.test(combinedCopy)
    ? 'No decorative em dashes or middle-dot separators in headings, status text, or metadata; use spacing, semantic grouping, or ordinary sentences.'
    : 'Avoid decorative em dashes and middle-dot separators in headings, status text, and metadata.';

  const noFiller = /congratulatory empty-state filler/i.test(combinedCopy)
    ? 'No atmospheric footer jokes, congratulatory empty-state filler, redundant filter subtitles, or development-status/demo banners.'
    : 'No filler text, atmospheric jokes, or redundant subtitles.';

  const factualCopy = /generic slogans|promotional/i.test(combinedCopy)
    ? 'Keep headings, buttons, and status text short, direct, and factual with no generic slogans or promotional reversals.'
    : 'Keep user-facing copy short, direct, and factual.';

  const focusRule = /preserve focus after toggles, edits and rerenders/i.test(verificationGuide)
    ? 'Interactive controls show a clear visible focus indicator and preserve keyboard focus after toggles, edits, and rerenders.'
    : 'Interactive controls show a clear visible focus indicator for keyboard navigation.';

  const errorRule = /preserve what the user typed/i.test(verificationGuide) || /error/i.test(contentGuide)
    ? 'Error states preserve user input, explain what failed in plain language near the affected control or view, and offer a clear recovery action.'
    : 'Error states clearly explain the problem and how to recover.';

  return {
    copyRules: Object.freeze([
      item('copy-no-middle-dots-or-em-dashes', 'copy', 'No middle dots or decorative em dashes', noSeparators),
      item('copy-no-filler', 'copy', 'No filler or demo banners', noFiller),
      item('copy-direct-factual', 'copy', 'Direct factual copy', factualCopy),
    ]),
    focusAndErrorRules: Object.freeze([
      item('focus-visibility', 'focus', 'Focus visibility and preservation', focusRule),
      item('error-state-recovery', 'error', 'Actionable error states', errorRule),
    ]),
  };
}

const quick = Object.freeze([
  item(
    'alignment-shared-edge',
    'quick',
    'Alignment to a shared edge',
    'Headings, controls, and content blocks align cleanly to shared vertical and horizontal edges.'
  ),
  item(
    'control-row-heights',
    'quick',
    'Consistent control heights in a row',
    'Inputs, selects, segmented toggles, and buttons in the same row share a consistent height and baseline.'
  ),
  item(
    'button-grouping-placement',
    'quick',
    'Button grouping and placement',
    'Related actions are grouped logically with clear primary/secondary hierarchy and destructive actions separated.'
  ),
  item(
    'panel-card-sibling-consistency',
    'quick',
    'Panel/card consistency with siblings',
    'Sibling panels and cards in the same group match padding, border treatment, corner radius, and header layout.'
  ),
  item(
    'spacing-rhythm',
    'quick',
    'Spacing rhythm',
    'Internal padding and gaps between sections, rows, and cards follow a consistent rhythm without crowding or awkward voids.'
  ),
  item(
    'type-scale-consistency',
    'quick',
    'Type scale consistency',
    'Section titles, labels, body copy, and metadata follow a coherent type scale and weight hierarchy.'
  ),
  item(
    'label-placement',
    'quick',
    'Label placement',
    'Field and setting labels sit in a consistent position relative to their controls with unambiguous pairing.'
  ),
  item(
    'no-floating-stray-elements',
    'quick',
    'No floating stray elements',
    'No unanchored badges, orphan dividers, detached icons, or stray controls appear out of context.'
  ),
  item(
    'overflow-clipping',
    'quick',
    'Overflow/clipping',
    'Labels, values, badges, and panels do not clip, overlap, or overflow their containers.'
  ),
  item(
    'text-background-contrast',
    'quick',
    'Contrast of text on background',
    'Primary, secondary, and muted text maintain legible contrast against backgrounds, cards, and pills.'
  ),
  item(
    'empty-error-state-clarity',
    'quick',
    'Empty/error state clarity',
    'Empty and error states clearly explain the current state and next step without decorative filler.'
  ),
  item(
    'icon-size-weight-consistency',
    'quick',
    'Icon size/weight consistency',
    'Icons across adjacent controls and navigation share consistent optical size, stroke weight, and alignment.'
  ),
]);

const pageItems = loadPageChecklistItems();
const { copyRules, focusAndErrorRules } = loadCopyAndStateItems();

const thorough = Object.freeze([
  ...quick,
  ...pageItems,
  ...copyRules,
  ...focusAndErrorRules,
]);

const checklists = Object.freeze({ quick, thorough });

function checklistForLevel(level = 'quick') {
  if (level === 'quick') return quick;
  if (level === 'thorough') return thorough;
  throw new Error(`Unknown review level "${level}". Expected "quick" or "thorough".`);
}

function formatChecklist(level = 'quick') {
  const list = checklistForLevel(level);
  return list.map((entry, idx) => `${idx + 1}. [${entry.id}] ${entry.title}: ${entry.description}`).join('\n');
}

module.exports = {
  quick,
  thorough,
  pageItems,
  copyRules,
  focusAndErrorRules,
  checklists,
  checklistForLevel,
  formatChecklist,
};
