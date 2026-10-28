'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { Sessions } = require('../electron/sessions.cjs');
const { closeReviewPanel } = require('../electron/review-panel.cjs');
const { Delegation, parseReply, progressLines, progressStream, progressLog, appendLog, reviewerLaunch, reviewBrief } = require('../electron/delegation.cjs');

test('Claude stream-json keeps the final result and old JSON replies', () => {
  const result = { type: 'result', result: 'VERDICT: approve\nFINDINGS:\n- none', usage: { input_tokens: 3 }, num_turns: 2 };
  const stream = [{ type: 'assistant', message: { content: [{ type: 'text', text: 'Checking edges' }] } }, result, { type: 'system' }].map(x => JSON.stringify(x)).join('\n');
  assert.equal(parseReply('claude', stream).verdict, 'approve');
  assert.equal(parseReply('claude', JSON.stringify({ result: result.result })).verdict, 'approve');
  assert.equal(parseReply('claude', stream).usage.inputTokens, 3);
  assert.throws(() => parseReply('claude', JSON.stringify({ type: 'result', is_error: true, result: 'Failed' })), /Failed/);
  const args = reviewerLaunch('claude', '/usr/bin/claude.exe', {}).args;
  assert.ok(args.includes('stream-json') && args.includes('--verbose'));
  assert.ok(reviewerLaunch('codex', '/usr/bin/codex.exe', { outFile: 'reply' }).args.includes('--json'));
});

test('readable Claude and Codex progress excludes raw tool output, commands and tokens', () => {
  const claude = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/app.js' } }, { type: 'tool_use', name: 'Grep', input: { pattern: 'private query' } }, { type: 'text', text: 'Checking edges' }] } };
  assert.deepEqual(progressLines('claude', JSON.stringify(claude)), ['Reading src/app.js', 'Searching files', 'Checking edges']);
  assert.deepEqual(progressLines('claude', JSON.stringify({ type: 'user', message: { content: 'PRIVATE BRIEF' } })), []);
  assert.deepEqual(progressLines('codex', JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'env SECRET=value' } })), ['Running read-only command']);
  assert.deepEqual(progressLines('codex', JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', aggregated_output: 'secret' } })), []);
  assert.deepEqual(progressLines('codex', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Checking branches' } })), ['Checking branches']);
  assert.deepEqual(progressLines('codex', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 99 } })), []);
  assert.deepEqual(progressLines('claude', 'broken json'), []);
  assert.deepEqual(progressLines('claude', 'null'), []);
  assert.deepEqual(progressLines('claude', JSON.stringify({ type: 'assistant', message: { content: [null] } })), []);
});

test('Kiro strips ANSI and partial UTF-8 and JSON lines are assembled', () => {
  assert.deepEqual(progressLines('kiro', '\x1b[32mReading app.js\x1b[0m\x1b]0;hidden\x07'), ['Reading app.js']);
  const lines = [], stream = progressStream('codex', x => lines.push(x));
  const buffer = Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Checking café' } }) + '\n');
  for (const byte of buffer) stream.push(Buffer.from([byte]));
  stream.end(); assert.deepEqual(lines, ['Checking café']);
  const kiro = progressStream('kiro', x => lines.push(x));
  kiro.push('\x1b[3'); kiro.push('2mReading file\x1b[0m'); kiro.end();
  assert.equal(lines.at(-1), 'Reading file');
  const oversized = progressStream('kiro', x => lines.push(x));
  oversized.push('x'.repeat(300_000)); oversized.push('discard tail\nNext line\n'); oversized.end();
  assert.equal(lines.at(-1), 'Next line'); assert.ok(!lines.includes('discard tail'));
  oversized.end(); assert.equal(lines.at(-1), 'Next line', 'ending twice does not append empty progress');
  const partial = progressStream('kiro', x => lines.push(x));
  partial.push('Last partial line'); partial.end();
  assert.equal(lines.at(-1), 'Last partial line', 'a final line without a newline is retained');
});

test('logs keep the last 400 lines and 200 KB, excluding brief, environment and tokens', () => {
  const job = { log: [] }, write = progressLog({ brief: 'PRIVATE BRIEF\n+secret diff text', environment: { API_TOKEN: 'env-secret-value' }, append: line => appendLog(job, line) });
  write('PRIVATE BRIEF\n+secret diff text\nReading app.js\nenv-secret-value\nBearer abc123\nAPI_KEY=hidden');
  assert.match(job.log.join('\n'), /Reading app.js/);
  assert.doesNotMatch(job.log.join('\n'), /PRIVATE|secret diff|env-secret-value|abc123|hidden/);
  for (let i = 0; i < 450; i++) write(`line ${i}`);
  assert.equal(job.log.length, 400); assert.equal(job.log[0], 'line 50'); assert.equal(job.log.at(-1), 'line 449');
  for (let i = 0; i < 100; i++) appendLog(job, '界'.repeat(4000));
  assert.ok(job.log.reduce((n, line) => n + Buffer.byteLength(line) + 1, 0) <= 200_000);
});

