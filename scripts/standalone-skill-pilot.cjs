'use strict';
// Explicit opt-in subscription pilot, not part of npm test. Agents run as native
// CLI processes, with no Paddock MCP, hooks, task wrapper or saved project context.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { tasks } = require('./skill-pilot-fixtures.cjs');
const { claudeTokens } = require('../electron/native-token-usage.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const inputHash = files => hash(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));

function skillTreeHash(root) {
  const files = []; let bytes = 0;
  const visit = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw Error('Skill context contains a link.');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        const data = fs.readFileSync(path.join(root, file)); bytes += data.length;
        if (files.length >= 2000 || bytes > 50 * 1024 * 1024) throw Error('Skill context exceeds the pilot bound.');
        files.push([file, hash(data)]);
      }
    }
  };
  visit(''); return hash(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b))));
}

function nativeEnvironment(env = process.env) {
  const output = {};
  for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'ProgramFiles', 'NODE_EXTRA_CA_CERTS']) if (env[name]) output[name] = env[name];
  return { ...output, NO_COLOR: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '2500' };
}

function skillSource(id, skillsRoot) {
  const folder = path.join(skillsRoot || path.join(os.homedir(), '.agents', 'skills'), id);
  if (id === 'project-documentation' && !fs.existsSync(path.join(folder, 'SKILL.md')) && !skillsRoot) return path.resolve(__dirname, '../skills/project-documentation');
  if (!fs.existsSync(path.join(folder, 'SKILL.md'))) throw Error(`Install the ${id} skill pack first.`);
  return folder;
}

