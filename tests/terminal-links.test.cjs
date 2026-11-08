'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { Terminal } = require('@xterm/headless');
const { webLinkHandler } = require('../src/file-links.js');

test('OSC 8 activation opens only HTTP(S) targets through the terminal handler', async () => {
  const source = fs.readFileSync('src/console/terminals.js', 'utf8');
  assert.match(source, /linkHandler:\s*webLinkHandler\(/);
  const opened = [];
  const handler = webLinkHandler(text => opened.push(text));
  const term = new Terminal({ cols: 80, rows: 2, allowProposedApi: true });
  try {
    await new Promise(resolve => term.write('\x1b]8;;https://example.com\x07Example\x1b]8;;\x07', resolve));
    assert.equal(term.buffer.active.getLine(0).translateToString(true), 'Example');
    // xterm invokes ILinkHandler.activate(event, text, range) on an OSC 8 click.
    handler.activate({ button: 0 }, 'https://example.com', { start: { x: 1, y: 1 }, end: { x: 7, y: 1 } });
    handler.activate({ button: 0 }, 'javascript:alert(1)', { start: { x: 1, y: 1 }, end: { x: 7, y: 1 } });
    assert.deepEqual(opened, ['https://example.com']);
  } finally { term.dispose(); }
});
