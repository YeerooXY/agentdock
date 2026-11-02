# Architecture audit, 2 November 2026

Six read-only reviews (Claude Opus, low effort), one per area. Nothing was edited or run by the reviewers. Line numbers refer to the working tree on 2 November, which held uncommitted account and model-switching work. Astra passes were not run: only the main Codex account offers Astra and its allowance read 0%.

## Scores

| Area | Score | Main reason |
|---|---|---|
| Desktop renderer (`src/app.js` and UI modules) | 4/10 | `app.js` holds rendering, state intake, events and provider rules; each state update rebuilds the page, so every form needs its own focus and draft restore code |
| Visual system (CSS, themes, effects) | 4/10 | One theme lives in 3 to 5 files in 2 languages; every effect is written twice; about 1,500 hex literals, 105 `!important`, more than 30 page widths |
| Electron backend and connectivity | 4/10 | `main.cjs` wires about 30 services by hand; whole state is sent on every change; concurrency caps are copied literals |
| Providers, accounts and usage | 4/10 | Good registry seeds exist, but provider rules sit in `if` branches across about 10 files; only 4 of 14 providers support extra accounts |
| Mobile app | 4/10 | `_DockHomeState` is about 1,900 lines; every terminal packet rebuilds the whole app; protocol data is untyped maps |
| Tasks, Projects and Results | 4/10 | "Project" means three different things; results are stored files, not outcomes; updates rely on refreshes nobody waits for |

Overall: about 4/10 for outside contributors. The domain logic is careful (validation, atomic writes, credential handling, tests). The structure is what holds it back: large files, special cases by name, and no shared state or provider system.

## Cross-cutting causes

The six reports point to five shared causes. Fixing these removes most listed bugs.

1. **No state store.** The backend sends the full snapshot on every change from about 20 sources (`electron/main.cjs:179`). The desktop rebuilds whole pages (`src/app.js:716`) and the phone rebuilds the whole app per terminal packet (`mobile/lib/dock_client.dart:962`). Some task updates are only persisted, never emitted (`electron/task-loop.cjs`, about 27 `persist(job)` sites), and the phone is never subscribed to tasks (`electron/mobile.cjs:115`). This explains stale tasks, lag, lost focus and closing dropdowns.
2. **No provider adapter.** Provider facts are stated in several places that can disagree (`provider-account-capabilities.cjs:20`, `main.cjs:432-448`, `subscription-usage.cjs:360`, `src/app.js:199,276,764`, `mobile/lib/agent_menu.dart:186-191`). Android previews 28 to 32 were all fixes to hardcoded screen parsing.
3. **No project identity.** Results group by `projectId || path` (`src/results-model.js:2`), Projects resolve by folder prefix (`src/project-activity.js:9`), and results saved before a console was bound keep their path forever. This is why "agent-dock" and "Agentdock" are two groups.
4. **No design tokens or shared components.** Page widths, card grids and colors are set per file, and later files win with `!important`. Projects cards get two different grid rules (`src/projects.css:6`, `src/workspace-glass.css:12`).
5. **No scheduler.** One task per repository and two running tasks are hardcoded twice (`electron/task-loop.cjs:188-189,251-252`); plan-ready tasks hold slots; other limits live in `task-plan.cjs:219`, `delegation.cjs:264`, `worker-placement.cjs:11`.

## Bugs found (fix early, small)

- Mobile menu offers "Set up X" for ready accounts and never for unready ones; both loops filter `ready == true` (`mobile/lib/main.dart`, account items).
- Plan-ready tasks block their repository and one of the two global slots until approved (`electron/task-loop.cjs:188`).
- `reserved` repository key may stay locked if an await throws before release (`electron/task-loop.cjs:255-274`); confirm and add `finally`.
- "12 needs attention" counts every interrupted or failed task ever, including ones killed by closing Paddock (`src/project-activity.js:2,21`); also a wrong plural.
- Phone bridge has no heartbeat; half-open sockets stay until TCP times out and can fill the 9-client cap (`electron/mobile.cjs:165`).
- On slow links the 2 MB buffer limit closes the socket, then a full state resend repeats the cycle (`electron/mobile.cjs:287`).
- Three `escape` functions disagree on `0` and `null` (`src/app.js:52`, `src/markdown.js:4`, `src/account-identity.js:40`).
- Desktop provider `<select>` never removes options for removed agents (`src/app.js:884`); account form restore uses a magic index (`src/app.js:723`); usage focus restore drops focus to the page body for unknown controls (`src/app.js:668`).
- Rule regexes differ between `agent_menu.dart:215` and `agent_dialog.dart:64`; dialog choices vanish when one repaint frame breaks the pattern.
- Wording: middle dots and em dashes in status text (`src/projects-ui.js:34,47,62`, `src/workbench-ui.js:22`, theme `detail` strings in `console-themes.js` and `console_theme.dart`).

## Target system

### State
- `electron/state-store.cjs`: keyed slices (sessions, tasks, projects, accounts, usage, results) with a revision number each. Services call `store.set(slice, value)`; the store coalesces per tick and emits `{slice, rev, patch}`.
- Desktop and phone subscribe through the same protocol. The phone sends `hello{lastRev}`; a gap triggers a resync. Heartbeat every 15 s, latest-wins frames instead of closing.
- Desktop views and phone screens update only when their slice changes. Desktop pages are patched in place (morphdom-style) so focus, typed text, `<details>` and open selects survive without per-form code.

### Providers
One adapter file per CLI, `electron/providers/<id>.cjs`, validated by a schema:

