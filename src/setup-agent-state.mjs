export function agentNeedsInstall(agent) {
  return !agent?.installed || !!agent.job?.checkFailed;
}

export function agentInstallDisabled(agent, busy) {
  return !!busy || (!agent?.installed && !agent?.installable) || (!!agent?.installed && !agent.job?.checkFailed);
}

export function agentOptionDisabled(agent, selected) {
  return agentNeedsInstall(agent) && !selected;
}

export function pendingAgentIds(selected, agents) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  return [...selected].filter(id => agentNeedsInstall(byId.get(id)));
}
