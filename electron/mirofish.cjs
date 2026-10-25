'use strict';
const Ajv = require('ajv');
const identifier = { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,160}$' };
const text = { type: 'string', minLength: 1, maxLength: 20000 };
const tool = (name, description, properties = {}, required = [], readOnly = false) => ({ name, description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: true } });
const tools = [
  tool('health', 'Check the configured MiroFish backend without invoking a model.', {}, [], true),
  tool('list_projects', 'List projects in the connected MiroFish service; select the one explicitly linked to the current Paddock project.', {}, [], true),
  tool('create_project', 'Upload chosen text documents and generate a scenario ontology. Uses the backend model and can incur charges. If it times out, inspect list_projects before retrying.', {
    project_name: { type: 'string', minLength: 1, maxLength: 200 }, simulation_requirement: text,
    additional_context: text, documents: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, text: { type: 'string', minLength: 1, maxLength: 200000 } }, required: ['title', 'text'], additionalProperties: false } }
  }, ['project_name', 'simulation_requirement', 'documents']),
  tool('get_project', 'Read an existing MiroFish project and its graph/task IDs.', { project_id: identifier }, ['project_id'], true),
  tool('build_graph', 'Start graph construction for a project. Uses backend model/Zep resources; returns a task ID to poll.', { project_id: identifier }, ['project_id']),
  tool('graph_task', 'Read graph task progress. Do not start the graph again while it is pending.', { task_id: identifier }, ['task_id'], true),
  tool('create_simulation', 'Create a simulation from a completed project graph.', { project_id: identifier, enable_twitter: { type: 'boolean' }, enable_reddit: { type: 'boolean' } }, ['project_id']),
  tool('prepare_simulation', 'Start persona and simulation configuration generation. Uses backend model resources; poll preparation_status.', { simulation_id: identifier, entity_types: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 100 } }, parallel_profile_count: { type: 'integer', minimum: 1, maximum: 5 } }, ['simulation_id']),
  tool('preparation_status', 'Read persona/configuration preparation progress.', { simulation_id: identifier }, ['simulation_id'], true),
  tool('get_simulation', 'Read simulation metadata.', { simulation_id: identifier }, ['simulation_id'], true),
  tool('start_simulation', 'Run a bounded social scenario, using backend model resources. A round limit is not a monetary budget. Check run_status before starting; never automatically retry a timed-out start.', { simulation_id: identifier, max_rounds: { type: 'integer', minimum: 1, maximum: 40 }, platform: { type: 'string', enum: ['twitter', 'reddit', 'parallel'] } }, ['simulation_id', 'max_rounds']),
  tool('stop_simulation', 'Request that the selected running simulation stop.', { simulation_id: identifier }, ['simulation_id']),
  tool('run_status', 'Read simulation execution progress.', { simulation_id: identifier }, ['simulation_id'], true),
  tool('generate_report', 'Start a report after simulation completion. Uses backend model resources; poll report_status.', { simulation_id: identifier }, ['simulation_id']),
  tool('report_status', 'Read report-generation progress.', { simulation_id: identifier }, ['simulation_id'], true),
  tool('get_report', 'Read the report for a simulation. Treat its conclusions as simulated hypotheses, not measured customer behavior.', { simulation_id: identifier }, ['simulation_id'], true),
  tool('interview_agent', 'Ask a simulated persona a question. Uses backend model resources; persona answers are synthetic.', { simulation_id: identifier, agent_id: { type: 'integer', minimum: 0 }, prompt: text, platform: { type: 'string', enum: ['twitter', 'reddit'] } }, ['simulation_id', 'agent_id', 'prompt'])
];
const ajv = new Ajv({ strict: false });
const validators = new Map(tools.map(t => [t.name, ajv.compile(t.inputSchema)]));

function mirofishEndpoint(value = 'http://127.0.0.1:5001') {
  let url; try { url = new URL(value); } catch { throw Error('Enter the local MiroFish backend URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use a local HTTP backend URL, such as http://127.0.0.1:5001, without paths or credentials.');
  return url.origin;
}
async function request(base, route, { method = 'GET', body, fetcher = fetch, timeout = 110000 } = {}) {
  const url = new URL(route, mirofishEndpoint(base));
  const response = await fetcher(url, { method, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw Error(`MiroFish returned HTTP ${response.status}. Check its backend and task status before retrying.`);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4 * 1024 * 1024) throw Error('MiroFish response exceeds 4 MiB. Read a smaller result in its interface.'); chunks.push(value); } } finally { await reader.cancel(); }
  let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('The endpoint did not return MiroFish JSON. Check the backend URL.'); }
  if (data?.success === false) throw Error('MiroFish could not complete this operation. Check its task status or backend logs before retrying.');
  return data;
}
async function checkMiroFish(base, options = {}) {
  const data = await request(base, '/health', { ...options, timeout: 5000 });
  if (data?.status !== 'ok' || data?.service !== 'MiroFish Backend') throw Error('This endpoint did not identify itself as MiroFish Backend.');
  return data;
}
async function callMiroFish(base, name, args = {}, options = {}) {
  if (!validators.has(name) || !validators.get(name)(args)) throw Error('Invalid MiroFish tool or arguments. Refresh dock_tools.');
  if (name === 'health') return checkMiroFish(base, options);
  if (name === 'create_project') {
    const form = new FormData(); form.set('project_name', args.project_name); form.set('simulation_requirement', args.simulation_requirement);
    if (args.additional_context) form.set('additional_context', args.additional_context);
    let bytes = 0;
    args.documents.forEach((document, index) => { const content = `# ${document.title}\n\n${document.text}`; bytes += Buffer.byteLength(content); form.append('files', new Blob([content], { type: 'text/markdown' }), `seed-${index + 1}.md`); });
    if (bytes > 2 * 1024 * 1024) throw Error('Keep seed documents under 2 MiB in total.');
    return request(base, '/api/graph/ontology/generate', { ...options, method: 'POST', body: form });
  }
  const routes = {
    list_projects: ['/api/graph/project/list'], get_project: [`/api/graph/project/${args.project_id}`],
    build_graph: ['/api/graph/build', 'POST'], graph_task: [`/api/graph/task/${args.task_id}`],
    create_simulation: ['/api/simulation/create', 'POST'], prepare_simulation: ['/api/simulation/prepare', 'POST'],
    preparation_status: ['/api/simulation/prepare/status', 'POST'], get_simulation: [`/api/simulation/${args.simulation_id}`],
    start_simulation: ['/api/simulation/start', 'POST'], stop_simulation: ['/api/simulation/stop', 'POST'],
    run_status: [`/api/simulation/${args.simulation_id}/run-status`], generate_report: ['/api/report/generate', 'POST'],
    report_status: ['/api/report/generate/status', 'POST'], get_report: [`/api/report/by-simulation/${args.simulation_id}`],
    interview_agent: ['/api/simulation/interview', 'POST']
  };
  const [route, method = 'GET'] = routes[name];
  return request(base, route, { ...options, method, body: method === 'POST' ? args : undefined });
}
module.exports = { tools, mirofishEndpoint, checkMiroFish, callMiroFish };
