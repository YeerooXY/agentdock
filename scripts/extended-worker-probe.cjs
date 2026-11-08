'use strict';
// Manual opt-in only; never imported by the test suite.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { killTree } = require('../electron/delegation.cjs');
const { usageEnvironment } = require('../electron/subscription-usage.cjs');
const { extensionPrompt, extensionLaunch, extensionInput, extensionEvent, extensionFinalize } = require('../electron/extended-workers.cjs');
if (process.argv[2] !== '--live' || process.argv[3] !== 'cline') throw Error('Use --live cline for the explicitly connected free Cline model.');
const provider = 'cline';
const root = path.resolve(__dirname, '../artifacts/agent-matrix/targets', new Date().toISOString().replaceAll(':', '-'));
const work = path.join(root, 'work'), privateDir = path.join(root, 'private');
fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(privateDir);
const brief = 'Complete this bounded worker check directly. Write receipt.json containing exactly {"worker":"cline","fileTools":true}. Do not use shell, network, MCP, skills, subagents or other tools. Then finish with RECEIPT_READY. The file tools are permitted; there is no need to run commands or perform a review.';
const promptFile = extensionPrompt(provider, privateDir, brief);
const inventory = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/agent-matrix/inventory.json'), 'utf8'));
const exe = inventory.find(x => x.id === provider).executable;
const launch = extensionLaunch(provider, exe, { workFolder: work, promptFile, model: 'cline-free/nemotron-3.5-super-vl' });
const state = { text: '', usage: null, complete: false, error: false, maxText: 1000, seen: new Set() };
const report = { provider, model: 'cline-free/nemotron-3.5-super-vl', startedAt: new Date().toISOString(), tools: [], events: {} };
let pending = '', stderr = ''; const started = Date.now();
const child = spawn(launch.executable, launch.args, { cwd: work, env: { ...usageEnvironment(), ...launch.env }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
const timer = setTimeout(() => { report.timeout = true; killTree(child); }, 60000);
function event(e) {
  report.events[e.type || 'unknown'] = (report.events[e.type || 'unknown'] || 0) + 1;
  const inner = e.event || e;
  if (inner.type === 'tool_call' || inner.type === 'tool_start') report.tools.push(inner.name || inner.toolName || inner.tool_call?.name || 'unknown');
  extensionEvent(provider, state, e);
}
child.stdout.on('data', b => { const lines = (pending + b.toString()).split('\n'); pending = lines.pop(); for (const line of lines) { try { event(JSON.parse(line)); } catch {} } });
child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-1500); });
child.stdin.on('error', () => {}); child.stdin.end(extensionInput(provider, brief));
child.once('error', () => { report.launchError = true; });
child.once('close', code => {
  clearTimeout(timer); try { event(JSON.parse(pending)); } catch {} extensionFinalize(provider, state, code);
  let receipt = null; try { receipt = JSON.parse(fs.readFileSync(path.join(work, 'receipt.json'), 'utf8')); } catch {}
  let guardCalls = []; try { guardCalls = fs.readFileSync(path.join(privateDir, 'guard-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); } catch {}
  Object.assign(report, { exitCode: code, elapsedMs: Date.now() - started, usage: state.usage, complete: state.complete, error: state.error, text: state.text, receipt,
    guardCalls, diagnostic: stderr.replace(/Bearer\s+\S+|sk-[\w-]+/gi, '[redacted]'), passed: code === 0 && state.complete && !state.error && guardCalls.length > 0 && receipt?.worker === 'cline' && receipt?.fileTools === true });
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ folder: root, ...report })); process.exitCode = report.passed ? 0 : 1;
});
