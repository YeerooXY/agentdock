'use strict';
const path = require('node:path');
const { readJson, atomicJson } = require('./storage.cjs');

// What Paddock knows about a tool's models and spending. Tools without an
// entry still get access control and a daily call budget.
const known = {
  meshy: {
    // Lowest to highest. 'latest' is Meshy 7.1 and is the server default when
    // ai_model is omitted, so a lower cap is filled in rather than left out.
    models: { param: 'ai_model', order: ['meshy-6-lite', 'meshy-6', 'meshy-7', 'meshy-7.1'], aliases: { latest: 'meshy-7.1' },
      tools: ['meshy_text_to_3d', 'meshy_text_to_3d_refine', 'meshy_image_to_3d', 'meshy_multi_image_to_3d', 'meshy_retexture'] },
    free: ['meshy_check_balance', 'meshy_list_usage', 'meshy_list_tasks', 'meshy_get_task_status', 'meshy_download_model', 'meshy_cancel_task', 'meshy_list_models', 'meshy_list_animations', 'meshy_analyze_printability', 'meshy_send_to_slicer'],
    credits: { tool: 'meshy_check_balance', field: 'balance' },
  },
};
const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

function validatePolicy(raw, id) {
  const policy = { access: raw?.access === 'ask' ? 'ask' : 'allowed', maxModel: null, dailyBudget: null };
  const models = known[id]?.models;
  if (raw?.maxModel) {
    if (!models?.order.includes(raw.maxModel)) throw new Error('Choose one of this tool’s models.');
    policy.maxModel = raw.maxModel;
  }
  if (raw?.dailyBudget !== undefined && raw.dailyBudget !== null && raw.dailyBudget !== '') {
    const budget = Number(raw.dailyBudget);
    if (!Number.isInteger(budget) || budget < 0 || budget > 1_000_000) throw new Error('Enter a whole-number daily budget, or leave it empty for no limit.');
    policy.dailyBudget = budget;
  }
  return policy;
}
const budgetUnit = id => known[id]?.credits ? 'credits' : 'paid calls';
const paid = (id, tool) => !(known[id]?.free || []).includes(tool);

class ToolPolicy {
  constructor(root, { now = () => Date.now() } = {}) { this.file = path.join(root, 'tool-usage.json'); this.usage = readJson(this.file, {}); this.now = now; }
  today(id) {
    const entry = this.usage[id];
    return entry?.day === day(this.now()) ? entry : { day: day(this.now()), calls: 0, startBalance: null, lastBalance: null };
  }
  record(id, patch) { this.usage = { ...this.usage, [id]: { ...this.today(id), ...patch } }; atomicJson(this.file, this.usage); }
  // Returns the arguments to send. Throws a plain message when the user's
  // limits block the call; agents are told not to retry those.
  async check(connection, tool, input, { balance, confirm, creditScope = '' } = {}) {
    if (connection.enabled === false || connection.policy?.access === 'off') throw new Error(`Blocked by your limits in Paddock: ${connection.name} is off.`);
    const id = connection.id, policy = connection.policy || validatePolicy({}, id), models = known[id]?.models;
    let args = input;
    if (models?.tools.includes(tool) && policy.maxModel) {
      const cap = models.order.indexOf(policy.maxModel), top = cap === models.order.length - 1;
      const asked = input[models.param], value = models.aliases[asked] || asked;
      if (asked === undefined) { if (!top) args = { ...input, [models.param]: policy.maxModel }; }
      else if (!top && !(models.order.includes(value) && models.order.indexOf(value) <= cap)) {
        throw new Error(`Blocked by your limits in Paddock: ${connection.name} may use up to ${policy.maxModel}. Allowed: ${models.order.slice(0, cap + 1).join(', ')}.`);
      }
    }
    const costs = paid(id, tool);
    if (costs && policy.dailyBudget !== null) {
      const balanceId = creditScope ? `${id}:${creditScope}` : id;
      const today = this.today(balanceId);
      if (known[id]?.credits) {
        const current = await balance?.().catch(() => null);
        if (typeof current !== 'number') throw new Error(`Blocked by your limits in Paddock: could not read the ${connection.name} balance to check today’s budget.`);
        const start = today.startBalance ?? current;
        this.record(balanceId, { startBalance: start, lastBalance: current });
        // Native CLI and configured MCP credentials may belong to different
        // accounts. Keep their balance baselines separate and share the cap.
        // If they are the same account, this can conservatively count overlap.
        const spent = this.creditSpent(id);
        if (spent >= policy.dailyBudget) throw new Error(`Blocked by your limits in Paddock: today’s ${connection.name} budget of ${policy.dailyBudget} credits is used up.`);
      } else if (today.calls >= policy.dailyBudget) throw new Error(`Blocked by your limits in Paddock: today’s ${connection.name} budget of ${policy.dailyBudget} paid calls is used up.`);
    }
    if (policy.access === 'ask' && !(await confirm?.({ connection: connection.name, tool, args }).catch(() => false))) throw new Error(`The user declined this ${connection.name} request in Paddock. Do not retry it unless they ask.`);
    return { args, counted: costs };
  }
  counted(id) { this.record(id, { calls: this.today(id).calls + 1 }); }
  creditSpent(id) { return Object.entries(this.usage).filter(([key, value]) => (key === id || key.startsWith(id + ':')) && value.day === day(this.now())).reduce((total, [, value]) => total + Math.max(0, (value.startBalance ?? value.lastBalance ?? 0) - (value.lastBalance ?? 0)), 0); }
  // One line per tool for the agents' shared instructions.
  describe(connection) {
    const id = connection.id, policy = connection.policy || validatePolicy({}, id), today = this.today(id), parts = [];
    parts.push(policy.access === 'ask' ? 'ask first: the user confirms each call' : 'allowed');
    if (policy.maxModel) parts.push(`max model ${policy.maxModel}${known[id].models.order.at(-1) === policy.maxModel ? '' : ` (requests without ${known[id].models.param} use it)`}`);
    if (policy.dailyBudget !== null) {
      const used = known[id]?.credits ? this.creditSpent(id) : today.calls;
      parts.push(`budget ${policy.dailyBudget} ${budgetUnit(id)} a day, about ${used} used today`);
    }
    return parts.join(' · ');
  }
}
module.exports = { ToolPolicy, validatePolicy, known, budgetUnit };
