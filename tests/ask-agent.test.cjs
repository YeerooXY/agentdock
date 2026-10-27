const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/ask-agent.js');
const sample = { file: 'src/app.js', from: 4, to: 5, text: 'const x = 1;\nrun(x);', folder: 'Paddock' };

test('compares source line ranges with normalized line endings', async () => {
  const { askSelectionChanged: changed } = await modulePromise;
  const selected = { from: 2, to: 3, text: 'second\nthird' };
  assert.equal(changed('first\r\nsecond\r\nthird\r\nlast', selected), false);
  assert.equal(changed('first\nsecond\nthird\nlast', { ...selected, text: 'second\r\nthird' }), false);
  assert.equal(changed('changed outside selection\rsecond\rthird', selected), false);
  assert.equal(changed('first\nchanged\nthird', selected), true);
  assert.equal(changed('first\nsecond', selected), true);
  assert.equal(changed(undefined, selected), true);
  assert.equal(changed(null, selected), true);
  assert.equal(changed('first\n', { from: 2, to: 2, text: '' }), false);
  assert.equal(changed('first', { from: 2, to: 2, text: '' }), true);
});

test('defaults to remembered, followed, same-folder, then first available console', async () => {
  const { defaultAskTarget: choose } = await modulePromise;
  const first = { id: 'first', cwd: 'C:/other' };
  const same = { id: 'same', cwd: 'C:/project' };
  const followed = { id: 'followed', consoleKey: 'source', cwd: 'C:/project' };
  const list = [first, same, followed];
  const options = { sourceKey: 'source', cwd: 'C:/project', platform: 'win32' };
  assert.equal(choose(list, { ...options, rememberedId: 'first' }), first);
  assert.equal(choose(list, options), followed);
  assert.equal(choose(list, { ...options, rememberedId: 'closed' }), followed);
  assert.equal(choose([first, same], options), same);
  assert.equal(choose([first], options), first);
  assert.equal(choose([], options), undefined);
  assert.equal(choose(list, { sourceKey: 'same' }), same);
});

test('matches folder paths using platform case rules and separators', async () => {
  const { defaultAskTarget: choose } = await modulePromise;
  const list = [{ id: 'first', cwd: '/other' }, { id: 'project', cwd: 'C:\\Project\\' }];
  assert.equal(choose(list, { cwd: 'c:/project', platform: 'win32' }), list[1]);
  assert.equal(choose(list, { cwd: 'c:/project', platform: 'linux' }), list[0]);
  assert.equal(choose(list, { cwd: 'C:/Project/', platform: 'linux' }), list[1]);
});

test('formats selected source lines with and without a note', async () => {
  const { formatAskContext: format } = await modulePromise;
  const expected = 'File: src/app.js:4-5  (Paddock)\n```javascript\nconst x = 1;\nrun(x);\n```';
  assert.equal(format(sample), expected);
  assert.equal(format({ ...sample, note: ' Explain this ' }), `Explain this\n\n${expected}`);
  assert.equal(format({ ...sample, note: '   ' }), expected);
});
test('includes branch and diff side, and marks explicitly retained stale snippets', async () => {
  const { formatAskContext: format } = await modulePromise;
  assert.match(format({ ...sample, branch: 'loop/ask-agent', side: 'after' }), /\(Paddock @ loop\/ask-agent, diff after side\)/);
  assert.match(format({ ...sample, stale: true }), /Captured version: the file changed since selection\./);
  assert.doesNotMatch(format(sample), /Captured version/);
});
test('chooses language fences and preserves embedded fences', async () => {
  const { formatAskContext: format } = await modulePromise;
  assert.match(format({ ...sample, file: 'test.py' }), /```python\n/);
  assert.match(format({ ...sample, file: 'README', text: 'plain' }), /\n```\nplain\n```$/);
  assert.match(format({ ...sample, file: 'README.md', text: '```js\nx\n```' }), /\n````markdown\n```js\nx\n```\n````$/);
});
for (const [name, seed] of [['plain text', 'x'], ['embedded fence', '```js\nx\n```']]) {
  test(`enforces the 60,000-character limit with ${name}`, async () => {
    const { formatAskContext: format } = await modulePromise;
    const overhead = format({ ...sample, text: seed }).length - seed.length;
    const text = seed + 'x'.repeat(60000 - overhead - seed.length);
    assert.equal(format({ ...sample, text }).length, 60000);
    assert.throws(() => format({ ...sample, text: text + 'x' }), { message: 'Select fewer than 60,000 characters.' });
    assert.throws(() => format({ ...sample, text: seed, note: 'x'.repeat(60000) }), /Select fewer than 60,000 characters\./);
  });
}