```js
module.exports = {
  id: 'cline',
  catalog: { command, install, docs, authHint },
  launch: { modelFlag: '--model', effortFlag: null, instructions: {...}, mcp: {...} },
  accounts: { isolation: { env: 'CLINE_DIR', homeScoped: false, extraDirs: [] },
              login: { args: ['auth'] }, verified: '2026-11-02 cline 1.x' } || null,
  usage: { read: async ctx => readings, nativeHint: '/usage' } || null,
  models: { list: async ctx => models } || null,
  settings: { switch: 'resume' | 'command' | null },
  session: { resumeArgs, confirmIdentity, postLaunch },
  screen: { cliVersion: '>=1.4', selectors: ['❯'], banner: '^Cline v', emptyPrompt: [...] },
};
```

The catalog, capability table and usage reader map are derived from the registry. The phone receives `screen` profiles as data at connect time and keeps only generic parsers. Each adapter has recorded screens per CLI version under `tests/fixtures/providers/<id>/<version>/`, run by both node and Dart tests. Adding a provider means one adapter plus fixtures.

### Projects, tasks, results
- One resolver, `electron/project-index.cjs`: path or item to `projectId`, used by main, renderer and phone. Attribution is resolved when read, so it cannot go stale.
- Task: `{id, projectId, originConsoleId, state, outcome, acknowledgedAt, supersededBy}`. Attention counts only unacknowledged `needs-you`, `failed` and `plan-ready`.
- Result: an outcome record `{type: task | turn | asset, projectId, taskId, consoleId, artifacts[]}`. A task card shows title, a one-line outcome, the verdict, changed files, check status, open items, and actions (Open diff, Accept, Resume, Open console). Tokens, raw step output and the full diff sit behind a "Technical log" disclosure; `<tool_call>` markup is stripped.
- Pages: Projects shows one card per project with fixed slots and a single "Awaiting your approval" inbox. Tasks shows active work and an inbox; history is collapsed. Results groups by project, then console or task, then outcome. "Add files" becomes "Attach file to project" or is removed.

### Scheduler
`electron/scheduler.cjs` queues jobs with declared resources: repository branch lock for current-branch work, worktree or file ownership for parallel work, per-account concurrency, and a global limit from Settings. Jobs queue with a visible position instead of failing. Plan-ready jobs hold no slot.

### Visual system
- One manifest per theme, `themes/<id>.json` (colors, frame, texture, opening, ambient, reactions). `scripts/build-themes.cjs` generates the JS module, the Dart constants and the CSS variables, and a test checks both platforms implement every referenced effect.
- Effect contract on both platforms: `setup(size, palette, params)`, `draw(t, dt)`, a time and flash budget, reduced motion. A small primitive set (particles, rings, sweep, flash, glyphs, shake) makes most effects compositions, so swapping an effect is one manifest line.
- CSS: `@layer reset, tokens, base, layout, components, themes, overrides`; `tokens.css` with colors, spacing and page widths (`--page-narrow: 720px; --page-default: 1100px; --page-wide: 1480px`); one `.page` primitive with `data-width`; components replace the polish, trim and glass override files; a lint rule bans hex outside tokens and generated themes.
- Theme creator guide: manifest fields and defaults, contrast rules, effect catalog with parameter ranges, limits, texture rules, build and preview commands, screenshot checklist, and how to write a custom effect.

### Mobile structure
`lib/core/` (connection state machine, typed protocol models, drafts), `lib/providers/` (profile registry, shared screen grammar), `lib/features/` (console, projects, results, settings, pairing, usage), `lib/app/` (shell with a tab enum, theme). Separate notifiers for connection, appearance and each terminal, so output only repaints its own console.

## Phased plan

Phases can overlap where file ownership does not.

**Phase 0, quick fixes (S, parallel):** the bugs list above; route every task `persist` through `changed()`; subscribe the phone to tasks; heartbeat; single project grouping key; honest attention count; remove the conflicting grid rule; rename "Add files"; batch pty output; precompile mobile regexes; per-terminal notifier on the phone.

**Phase 1, foundations (M, parallel by owner):**
- A: state store with revisions and throttled publish (`electron/state-store.cjs`, `main.cjs` publish, `mobile.cjs`).
- B: provider registry wrapping the current tables, derived usage flag, normalized account ids (`electron/providers/*`, `cli-catalog.cjs`, `provider-account-capabilities.cjs`).
- C: design tokens, page widths and `@layer` wrappers (`src/tokens.css`, `src/page-layout.css`, `src/style.css` formatting).
- D: project resolver and task outcome JSON (`electron/project-index.cjs`, `task-loop.cjs` report section, `src/results-model.js`).

**Phase 2, migrate onto the foundations:** desktop in-place patching, then extract views from `app.js` one page at a time; phone typed `Session` model, console actions sheet, composer controller; launch strategies and session hooks into adapters; screen profiles served to the phone with golden fixtures; scheduler with worktree and file-ownership parallelism; theme manifest and codegen; Projects, Tasks and Results restyled on one shared card component.

**Phase 3, breadth:** extra accounts for copilot, qwen, droid, cline, opencode, kimi, kiro, cursor, grok and antigravity (one per change, each with an isolation fixture); usage readers for gemini, grok, droid, cline and qwen or an explicit "unknown"; model discovery for all providers; effect primitives and the redesigned RGB opening; theme creator guide; mobile feature folders.

## Corrections to earlier assumptions

- Cursor already has a usage reader (`electron/cursor-usage.cjs`). Missing readers: gemini, grok, cline, droid, qwen.
- The recent account change added named profiles for exactly two providers, Gemini and Pi. Supported now: Codex, Claude, Gemini, Pi.
