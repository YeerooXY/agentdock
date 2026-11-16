'use strict';
async function stopConsole({ sessions, confirm, caller }, { id, launchId, action = 'interrupt' } = {}) {
  const target = sessions.items.get(id);
  if (!target?.alive || target.launchId !== launchId) throw Error('Console changed or closed. Read its current launch ID.');
  if (!['interrupt', 'stop'].includes(action)) throw Error('Choose interrupt or stop.');
  if (!caller?.projectId || target.projectId !== caller.projectId) throw Error('Choose a console in this project.');
  if (target.taskId || target.remote || target.kind) throw Error('Use the task or remote console controls for this console.');
  if (!await confirm({ name: target.name, action })) return { approved: false, action };
  if (sessions.items.get(id) !== target || !target.alive || target.launchId !== launchId) throw Error('Console changed while awaiting approval.');
  if (action === 'interrupt') sessions.write(id, '\x03');
  else await sessions.end(id);
  return { approved: true, action, id };
}
module.exports = { stopConsole };