test('brief filtering preserves verdicts, findings and progress containing short syntax', () => {
  const job = { log: [] }, brief = reviewBrief({ focus: 'PRIVATE_FOCUS_TEXT', changes: { untracked: [], omitted: 0, base: 'HEAD', diff: '}\n+\n+PRIVATE_DIFF_TEXT\n' } });
  const write = progressLog({ brief, append: line => appendLog(job, line) });
  const stream = progressStream('kiro', write);
  stream.push('What to check: PRIVATE_FOCUS_TEXT\n+PRIVATE_DIFF_TEXT\nReading src/app.js + surrounding code\nChecking a closing }\n');
  stream.push('VERDICT: changes-requested\nFINDINGS:\n- src/app.js:1 — medium — handle } — add a guard'); stream.end();
  assert.deepEqual(job.log, ['Reading src/app.js + surrounding code', 'Checking a closing }', 'VERDICT: changes-requested', 'FINDINGS:', '- src/app.js:1 — medium — handle } — add a guard']);
  write('VERDICT: approve\nFINDINGS:\n- none');
  assert.deepEqual(job.log.slice(-3), ['VERDICT: approve', 'FINDINGS:', '- none']);
});

test('token redaction preserves long paths and identifiers', () => {
  const job = { log: [] }, write = progressLog({ append: line => appendLog(job, line) });
  const file = 'src/components/' + 'very-long-folder-name/'.repeat(5) + 'app.js', identifier = 'longidentifier'.repeat(5), token = 'aA9b'.repeat(12);
  write(`Reading ${file}\nChecking ${identifier}\nReceived ${token}`);
  assert.deepEqual(job.log, [`Reading ${file}`, `Checking ${identifier}`, 'Received [redacted]']);
});

function fixture(t, settings = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-review-panel-'));
  const sessions = new Sessions(root, { grid: { columns: 2, rows: 2 }, pty: { spawn() { throw new Error('No terminal expected'); } } });
  const children = [];
  const delegation = new Delegation(root, {
    getSettings: () => ({ delegationEnabled: true, ...settings }), candidates: () => [{ id: 'kiro:default', provider: 'kiro', label: 'Kiro', executable: '/mock/kiro' }], getLimits: () => [], environment: () => ({ TOKEN: 'PRIVATE_TOKEN_VALUE' }),
    openPanel: job => sessions.createReviewPanel(job),
    panelOpen: id => sessions.items.get(id)?.kind === 'review',
    run: (_exe, args, _options, callback) => callback(null, args.includes('diff') ? (args.includes('--name-only') ? 'app.js\n' : '+PRIVATE_DIFF_TEXT\n') : ''),
    spawnProcess: () => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdin = { on() {}, end(brief) { child.brief = brief; } }; child.kill = () => { child.killed = true; }; children.push(child); return child;
    }, saveResult: async () => ({ id: 'saved-review' })
  });
  t.after(() => { delegation.stopAll(); fs.rmSync(root, { recursive: true, force: true }); });
  const start = () => delegation.start({ focus: 'PRIVATE_FOCUS_TEXT' }, { sessionId: 'caller', cwd: root, consoleName: 'Builder', context: { project: root } });
  return { sessions, delegation, start, children };
}

test('starting a review opens a panel; drag, resize and close preserve the running job', async t => {
  const f = fixture(t), started = await f.start();
  const panel = f.sessions.codePanels()[0]; assert.equal(panel.kind, 'review'); assert.equal(panel.reviewId, started.id);
  assert.equal(f.sessions.list().length, 0); assert.equal(f.sessions.savedConsoles().length, 0);
  assert.throws(() => f.sessions.write(panel.id, 'do something'), /read-only review panel/);
  f.sessions.layout({ id: panel.id, slot: 3, width: 2 });
  assert.equal(f.sessions.codePanels()[0].slot, 3);
  f.children[0].stdout.emit('data', f.children[0].brief + '\n');
  assert.doesNotMatch(f.delegation.snapshot()[0].log.join('\n'), /PRIVATE_FOCUS_TEXT|PRIVATE_DIFF_TEXT/, 'private focus and diff lines stay out of progress');
  f.children[0].stdout.emit('data', 'PRIVATE_FOCUS_TEXT\n+PRIVATE_DIFF_TEXT\nPRIVATE_TOKEN_VALUE\nReading app.js\n');
  assert.deepEqual(f.delegation.snapshot()[0].log.slice(-2), ['[redacted]', 'Reading app.js']);
  f.sessions.end(panel.id);
  assert.equal(f.sessions.codePanels().length, 0); assert.equal((await f.delegation.status(started.id)).state, 'running');
  assert.ok(!f.children[0].killed);
  const waiting = f.delegation.status(started.id, { waitSeconds: 5 });
  f.children[0].stdout.emit('data', 'VERDICT: approve\nFINDINGS:\n- none'); f.children[0].emit('close', 0);
  const done = await waiting; assert.equal(done.verdict, 'approve'); assert.equal(done.resultId, 'saved-review');
  assert.deepEqual(f.delegation.jobs.get(started.id).log.slice(-4), ['VERDICT: approve', 'FINDINGS:', '- none', 'Verdict: approve']);
  assert.deepEqual(f.delegation.snapshot()[0].log, [], 'finished jobs without panels publish metadata only');
});

