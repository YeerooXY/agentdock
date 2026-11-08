'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { taskGuidance } = require('../electron/task-guidance.cjs');
const { websiteGuide } = require('../electron/website-guide.cjs');

test('website builders receive a compact contract without tool credentials or a repeated library', () => {
  const config = { instructions: 'Preserve the actual bakery prices.', guideIds: ['web-design'], profiles: [{ keyId: 'private-key-id' }], connections: [{ url: 'https://private.example/' }] };
  const brief = taskGuidance(config, { title: 'Build a bakery website', criteria: 'Show hours and contact.' });
  assert.ok(brief.includes(config.instructions));
  assert.ok(brief.includes(websiteGuide('worker').content));
  for (const topic of ['overview', 'content', 'verification', 'checklist']) assert.ok(!brief.includes(websiteGuide(topic).content), topic);
  const previousSize = ['overview', 'content', 'verification', 'checklist'].reduce((sum, topic) => sum + websiteGuide(topic).content.length, 0);
  assert.ok(brief.length < previousSize / 3, 'Builder guidance stays below one third of the previous library.');
  assert.ok(!brief.includes('private-key-id')); assert.ok(!brief.includes('private.example'));
});

test('child tasks inherit website scope while unrelated and disabled tasks omit the library', () => {
  const config = { guideIds: ['web-design'] };
  assert.ok(taskGuidance(config, { title: 'Footer and contacts' }, { title: 'Build a website' }).includes(websiteGuide('worker').content));
  assert.ok(!taskGuidance(config, { title: 'Repair Python argument parsing' }).includes(websiteGuide('worker').content));
  assert.ok(!taskGuidance({ guideIds: [] }, { title: 'Build a website' }).includes(websiteGuide('worker').content));
});

test('supplied skill text is included directly and never sends workers back to pack paths', () => {
  const brief = taskGuidance({}, { title: 'Repair parser' }, {}, null, { role: 'builder', skills: '### ponytail (revision r1, digest abc)\nSource: verified instruction text included here.\n' });
  assert.match(brief, /Use it directly\. Do not reopen external pack paths or retry denied reads\./);
  assert.ok(brief.indexOf('## Applicable skill instructions') < brief.indexOf('### ponytail'));
});

test('planning gets creative direction; first review gets the full checklist; fixes keep the compact contract', () => {
  const brief = phase => taskGuidance({ guideIds: ['web-design'] }, { title: 'Build a website' }, {}, null, phase);
  assert.ok(brief({ role: 'planner' }).includes(websiteGuide('creative').content));
  assert.ok(brief({ role: 'reviewer' }).includes(websiteGuide('checklist').content));
  const followup = brief({ role: 'reviewer', followup: true });
  assert.ok(followup.includes(websiteGuide('worker').content));
  assert.ok(!followup.includes(websiteGuide('checklist').content));
  assert.match(followup, /All applicable release checks still apply/);
});


test('each role receives only its scope and reuse contract', () => {
  const brief = role => taskGuidance({}, {}, {}, null, { role });
  assert.match(brief('planner'), /user scenario and impact/);
  assert.match(brief('planner'), /helpers, data shapes and transaction flows/);
  assert.match(brief('builder'), /concrete reason the existing one cannot serve/);
  assert.match(brief('builder'), /normal final summary/);
  assert.match(brief('reviewer'), /against the actual code/);
  assert.match(brief('reviewer'), /same behavior before and after/);
  assert.match(brief('reviewer'), /line counts are clues, not objectives/);
  for (const role of ['planner', 'builder', 'reviewer']) {
    assert.match(brief(role), /cheap boundary checks and data-loss, security and accessibility safeguards/);
    for (const other of ['Planner', 'Builder', 'Reviewer'].filter(name => name.toLowerCase() !== role)) {
      assert.ok(!brief(role).includes(other + ':'));
    }
  }
});
