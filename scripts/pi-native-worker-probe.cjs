'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { workerLaunch, workerPrompt, workerState, workerEvent } = require('../electron/provider-workers.cjs');
const { readPiUsage } = require('../electron/pi-usage.cjs');
const { usageEnvironment } = require('../electron/subscription-usage.cjs');
const { killTree } = require('../electron/delegation.cjs');
const prepareOnly = process.argv[2] === '--prepare-only';
if (!prepareOnly && process.argv[2] !== '--live') throw Error('Pass --live or --prepare-only explicitly.');
const root = path.resolve(__dirname, '../artifacts/agent-matrix/pi-target-' + Date.now());
fs.mkdirSync(path.join(root, 'work'), { recursive: true }); fs.mkdirSync(path.join(root, 'private'));
const executable = path.join(process.env.APPDATA, 'Paddock/agents/pi/node_modules/.bin/pi.cmd');
const workFolder = path.join(root, 'work'), model = 'openrouter/cohere/north-mini-code:free';
(async () => {
  const allowance = await readPiUsage({ executable, cwd: workFolder, model });
  fs.writeFileSync(path.join(root, 'allowance.json'), JSON.stringify(allowance, null, 2));
  if (!prepareOnly && (allowance[0].modelAllowed !== true || allowance[0].funding !== 'free')) throw Error('Verified free allowance required.');
  const brief = 'Create result.json with exactly {"localFirst":true,"textInArtwork":false,"radiatingStrokes":false}. Use the write file tool once; no other tools. Finish with one short sentence.';
  const launch = workerLaunch('pi', executable, { workFolder, model, promptFile: workerPrompt('pi', path.join(root, 'private'), brief) });
  if (prepareOnly) launch.args.push('--prepare-only');
  const state = workerState(), startedAt = Date.now(); let buffer = '', timedOut = false, prepared = false;
  const child = spawn(launch.executable, launch.args, { cwd: workFolder, env: { ...usageEnvironment(), ...launch.env }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
  const timer = setTimeout(() => { timedOut = true; killTree(child); }, 60000);
  child.stdout.on('data', b => { const lines = (buffer + b.toString()).split('\n'); buffer = lines.pop(); for (const line of lines) { try { const event = JSON.parse(line); prepared ||= event.type === 'worker_prepared' && event.generation === false; workerEvent('pi', state, event); } catch {} } });
  child.stderr.on('data', () => {}); child.stdin.end();
  child.once('close', code => { clearTimeout(timer); let receipt; try { receipt = JSON.parse(fs.readFileSync(path.join(workFolder, 'result.json'), 'utf8')); } catch {}
    const report = { model, code, timedOut, elapsedMs: Date.now() - startedAt, complete: state.complete, error: state.error, usage: state.usage, receipt,
      prepareOnly, prepared, passed: code === 0 && !state.error && (prepareOnly ? prepared : state.complete && receipt?.localFirst === true && receipt?.textInArtwork === false && receipt?.radiatingStrokes === false) };
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ root, ...report })); process.exitCode = report.passed ? 0 : 1;
  });
})().catch(error => { console.log(error.message); process.exitCode = 1; });
