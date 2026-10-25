'use strict';
const fs = require('node:fs');
const path = require('node:path');
// The compact topics are the bundled web-ux-ui skill's references, so agents
// with and without skill support read the same files.
const folder = path.join(__dirname, '..', 'skills', 'web-ux-ui', 'references');

const topics = Object.freeze({
  overview: 'Choose the page and user task',
  layout: 'First screen, hierarchy and responsive arrangement',
  visual: 'Color, typography, motion and loading',
  content: 'Concrete wording and honest evidence',
  commerce: 'Catalogue, product selection and checkout',
  verification: 'Devices, accessibility, performance and release checks',
  sources: 'Research provenance and primary references',
  checklist: 'Full page and security review requirements'
});

function websiteGuide(topic = 'overview') {
  if (typeof topic !== 'string' || !Object.hasOwn(topics, topic)) throw new Error('Choose an available website guide topic.');
  return {
    topic, title: topics[topic], revision: '2026-10-23',
    evidence: 'Working guidance based on published sources and observed website patterns. Recheck changing standards; observations do not prove conversion gains.',
    content: fs.readFileSync(topic === 'checklist' ? path.join(__dirname, '..', 'guides', 'web-design.md') : path.join(folder, `${topic}.md`), 'utf8'),
    topics: Object.entries(topics).map(([id, title]) => ({ id, title }))
  };
}

module.exports = { websiteGuide, topics };
