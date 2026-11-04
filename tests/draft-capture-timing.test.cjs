'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sessions } = require('../electron/sessions.cjs');

// A CLI that redraws its composer only after the editor helper has reported
// and exited, with a pause longer than the quiet period before that.
function slowEditorConsole({ backgroundOutput = false, wrappedMarker = false } = {}) {
  const session = { id: 's', launchId: 'l', provider: 'codex', alive: true, draftSupported: true, sequence: 1, lastOutputAt: Date.now() - 1000, buffer: 'prompt' };
  let composer = '', pendingMarker = null;
  const output = text => { session.buffer += text; session.sequence++; session.lastOutputAt = Date.now(); };
  session.terminal = { write: data => {
    if (data === '\x07') return;
    if (/^\x7f+$/.test(data)) { composer = composer.slice(0, Math.max(0, composer.length - data.length)); output('redraw'); }
  } };
  const sessions = Object.create(Sessions.prototype);
  sessions.draftQuietMs = 60;
  sessions.draftBridge = { request: async (id, launchId, mode, marker) => {
    output('Save and close external editor to continue.');
    await new Promise(resolve => setTimeout(resolve, 150)); // the helper starts and reports
    pendingMarker = marker; const captured = composer;
    if (backgroundOutput) setTimeout(() => output('unrelated status redraw'), 10);
    setTimeout(() => {
      composer += pendingMarker;
      const displayed = wrappedMarker ? pendingMarker.slice(0, 12) + '\x1b[0m\r\n' + pendingMarker.slice(12) : pendingMarker;
      output('composer ' + displayed);
    }, backgroundOutput ? 300 : 120); // redraw after exit
    return captured;
  } };
  return { sessions, session, composer: () => composer };
}

test('draft capture waits for the composer redraw before deleting its marker', async () => {
  const { sessions, session, composer } = slowEditorConsole();
  assert.equal(await sessions.captureNativeDraft(session), '');
  assert.equal(composer(), '', 'no marker is left in the composer');
});

test('background output after the editor acknowledgement cannot trigger early marker deletion', async () => {
  const { sessions, session, composer } = slowEditorConsole({ backgroundOutput: true });
  assert.equal(await sessions.captureNativeDraft(session), '');
  assert.equal(composer(), '', 'capture preserves the exact original draft');
});

test('draft marker detection tolerates ANSI styling and line wrapping', async () => {
  const { sessions, session, composer } = slowEditorConsole({ wrappedMarker: true });
  assert.equal(await sessions.captureNativeDraft(session), '');
  assert.equal(composer(), '');
});

test('an absent draft marker times out without sending deletion keys', async () => {
  const sessions = Object.create(Sessions.prototype), writes = [];
  const session = { alive: true, buffer: 'unrelated status update', terminal: { write: data => writes.push(data) } };
  await assert.rejects(sessions.removeNativeDraftMarker(session, 'PDK' + 'a'.repeat(32), { timeout: 1 }), /did not display/);
  assert.deepEqual(writes, []);
});
