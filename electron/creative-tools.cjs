'use strict';
// Optional suggestions, not automatic installs or claims of Adobe feature parity.
const creativeTools = [
  ['photocraft', 'PhotoCraft', 'Layered images and PSD editing'],
  ['vectorcraft', 'VectorCraft', 'Vector illustration and SVG'],
  ['filmcraft', 'FilmCraft', 'Video editing, color and sound'],
  ['lightcraft', 'LightCraft', 'Photo libraries and raw development'],
  ['pdfcraft', 'PdfCraft', 'PDF reading and document organization'],
  ['effectcraft', 'EffectCraft', 'Motion graphics and effects'],
  ['designcraft', 'DesignCraft', 'Page layout and publishing']
].map(([id, name, purpose]) => ({ id, name, purpose, command: `${id}-cli`, args: ['mcp'],
  docs: `https://github.com/storytold/${id}`, description: `${purpose}. Optional free creative tool; inspect its discovered MCP capabilities before use.` }));
module.exports = { creativeTools };
