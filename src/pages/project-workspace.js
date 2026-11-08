import { isOperationalResult } from '../results-model.js';
// Project workspace: compact view of project work, outputs and knowledge.
// Pure render function; controllers and event listeners are owned by the lead.

const RUNNING_STATES = new Set([
  'planning',
  'reviewing-plan',
  'building',
  'implementing',
  'checking',
  'reviewing',
  'queued'
]);

function defaultEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

function taskImplementer(task) {
  if (task.implementer && typeof task.implementer === 'object') {
    const name = task.implementer.label || task.implementer.accountId || '';
    const model = task.implementer.model || '';
    return [name, model].filter(Boolean).join(' / ');
  }
  if (typeof task.implementer === 'string') {
    return [task.implementer, task.model].filter(Boolean).join(' / ');
  }
  if (task.requestedImplementer) {
    return String(task.requestedImplementer);
  }
  if (task.model) {
    return String(task.model);
  }
  return '';
}

function renderOverview(project, e, knowledge, mode) {
  const summary = typeof project?.lastProgress === 'string'
    ? project.lastProgress
    : project?.lastProgress?.summary;
  const goals = project?.goals;
  const nextStep = project?.nextStep;
  const folders = Array.isArray(project?.folders) ? project.folders : [];

  if (!summary && !goals && !nextStep && folders.length === 0 && mode !== 'read') {
    return '<p class="field-hint">No overview details recorded for this project.</p>';
  }

  const application = knowledge?.application;
  const sections = [];
  if (mode === 'read') {
    const overviews = application?.overviews || [];
    sections.push(`<section class="surface project-overview-section"><h3>Application</h3>${overviews.length ? overviews.map(note => `<article><p>${e(note.summary.slice(0, 1200))}</p><p class="field-hint">${e(({ matches: 'Source evidence matches. Semantic claims are unverified.', changed: 'Source changed. This overview needs updating.', unavailable: 'Source evidence is unavailable.', unverified: 'Source evidence is unverified.' })[note.evidence] || 'Unverified.')}</p><button type="button" class="subtle" data-project-knowledge-read="${e(note.id)}">Read overview</button></article>`).join('') : '<p class="field-hint">No application map yet. An agent can initialize it and document the implemented systems.</p>'}<button type="button" class="secondary" data-project-initialize="${e(project.id)}">${overviews.length ? 'Refresh source map' : 'Build project map'}</button>${application?.areas?.length ? `<ul>${application.areas.slice(0, 8).map(area => `<li><button type="button" class="subtle" data-project-knowledge-read="${e(area.id)}">${e(area.title)}</button></li>`).join('')}</ul>` : ''}</section>`);
  }
  if (summary) {
    sections.push(`<section class="surface project-overview-section project-last-progress"><h3>Last progress</h3><p>${e(summary)}</p></section>`);
  }
  if (goals) {
    sections.push(`<details class="surface project-overview-section project-goals"><summary>Saved goals</summary><p>${e(goals)}</p></details>`);
  }
  if (nextStep) {
    sections.push(`<details class="surface project-overview-section project-next"><summary>Saved next step</summary><p>${e(nextStep)}</p></details>`);
  }
  if (folders.length > 0) {
    const list = folders.map(f => {
      const path = typeof f === 'string' ? f : f?.path || '';
      const label = typeof f === 'object' && f?.label ? f.label : path;
      return `<li><code>${e(label)}</code>${label !== path && path ? ` <span class="field-hint">${e(path)}</span>` : ''}</li>`;
    }).join('');
    sections.push(`<section class="surface project-overview-section project-folder-links"><h3>Folders</h3><ul>${list}</ul></section>`);
  }

  return `<div class="project-overview-content">${sections.join('')}</div>`;
}

