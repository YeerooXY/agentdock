'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { inputHash, nativeEnvironment, prepareTrial, inspectInit, runNative, scoreTrial, main } = require('../scripts/standalone-skill-pilot.cjs');

test('unsupported repeat arguments fail rather than silently running one trial', async () => {
  await assert.rejects(main(['--repeats=5']), /Unsupported option/);
});

test('native environment removes app context, API fallback and vault credentials', () => {
  const env = nativeEnvironment({ PATH: 'tools', APPDATA: 'profile', ANTHROPIC_API_KEY: 'secret', ANTHROPIC_BASE_URL: 'paid-fallback', CLAUDE_CODE_USE_BEDROCK: '1', PADDOCK_PROFILE: 'app', VAULT_KEY: 'private' });
  assert.equal(env.PATH, 'tools');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'PADDOCK_PROFILE', 'VAULT_KEY']) assert.equal(env[key], undefined);
});

test('paired conditions preserve identical tasks and source while adding only selected skill context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-pilot-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'selected'); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'SKILL.md'), 'Selected skill');
  const task = { id: 'test', skill: 'selected', prompt: 'Same task', files: { 'src/app.js': 'const value = 1;' } };
  const plain = prepareTrial(root, task, 'plain', 1), skill = prepareTrial(root, task, 'skill', 1, () => source);
  assert.equal(plain.inputHash, skill.inputHash); assert.equal(plain.promptHash, skill.promptHash);
  assert.equal(inputHash(task.files), plain.inputHash);
  assert.equal(fs.existsSync(path.join(plain.folder, '.pilot-skill')), false);
  assert.equal(fs.readFileSync(path.join(skill.folder, '.pilot-skill/SKILL.md'), 'utf8'), 'Selected skill');
  assert.match(skill.instruction, /Paddock is absent/);
  assert.match(fs.readFileSync(skill.instructionFile, 'utf8'), /Selected skill/);
  assert.deepEqual(skill.loadedSkillFiles, ['SKILL.md']);
  assert.equal(inspectInit({ tools: ['Read'], mcp_servers: [], skills: [] }).isolated, true);
  assert.equal(inspectInit({ tools: ['mcp__paddock__dock_context'], mcp_servers: [], skills: [] }).isolated, false);
  assert.equal(inspectInit({ tools: ['Read'], mcp_servers: [], skills: ['global-skill'] }).isolated, false);
  const score = scoreTrial({ ...task, verify: () => ({ passed: true, checks: [] }) }, plain, { nativeSuccess: true });
  assert.equal(score.accepted, true);
  fs.writeFileSync(path.join(plain.folder, 'src/app.js'), 'changed');
  assert.equal(scoreTrial({ ...task, verify: () => ({ passed: true, checks: [] }) }, plain, { nativeSuccess: true }).accepted, false);
  fs.writeFileSync(path.join(skill.folder, '.pilot-skill/SKILL.md'), 'changed instructions');
  const altered = scoreTrial({ ...task, verify: () => ({ passed: true, checks: [] }) }, skill, { nativeSuccess: true });
  assert.equal(altered.changedSkillContext, true); assert.equal(altered.accepted, false);
  assert.throws(() => prepareTrial(root, task, 'plain', 1), /EEXIST/);
});

test('native runner captures real work and usage with hidden launches and no Paddock wrapper', async () => {
  let called;
  const launch = (command, args, options) => {
    called = { args, options }; const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    child.stdin.on('finish', () => {
      child.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'fixed-model', tools: ['Read', 'Write'], skills: [], mcp_servers: [] }) + '\n');
      child.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }) + '\n');
      child.stdout.write(JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Output token limit hit. Resume directly.' }] } }) + '\n');
      child.stdout.write(JSON.stringify({ type: 'result', is_error: false, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 }, num_turns: 2 }) + '\n');
      child.emit('close', 0);
    }); return child;
  };
  const run = await runNative({ executable: 'native', trial: { folder: 'fixture', prompt: 'Task', instructionFile: 'actual-skill.txt' }, model: 'fixed-model', emptyMcp: 'empty.json', maxOutputTokens: 8192, maxTurns: 24, effort: 'medium', launch });
  assert.equal(called.options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '8192');
  assert.equal(called.args[called.args.indexOf('--max-turns') + 1], '24');
  assert.equal(called.args[called.args.indexOf('--effort') + 1], 'medium');
  assert.equal(run.maxTurns, 24); assert.equal(run.effort, 'medium');
  assert.equal(run.maxOutputTokens, 8192); assert.equal(run.outputLimitContinuations, 1);
  assert.equal(run.nativeSuccess, true); assert.equal(run.usage.inputTokens, 17); assert.equal(run.usage.cachedInputTokens, 7);
  assert.deepEqual(run.toolsUsed, ['Read']); assert.equal(called.options.windowsHide, true);
  assert.ok(called.args.includes('--safe-mode')); assert.ok(called.args.includes('--disable-slash-commands'));
  assert.ok(called.args.includes('--strict-mcp-config')); assert.ok(!called.args.includes('--bare'));
  assert.equal(called.args[called.args.indexOf('--append-system-prompt-file') + 1], 'actual-skill.txt');
});


test('invalid output limits fail before launching a native model', async () => {
  let launches = 0;
  for (const maxOutputTokens of [0, 255, 16385, NaN, '8192', 400.5]) {
    await assert.rejects(runNative({ maxOutputTokens, launch: () => { launches++; } }), /output token limit/);
  }
  await assert.rejects(main(['--max-output-tokens=invalid']), /output token limit/);
  assert.equal(launches, 0);
});


test('invalid turn and effort bounds cannot launch a model', async () => {
  for (const options of [{ maxTurns: 0 }, { maxTurns: 41 }, { maxTurns: '24' }, { effort: 'unknown' }]) {
    await assert.rejects(runNative({ ...options, launch: () => { throw Error('unexpected launch'); } }), /bounded turn limit/);
  }
});
