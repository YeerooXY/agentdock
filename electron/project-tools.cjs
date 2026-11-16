'use strict';
const path = require('node:path');
// Agent-facing project and console setup. Both reuse the same validation as the
// desktop commands: Projects.save/setKnowledgeMode and Sessions.create.
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function createProject(projects, { name, folders, knowledgeMode } = {}) {
  if (!Array.isArray(folders) || !folders.length || folders.some(folder => typeof folder !== 'string')) throw new Error('Add 1 to 20 project folder paths.');
  // A folder already saved as a project's first folder returns that project instead of a duplicate.
  const existing = projects.list().find(project => samePath(project.folders[0].path, folders[0]));
  if (existing) {
    // An existing project may only be lowered here; raising it can start upkeep spending, so that stays in Settings.
    if (['off', 'read'].includes(knowledgeMode)) return { created: false, project: projects.setKnowledgeMode(existing.id, knowledgeMode), note: `Existing project kept; Knowledge set to ${knowledgeMode}.` };
    return { created: false, project: existing, note: 'This folder already belongs to a saved project; it was not changed. Raise its Knowledge mode in Settings.' };
  }
  let project = projects.save({ name, folders: folders.map(folder => ({ path: folder })) });
  if (knowledgeMode !== undefined) project = projects.setKnowledgeMode(project.id, knowledgeMode);
  return { created: true, project, note: knowledgeMode === 'automatic' ? 'Automatic upkeep selects an eligible worker while Automatic documentation is enabled in Settings.' : undefined };
}

async function openConsole({ projects, sessions, settings }, { projectId, provider, model, effort, name } = {}) {
  if (!projects.get(projectId)) throw new Error('Project not found. Create it with dock/project_create first.');
  // The project folder wins over the default console folder.
  const session = await sessions.create({ ...settings.consoleDefaults, cwd: projects.get(projectId).folders[0].path, projectId, provider, ...(model ? { model } : {}), ...(effort ? { effort } : {}),
    ...(name ? { name, nameMode: 'custom' } : { nameMode: 'project' }), permissions: settings.agentPermissions });
  return { id: session.id, launchId: session.launchId, name: session.name, provider: session.provider, cwd: session.cwd, projectId: session.projectId, permissions: session.permissions,
    note: 'The console opened in Paddock. It runs with the owner\'s default agent permissions.' };
}

module.exports = { createProject, openConsole };

// Knowledge mode and documentation worker, set only at the owner's explicit request.
// The 'settings' and 'projects.knowledgeMode' commands validate exactly as Settings does.
async function knowledgeSettings(command, projects, { knowledgeMode, worker, projectId, projectMode } = {}) {
  if (knowledgeMode === undefined && worker === undefined && projectMode === undefined) throw new Error('Choose a knowledge mode, documentation worker or project mode.');
  if (projectMode !== undefined && !projects.get(projectId)) throw new Error('Project not found.');
  const changes = {};
  if (worker !== undefined) changes.knowledgeWorker = worker;
  if (knowledgeMode !== undefined) changes.knowledgeMode = knowledgeMode;
  if (Object.keys(changes).length) await command('settings', changes);
  if (projectMode !== undefined) await command('projects.knowledgeMode', { id: projectId, mode: projectMode });
  return { applied: { ...changes, ...(projectMode !== undefined ? { projectId, projectMode } : {}) }, note: 'Automatic upkeep selects an eligible local, free or included worker, up to four attempts per hour per project.' };
}
module.exports.knowledgeSettings = knowledgeSettings;
