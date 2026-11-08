'use strict';
const mobileProjects = require('./mobile-projects.cjs');
const workspace = require('./mobile-project-workspace.cjs');
const { settingsSummary } = require('./mobile-settings.cjs');
const { resumableImageJob } = require('./mobile-images.cjs');
const { turnPage } = require('./mobile-usage.cjs');

// Read models, project/result content and account-level phone actions. These
// handlers never receive desktop administration services or vault credentials.
function mobileContentCommands(h) {
  return {
    'state': async () => h.publicState(),
    'device.rename': async (client, payload) => h.renameDevice(client, payload.name),
    'projects.list': async () => mobileProjects.readProjects(h.sessions),
    'projects.detail': async (_client, payload) => {
      const value = mobileProjects.readProjects(h.sessions, payload.id, true);
      return h.knowledge ? { ...value, workspace: true, work: workspace.work(h, payload.id), outputs: workspace.outputs(h, payload.id), knowledge: { mode: h.knowledge.enabled(payload.id) ? h.knowledge.automatic(payload.id) ? 'automatic' : 'read' : 'off', ...(h.knowledge.enabled(payload.id) && typeof h.knowledge.state === 'function' ? { application: h.knowledge.state(payload.id) } : {}), items: [], status: 'idle' } } : value;
    },
    'projects.knowledge': async (_client, payload) => workspace.knowledge(h, payload.id, payload),
    'projects.knowledge.read': async (_client, payload) => { workspace.project(h, payload.id); if (!h.knowledge?.enabled(payload.id)) throw Error('Project knowledge is off.'); return h.knowledge.read(payload.id, { ids: payload.ids, revision: payload.revision, maxBytes: 64000 }); },
    'projects.report': async (_client, payload) => workspace.report(h, payload),
    'prompts.save': async (_client, payload) => {
      const prompts = h.prompts();
      if (!prompts) throw new Error('Update Paddock on your PC to manage prompts.');
      const scope = payload.scope === undefined ? (payload.projectId == null ? 'global' : 'project') : payload.scope;
      if (!['global', 'project'].includes(scope) || (scope === 'global' && payload.projectId != null)) throw new Error('Choose This PC or a project for the prompt.');
      const projectId = scope === 'project' ? payload.projectId : null;
      const project = typeof projectId === 'string' && /^[\w-]{1,64}$/.test(projectId) ? h.sessions.projects?.get(projectId) : null;
      if (scope === 'project' && (!project || project.status === 'archived')) throw new Error('Choose an existing project on this PC.');
      return prompts.save({ name: payload.name, text: payload.text, projectId });
    },
    'prompts.remove': async (_client, payload) => {
      const prompts = h.prompts();
      if (!prompts) throw new Error('Update Paddock on your PC to manage prompts.');
      prompts.remove(payload.id); return true;
    },
    'settings.summary': async () => {
      const getSettings = h.settings();
      if (!getSettings) throw new Error('PC settings are unavailable. Update Paddock on your PC.');
      return settingsSummary({ ...getSettings(), capabilities: h.toolsStatus() ? ['tools.status'] : [] });
    },
    'code.list': (client, payload) => codeRead(h, 'code.list', client, payload),
    'code.read': (client, payload) => codeRead(h, 'code.read', client, payload),
    'image.resume': async (_client, payload) => {
      const concepts = h.concepts;
      if (!concepts) throw new Error('Image jobs are unavailable.');
      if (typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id) || Object.keys(payload).some(key => key !== 'id')) throw new Error('Invalid image job.');
      const job = concepts.items.find(x => x.id === payload.id);
      if (!resumableImageJob(job)) throw new Error('This image job cannot be resumed.');
      concepts.resume(job.id); return true;
    },
    'results.list': async () => h.results.list().map(({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt, project, projectId, changeCount, git, gitEnd, outcome }) => ({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt, project, projectId, changeCount, git, gitEnd, ...(outcome ? { outcome } : {}) })),
    'results.preview': async (_client, payload) => {
      if (typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id)) throw new Error('Choose a result.');
      if (payload.thumbnail !== undefined && typeof payload.thumbnail !== 'boolean') throw new Error('Invalid thumbnail option.');
      const value = await h.results.preview(payload.id, payload.thumbnail !== false, payload.entry);
      if (JSON.stringify(value).length > 3 * 1024 * 1024) throw new Error('This preview is too large. Open it on your PC.');
      return value;
    },
    'results.seen': async (_client, payload) => h.results.markSeen(payload.ids),
    'results.delete': async (_client, payload) => h.results.remove(payload.ids),
    'tasks.seen': async (_client, payload) => {
      const tasks = h.tasks();
      if (!tasks) throw new Error('Tasks are unavailable on this PC.');
      if (typeof payload.id !== 'string' || !tasks.jobs?.has(payload.id)) throw new Error('Task not found.');
      tasks.acknowledge(payload.id); return true;
    },
    'tasks.close': async (_client, payload) => {
      const tasks = h.tasks();
      if (!tasks) throw new Error('Tasks are unavailable on this PC.');
      if (typeof payload.id !== 'string' || !tasks.jobs?.has(payload.id)) throw new Error('Task not found.');
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      if (!reason || reason.length > 300) throw new Error('Enter a reason up to 300 characters.');
      return tasks.dismiss(payload.id, { reason, by: 'owner' });
    },
    'usage.turns': async (_client, payload) => {
      const getUsageTurns = h.usageTurns();
      if (typeof getUsageTurns !== 'function') throw new Error('Turn usage is unavailable on this host.');
      return turnPage(await getUsageTurns(), h.sessions.projects?.list?.() || [], payload);
    },
    'usage': async (_client, payload) => {
      if (payload.refresh === true) h.refreshUsage()?.().catch(() => {});
      return h.usage();
    },
    'alerts.mode': async (client, payload) => {
      if (typeof payload.direct !== 'boolean') throw new Error('Choose a notification mode.');
      client.device.directAlerts = payload.direct; h.persist(); return true;
    },
    'ping': async () => true
  };
}

async function codeRead(h, method, client, payload) {
  const session = h.sessions.items.get(payload.consoleId);
  if (client.selected !== payload.consoleId) throw new Error('Select an open console first.');
  if (client.codeRequest) throw new Error('Wait for the code request.');
  client.codeRequest = true;
  try {
    const roots = JSON.stringify(h.code.roots(session));
    const value = await h.code.call(method, session, payload.path);
    if (!h.authorized(client) || client.selected !== payload.consoleId || h.sessions.items.get(payload.consoleId) !== session || session.dismissed || JSON.stringify(h.code.roots(session)) !== roots) throw new Error('Console or connection changed. Reopen Code.');
    return value;
  } finally { client.codeRequest = false; }
}

module.exports = { mobileContentCommands };
