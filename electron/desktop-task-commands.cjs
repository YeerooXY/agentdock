'use strict';

function desktopTaskCommands({ tasks, sessions, projects, dialog, getWindow, testMode, workbench }) {
  return {
    'execution.report': async payload => {
      if (!['task', 'review'].includes(payload?.kind)) throw new Error('Invalid report kind.');
      const history = payload.kind === 'task' ? tasks.executionHistory : workbench.delegation.executionHistory;
      return history.read(payload.kind, payload.id, payload);
    },
    'tasks.candidates': async payload => tasks.choices(payload?.implementer, payload || {}),
    'tasks.start': async payload => tasks.start({ ...payload, projectId: projects.forFolder(payload?.repo)?.id || null }),
    'tasks.acknowledge': async payload => tasks.acknowledge(payload?.id),
    'tasks.dismiss': async payload => tasks.dismiss(payload?.id),
    'tasks.approvePlan': async payload => tasks.approvePlan(payload),
    'tasks.resume': async payload => tasks.resume(payload?.id),
    'tasks.stop': async payload => {
      const affected = sessions.list().filter(item => item.taskId === payload?.id && item.processAlive);
      if (affected.length && !testMode) {
        const reply = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['Keep running', 'Stop workers'], defaultId: 0, cancelId: 0,
          message: 'Stop task workers?', detail: affected.map(item => item.name).join('\n') });
        if (reply.response !== 1) return false;
        const current = sessions.list().filter(item => item.taskId === payload?.id && item.processAlive);
        if (current.length !== affected.length || current.some(item => !affected.some(prior => prior.consoleKey === item.consoleKey && prior.launchId === item.launchId))) {
          throw new Error('The task workers changed. Review Stop again.');
        }
      }
      return tasks.stop(payload?.id);
    },
    'worker.submit': async payload => sessions.workerBridge.submit(payload),
    'worker.stop': async payload => sessions.workerBridge.stopDesktop(payload, { testMode,
      confirm: async item => (await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['Keep running', 'Stop worker'], defaultId: 0, cancelId: 0,
        message: `Stop worker for ${item.name}?`, detail: 'All work is kept.' })).response === 1 }),
    'tasks.accept': async payload => tasks.accept(payload?.id),
    'tasks.list': async () => { await tasks.refresh(); return tasks.snapshot(); }
  };
}

module.exports = { desktopTaskCommands };
