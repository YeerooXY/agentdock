# Module boundaries

This map describes implemented boundaries, including the project workspace,
knowledge persistence, source extraction and task helpers below. See
[Project current state](project-current-state.md) for a concise mapping of
implemented source entry points across desktop, backend and mobile.

## Desktop

`src/app.js` composes controllers and owns window navigation, selected and
expanded console IDs, state intake and window keyboard dispatch. It obtains
state through `state-client.js`. Controllers receive explicit callbacks and
state readers; they do not import the bootstrap or expose mutable globals.

| Responsibility | Entry point | Ownership |
| --- | --- | --- |
| Console grid | `src/console/grid.js` | Cards, expansion, opening effects and DOM patching |
| Terminal lifetime | `src/console/terminals.js` | One xterm per console, serialized output, fitting, text size and screenshot paste |
| Terminal geometry | `src/console/terminal-fit.js` | Fit decisions and scroll anchors |
| Slot geometry | `src/console/panels.js` | Open-panel selection, capacity and occupied cells |
| Console chooser | `src/console/chooser.js` | Hold gesture, launch form and one-time launch choices |
| HUD | `src/console/hud.js` | Compact console presentation |
| Slot names | `src/console/slot-names.js` | Inline name editing |
| Account menus | `src/console/account-menu.js` | Menu rendering and account-switch interactions |
| Usage | `src/pages/usage-page.js` | Usage presentation, period/metric selection and add-panel state |
| Agent settings | `src/pages/accounts-settings.js` | Account drafts, renaming, routing and review settings |
| Tools | `src/pages/tools-page.js` | Tools, APIs and Instructions pages |
| General settings | `src/pages/settings-page.js` | General, Appearance and Consoles settings |
| Window shell | `src/ui/shell.js` | Initial frame and navigation markup |
| Shared UI helpers | `src/ui/` | Icons, formatting, provider display names, lighting, theme sync, notices and form handling |

Existing feature controllers such as `projects-ui.js`, `workbench-ui.js`,
`task-loop-ui.js` and `console-projects.js` remain independent modules composed
by the bootstrap. Projects provides a unified workspace with Overview, Work,
Outputs and Knowledge views, replacing standalone Tasks and Results sidebar
navigation. `src/pages/project-workspace-controller.js` manages tab state,
knowledge epoch invalidation, policy synchronization, focus preservation and
asynchronous record loading. `src/pages/project-workspace.js` is a pure render
module for workspace tabs, task cards, project outputs and knowledge sections.
`src/projects-ui.js` and `src/project-plan-ui.js` own the project catalog,
card interactions and plan section editing. The structural extraction does not
change underlying feature workflows.

Page changes can replace the page container. Updates within the same page
patch existing nodes through `src/core/dom.js`. Console updates preserve xterm
instances and their mounted nodes. Hiding a session preserves its process;
ending it requires the explicit session or worker action.

Controllers created before other features use injected getters for those
dependencies. A callback must not read an uninitialized controller during
construction. Unmatched click handlers return `false` synchronously so shared
dispatch retains its ordering. Form identifiers are read with
`getAttribute('id')`, because a named form field can shadow `form.id`.

## Mobile

`mobile/lib/main.dart` starts the app and retains compatibility exports.
Feature code imports shared helpers directly, rather than importing the entry
point. `app/dock_app.dart` owns the Material app and theme subscription;
`app/dock_home.dart` composes pages and controllers and owns navigation and
foreground lifecycle. `app/home_chrome.dart` contains app-bar and navigation
widgets.

| Responsibility | Module under `mobile/lib/` |
| --- | --- |
| Public client and connection lifecycle | `dock_client.dart` |
| TLS pinning and endpoint policy | `core/connection/endpoint_policy.dart` |
| Event socket ownership | `core/connection/socket_transport.dart` |
| Request/reply tracking | `core/protocol/request_tracker.dart` |
| State protocol and frame decoding | `core/protocol/state_stream.dart`, `frame_codec.dart` |
| Terminal buffers, launch identity and narrow signals | `core/terminal/console_terminals.dart` |
| Worker submission IDs and paste/Enter targeting | `core/terminal/console_submission.dart` |
| Background alerts | `core/alerts/alert_relay.dart` |
| Drafts, sending and attachment state | `features/console/composer_controller.dart`, `attachment_controller.dart` |
| Command and launch targeting | `features/console/command_target.dart` |
| Confirmed console changes and sheets | `features/console/console_commands.dart`, `console_sheets.dart` |
| Console layout and rendering | `features/console/console_workspace.dart`, `console_terminal_pane.dart`, `console_composer.dart` |
| Result detail and thumbnails | `features/results/result_detail.dart` |
| Console surface lifecycle and animation disposal | `console_surface.dart` |
| Console outline, frame, atmosphere and opening painters | `features/appearance/` |

