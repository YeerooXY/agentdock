'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { capabilities, NATIVE_WORKERS, extensionPrompt, extensionLaunch, extensionInput, extensionEvent, extensionFinalize, clineToolDecision } = require('../electron/extended-workers.cjs');
const state = () => ({ text: '', usage: null, complete: false, error: false, maxText: 40, seen: new Set() });
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-native-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const work = path.join(root, 'work'), privateDir = path.join(root, 'private'); fs.mkdirSync(work); fs.mkdirSync(privateDir); return { root, work, privateDir }; }

test('Cursor denies shell, MCP and web through a private permission file and writes only in the task folder', t => {
  const { work, privateDir } = temp(t), promptFile = extensionPrompt('cursor', privateDir, 'Task');
  for (const review of [false, true]) {
    const launch = extensionLaunch('cursor', '/native/cursor-agent.exe', { workFolder: work, promptFile, review });
    const config = JSON.parse(fs.readFileSync(path.join(launch.env.CURSOR_CONFIG_DIR, 'cli-config.json'), 'utf8'));
    assert.deepEqual(config.permissions.deny, ['Shell(*)', 'Mcp(*:*)', 'WebFetch(*)']);
    assert.deepEqual(config.permissions.allow, ['Read(**)', ...(review ? [] : [`Write(${path.resolve(work).split(path.sep).join('/')}/**)`])]);
    assert.equal(launch.args.includes('--force') || launch.args.includes('--yolo'), false);
    assert.equal(launch.args.includes('plan'), review);
    assert.ok(launch.env.CURSOR_CONFIG_DIR.startsWith(privateDir), 'the owner Cursor config is never used');
  }
  const s = extensionEvent('cursor', state(), { type: 'result', subtype: 'success', is_error: false, result: 'Done', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 30, cacheWriteTokens: 0 } });
  assert.equal(s.complete, true); assert.equal(s.error, false); assert.deepEqual(s.usage, { inputTokens: 40, outputTokens: 2, cachedInputTokens: 30 });
});
test('unverified launchers remain visible but cannot run as bounded workers', () => {
  for (const p of ['qwen']) { assert.equal(capabilities[p].builder, false); assert.equal(NATIVE_WORKERS.includes(p), false); assert.throws(() => extensionLaunch(p, 'native'), /verified|verification/); }
});
test('Droid permits only file tools and keeps review read-only', t => {
  const { work, privateDir } = temp(t), promptFile = extensionPrompt('droid', privateDir, 'A bounded task');
  for (const review of [false, true]) {
    const { args } = extensionLaunch('droid', '/native/droid.exe', { workFolder: work, promptFile, review });
    const allowed = args[args.indexOf('--only-tools') + 1];
    assert.doesNotMatch(allowed, /Execute|Task|MCP|Fetch|Web/);
    assert.equal(allowed.includes('Edit'), !review); assert.equal(args.includes('--auto'), !review);
    assert.equal(args.includes('--skip-permissions-unsafe'), false);
  }
});
test('Kimi agent file restricts tools without incompatible print flags', t => {
  const { work, privateDir } = temp(t), promptFile = extensionPrompt('kimi', privateDir, 'Task');
  const launch = extensionLaunch('kimi', '/native/kimi.exe', { workFolder: work, promptFile, review: true });
  const profile = fs.readFileSync(launch.args[launch.args.indexOf('--agent-file') + 1], 'utf8');
  assert.match(profile, /subagents: \[\]/); assert.match(profile, /disallowedTools:/); assert.doesNotMatch(profile, /  - (Write|Edit)\n/);
  for (const flag of ['--plan', '--yolo', '--auto']) assert.equal(launch.args.includes(flag), false);
});
test('Cline uses native local backend and a per-launch guard, never owner config', t => {
  const { work, privateDir } = temp(t), promptFile = extensionPrompt('cline', privateDir, 'Task');
  const launch = extensionLaunch('cline', '/native/cline.exe', { workFolder: work, promptFile });
  assert.equal(launch.env.CLINE_SESSION_BACKEND_MODE, 'local');
  assert.deepEqual(JSON.parse(fs.readFileSync(launch.env.CLINE_MCP_SETTINGS_PATH, 'utf8')), { mcpServers: {} });
  assert.equal(launch.args.includes('--config'), false); assert.equal(extensionInput('cline', 'Task'), '');
  const hook = path.join(launch.args[launch.args.indexOf('--hooks-dir') + 1], 'PreToolUse.cjs'); assert.equal(fs.existsSync(hook), true);
});
test('Cline guard rejects command, MCP, skills, subagents and unknown tool names', t => {
  const { work } = temp(t);
  for (const name of ['run_commands', 'fetch_web_content', 'spawn_agent', 'team', 'skills', 'mcp__anything', 'future_tool'])
    assert.equal(clineToolDecision({ tool_call: { name, input: {} } }, work, false).cancel, true);
});
test('Cline guard allows assigned files and denies escaping patches and readonly edits', t => {
  const { work } = temp(t);
  const call = (name, input, review = false) => clineToolDecision({ tool_call: { name, input } }, work, review);
  assert.deepEqual(call('editor', { path: 'src/new.js' }), {});
  assert.equal(call('editor', { path: '../outside.js' }).cancel, true);
  assert.equal(call('editor', { path: 'src/new.js' }, true).cancel, true);
  assert.deepEqual(call('read_files', { files: ['test.js'] }, true), {});
  assert.equal(call('apply_patch', { patch: '*** Begin Patch\n*** Add File: ../outside.js\n+bad\n*** End Patch' }).cancel, true);
  assert.deepEqual(call('apply_patch', { patch: '*** Begin Patch\n*** Add File: src/new.js\n+ok\n*** End Patch' }), {});
  assert.equal(call('editor', {}).cancel, true);
});
test('Cline cumulative receipt is counted once, with cache included in native input', () => {
  const s = state(), event = { type: 'run_result', finishReason: 'completed', text: 'Done', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 60, cacheWriteTokens: 0, totalCost: 0 } };
  extensionEvent('cline', s, event); extensionEvent('cline', s, event);
  assert.equal(s.complete, true); assert.equal(s.error, false); assert.deepEqual(s.usage, { inputTokens: 100, outputTokens: 10, cachedInputTokens: 60, reportedCost: 0 });
  extensionEvent('cline', s, { type: 'run_result', finishReason: 'mistake_limit', text: 'Stopped' }); assert.equal(s.error, true);
});
test('Droid cache totals include fresh, read and write tokens and invalid values stay unknown', () => {
  const s = state(); extensionEvent('droid', s, { type: 'result', subtype: 'success', is_error: false, result: 'Done', usage: { input_tokens: 4, output_tokens: 18, cache_read_input_tokens: 13, cache_creation_input_tokens: 17 } });
  assert.equal(s.usage.inputTokens, 34); assert.equal(s.usage.cachedInputTokens, 13);
  extensionEvent('droid', s, { type: 'result', subtype: 'success', is_error: false, result: 'Done', usage: { input_tokens: -1, output_tokens: Infinity } });
  assert.equal(s.usage.inputTokens, null); assert.equal(s.usage.outputTokens, null); assert.equal(s.usage.cachedInputTokens, null);
});
test('Kimi only completes after native exit zero; missing output, retries and errors fail', () => {
  for (const code of [1, null]) { const s = state(); extensionEvent('kimi', s, { role: 'assistant', content: 'Done' }); extensionFinalize('kimi', s, code); assert.equal(s.complete, false); assert.equal(s.error, true); }
  const s = state(); extensionEvent('kimi', s, { role: 'assistant', content: 'Done' }); assert.equal(s.complete, false); extensionFinalize('kimi', s, 0); assert.equal(s.complete, true); assert.equal(s.usage, null);
  const retry = state(); extensionEvent('kimi', retry, { type: 'retrying' }); extensionEvent('kimi', retry, { role: 'assistant', content: 'Done' }); extensionFinalize('kimi', retry, 0); assert.equal(retry.complete, false);
  const empty = state(); extensionFinalize('kimi', empty, 0); assert.equal(empty.complete, false);
  const nativeRetry = state(); extensionEvent('kimi', nativeRetry, { role: 'meta', type: 'turn.step.retrying', next_attempt: 2 }); assert.equal(nativeRetry.retryAttempted, true); assert.equal(nativeRetry.error, true);
});

test('Cline exact prompt-file read exception grants no write access outside the workspace', t => {
  const { work, privateDir } = temp(t), instruction = path.join(privateDir, 'prompt.txt'); fs.writeFileSync(instruction, 'Task');
  assert.deepEqual(clineToolDecision({ tool_call: { name: 'read_files', input: { files: [instruction] } } }, work, true, [instruction]), {});
  assert.equal(clineToolDecision({ tool_call: { name: 'editor', input: { path: instruction } } }, work, false, [instruction]).cancel, true);
});
