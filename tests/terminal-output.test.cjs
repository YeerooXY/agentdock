'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const outputModule = import('../src/terminal-output.js');

test('terminal output joins fragmented cursor redraws in order without changing ANSI data', async t => {
  const { terminalOutput } = await outputModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [], done = () => {};
  const output = terminalOutput((data, callback) => writes.push([data, callback]), done);
  for (const chunk of ['\x1b[?25', 'l\x1b[H', 'Thinking\r\n', '\x1b[?25h']) output.push(chunk);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(16);
  assert.deepEqual(writes, [['\x1b[?25l\x1b[HThinking\r\n\x1b[?25h', done]]);
  output.dispose();
});

test('large terminal output flushes promptly and disposal cancels pending writes', async t => {
  const { terminalOutput } = await outputModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [], output = terminalOutput(data => writes.push(data));
  const large = 'x'.repeat(65536);
  output.push(large); assert.deepEqual(writes, [large]);
  output.push('next frame'); output.dispose();
  t.mock.timers.tick(1000); output.push('after close'); output.flush();
  assert.deepEqual(writes, [large]);
});

test('cursor redraw arriving after a display frame is painted once, with the cursor restored', async t => {
  const { terminalOutput } = await outputModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [], output = terminalOutput(data => writes.push(data));
  output.push('\x1b[?25l\x1b[Hworking');
  t.mock.timers.tick(24);
  assert.equal(writes.length, 0, 'Do not paint the temporary hidden cursor');
  output.push('\rready\x1b[?25'); t.mock.timers.tick(4);
  output.push('h'); t.mock.timers.tick(0);
  assert.deepEqual(writes, ['\x1b[?25l\x1b[Hworking\rready\x1b[?25h']);
  output.dispose();
});

test('intentional cursor hiding has a bounded delay and normal typing keeps its short flush', async t => {
  const { terminalOutput } = await outputModule;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [], output = terminalOutput(data => writes.push(data));
  output.push('\x1b[?25l'); t.mock.timers.tick(16); t.mock.timers.tick(32);
  assert.deepEqual(writes, ['\x1b[?25l']);
  output.push('typing'); t.mock.timers.tick(16);
  assert.deepEqual(writes, ['\x1b[?25l', 'typing']);
  output.push('\x1b]0;literal \x1b[?25l\x07title'); t.mock.timers.tick(16);
  assert.equal(writes.length, 3, 'Control-looking text inside OSC is not a cursor command');
  output.dispose();
});