test('a full grid keeps every panel in place and runs the review with No free slot', async t => {
  const f = fixture(t);
  f.sessions.items.set('wide', { id: 'wide', alive: true, slot: 1, width: 2, height: 2, kind: 'web' });
  const before = JSON.stringify([...f.sessions.items.values()]);
  const started = await f.start();
  assert.equal(started.state, 'running'); assert.equal(f.delegation.snapshot()[0].noFreeSlot, true);
  assert.equal(JSON.stringify([...f.sessions.items.values()]), before); assert.deepEqual(f.sessions.grid, { columns: 2, rows: 2 });
});

test('panels can be disabled and pending openings reserve their cells', async t => {
  const off = fixture(t, { delegationPanels: false }); await off.start();
  assert.equal(off.sessions.codePanels().length, 0); assert.equal(off.delegation.snapshot()[0].noFreeSlot, false);
  const f = fixture(t); f.sessions.starting.set('opening', { alive: true, slot: 1, width: 2, height: 2 });
  await f.start(); assert.equal(f.sessions.codePanels().length, 0); assert.equal(f.delegation.snapshot()[0].noFreeSlot, true);
});

test('snapshots retain old panel jobs and publish logs only for running jobs or open panels', t => {
  const f = fixture(t);
  for (let i = 0; i < 25; i++) f.delegation.jobs.set(`done-${i}`, { id: `done-${i}`, state: 'done', startedAt: i, log: ['Archived log'], panelId: null });
  f.sessions.items.set('old-panel', { id: 'old-panel', kind: 'review' });
  f.delegation.jobs.set('old-open', { id: 'old-open', state: 'done', startedAt: -1, panelId: 'old-panel', log: ['Panel log'] });
  f.delegation.jobs.set('old-running', { id: 'old-running', state: 'running', startedAt: -2, log: ['Live log'] });
  const snapshot = f.delegation.snapshot();
  assert.equal(snapshot.length, 22);
  assert.deepEqual(snapshot.find(x => x.id === 'old-open').log, ['Panel log']);
  assert.deepEqual(snapshot.find(x => x.id === 'old-running').log, ['Live log']);
  assert.ok(snapshot.filter(x => x.id.startsWith('done-')).every(x => x.log.length === 0));
  assert.deepEqual(f.delegation.jobs.get('done-24').log, ['Archived log'], 'publishing does not discard stored logs');
  f.sessions.items.delete('old-panel');
  assert.ok(!f.delegation.snapshot().some(x => x.id === 'old-open'));
});

test('review.close validates kind, clears only its slot name and keeps its delegation running', async t => {
  const f = fixture(t), started = await f.start(), panel = f.sessions.codePanels()[0], saved = [];
  let settings = { slotNames: { [panel.slot]: 'Review slot', 4: 'Builder' }, delegationPanels: true };
  const options = { sessions: f.sessions, getSettings: () => settings, persistSettings: next => { saved.push(next); settings = next; } };
  for (const kind of ['code', 'web', undefined]) {
    f.sessions.items.set('other', { id: 'other', kind, slot: 4 });
    assert.throws(() => closeReviewPanel('other', options), /Open a review panel first/);
    assert.ok(f.sessions.items.has('other'));
  }
  assert.throws(() => closeReviewPanel('missing', options), /Open a review panel first/);
  assert.equal(saved.length, 0);
  closeReviewPanel(panel.id, options);
  assert.equal(saved.length, 1); assert.deepEqual(settings.slotNames, { 4: 'Builder' });
  assert.equal(settings.delegationPanels, true); assert.ok(!f.sessions.items.has(panel.id));
  assert.equal((await f.delegation.status(started.id)).state, 'running'); assert.ok(!f.children[0].killed);
});

test('Stop from a panel marks its job stopped and appends Stopped to the live log', async t => {
  const f = fixture(t), started = await f.start();
  const panel = f.sessions.codePanels()[0];
  f.delegation.stop(panel.reviewId);
  assert.equal((await f.delegation.status(started.id)).state, 'stopped');
  assert.equal(f.delegation.snapshot()[0].log.at(-1), 'Stopped');
  assert.ok(f.children[0].killed); assert.ok(f.sessions.items.has(panel.id));
});
