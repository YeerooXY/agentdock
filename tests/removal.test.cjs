'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { Workbench } = require('../electron/workbench.cjs');
const { Projects } = require('../electron/projects.cjs');
const { SharedHub } = require('../electron/shared.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-removal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('ordinary context reads require no completion tools or project writes', async t => {
  const root = fixture(t), sessions = new Map([['console', { id: 'console', cwd: root, alive: true }]]);
  const wb = new Workbench(root, {}, {}, { getSessions: () => ({ items: sessions }), getProject: () => root, onChange() {} });
  wb.projects = new Projects(root);
  const p = wb.projects.save({ name: 'Project', folders: [{ path: root }], notes: 'x'.repeat(19957) });
  sessions.get('console').projectId = p.id;
  const before = fs.readFileSync(wb.projects.file, 'utf8');
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb });
  t.after(() => hub.close());
  const context = (await hub.invoke('dock_context', { includeProject: true }, 'console')).content[0].text;
  assert.doesNotMatch(context, /finish_turn|save_result|project_progress|Current turnId/);
  assert.equal(fs.readFileSync(wb.projects.file, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, 'turn-completions')), false);
  for (const name of ['start_turn', 'finish_turn', 'agent_response', 'save_result', 'list_results', 'project_progress', 'propose_project', 'project_decision', 'project_plan', 'propose_project_plan', 'add_later_feature', 'downloaded_tools', 'meshy_concept']) {
    assert.equal(wb.tools('console').some(tool => tool.name === 'dock/' + name), false);
    await assert.rejects(wb.invoke('dock/' + name, {}, 'console'), /Unknown Paddock tool/);
  }
  for (const name of ['review_page', 'review_details', 'generate_preview', 'concept_status']) {
    assert.ok(wb.tools('console').some(tool => tool.name === 'dock/' + name));
  }
  for (const action of ['results.import', 'results.export', 'results.folder', 'results.delete', 'results.preview']) {
    await assert.rejects(wb.call(action, {}), /Unknown workbench action/);
  }
});

test('project edits preserve existing Markdown and never append progress notes', t => {
  const root = fixture(t), store = new Projects(root);
  const p = store.save({ name: 'Project', guided: true, folders: [{ path: root }], notes: 'x'.repeat(19957) });
  assert.equal(p.plan, undefined);
  const legacyPlan = { revision: 63, scope: 'Saved owner scope', approvals: { roadmap: 1 }, references: [] };
  store.get(p.id).plan = legacyPlan;
  const dir = path.join(root, '.agentdock', 'projects', p.id);
  assert.equal(fs.existsSync(dir), false);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'PROJECT.md'); fs.writeFileSync(file, 'Existing file');
  const updated = store.save({ ...p, name: 'Edited', revision: 999 });
  assert.equal(fs.readFileSync(file, 'utf8'), 'Existing file');
  assert.equal(fs.existsSync(path.join(dir, 'ROADMAP.md')), false);
  assert.equal(updated.notes, p.notes);
  assert.deepEqual(store.get(p.id).plan, legacyPlan);
  assert.equal(store.list()[0].plan, undefined);
});

test('new preview images retain legacy saved-file records without exposing a gallery', t => {
  const root = fixture(t), id = '00000000-0000-4000-8000-000000000001';
  const dir = path.join(root, 'results', id); fs.mkdirSync(dir, { recursive: true });
  const legacy = { id, title: 'Existing file', ext: '.md', kind: 'report', size: 4 };
  fs.writeFileSync(path.join(root, 'results', 'index.json'), JSON.stringify([legacy]));
  fs.writeFileSync(path.join(dir, 'result.md'), 'KEEP');
  const wb = new Workbench(root, {}, {}, { onChange() {} });
  wb.results.add({ buffer: Buffer.from('image fixture'), ext: '.png', kind: 'concept' }, { trusted: true });
  assert.equal(JSON.parse(fs.readFileSync(wb.results.file, 'utf8')).length, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'result.md'), 'utf8'), 'KEEP');
  assert.equal(wb.snapshot().results.length, 1);
  assert.throws(() => wb.results.preview(id), /Only review and preview images/);
});

test('MCP initialization omits the full policy file', async t => {
  const root = fixture(t), file = path.join(root, 'PADDOCK.md');
  fs.writeFileSync(file, 'DUPLICATE_POLICY_'.repeat(1000));
  const child = spawn(process.execPath, [path.join(__dirname, '../electron/agent-tools.cjs')], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PADDOCK_INSTRUCTIONS: file, PADDOCK_BRIDGE_URL: 'http://127.0.0.1:1', PADDOCK_BRIDGE_TOKEN: 'test' },
  });
  t.after(() => child.kill());
  const reply = new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', chunk => {
      text += chunk;
      for (const line of text.split('\n')) {
        try { const message = JSON.parse(line); if (message.id === 1) resolve(message); } catch {}
      }
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error('MCP exited: ' + code)));
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) + '\n');
  const response = await reply;
  assert.doesNotMatch(response.result.instructions, /DUPLICATE_POLICY|finish_turn/);
  assert.ok(response.result.instructions.length < 1000);
});
