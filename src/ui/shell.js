// The static window frame: sidebar, title bar, page regions and the two
// app-level dialogs. Rendered once at startup; pages fill #content.
import { icon, pdMark } from './icons.js';

export function mountShell(root, { consoleProviders, providerName }) {
  root.innerHTML = `
<div id="dashboard" class="app-shell">
  <div class="workspace">
    <header class="titlebar">
  <aside id="sidebar" class="sidebar">
    <button class="brand" data-page="consoles" aria-label="Paddock home"><span class="brand-mark">${pdMark()}</span><span>pad<span class="brand-light">dock</span></span></button>
    <nav aria-label="Main navigation">
      <button data-page="consoles"><span class="notification-icon">${icon('terminal')}<span id="ready-count" class="notification-badge" hidden></span></span>Consoles <span id="nav-count">0</span></button>
      <button data-page="projects">${icon('folders')}Projects</button>
      <button data-page="usage">${icon('chart')}Usage</button>
    </nav>
    <span class="sidebar-edge" aria-hidden="true"></span>
    <div class="sidebar-bottom"><button data-page="settings">${icon('settings')}Settings</button></div>
  </aside>
    <div class="window-drag-handle" data-window-drag title="Drag to move. Double-click for fullscreen." aria-hidden="true"><span></span></div><div class="window-actions"><button data-action="hud" title="Collapse to corner HUD" aria-label="Collapse to corner HUD">${icon('corner')}</button><button data-action="minimize" aria-label="Minimize">${icon('minus')}</button><button data-action="fullscreen" aria-label="Fullscreen" title="Fullscreen">${icon('expand')}</button><button data-action="tray" aria-label="Hide in system tray" title="Hide in system tray">${icon('close')}</button></div></header>
    <div id="startup-notices" aria-live="polite"></div>
    <main id="content" tabindex="-1"></main>
    <section id="consoles-page" class="console-grid-view" hidden aria-label="Consoles"><div class="consoles-only"><div class="session-grid"></div></div><button id="grid-add" class="primary" data-action="new" aria-label="Add console" title="Add console, Ctrl Shift N" hidden>${icon('plus')}</button></section>
    <div id="terminal-cache" hidden></div>
  </div>
</div>
<section id="hud" hidden aria-label="Paddock desktop HUD"></section>
<dialog id="console-chooser" aria-labelledby="console-chooser-title" aria-describedby="console-chooser-hint">
  <form id="one-off-console-form">
    <div class="dialog-heading"><div><h2 id="console-chooser-title">Open console</h2><p id="console-chooser-hint">Just for this console.</p></div><button type="button" class="icon-button" data-action="cancel-console" aria-label="Close chooser">${icon('close')}</button></div>
    <label>Computer<select name="remoteHostId"><option value="">This PC</option></select></label><label id="chooser-remote-folder" hidden>Linux folder<input name="remoteFolder" value="."></label><div class="chooser-project"><label>Project<div class="folder-input"><select name="projectId"><option value="">No project</option></select><button type="button" class="secondary" id="chooser-new-project">New project</button></div></label><label id="chooser-project-folders" hidden>Start in<select name="projectFolder"></select></label></div>
    <label>Name <span class="optional">optional</span><input name="name" maxlength="64" placeholder="Uses the folder name" autocomplete="off"></label>
    <div class="form-pair"><div class="shell-field"><span>Agent or shell</span><select name="provider" aria-label="Agent or shell">${consoleProviders().map(provider => `<option value="${provider}">${providerName(provider)}</option>`).join('')}</select><input type="hidden" name="accountId"></div><label id="one-off-model">Model<select name="model"><option value="">Agent default</option><option value="__custom__">Enter a model…</option></select></label></div>
    <label id="one-off-custom-model" hidden>Model name<input name="customModel" maxlength="200" spellcheck="false" autocomplete="off" placeholder="Model name or alias"></label>
    <label>Project folder<div class="folder-input"><input name="cwd" required><button type="button" data-action="pick-folder" aria-label="Choose project folder for this console">${icon('folder')}</button></div></label>
    <label id="one-off-command" hidden>Command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run"></textarea></label>
    <details class="console-options"><summary>Options</summary><label id="one-off-permissions">Permissions<select name="permissions"><option value="unrestricted">Unrestricted</option><option value="default">Agent defaults</option></select></label><label class="chooser-check" id="one-off-worktree"><input type="checkbox" name="worktree" value="1"><span>Work in a new Git worktree<small>Its own branch and folder, so agents working in parallel don’t overwrite each other.</small></span></label></details>
    <p class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="secondary" data-action="cancel-console">Cancel</button><button type="submit" class="primary">Open console</button></div>
  </form>
</dialog>
<dialog id="account-rename-dialog" aria-labelledby="account-rename-title">
  <form id="account-rename-form">
    <div class="dialog-heading"><div><h2 id="account-rename-title">Rename account</h2></div><button type="button" class="icon-button" data-action="cancel-account-rename" aria-label="Close rename dialog">${icon('close')}</button></div>
    <label>Account name<input name="label" required maxlength="64" autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <div class="dialog-footer"><button type="button" class="secondary" data-action="cancel-account-rename">Cancel</button><button type="submit" class="primary">Save name</button></div>
  </form>
</dialog>`;
  const titlebar = root.querySelector('.titlebar');
  titlebar.insertAdjacentHTML('afterbegin', '<button class="vim-mode" data-action="vim-normal" hidden></button>');
  titlebar.querySelector('.window-actions').insertAdjacentHTML('beforebegin', '<button id="screenshot-spot" class="screenshot-spot" data-action="paste-screenshot" draggable="true" hidden><img alt="" width="48" height="27"><span>Paste screenshot</span></button>');
  // Rail buttons show their name as a tooltip; the label stays for screen readers.
  root.querySelectorAll('.sidebar [data-page]').forEach(button => {
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.textContent.replace(/\d+$/, '').trim());
    const label = document.createElement('span'); label.className = 'rail-tooltip'; label.textContent = button.getAttribute('aria-label');
    for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    button.append(label);
  });
  root.querySelectorAll('.sidebar button').forEach(button => {
    button.removeAttribute('title');
  });
}