function prepareTrial(root, task, condition, repetition, sourceForSkill = skillSource) {
  const preparationStarted = Date.now();
  if (!['plain', 'skill'].includes(condition)) throw Error('Unknown pilot condition.');
  if (!/^[a-z0-9-]+$/.test(task.id)) throw Error('Invalid fixture identity.');
  const folder = path.join(root, `${task.id}-${repetition}-${condition}`);
  fs.mkdirSync(folder);
  for (const [relative, content] of Object.entries(task.files)) {
    if (/[\\:\0]/.test(relative) || relative.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(relative)) throw Error('Invalid fixture path.');
    const file = path.join(folder, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  }
  let instruction = '', skillHash = null;
  let instructionFile = null, loadedSkillFiles = [], initialSkillTreeHash = null;
  if (condition === 'skill') {
    const source = sourceForSkill(task.skill), target = path.join(folder, '.pilot-skill');
    fs.cpSync(source, target, { recursive: true, dereference: false, filter: name => path.basename(name) !== '.paddock-skill.json' });
    initialSkillTreeHash = skillTreeHash(target);
    const entries = {
      'project-documentation': ['SKILL.md', 'references/standalone.md'],
      ponytail: ['upstream/ponytail/SKILL.md'],
      pstack: ['upstream/skills/poteto-mode/SKILL.md'],
      'thermo-nuclear-code-quality-review': ['upstream/SKILL.md']
    };
    loadedSkillFiles = entries[task.skill] || ['SKILL.md'];
    const bodies = loadedSkillFiles.map(relative => `\n## Selected skill source: .pilot-skill/${relative}\nResolve relative references from that file.\n\n${fs.readFileSync(path.join(target, relative), 'utf8')}`);
    skillHash = hash(bodies.join('\n'));
    instruction = `The user explicitly selected the ${task.skill} skill for this task. Its actual instructions follow, not just a launcher or description. Paddock is absent: use only the current native tools and fixed model, with no setup, hooks, external services or nested agents. Keep the requested artifact format and scope. Skill advice does not authorize changing the task or input source files. .pilot-skill and .pilot-instructions.txt are experiment context, not application files.\n\n${bodies.join('\n')}`;
    instructionFile = path.join(folder, '.pilot-instructions.txt'); fs.writeFileSync(instructionFile, instruction);
  }
  return { task: task.id, skill: task.skill, condition, repetition, folder, inputHash: inputHash(task.files), prompt: task.prompt, promptHash: hash(task.prompt), instruction, instructionFile, loadedSkillFiles, skillHash, initialSkillTreeHash, preparationMs: Date.now() - preparationStarted };
}

function inspectInit(init) {
  if (!init) return { isolated: false, reason: 'Native initialization event missing.' };
  const tools = init.tools || [], servers = init.mcp_servers || [], skills = init.skills || [];
  const isolated = servers.length === 0 && skills.length === 0 && !tools.some(name => /^mcp__/i.test(name));
  return { isolated, tools, servers: servers.map(x => x.name), autoDiscoveredSkillCount: skills.length, model: init.model, permissionMode: init.permissionMode };
}

async function runNative({ executable, trial, model, emptyMcp, timeoutMs = 120000, maxOutputTokens = 2500, maxTurns = 10, effort = 'low', launch = spawn }) {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16384) throw Error('Choose an output token limit from 256 to 16384.');
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1 || maxTurns > 40 || !['low', 'medium', 'high'].includes(effort)) throw Error('Choose a bounded turn limit and supported effort.');
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--safe-mode', '--restricted', '--disable-slash-commands', '--strict-mcp-config', '--mcp-config', emptyMcp,
    '--no-session-persistence', '--no-chrome', '--tools', 'Read,Grep,Glob,Write,Edit', '--permission-mode', 'acceptEdits', '--permission-prompts', 'none', '--max-turns', String(maxTurns), '--effort', effort, '--model', model];
  if (trial.instructionFile) args.push('--append-system-prompt-file', trial.instructionFile);
  const started = Date.now();
  return new Promise(resolve => {
    const child = launch(executable, args, { cwd: trial.folder, env: { ...nativeEnvironment(), CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxOutputTokens) }, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, failure = null, lineBuffer = '', init = null, result = null;
    const toolsUsed = []; let outputLimitContinuations = 0;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const stop = message => { failure = message; child.kill(); };
    child.stdout.on('data', chunk => {
      stdout += chunk; lineBuffer += chunk;
      if (stdout.length > 4000000) return stop('Native output exceeded the pilot bound.');
      let newline;
      while ((newline = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, newline); lineBuffer = lineBuffer.slice(newline + 1);
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (event.type === 'system' && event.subtype === 'init') {
          init = event; if (!inspectInit(init).isolated) stop('Unexpected MCP or automatically discovered skills.');
        }
        if (event.type === 'assistant') for (const part of event.message?.content || []) if (part.type === 'tool_use') toolsUsed.push(part.name);
        if (event.type === 'user' && Array.isArray(event.message?.content) && event.message.content.some(part => part.type === 'text' && /^Output token limit hit\./.test(part.text || ''))) outputLimitContinuations++;
        if (event.type === 'result') result = event;
      }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 64000) stderr += chunk; });
    child.stdin.on('error', () => {});
    child.once('error', error => { failure = error.message; });
    child.once('close', code => {
      clearTimeout(timer);
      const isolation = inspectInit(init), usage = claudeTokens(result?.usage);
      resolve({ elapsedMs: Date.now() - started, exitCode: code, timedOut, failure, isolation, toolsUsed,
        nativeSuccess: code === 0 && !timedOut && !failure && isolation.isolated && !!result && !result.is_error,
        usage, modelUsage: result?.modelUsage || null, apiEquivalentEstimateUsd: result?.total_cost_usd ?? null,
        maxOutputTokens, maxTurns, effort, outputLimitContinuations, numTurns: result?.num_turns ?? null, resultSubtype: result?.subtype || null, stdout, stderr });
    });
    child.stdin.end(trial.prompt);
  });
}

