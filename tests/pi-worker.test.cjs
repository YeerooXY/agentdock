'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { piRoute, piLaunch, piPrompt, piState, piEvent, piReply, piProgress } = require('../electron/pi-worker.cjs');

const prompt = path.join(os.tmpdir(), 'paddock-pi-private', 'prompt.txt');
const work = path.join(os.tmpdir(), 'paddock-pi-work');
const argv = launch => launch.executable.toLowerCase().endsWith('powershell.exe') ? launch.args.at(-1) : launch.args.join(' ');
const assistant = (text, usage, extra = {}) => ({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop', usage, ...extra } });
const usage = (input, output, cacheRead = 0, cacheWrite = 0, cost = 0) => ({ input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite, cost: { total: cost } });

test('SDK effort downgrade stops before inference; omitted effort preserves adapter default', t => {
  const { spawnSync } = require('node:child_process');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-pi-effort-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const sdk = path.join(folder, 'mock.mjs'), config = path.join(folder, 'config.json');
  fs.writeFileSync(sdk, `
    export const SettingsManager={inMemory:x=>x};
    export const ModelRuntime={create:async()=>({getAvailable:async()=>[{id:'test',provider:'mock'}]})};
    export const SessionManager={inMemory:()=>({})};
    export const createExtensionRuntime=()=>({});
    export async function createAgentSession(){return {session:{thinkingLevel:'off',dispose(){},
      subscribe(){},prompt(){throw Error('Inference must not run');}}};}
  `);
  const runner = path.resolve(__dirname, '../electron/pi-worker-runner.mjs');
  for (const effort of ['high', undefined]) {
    fs.writeFileSync(config, JSON.stringify({route:{provider:'mock',model:'test'},workFolder:folder,effort}));
    const result = spawnSync(process.execPath, [runner,sdk,config,'--prepare-only'], {encoding:'utf8'});
    const events = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(result.status, effort ? 1 : 0);
    assert.equal(events[0].type, 'worker_effort');
    assert.equal(events[0].effective, 'off');
    assert.equal(events.some(e => e.type === 'worker_prepared'), !effort);
  }
});

test('routes split provider from slash-containing model ids and reject option injection', () => {
  assert.deepEqual(piRoute('openrouter/cohere/north-mini-code:free'), { provider: 'openrouter', model: 'cohere/north-mini-code:free' });
  assert.deepEqual(piRoute('moonshotai/kimi-k2.6'), { provider: null, model: 'moonshotai/kimi-k2.6' });
  assert.deepEqual(piRoute({ provider: 'openrouter', model: 'moonshotai/kimi-k2.6' }), { provider: 'openrouter', model: 'moonshotai/kimi-k2.6' });
  assert.equal(piRoute(''), null); assert.equal(piRoute(undefined), null);
  for (const bad of ['--tools=bash', '-e builtin:mcp', 'openrouter/', 'a//b', 'x y', 'a;b', { provider: '--x', model: 'm' }, { provider: 'a/b', model: 'm' }])
    assert.throws(() => piRoute(bad), /invalid/);
});

test('launch isolates retries, resources and tool access in the native SDK runner', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-pi-sdk-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const promptFile = piPrompt(folder, 'Bounded task');
  const options = { model: 'openrouter/cohere/north-mini-code:free', workFolder: work, promptFile, sdkPath: '/native/pi-sdk.js' };
  const launch = piLaunch('pi.exe', options);
  assert.equal(launch.executable, process.execPath);
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, '1');
  assert.match(launch.args[0], /pi-worker-runner.mjs$/);
  const config = JSON.parse(fs.readFileSync(launch.args[2], 'utf8'));
  assert.deepEqual(config.route, { provider: 'openrouter', model: 'cohere/north-mini-code:free' });
  assert.equal(config.review, false); assert.equal(config.workFolder, work);
  const source = fs.readFileSync(launch.args[0], 'utf8');
  assert.match(source, /retry: \{ enabled: false/); assert.match(source, /compaction: \{ enabled: false/);
  assert.match(source, /responses > 12/); assert.match(source, /calls > 24/);
  const review = piLaunch('pi.exe', { ...options, review: true });
  assert.equal(JSON.parse(fs.readFileSync(review.args[2], 'utf8')).review, true);
  const thinking = piLaunch('pi.exe', { ...options, effort: 'high' });
  assert.equal(JSON.parse(fs.readFileSync(thinking.args[2], 'utf8')).effort, 'high');
  assert.equal(thinking.effortDispatch.key, 'thinkingLevel');
  const state = piState(); piEvent(state, {type:'worker_effort',effective:'high'});
  assert.deepEqual(state.effortEffective, {value:'high',source:'Pi SDK'});
  assert.throws(() => piLaunch('pi.exe', { ...options, model: '' }), /explicit/);
  assert.throws(() => piLaunch('pi.exe', { ...options, promptFile: undefined }), /prompt file/);
  assert.throws(() => piLaunch('pi.exe', { ...options, workFolder: folder }), /outside/);
});

test('prompt is written privately and never placed in arguments', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-pi-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = piPrompt(folder, 'secret brief --tools bash');
  assert.equal(fs.readFileSync(file, 'utf8'), 'secret brief --tools bash');
  assert.ok(!piLaunch('pi.exe', { promptFile: file, model: 'openrouter/test:free', sdkPath: '/native/pi-sdk.js' }).args.some(x => x.includes('secret brief')));
});

test('agent_settled is terminal; agent_end is not', () => {
  const s = piState();
  piEvent(s, assistant('Done. VERDICT: approve', usage(100, 20, 300, 50, 0.01)));
  piEvent(s, { type: 'agent_end' });
  assert.equal(s.complete, false);
  piEvent(s, { type: 'agent_settled' });
  assert.equal(s.complete, true); assert.equal(s.error, false);
  assert.deepEqual(s.usage, { inputTokens: 450, outputTokens: 20, cachedInputTokens: 300, reportedCost: 0.01, turns: 1 });
  piEvent(s, assistant('late', usage(1, 1)));
  assert.equal(s.text, 'Done. VERDICT: approve');
});

test('usage accumulates per assistant response, dedupes repeats and ignores non-assistant messages', () => {
  const s = piState();
  piEvent(s, assistant('step', usage(10, 5, 2), { responseId: 'a', stopReason: 'toolUse' }));
  piEvent(s, assistant('step', usage(10, 5, 2), { responseId: 'a', stopReason: 'toolUse' }));
  piEvent(s, { type: 'message_end', message: { role: 'user', content: [{ type: 'text', text: 'ignored' }], usage: usage(999, 999) } });
  piEvent(s, { type: 'message_end', message: { role: 'toolResult', content: [{ type: 'text', text: 'ignored' }] } });
  piEvent(s, assistant('final', usage(20, 7, 3, 1), { responseId: 'b' }));
  piEvent(s, { type: 'agent_settled' });
  assert.deepEqual(s.usage, { inputTokens: 36, outputTokens: 12, cachedInputTokens: 5, reportedCost: 0, turns: 2 });
  assert.equal(piReply([JSON.stringify(assistant('final', usage(1, 1))), '{"type":"agent_settled"}'].join('\n')).text, 'final');
});

test('unknown, negative, non-finite and missing counters stay unknown', () => {
  for (const bad of [{ input: 1, output: 1 }, { input: -1, output: 1, cacheRead: 0, cacheWrite: 0 }, { input: Infinity, output: 1, cacheRead: 0, cacheWrite: 0 }, null, 'x']) {
    const s = piState();
    piEvent(s, assistant('a', usage(5, 5), { responseId: '1' }));
    piEvent(s, assistant('b', bad, { responseId: '2' }));
    assert.equal(s.usage.inputTokens, null, JSON.stringify(bad));
    assert.equal(s.usage.turns, 2);
  }
  const s = piState(); piEvent(s, assistant('a', { input: 1, output: NaN, cacheRead: 0, cacheWrite: 0 }));
  assert.equal(s.usage.outputTokens, null); assert.equal(s.usage.reportedCost, null);
});

test('error and aborted are sticky and fail the reply', () => {
  for (const events of [
    [assistant('', usage(1, 0), { stopReason: 'error', errorMessage: 'rate limited' }), assistant('recovered', usage(1, 1)), { type: 'agent_settled' }],
    [assistant('partial', usage(1, 1), { stopReason: 'aborted' }), { type: 'agent_settled' }],
    [assistant('ok', usage(1, 1)), { type: 'agent_settled', aborted: true }],
    [assistant('ok', usage(1, 1)), { type: 'agent_end' }],
    [{ type: 'agent_settled' }]]) {
    assert.throws(() => piReply(events.map(e => JSON.stringify(e)).join('\n') + '\nnot json'), /no successful final answer/);
  }
  const s = piState(); piEvent(s, assistant('', usage(1, 0), { stopReason: 'error' })); piEvent(s, assistant('fine', usage(1, 1))); assert.equal(s.error, true);
});

test('text is bounded and progress reports only tools and assistant text', () => {
  const s = piState(10); piEvent(s, assistant('x'.repeat(50)));
  assert.equal(s.text.length, 10);
  assert.deepEqual(piProgress({ type: 'tool_execution_start', toolName: 'edit' }), ['Using project tool']);
  assert.deepEqual(piProgress(assistant('hello')), ['hello']);
  assert.deepEqual(piProgress({ type: 'message_update' }), []);
  assert.equal(piEvent(s, null), s);
});

test('worker budget failure has a fixed diagnostic and remains failed after final text', () => {
  const state = piState();
  piEvent(state, { type: 'worker_limit', kind: 'budget', responses: 13, calls: 8 });
  piEvent(state, assistant('Author authentication component written.', usage(1, 1)));
  piEvent(state, { type: 'agent_settled', aborted: true });
  assert.equal(state.error, true);
  assert.equal(state.failureReason, 'Pi reached its bounded worker response or tool-call limit.');
});
