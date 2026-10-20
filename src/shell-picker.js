// Keep the native select as the form value; the visible picker adds local logos.
export function shellPicker(select, mark) {
  const details = document.createElement('details');
  details.className = 'shell-picker';
  const summary = document.createElement('summary');
  const options = document.createElement('div');
  options.className = 'shell-picker-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'AI shells');
  details.append(summary, options);
  select.after(details);
  select.classList.add('shell-picker-value');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  let signature;
  function sync() {
    const next = JSON.stringify([...select.options].map(x => [x.value, x.text, x.disabled]));
    if (next !== signature) {
      options.replaceChildren(...[...select.options].map((option, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.shellIndex = index;
        button.innerHTML = mark(option.value);
        button.firstElementChild?.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.textContent = option.text;
        button.append(name); button.disabled = option.disabled;
        return button;
      }));
      signature = next;
    }
    const chosen = select.selectedOptions[0];
    summary.innerHTML = chosen ? mark(chosen.value) : '';
    const name = document.createElement('span'); name.textContent = chosen?.text || 'Choose a shell';
    summary.append(name);
    summary.setAttribute('aria-label', 'Agent or shell: ' + name.textContent);
    summary.setAttribute('aria-disabled', String(select.disabled));
    summary.tabIndex = select.disabled ? -1 : 0;
    for (const button of options.children) button.setAttribute('aria-pressed', String(Number(button.dataset.shellIndex) === select.selectedIndex));
    if (select.disabled) details.open = false;
  }
  summary.addEventListener('click', event => { if (select.disabled) event.preventDefault(); });
  options.addEventListener('click', event => {
    const button = event.target.closest('button[data-shell-index]');
    if (!button || button.disabled || select.disabled) return;
    select.selectedIndex = Number(button.dataset.shellIndex);
    details.open = false; sync(); summary.focus({ preventScroll: true });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  details.addEventListener('keydown', event => {
    if (event.key === 'Escape' && details.open) {
      event.preventDefault(); event.stopPropagation(); details.open = false; summary.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || select.disabled) return;
    event.preventDefault(); details.open = true;
    const buttons = [...options.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    let index = buttons.indexOf(document.activeElement);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else if (index < 0) index = Math.max(0, buttons.findIndex(x => Number(x.dataset.shellIndex) === select.selectedIndex));
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus({ preventScroll: true }); buttons[index].scrollIntoView({ block: 'nearest' });
  });
  details.addEventListener('focusout', () => setTimeout(() => { if (!details.contains(document.activeElement)) details.open = false; }, 0));
  select.addEventListener('change', sync);
  sync();
  return { sync, close() { details.open = false; } };
}
