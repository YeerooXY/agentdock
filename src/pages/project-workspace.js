// Project knowledge view.
// Pure render function; controllers and event listeners are owned by the lead.

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
    (knowledge?.maintenance && (knowledge.maintenance.pending || knowledge.maintenance.blocked || knowledge.maintenance.waitingReason) ? `<details open><summary>Documentation maintenance</summary><p>${e(knowledge.maintenance.pending || 0)} pending. ${e(knowledge.maintenance.blocked || 0)} need technical reconciliation.</p>${knowledge.maintenance.waitingReason ? `<p>${e(knowledge.maintenance.waitingReason)}</p>` : ''}</details>` : '') +
    entriesHtml +
    (status === 'error' ? `<p role="alert">${e(error)}</p><button type="button" data-project-knowledge-retry>Retry</button>` : '') +
    (knowledge?.nextCursor ? `<p class="field-hint">${e(items.length)} of ${e(knowledge.total)} sections</p><button type="button" data-project-knowledge-more ${status === 'loading' ? 'disabled' : ''}>Load more</button>` : '') +
  `</div>`;
}

export function renderProjectWorkspace({
  project,
  knowledge = null,
  mode = 'off',
  knowledgeStatus = 'ready',
  knowledgeError = '',
  escape,
  icon
}) {
  const projectId = project?.id || '';
  const e = typeof escape === 'function' ? escape : defaultEscape;
  const renderIcon = (name, cls = '') => typeof icon === 'function' ? icon(name, cls) : '';

  const header = `<header class="page-heading project-workspace-header">` +
    `<div class="project-workspace-nav">` +
      `<button type="button" class="subtle" data-project-back>${renderIcon('arrow')}Back</button>` +
    `</div>` +
    `<h1 id="project-workspace-title" tabindex="-1">${e(project?.name || 'Project')}</h1>` +
  `</header>`;

  return `<div class="surface project-workspace" data-project-workspace="${e(projectId)}">` +
    header +
    `<main class="project-workspace-panel" data-project-panel="knowledge">${renderKnowledge(project, knowledge, mode, e, knowledgeStatus, knowledgeError)}</main>` +
  `</div>`;
}