function renderTaskCard(task, e) {
  const isRunning = RUNNING_STATES.has(task.state);
  const hasReport = Boolean(task.executionHistory || task.resultId);
  const implementer = taskImplementer(task);

  const actions = [];
  if (isRunning) {
    actions.push(`<button type="button" class="secondary" data-project-stop-task="${e(task.id)}">Stop</button>`);
  }
  if (hasReport) {
    actions.push(`<button type="button" class="subtle" data-project-task-report="${e(task.id)}">Report</button>`);
  }

  const details = [];
  if (task.criteria) {
    details.push(`<p class="task-criteria">${e(task.criteria)}</p>`);
  }
  if (implementer) {
    details.push(`<p class="task-implementer">Assigned worker: ${e(implementer)}</p>`);
  }
  if (implementer) details.push('<p class="field-hint">Native model identity is unverified unless reported by the provider.</p>');
  if (task.size) {
    details.push(`<p class="task-size">Size: ${e(task.size)}</p>`);
  }

  return `<article class="surface task-card" data-task-id="${e(task.id)}">` +
    `<header class="task-card-heading">` +
      `<h3>${e(task.title || 'Untitled task')}</h3>` +
      `<span class="task-status" data-status="${e(task.state || '')}">${e(task.resolution?.state === 'completed' ? ({ verified: 'Verified', integrated: 'Integrated', 'completed-unverified': 'Completed without checks' }[task.resolution.disposition] || task.state) : task.state || 'not-run')}</span>` +
    `</header>` +
    (details.length > 0 ? `<details class="task-details"><summary>Details</summary>${details.join('')}</details>` : '') +
    (actions.length > 0 ? `<div class="task-actions">${actions.join('')}</div>` : '') +
  `</article>`;
}

function renderWork(tasks, projectId, e) {
  const scoped = (Array.isArray(tasks) ? tasks : []).filter(t => t && t.projectId === projectId);
  if (scoped.length === 0) {
    return '<p class="field-hint">No tasks for this project.</p>';
  }
  return `<div class="task-list">${scoped.map(task => renderTaskCard(task, e)).join('')}</div>`;
}

function renderOutputs(outputs, projectId, e) {
  const scoped = (Array.isArray(outputs) ? outputs : []).filter(o => o && o.projectId === projectId && !isOperationalResult(o));
  if (scoped.length === 0) {
    return '<p class="field-hint">No outputs for this project.</p>';
  }
  return `<div class="project-outputs">${scoped.map(output =>
    `<button type="button" class="surface output-card" data-project-result="${e(output.id)}">` +
      `<strong>${e(output.title || 'Untitled output')}</strong>` +
      (output.summary ? `<p>${e(output.summary)}</p>` : '') +
    `</button>`
  ).join('')}</div>`;
}

function renderKnowledge(project, knowledge, mode, e, status = 'ready', error = '') {
  const selectedMode = project?.knowledgeMode || 'inherit';
  const selectHtml = `<div class="project-knowledge-control">` +
    `<label for="project-knowledge-mode">Knowledge mode</label>` +
    `<select id="project-knowledge-mode" data-project-knowledge-mode>` +
      `<option value="inherit"${selectedMode === 'inherit' ? ' selected' : ''}>Use app setting</option>` +
      `<option value="off"${selectedMode === 'off' ? ' selected' : ''}>Off</option>` +
      `<option value="read"${selectedMode === 'read' ? ' selected' : ''}>On demand</option><option value="automatic"${selectedMode === 'automatic' ? ' selected' : ''}>Automatic when enabled in app settings</option>` +
    `</select>` +
  `</div>`;

  if (mode !== 'read') {
    return `<div class="project-knowledge-content">${selectHtml}<p class="field-hint">Project knowledge is off.</p><p class="field-hint">Enable Project knowledge in Settings to allow on-demand access. A project set to Off stays disabled.</p></div>`;
  }

  const inventoryBtn = `<button type="button" class="secondary" data-project-initialize="${e(project?.id || '')}">Build project map</button><button type="button" class="subtle" data-project-inventory="${e(project?.id || '')}">Scan folder</button>`;
  const revision = knowledge?.revision != null ? `<p class="knowledge-revision">Revision ${e(knowledge.revision)}</p>` : '';
  const assuranceText = typeof knowledge?.assurance === 'string'
    ? knowledge.assurance
    : knowledge?.assurance?.coverage || 'Unverified: stored section metadata only. Source inventory and freshness have not been verified.';
  const assuranceHtml = `<p class="knowledge-assurance field-hint">Unverified. ${e(assuranceText)}</p>`;

  const items = Array.isArray(knowledge?.items) ? knowledge.items : [];
  let entriesHtml = '';
  if (items.length > 0) {
    entriesHtml = `<div class="knowledge-entries">${items.map(entry =>
      `<button type="button" class="subtle knowledge-entry" data-project-knowledge-read="${e(entry.id)}">` +
        `<strong>${e(entry.title || entry.id)}</strong>` +
        (entry.kind ? `<span class="task-status">${e(entry.kind)}</span>` : '') +
      `</button>`
    ).join('')}</div>`;
  } else {
    entriesHtml = status === 'loading' ? '<p role="status">Loading knowledge...</p>' : status === 'error' ? '' : '<p class="field-hint">No knowledge entries recorded.</p>';
  }

  return `<div class="project-knowledge-content">` +
    selectHtml +
    `<div class="project-knowledge-actions">${inventoryBtn}</div>` +
    revision +
    assuranceHtml +
    (knowledge?.maintenance && (knowledge.maintenance.pending || knowledge.maintenance.blocked || knowledge.maintenance.waitingReason) ? `<details><summary>Maintenance</summary><p>${e(knowledge.maintenance.pending || 0)} pending. ${e(knowledge.maintenance.blocked || 0)} need technical reconciliation.</p>${knowledge.maintenance.waitingReason ? `<p>${e(knowledge.maintenance.waitingReason)}</p>` : ''}</details>` : '') +
    entriesHtml +
    (status === 'error' ? `<p role="alert">${e(error)}</p><button type="button" data-project-knowledge-retry>Retry</button>` : '') +
    (knowledge?.nextCursor ? `<p class="field-hint">${e(items.length)} of ${e(knowledge.total)} sections</p><button type="button" data-project-knowledge-more ${status === 'loading' ? 'disabled' : ''}>Load more</button>` : '') +
  `</div>`;
}

