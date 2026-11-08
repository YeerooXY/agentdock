import { projectResolver } from '../project-identity.js';
let renderProjectWorkspace, workspaceView;
const loadWorkspace = () => workspaceView ||= import('./project-workspace.js').then(module => { renderProjectWorkspace = module.renderProjectWorkspace; });
import { openExecutionReport } from '../ui/execution-report.js';

export function projectWorkspaceController({ call, getState, getPage, renderPage, escape, icon, toast, openResult }) {
  let selected = '', tab = 'overview', knowledge = null, stamp = '', request = 0, policy = '', status = 'idle', errorText = '', knowledgeEpoch;
  const current = () => (getState().projects || []).find(project => project.id === selected);
  const mode = project => ['read', 'automatic'].includes(getState().settings.knowledgeMode) && ['inherit', 'read', 'automatic', undefined, null].includes(project?.knowledgeMode) ? 'read' : 'off';
  const policyKey = () => JSON.stringify([selected, getState().settings.knowledgeMode, current()?.knowledgeMode]);
  const scoped = items => { const owner = projectResolver(getState().projects || []); return items.map(item => ({ ...item, projectId: owner(item) })); };
  const heading = () => document.querySelector('#project-workspace-title, [data-project-new]');
  const focusKey = node => {
    if (!node?.closest('[data-project-workspace]')) return null;
    const attr = [...node.attributes].find(attr => attr.name.startsWith('data-project-'));
    return attr ? [attr.name, attr.value] : null;
  };
  function restore(key) {
    const target = key && [...document.querySelectorAll(`[${key[0]}]`)].find(node => node.getAttribute(key[0]) === key[1]);
    (target && !target.disabled ? target : document.querySelector(`[data-project-tab="${tab}"]`) || heading())?.focus({ preventScroll: true });
  }
  function refresh() {
    if (getPage() !== 'projects') return;
    const active = document.activeElement, key = focusKey(active); renderPage();
    if (!active?.isConnected) restore(key);
  }
  function observePolicy() {
    const epoch = getState().workbench?.knowledgeEpoch;
    if (knowledgeEpoch !== epoch) { knowledgeEpoch = epoch; knowledge = null; status = 'idle'; errorText = ''; request++; stamp = ''; }
    const next = policyKey(); if (next === policy) return;
    policy = next; knowledge = null; status = 'idle'; errorText = ''; request++;
  }
  function render() {
    const project = current(); if (!project) { selected = ''; return null; }
    observePolicy();
    if (mode(project) === 'read' && ['overview', 'knowledge'].includes(tab) && status === 'idle') queueMicrotask(() => loadKnowledge());
    stamp = JSON.stringify([project, getState().tasks, getState().workbench?.results, policy, knowledge, status, errorText, tab]);
    return renderProjectWorkspace({ project, tasks: scoped(getState().tasks || []), outputs: scoped(getState().workbench?.results || []),
      knowledge, knowledgeStatus: status, knowledgeError: errorText, mode: mode(project), tab, escape, icon });
  }
  function sync() {
    observePolicy();
    if (!selected || getPage() !== 'projects') return false;
    const next = JSON.stringify([current(), getState().tasks, getState().workbench?.results, policy, knowledge, status, errorText, tab]);
    if (next !== stamp) refresh();
    return true;
  }
  async function loadKnowledge(cursor) {
    observePolicy();
    if (!current() || mode(current()) !== 'read' || status === 'loading' || getPage() !== 'projects' || !['overview', 'knowledge'].includes(tab)) return;
    const ticket = ++request, id = selected, key = policyKey(), prior = knowledge;
    status = 'loading'; errorText = ''; refresh();
    try {
      const results = await Promise.allSettled([call('knowledge.directory', { id, limit: 20, ...(cursor ? { cursor } : {}) }), call('knowledge.state', { id })]);
      if (results[0].status === 'rejected') throw results[0].reason;
      const value = { ...results[0].value, ...(results[1].status === 'fulfilled' ? { application: results[1].value } : {}) };
      if (ticket !== request || policyKey() !== key) return;
      knowledge = cursor && prior ? { ...value, items: [...prior.items, ...value.items] } : value; status = 'ready'; refresh();
    } catch (error) {
      if (ticket !== request || policyKey() !== key) return;
      status = 'error'; errorText = error.message; refresh();
    }
  }
  async function show(id) {
    if (!(getState().projects || []).some(project => project.id === id)) return;
    const ticket = ++request;
    try {
      await loadWorkspace();
      if (ticket !== request || getPage() !== 'projects') return;
      selected = id; tab = 'overview'; observePolicy(); renderPage(); heading()?.focus();
    } catch { toast('Project view could not load. Restart Paddock and try again.', true); }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.projectInspect) { show(button.dataset.projectInspect); return; }
    if (button.hasAttribute('data-project-back')) { selected = ''; observePolicy(); renderPage(); heading()?.focus(); return; }
    if (button.dataset.projectTab) {
      tab = button.dataset.projectTab; if (tab === 'knowledge' && status !== 'loading') status = 'idle'; renderPage(); document.querySelector(`[data-project-tab="${tab}"]`)?.focus(); return;
    }
    if (!current() || !button.closest('[data-project-workspace]')) return;
    const key = focusKey(button), wasFocused = document.activeElement === button;
    try {
      if (button.hasAttribute('data-project-knowledge-retry')) { status = 'idle'; await loadKnowledge(); return; }
      if (button.hasAttribute('data-project-knowledge-more')) { await loadKnowledge(knowledge?.nextCursor); return; }
      if (button.dataset.projectInventory) {
        button.disabled = true; const ticket = ++request, id = selected, version = policyKey();
        const value = await call('knowledge.inventory', { id });
        if (ticket !== request || policyKey() !== version) return;
        knowledge = value; status = 'ready'; errorText = ''; refresh();
      }
      if (button.dataset.projectInitialize) {
        button.disabled = true; ++request; const id = selected, version = policyKey();
        await call('knowledge.initialize', { id });
        if (policyKey() !== version || selected !== id || getPage() !== 'projects') return;
        status = 'idle'; await loadKnowledge();
      }
      if (button.dataset.projectKnowledgeRead) {
        const id = selected, section = button.dataset.projectKnowledgeRead, version = policyKey();
        await openExecutionReport(async () => {
          const value = await call('knowledge.read', { id, ids: [section], revision: knowledge?.revision, maxBytes: 262144 });
          if (policyKey() !== version || mode(current()) !== 'read' || getPage() !== 'projects') throw new Error('Knowledge view changed.');
          if (!value.items.length) throw new Error('This section exceeds the reading limit or is unavailable.');
          const record = value.items[0].recorded;
          return { title: record.title, text: record.summary + '\n\nStored reference. Source freshness and semantic claims are unverified.', nextOffset: null };
        }, button, () => document.querySelector('[data-project-tab="knowledge"]'));
      }
      if (button.dataset.projectStopTask) await call('tasks.stop', { id: button.dataset.projectStopTask });
      if (button.dataset.projectTaskReport) {
        const job = scoped(getState().tasks || []).find(task => task.id === button.dataset.projectTaskReport && task.projectId === selected);
        if (job?.executionHistory) await openExecutionReport(page => call('execution.report', { kind: 'task', id: job.id, ...page }), button, () => document.querySelector('[data-project-tab="work"]'));
        else if (job?.resultId) await openResult(job.resultId);
      }
    } catch (error) { toast(error.message, true); }
    finally {
      if (button.isConnected) button.disabled = false;
      if (wasFocused && (document.activeElement === document.body || !button.isConnected) && !document.querySelector('dialog[open]')) restore(key);
    }
  });
  document.addEventListener('change', async event => {
    const select = event.target.closest('[data-project-knowledge-mode]'); if (!select || !current()) return;
    const id = selected, previous = current().knowledgeMode || 'inherit', key = focusKey(select); select.disabled = true;
    try {
      await call('projects.knowledgeMode', { id, mode: select.value });
      observePolicy();
      if (getPage() === 'projects' && selected === id) refresh();
    } catch (error) { select.value = previous; toast(error.message, true); }
    finally {
      if (select.isConnected) select.disabled = false;
      if (getPage() === 'projects' && selected === id && !document.querySelector('dialog[open]')) restore(key);
    }
  });
  return { render, sync, show, observePolicy, isOpen: () => !!selected };
}
