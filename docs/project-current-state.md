# Project Current State

This guide maps implemented architecture and entry points in the current source tree. It reflects working code rather than packaged releases or historical planning documents.

## Source vs Packaged Release

Packaged releases can lag the working tree; their feature set must be checked against their own release notes. No current download or installed-package version was verified by this refresh. Working source adds the unified Projects workspace, removed standalone Tasks and Results sidebar navigation, syntax extraction via Lezer, source snapshots, an asynchronous documentation queue, and system task resolution. Running current behavior requires launching from source or creating fresh builds.

## Desktop Bootstrap and Controllers

- Bootstrap: `src/app.js` manages window view state, page routing, selected/expanded console IDs, and keyboard dispatch.
- Window shell: `src/ui/shell.js` defines top-level markup and navigation buttons (Consoles, Projects, Usage, Settings).
- Projects workspace controller: `src/pages/project-workspace-controller.js` manages Overview, Work, Outputs, and Knowledge tabs, knowledge epoch invalidation, and focus retention.
- Projects workspace renderer: `src/pages/project-workspace.js` renders workspace tabs, task cards, outputs, and knowledge records.
- Project management and plans: `src/projects-ui.js` and `src/project-plan-ui.js` handle project listings, cards, and plan section reviews.
- Console grid and terminals: `src/console/grid.js`, `src/console/terminals.js`, `src/console/panels.js`, `src/console/terminal-fit.js`, and `src/console/chooser.js`.
- Pages: `src/pages/usage-page.js`, `src/pages/accounts-settings.js`, `src/pages/tools-page.js`, and `src/pages/settings-page.js`.
- State bridge: `src/state-client.js` connects renderer views to Electron main-process state.

## Electron Services and Provider Launch

- Main process: `electron/main.cjs` handles application lifecycle, safeStorage credential encryption, service instantiation, and IPC channels.
- Command dispatch: `electron/desktop-commands.cjs` routes IPC requests for sessions, settings, projects, tasks, tools, and knowledge.
- Sessions and PTY: `electron/sessions.cjs` manages layouts and lifecycle; `electron/session-launch.cjs` spawns CLI processes; `electron/session-runtime.cjs` tracks terminal streams and status.
- CLI arguments and configuration: `electron/cli-launch.cjs` serializes provider MCP configuration and permission flags.
- Provider strategies: `electron/providers/` defines provider catalogs and capabilities; `electron/providers/strategies/` provides CLI-specific execution logic.
- Passive checks: automatic refresh skips interactive Cursor/Antigravity usage CLIs; explicit Refresh retains native quota reads. Cached readings retain their original observation time.
- Account routing: `electron/task-accounts.cjs` evaluates accounts, quota freshness, funding, and free-tier routes.

## Shared Tools, Task Scheduling, and Resolution

- Admission: `electron/scheduler.cjs` and `electron/worker-registry.cjs` enforce per-project slots (default five), explicit account limits and shared-checkout write isolation.

- Shared tool transport and context: `electron/shared.cjs` hosts the loopback hub and `dock_context`, `dock_tools`, `dock_call` entry points; `electron/workbench.cjs` supplies the `dock/*` task, project, knowledge and completion handlers.
- Task orchestration: `electron/task-loop.cjs` manages task attempts, checks execution, reviewer coordination, and completion records.
- Task resolution: `electron/task-resolution.cjs` computes system dispositions (`verified`, `integrated`, `completed-unverified`) from current diff fingerprints and HEAD, configured check results, and any configured reviewer verdict. It records system action separately from owner approval; current-checkout work may include authorized uncommitted changes.
- Worktree and file boundaries: `electron/task-ownership.cjs` checks file ownership patterns; `electron/task-checkout.cjs` links dependencies into isolated task checkouts.
- Execution history: `electron/execution-history.cjs` stores durable task reports and outcomes.

## Source Snapshots and Knowledge Upkeep

- Persistence service: `electron/project-knowledge.cjs` manages atomic per-project JSON documents and operation journals under `<data>/knowledge/<projectId>.json`.
- Policy boundary: `electron/knowledge-policy.cjs` evaluates Off, On demand, and Automatic modes; `electron/knowledge-access.cjs` gates tools, desktop reads, and snapshot capture.
- Contract validation: `electron/knowledge-contracts.cjs` validates section structure, evidence, and freshness metadata.
- Read views: `electron/knowledge-reader.cjs` serves paged directories and bounded whole-section reads.
- Documentation authoring: `electron/knowledge-authoring.cjs` validates source-backed writes and serves current overview previews; `electron/documentation-map.cjs` seeds a deterministic source directory. `skills/project-documentation/SKILL.md` is available through `dock/knowledge_guide`.
- Proposed map adoption: `electron/knowledge-adoption.cjs` checks observed source hashes and imports inferred section proposals without changing owner intent.
- Snapshots and extraction: `electron/source-snapshots.cjs` captures hash-pinned UTF-8 source with private-path and known-credential filtering (not a universal secret detector); `electron/source-symbols.cjs` parses JS/TS/JSX declarations using Lezer syntax trees without LSP or type inference.
- Upkeep engine and queue: `electron/knowledge-queue.cjs` manages the durable documentation queue; `electron/knowledge-upkeep.cjs` reconciles completed task deltas under bounded attempt budgets.
- Repository scanner: `electron/repo-inventory.cjs` performs bounded metadata scanning.

## Phone Protocol and Companion Features

- Transport and security: `electron/mobile.cjs` hosts HTTPS/WSS over Tailscale with safeStorage pairing tokens and protocol v2 state streaming.
- Phone command routing: `electron/mobile-commands.cjs` dispatches phone requests for consoles, projects, tasks, and outputs.
- Flutter client: `mobile/lib/dock_client.dart` maintains transport connections and decodes protocol v2 frames.
- Mobile shell: `mobile/lib/app/dock_home.dart` coordinates mobile pages; `mobile/lib/app/home_chrome.dart` dynamically presents navigation destinations (Consoles, Projects, Usage, Settings when `projects.workspace` capability is present; standalone Results on legacy PC hosts).
- Mobile projects workspace: `mobile/lib/features/projects/project_workspace.dart` and `mobile/lib/projects_page.dart` render Overview, Work, Outputs, and Knowledge tabs on mobile.

## Validation Commands

- Desktop build and checks: `npm run build` (runs syntax, theme, and `scripts/check-boundaries.cjs`), `npm test`.
- Desktop headless tests: `npm run test:linux` builds the Docker test environment and runs units plus the six `npm run test:desktop` scripts without opening local windows.
- Theme and profile generators: `node scripts/build-theme-data.cjs --check` and `node scripts/generate-agent-profiles.cjs --check`.
- Mobile validation: `flutter analyze` and `flutter test` within `mobile/`.
- Packaged installation testing: `npm run pack`, `npm run test:packaged`, and `scripts/test-installer.ps1`.
- Restart behavior: `scripts/relaunch.ps1` defaults to one shot; `-Hours` explicitly opts into continued supervision. Scheduled helpers and stop commands stay hidden. Requests delayed beyond their intended time plus two minutes expire without touching the running app.
- Restart preflight: `scripts/relaunch-preflight.cjs` uses an isolated copied profile and hidden `--startup-check` mode. Success never shows/focuses its window; startup failures log and exit without a dialog. Ordinary desktop interaction tests still run in Docker.

For the stale saved-project audit and refresh order, see [Project refresh](project-refresh-2026-11-05.md). Existing architecture plans and dated handoffs retain their historical status; this guide records implemented entry points and does not approve scope or prove semantic documentation correct.
