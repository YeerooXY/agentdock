'use strict';
const fs = require('node:fs');
const path = require('node:path');
const guides = [{ id: 'web-design', name: 'Web design', description: 'Page design, accessibility and your 20-point page review.', content: fs.readFileSync(path.join(__dirname, '..', 'guides', 'web-design.md'), 'utf8') }];
function guideIds(value) {
  if (!Array.isArray(value) || value.some(id => !guides.some(guide => guide.id === id))) throw new Error('Choose an available guide.');
  return [...new Set(value)];
}
module.exports = { guides, guideIds };
