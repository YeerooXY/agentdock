'use strict';
// Manual, opt-in verification using the user's signed-in CLI. Never in npm test.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { workerLaunch, workerInput, workerPrompt, workerState, workerEvent } = require('../electron/provider-workers.cjs');
const { usageEnvironment } = require('../electron/subscription-usage.cjs');
const { killTree } = require('../electron/delegation.cjs');
const provider = process.argv[2], executable = process.argv[3];
if (!['antigravity', 'copilot', 'grok'].includes(provider) || !executable || process.argv[4] !== '--live') throw Error('Use provider executable --live explicitly. This uses the connected account allowance.');
const root = path.resolve(__dirname, '../artifacts/provider-workers', new Date().toISOString().replaceAll(':', '-'));
const folder = path.join(root, `${provider}-pilot`); fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'task.txt'), 'localFirst=true\nartwork=text-free\nreview=one focused pass\n');
const brief = 'Paddock delegated this bounded task. Read task.txt and create result.json with exactly these three keys: localFirst (boolean), artwork (string), review (string). Derive their values from task.txt. Use file tools only. Do not run shell commands, use MCP, delegate, or ask questions. Finish with one short sentence.';
const launch = workerLaunch(provider, executable, { workFolder: folder, promptFile: workerPrompt(provider, folder, brief) });
const started = Date.now(), state = workerState(); let buffer = '', stderr = '', timedOut = false;
const child = spawn(launch.executable, launch.args, { cwd: folder, env: usageEnvironment(), windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
const output = fs.createWriteStream(path.join(root, `${provider}-pilot-events.jsonl`), { mode: 0o600 });
const timer = setTimeout(() => { timedOut = true; killTree(child); }, 60000);
child.stdout.on('data', chunk => { output.write(chunk); const lines = (buffer + chunk.toString()).split('\n'); buffer = lines.pop(); for (const line of lines) { try { workerEvent(provider, state, JSON.parse(line)); } catch {} } });
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
child.stdin.on('error', () => {}); child.stdin.end(workerInput(provider, brief));
child.once('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.once('close', code => {
  clearTimeout(timer); output.end();
  try { workerEvent(provider, state, JSON.parse(buffer)); } catch {}
  let actual; try { actual = JSON.parse(fs.readFileSync(path.join(folder, 'result.json'), 'utf8')); } catch {}
  const passed = actual?.localFirst === true && actual?.artwork === 'text-free' && actual?.review === 'one focused pass';
  const report = { provider, code, timedOut, elapsedMs: Date.now() - started, passed, complete: state.complete, error: state.error, usage: state.usage, text: state.text.slice(-1000) };
  fs.writeFileSync(path.join(root, `${provider}-pilot.json`), JSON.stringify(report, null, 2));
  // Diagnostics stay local; never print raw provider streams or config data.
  fs.writeFileSync(path.join(root, `${provider}-pilot-stderr.txt`), stderr, { mode: 0o600 });
  console.log(JSON.stringify(report)); process.exitCode = passed && state.complete && !state.error && code === 0 ? 0 : 1;
});
