import { projectColor, projectDot } from './project-colors.js';

export function projectUsage({ getState, escape: e, providerName, number, mark }) {
  let project = '';
  const expanded = new Map();
  const windowName = minutes => minutes === 10080 ? 'Weekly' : minutes === 300 ? '5h' : minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes} min`;
  function quota(row) {
    if (!row.quota?.length) return `<span class="usage-unknown">${row.source === 'Dock API' ? 'API billing' : 'Not reported'}</span>`;
    return row.quota.map(q => {
      const known = typeof q.changePercent === 'number' && Number.isFinite(q.changePercent) && q.changePercent >= 0 && q.changePercent <= 100;
      return `<div class="turn-quota"><span>${e(windowName(q.minutes))}<b>${known ? '~' + number(q.changePercent) + '%' : '—'}</b></span>${known ? `<div class="turn-quota-meter" aria-hidden="true"><i style="width:${q.changePercent}%"></i></div>${q.changePercent === 0 ? '<small>No reported change; readings may be rounded.</small>' : ''}` : `<small>${e(q.reason || 'Not reported')}</small>`}</div>`;
    }).join('');
  }
  function render() {
    const state = getState(), rows = state.messages || [], groups = new Map();
    const projects = new Map((state.projects || []).map(x => [x.id, x]));
    for (const row of rows) {
      const id = row.projectId || 'unassigned';
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(row);
      if (row.projectId && !projects.has(id)) projects.set(id, { id, name: row.projectName || 'Removed project' });
    }
    const visible = [...groups].filter(([id]) => !project || id === project);
    const sections = visible.map(([id, turns], index) => {
      const p = projects.get(id) || { name: 'Unassigned' };
      const open = expanded.has(id) ? expanded.get(id) : index === 0;
      return `<details class="usage-project" data-usage-group="${e(id)}" style="--project-color:${projectColor(p)}" ${open ? 'open' : ''}><summary>${projectDot(p)}<strong>${e(p.name)}</strong><span>${turns.length} turn${turns.length === 1 ? '' : 's'}</span></summary><div class="table-scroll"><table><thead><tr><th>Time / console</th><th>AI / model</th><th>Quota change · estimate</th><th>Input</th><th>Output</th><th>Cache reads</th></tr></thead><tbody>${turns.map(row => `<tr><td>${e(new Date(row.at).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }))}<small>${e(row.consoleName || providerName(row.provider))}</small></td><td><div class="usage-turn-model">${mark(row.provider)}<span>${e(row.model || providerName(row.provider))}</span></div><small>${e(row.status || '')}${row.steps ? ' · ' + row.steps + ' steps' : ''}</small></td><td class="usage-quota-cell">${quota(row)}</td><td class="mono">${number(row.usage?.input)}</td><td class="mono">${number(row.usage?.output)}</td><td class="mono">${number(row.usage?.cached)}</td></tr>`).join('')}</tbody></table></div></details>`;
    }).join('');
    return `<section class="surface message-usage"><div class="section-label"><h2>Project turns</h2><span>Latest ${rows.length}</span></div><label class="usage-project-filter">Project<select data-usage-project><option value="">All projects</option>${[...projects.values()].map(p => `<option value="${e(p.id)}" ${project === p.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}<option value="unassigned" ${project === 'unassigned' ? 'selected' : ''}>Unassigned</option></select></label><p class="section-note">Quota changes are estimates and can include other account activity.</p>${sections || '<p class="section-note">No recorded turns for this project.</p>'}<details class="usage-measurement-note"><summary>How quota change is measured</summary><p>The difference between provider readings near the start and end of a turn. Each percentage refers to its own quota window. These account-wide changes are not added across consoles or projects. Missing, stale, reset or exhausted readings stay unavailable. A reported 0% can be rounded. Subscription price is separate from API billing.</p></details></section>`;
  }
  function mount() {
    const root = document.querySelector('.message-usage');
    if (!root) return;
    root.addEventListener('toggle', event => { if (event.target.matches('[data-usage-group]')) expanded.set(event.target.dataset.usageGroup, event.target.open); }, true);
    root.querySelector('[data-usage-project]').addEventListener('change', event => {
      project = event.target.value; root.outerHTML = render(); mount(); document.querySelector('[data-usage-project]')?.focus();
    });
  }
  return { render, mount };
}
