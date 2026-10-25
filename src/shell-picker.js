// Keep the native select as the form value; the visible picker lists installed
// agents and their accounts in a popover, so opening it never moves the form.
export function shellPicker(select, account, { mark, choices, escape: e, more }) {
  const wrap = document.createElement('div');
  wrap.className = 'shell-picker';
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'shell-picker-trigger';
  trigger.setAttribute('aria-haspopup', 'true'); trigger.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'shell-picker-options'; list.popover = 'auto';
  list.id = `shell-picker-${Math.random().toString(36).slice(2)}`;
  list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Agents and shells');
  trigger.popoverTargetElement = list; trigger.setAttribute('aria-controls', list.id);
  wrap.append(trigger, list);
  select.after(wrap);
  select.classList.add('shell-picker-value');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  let rows = [];
  const key = row => `${row.provider}|${row.accountId || ''}`;
  const current = () => rows.find(row => row.provider === select.value && (row.accountId || '') === (account.value || ''))
    || rows.find(row => row.provider === select.value);
  function render() {
    rows = choices();
    const groups = [...new Set(rows.map(row => row.group))];
    list.innerHTML = groups.map(group => `<p class="shell-picker-group">${e(group)}</p>` + rows.map((row, index) => row.group !== group ? '' :
      `<button type="button" data-choice="${index}" aria-pressed="false">${mark(row.provider)}<span class="shell-picker-name">${e(row.label)}${row.best ? '<small class="shell-picker-best">Most left</small>' : ''}</span>${row.detail ? `<span class="shell-picker-detail">${e(row.detail)}</span>` : ''}</button>`).join('')).join('')
      + (more ? `<button type="button" class="shell-picker-more" data-more>${e(more.label)}</button>` : '');
    sync();
  }
  function sync() {
    const chosen = current();
    trigger.innerHTML = `${mark(select.value)}<span class="shell-picker-name">${e(chosen?.label || select.selectedOptions[0]?.text || 'Choose an agent')}${chosen?.detail ? `<small class="shell-picker-detail">${e(chosen.detail)}</small>` : ''}</span><svg class="shell-picker-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>`;
    trigger.firstElementChild?.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-label', 'Agent or shell: ' + (chosen?.label || select.selectedOptions[0]?.text || 'none'));
    trigger.disabled = select.disabled;
    for (const button of list.querySelectorAll('[data-choice]')) button.setAttribute('aria-pressed', String(rows[button.dataset.choice] === chosen));
  }
  function place() {
    // A popover sits in the top layer, so it can extend past the dialog edges.
    const box = trigger.getBoundingClientRect(), gap = 6, edge = 12;
    const below = innerHeight - box.bottom - gap - edge, above = box.top - gap - edge;
    list.style.width = `${Math.max(box.width, Math.min(380, innerWidth - 2 * edge))}px`;
    list.style.left = `${Math.max(edge, Math.min(box.left, innerWidth - edge - list.offsetWidth))}px`;
    // Open below unless the list fits better above.
    const down = below >= Math.min(list.scrollHeight, 260) || below >= above;
    const height = Math.min(440, down ? below : above);
    list.style.maxHeight = `${height}px`;
    list.style.top = down ? `${box.bottom + gap}px` : `${box.top - gap - Math.min(height, list.scrollHeight)}px`;
  }
  list.addEventListener('beforetoggle', event => { if (event.newState === 'open') render(); });
  list.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(open));
    if (!open) return;
    place();
    (list.querySelector('[aria-pressed=true]') || list.querySelector('button'))?.focus({ preventScroll: true });
    list.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest' });
  });
  list.addEventListener('click', event => {
    if (event.target.closest('[data-more]')) { list.hidePopover(); more.open(); return; }
    const row = rows[event.target.closest('[data-choice]')?.dataset.choice];
    if (!row) return;
    const changed = key(row) !== `${select.value}|${account.value || ''}`;
    select.value = row.provider; account.value = row.accountId || '';
    list.hidePopover(); sync(); trigger.focus({ preventScroll: true });
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  list.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...list.querySelectorAll('button:not(:disabled)')];
    let index = buttons.indexOf(document.activeElement);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus({ preventScroll: true }); buttons[index]?.scrollIntoView({ block: 'nearest' });
  });
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && !select.disabled) { event.preventDefault(); list.showPopover(); }
  });
  addEventListener('resize', () => { if (list.matches(':popover-open')) place(); });
  select.addEventListener('change', sync);
  sync();
  return { sync: render, close() { if (list.matches(':popover-open')) list.hidePopover(); } };
}