function scoreTrial(task, trial, native) {
  const changedInputs = Object.entries(task.files).filter(([relative, text]) => {
    try { return fs.readFileSync(path.join(trial.folder, relative), 'utf8') !== text; } catch { return true; }
  }).map(([relative]) => relative);
  const checked = task.verify(trial.folder);
  let changedSkillContext = false;
  if (trial.initialSkillTreeHash) {
    try { changedSkillContext = skillTreeHash(path.join(trial.folder, '.pilot-skill')) !== trial.initialSkillTreeHash; } catch { changedSkillContext = true; }
  }
  return { ...checked, changedInputs, changedSkillContext, accepted: native.nativeSuccess && checked.passed && changedInputs.length === 0 && !changedSkillContext,
    limitation: 'Synthetic tasks and static content checks. Patch output is not executed; scores do not establish runtime correctness or general skill effectiveness.' };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.some(value => value !== '--run' && !/^--(model|task|skills-root|max-output-tokens)=.+/.test(value))) throw Error('Unsupported option. Use --run, --model=, --task=, --skills-root= or --max-output-tokens=.');
  const execute = argv.includes('--run'), model = argv.find(x => x.startsWith('--model='))?.slice(8) || 'sonnet';
  const select = argv.find(x => x.startsWith('--task='))?.slice(7);
  const skillsRoot = argv.find(x => x.startsWith('--skills-root='))?.slice(14);
  const outputOption = argv.find(x => x.startsWith('--max-output-tokens='));
  const maxOutputTokens = outputOption ? Number(outputOption.slice(20)) : 2500;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16384) throw Error('Choose an output token limit from 256 to 16384.');
  const chosen = select ? tasks.filter(task => task.id === select) : tasks;
  if (!chosen.length) throw Error('Unknown pilot task.');
  const parent = path.resolve('.build/skill-pilot'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-skill-pilot-'));
  const emptyMcp = path.join(root, 'empty-mcp.json'); fs.writeFileSync(emptyMcp, '{"mcpServers":{}}');
  // Alternate which condition goes first across tasks. One pair per task is an
  // isolation/scoring pilot, not enough repetitions for an adoption decision.
  const trials = chosen.flatMap((task, i) => (i % 2 ? ['skill', 'plain'] : ['plain', 'skill']).map(condition => prepareTrial(root, task, condition, 1, id => skillSource(id, skillsRoot))));
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ model, maxOutputTokens, environment: 'native CLI outside Paddock', repeats: 1, trials, claims: 'No winner or savings claim; verify the experiment actually runs and captures failures.' }, null, 2));
  console.log(`Pilot directory: ${root}`);
  fs.writeFileSync(path.join(parent, 'latest.json'), JSON.stringify({ root, execute, model }, null, 2));
  if (!execute) { console.log('Prepared only. --run explicitly enables included-subscription model calls.'); return { root, trials }; }
  const spec = require('../electron/adapters.cjs').findClaude();
  if (spec?.kind !== 'native') throw Error('A native Claude CLI is required for this pilot; no provider fallback.');
  const auth = spawnSync(spec.path, ['auth', 'status', '--json'], { env: nativeEnvironment(), windowsHide: true, encoding: 'utf8', timeout: 20000 });
  let status; try { status = JSON.parse(auth.stdout); } catch { throw Error('Could not verify native subscription authentication.'); }
  if (!status.loggedIn || status.authMethod !== 'claude.ai' || !status.subscriptionType) throw Error('Native subscription sign-in required. API fallback is disabled.');
  const rows = [];
  for (const trial of trials) {
    console.log(`Running ${trial.task}: ${trial.condition}`);
    const native = await runNative({ executable: spec.path, trial, model, emptyMcp, maxOutputTokens });
    fs.writeFileSync(path.join(trial.folder, 'native.stdout.jsonl'), native.stdout);
    fs.writeFileSync(path.join(trial.folder, 'native.stderr.txt'), native.stderr);
    const task = chosen.find(task => task.id === trial.task), score = scoreTrial(task, trial, native);
    const { stdout, stderr, ...metrics } = native;
    const row = { task: trial.task, skill: trial.skill, condition: trial.condition, folder: trial.folder, inputHash: trial.inputHash, promptHash: trial.promptHash, skillHash: trial.skillHash, initialSkillTreeHash: trial.initialSkillTreeHash, loadedSkillFiles: trial.loadedSkillFiles, skillDelivery: 'explicit skill text via native append-system-prompt-file', preparationMs: trial.preparationMs, ...metrics, score };
    rows.push(row);
    fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify({ account: 'Native subscription', rows, verdict: 'Pilot only; no comparative performance conclusion.', limitations: ['One trial per task and condition.', 'Small synthetic fixtures; not a real repository trial.', 'No nested agents, shell or network tools in either arm.', 'Static checkers may need human adjudication.', 'Native USD values are API-equivalent estimates, not subscription charges.', 'Initialization/upkeep/lead/fixture drafting costs are separate and must be included before claiming savings.'] }, null, 2));
    console.log(`${trial.task}/${trial.condition}: ${native.nativeSuccess ? 'native complete' : 'native failed'}, ${score.checks.filter(x => x.passed).length}/${score.checks.length} checks`);
    const boundedTaskFailure = native.timedOut || native.resultSubtype === 'error_max_turns';
    if (native.failure || !native.isolation.isolated || (!native.nativeSuccess && !boundedTaskFailure)) throw Error('Pilot stopped on native execution/isolation failure. No automatic retry or provider fallback.');
  }
  const archive = path.join(parent, path.basename(root)); fs.cpSync(root, archive, { recursive: true });
  console.log(`Archived pilot: ${archive}`);
  return { root, rows };
}

module.exports = { inputHash, nativeEnvironment, prepareTrial, inspectInit, runNative, scoreTrial, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