`DockClient` preserves the public map API while exposing typed session access
to controllers and target guards. Its services receive narrow callbacks or a
`ConsoleScope` interface. Terminal output fires the terminal's signal; it does
not rebuild the app shell. Controllers own their listeners, focus nodes and
disposal. An action prepared for one PC, connection or launch must be
revalidated before dispatch. Code returning from another page reloads the
selected console's saved draft.

The Results list links to Image Jobs, and Image Jobs links to Result Detail.
Result Detail does not depend on either list page. `features/projects/project_workspace.dart`
and `projects_page.dart` own the mobile Projects workspace (Overview, Work, Outputs,
Knowledge) when connected to a host advertising the `projects.workspace` capability.
`app/home_chrome.dart` dynamically removes Results from main navigation destinations
when connected to a workspace-capable host, while preserving legacy navigation for
older PC hosts. Shared widgets and formatting live under `core/`.

## Backend

`electron/main.cjs` composes services, application lifecycle and trusted desktop
transports. The `dock:call` transport retains sender/frame validation, state
synchronization and reply envelopes. `desktop-commands.cjs` composes separate
session, settings, project, task, tool, mobile-setup and system command families.
Their handlers receive explicit dependencies and accessors for replaceable
state. Unknown command names fail, and a private `NO_VALUE` marker preserves
the distinction between a reply with no value and a returned `undefined`.

`task-accounts.cjs` owns worker/reviewer account candidates, quota freshness,
funding and the verified free-model route selection. The bootstrap supplies
live readers and credential-switch operations. Replacing usage readings or
worker candidates does not leave the service with an old captured array.

`electron/mobile.cjs` owns pairing, authenticated WebSocket connections, state
delivery and phone request guards. `mobile-commands.cjs` composes console,
session and content handlers after those guards. The service's `createCommands`
method is the shared composition path for the application and focused fixtures.

`electron/sessions.cjs` retains the public session/layout facade. It composes
`SessionLauncher` in `session-launch.cjs`, `SessionEventRuntime` in
`session-runtime.cjs`, and `AccountSwitching` in `account-switching.cjs`.
Services receive narrow hosts and read current replaceable state through
accessors. Staged account changes keep the original PTY and draft until the
replacement is confirmed. Credentials resolve in the main process.

### Shared task helpers

`execution-history.cjs` owns generated task/review reports under application
storage. TaskLoop in `electron/task-loop.cjs` coordinates task attempts, checks
execution, reviewer loops and durable completion records. `task-resolution.cjs`
evaluates system task resolution candidates and computes structured dispositions
(`verified`, `integrated`, `completed-unverified`) based on check outcomes, clean git
heads and approved reviews. Routine task and independent-review completion does
not publish a Results artifact. Saved Results keep their existing files and
identities. Task views carry current structured outcomes directly, and the
renderer retains a legacy saved-Result fallback.

`knowledge-policy.cjs` evaluates global and project-level knowledge modes (Off,
On demand, Automatic) and enforces access assertions. `knowledge-access.cjs`
serves as the unified policy boundary for desktop reads, agent tools and source
snapshot capture. `knowledge-contracts.cjs` defines versioned section metadata,
separating facts, interpretations and owner intent with explicit freshness and
evidence references. Shape validation establishes metadata integrity without
proving source anchors, semantic claims or owner authorization.
`project-knowledge.cjs` owns atomic per-project metadata and operation journals
in `<data>/knowledge/<projectId>.json`. `knowledge-reader.cjs` owns bounded
directory and whole-section views. `source-snapshots.cjs` captures hash-pinned
UTF-8 source snapshots with credential and secret filtering. `source-symbols.cjs`
extracts JS/TS/JSX declaration syntax using Lezer without type resolution or
call graph completeness claims. `knowledge-queue.cjs` manages the durable
documentation delta queue in `<data>/knowledge-queue.json`. `knowledge-upkeep.cjs`
reconciles completed task outbox deltas under bounded attempt budgets.
`repo-inventory.cjs` is a separate bounded metadata observer; it does not
initialize or mutate knowledge. See `project-knowledge.md` and
`project-current-state.md` for implemented APIs, limits and file entry points.

`electron/task-ownership.cjs` owns the existing ownership-glob validation and
matching rules. Both the scheduler and task planner use it. The scheduler must
not import the planner to match file ownership.

`electron/task-checkout.cjs` owns dependency linking for isolated task checkouts.
The task planner uses that helper directly; it does not import the task engine
for a filesystem operation. The existing task-plan and task-loop exports remain
available to callers. This separation changes dependencies, not task semantics.

### Provider strategies and phone profiles

`electron/providers/` contains validated, deeply frozen provider facts. The
registry derives the CLI catalog, account capabilities, usage references,
session policies and versioned phone screen profiles. Adapters select named
runtime strategies; they do not import the registry. Strategy hooks receive
dependencies from the launcher and account-switching service. Credential
stripping, authorization and replacement commit/rollback remain in those
trusted services.