export function renderProjectWorkspace({
  project,
  tasks = [],
  outputs = [],
  knowledge = null,
  mode = 'off',
  knowledgeStatus = 'ready',
  knowledgeError = '',
  tab = 'overview',
  escape,
  icon
}) {
  const e = typeof escape === 'function' ? escape : defaultEscape;
  const renderIcon = (name, cls = '') => typeof icon === 'function' ? icon(name, cls) : '';

  const activeTab = ['overview', 'work', 'outputs', 'knowledge'].includes(tab) ? tab : 'overview';
  const projectId = project?.id || '';

  const header = `<header class="page-heading project-workspace-header">` +
    `<div class="project-workspace-nav">` +
      `<button type="button" class="subtle" data-project-back>${renderIcon('arrow')}Back</button>` +
    `</div>` +
    `<h1 id="project-workspace-title" tabindex="-1">${e(project?.name || 'Project')}</h1>` +
    (project?.plan ? `<div class="project-actions"><button type="button" class="secondary" data-project-plan="${e(projectId)}">Plan</button></div>` : '') +
  `</header>`;

  const tabsNav = `<nav class="project-workspace-tabs" aria-label="Project tabs">` +
    `<button type="button" data-project-tab="overview" aria-pressed="${activeTab === 'overview' ? 'true' : 'false'}">Overview</button>` +
    `<button type="button" data-project-tab="work" aria-pressed="${activeTab === 'work' ? 'true' : 'false'}">Work</button>` +
    `<button type="button" data-project-tab="outputs" aria-pressed="${activeTab === 'outputs' ? 'true' : 'false'}">Outputs</button>` +
    `<button type="button" data-project-tab="knowledge" aria-pressed="${activeTab === 'knowledge' ? 'true' : 'false'}">Knowledge</button>` +
  `</nav>`;

  let content = '';
  switch (activeTab) {
    case 'work':
      content = renderWork(tasks, projectId, e);
      break;
    case 'outputs':
      content = renderOutputs(outputs, projectId, e);
      break;
    case 'knowledge':
      content = renderKnowledge(project, knowledge, mode, e, knowledgeStatus, knowledgeError);
      break;
    case 'overview':
    default:
      content = renderOverview(project, e, knowledge, mode);
      break;
  }

  return `<div class="surface project-workspace" data-project-workspace="${e(projectId)}">` +
    header +
    tabsNav +
    `<main class="project-workspace-panel" data-project-panel="${e(activeTab)}">${content}</main>` +
  `</div>`;
}
