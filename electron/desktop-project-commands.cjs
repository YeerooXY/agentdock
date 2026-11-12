'use strict';
const { NO_VALUE } = require('./command-result.cjs');

function desktopProjectCommands({ projects, sessions, shell, publish, workbench }) {
  return {
    'projects.knowledgeMode': async payload => { const project = projects.setKnowledgeMode(payload?.id, payload?.mode); publish(); return project; },
    'knowledge.directory': async payload => workbench.knowledgeAccess.directory(payload?.id, payload || {}),
    'knowledge.read': async payload => workbench.knowledgeAccess.read(payload?.id, payload || {}),
    'knowledge.inventory': async payload => { const value = workbench.knowledgeAccess.capture(payload?.id, payload || {}); publish(); return value; },
    'knowledge.initialize': async payload => { const value = workbench.knowledgeAccess.initialize(payload?.id, { folderIndex: payload?.folderIndex ?? 0, ...(payload?.paths ? { paths: payload.paths } : {}) }); publish(); return value; },
    'knowledge.state': async payload => workbench.knowledgeAccess.state(payload?.id),
    'projects.save': async payload => { const project = projects.save(payload); publish(); return project; },
    'projects.decision': async payload => { const project = projects.decide(payload.id, payload); publish(); return project; },
    'open.link': async payload => {
      let url; try { url = new URL(String(payload)); } catch { throw new Error('That link is not valid.'); }
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only web links can be opened.');
      await shell.openExternal(url.href); return NO_VALUE;
    },
    'projects.folder': async payload => {
      const target = projects.folderPath(payload.id, payload.index ?? 0);
      const error = await shell.openPath(target); if (error) throw new Error('The project folder could not be opened.');
      return target;
    },
    'session.project': async payload => sessions.assignProject(payload?.id, payload?.projectId, { useProjectName: payload?.useProjectName }),
    'projects.progress': async payload => { const project = projects.progress(payload?.id, payload); publish(); return project; },
    'projects.remove': async payload => {
      projects.remove(payload);
      for (const item of sessions.items.values()) if (item.projectId === payload) item.projectId = null;
      sessions.emit('changed'); publish(); return NO_VALUE;
    }
  };
}

module.exports = { desktopProjectCommands };