Registry console flags drive model choices, permissions and native live-menu
support in desktop settings, the chooser and phone launch data. Account menus
query the served session `switchMethod`. Worker admission/presentation guards
share the registry steering policy. The phone's generated fallback also carries
console flags for older PCs; explicit served flags take precedence.

`provider-settings.cjs` retains compatibility factories and caches strategies.
The `strategies/` modules implement native arguments, editor folders, tracking,
environment translation and resume confirmation. Generic services query them
instead of repeating provider-name switches. Protocol-specific conversation
and usage readers remain separate implementations.

`cli-launch.cjs` intentionally owns CLI-specific MCP/configuration serialization
and native instruction/trust argument protocols. `strategies/cli.cjs` invokes
that writer. Its provider branches select concrete wire formats and supported
CLI flags; they do not decide account eligibility, menu visibility or scheduling.
Keep those protocol-specific writers separate from shared capability facts.

`draft-policy.cjs` is a standalone protocol validator copied beside the external
draft editor outside ASAR. Its Claude editor-context check intentionally stays
independent of registry/service loading, so the packaged helper has no missing
application dependencies.

The phone receives `agentProfiles` through both legacy state and the protocol 2
shell slice. `agent_profiles.dart` validates that data, and the menu/dialog
parsers consume it. Unknown providers remain terminal-only. Missing, malformed
or unsupported-version profiles use the bundled fallback. Changing PCs resets
the served profile. `scripts/generate-agent-profiles.cjs` generates that fallback
from the same provider registry, and the build checks it for drift. Node and
Dart tests share the recorded DTO and captured terminal screens.

## Themes and effects

`themes/manifest.json` supplies stable theme IDs, labels, terminal palettes,
lighting choices and explicit phone terminal overrides. Run
`node scripts/build-theme-data.cjs` after editing it. Generated JavaScript,
CommonJS, Dart and desktop CSS data are build inputs; `--check` rejects drift without writing.
The same generator emits the Dart opening and sky enums from its validated
supported IDs, so a newly accepted effect cannot be absent from the phone enums.
The renderer and phone preserve their existing terminal background, cursor and
selection differences.

Desktop accent/frame exceptions also live in the manifest. Generated palette
rules preserve spectrum-lighting precedence; geometry, textures and effect
colors stay with their owning component. `page-layout.css` owns shared page
padding and heading rules. See [Theme authoring](theme-authoring.md) for fields,
stylesheet order and extension checks.

`src/console-effects.js` owns visibility, reduced motion, animation clocks,
cancellation and inert closing snapshots. `src/effects/registry.js` owns the
canvas drawing definitions without DOM subscriptions. Each opening takes the
canvas size, normalized progress, palette, setup state and elapsed time. It ends
within 1.6 seconds and declares at most two flashes.

The phone surface owns animation controllers and lifecycle observers. Separate
geometry, frame, atmosphere and opening modules paint existing compositions;
they do not own sockets, session state or terminal input. Compatibility exports
from `console_surface.dart` retain existing imports. Output updates repaint the
decoration independently of terminal layout.

## Size and dependency review

File lengths identify review candidates; they are not acceptance thresholds.
`DockClient` retains the public phone API and coordinates paired-PC connection
generations while transport, framing, request tracking, terminal buffers,
submission and alerts have separate owners. Provider wire protocols and platform
painters remain distinct because their APIs and rendering mechanisms differ.

Feature controller factories contain nested handlers sharing one feature's
state. Their enclosing line counts do not measure a single sequential function.
Projects now houses Work and Outputs views in place of separate navigation
buttons, while legacy Results and standalone Tasks controllers remain
reachable for secondary and unassigned views. The task engine coordinates
durable attempts, checks, resolution and recovery; its ownership matcher,
system resolution candidate helper and checkout utility are independent
dependencies. The final review must assess these boundaries and actual call
paths, including dynamic provider loading.

## Checks

Run `npm run build` and `npm test`. Run Electron interaction checks headlessly
with `npm run test:linux`; the Docker image also runs the Node tests. The
desktop checks cover repeated keyboard actions, focus retention, terminal
identity, launch/restore, grid moves, account forms and chooser gestures.
Tests use temporary data and mocked providers. They must never send paid model
requests or modify the owner's live sessions.

The build first runs `scripts/check-boundaries.cjs`. This checks local static
JavaScript, CommonJS and Dart imports for cycles, missing modules and feature imports of
`app.js`, `main.cjs` or `main.dart`. Vite, Node and Flutter validate syntax and assets. Runtime
dynamic imports are outside the boundary check. Mobile changes also require
`flutter analyze` and `flutter test` from `mobile/`.
