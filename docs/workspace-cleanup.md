# Workspace cleanup and freshness

31 October 2026. Current branch: main, base 82e9d88de6392d06fba261dd8726ab920605e77f. Changes remain uncommitted alongside existing work.

## Implemented

- Removed the file explorer, Code panel, website Preview panel and their renderer controls. Old Code/Preview panels are skipped during workspace restoration. Existing terminals and ordinary console file-link previews remain available.
- Removed the titlebar Results shortcut and startup-folder picker. Startup folder is in Settings → Consoles. Results retains its navigation badge.
- Fullscreen and HUD transitions remember normal window bounds and the maximized flag. Returning to the current mode does not resize the window. Repeated F11 keydown events are ignored during a transition. Saved bounds are constrained to an available display.
- Task verification now includes HEAD and branch for ordinary tasks as well as split tasks. Changing revision or branch with identical file contents invalidates previous checks and review. Existing accepted records remain frozen. Old unaccepted verification fingerprints may become stale once after this upgrade.
- Updating a saved report increments its content revision and records an update time. An open text/report preview reloads when that revision changes, including equal-length edits. Saved copies still remain independent of their original source files.
- Stale review verdicts say “Previous verdict.” Project cards show separate activity and notes dates. Console Settings uses sentence-case headings and omits the redundant “Used when you click +.” hint.

## Selected design implemented

The user supplied screenshot-20261031-114114-34604b.png as the selected direction. Projects, Tasks, Results and Usage now use translucent cards with luminous edges and readable status chips. Colors and backgrounds follow the selected theme. A compact bottom-left navigation strip replaces the tall rail. It retains keyboard access and tooltips, and the console grid reserves space beneath its panels.

Project cards expose milestones, current task and console counts, the latest saved output, and separate activity/details dates. Counts and output titles derive from current local state, including edits and removals; explicit project bindings take priority over folder inference. Updates preserve open card controls, decision drafts and keyboard focus. Project editing, planning, folder access and console launching remain available through the card actions.

Tasks separates active work from accepted/stopped/failed history. Stale checks and previous review verdicts remain visible; accepting unresolved work is labelled "Accept with issues." Results keeps chat/turn grouping, uses one glass card per saved batch, and distinguishes a saved copy from checks that passed when saved. Technical revision details remain expandable. Closing a preview restores focus to a visible control.

Activity, task state, output metadata and dates can update from local events without model calls. Written plans require explicit edits; this repair does not invent progress or automatically consume model tokens to rewrite them. Capacity waits, unavailable accounts and decisions can still require user action. No claim that orchestration can never stall is justified.

## Usage and agent settings

The horizontal provider rows follow the user's screenshot-20261031-120538-9e2670.png reference. Each row displays one selected account, its quota windows, reset times, observation age and source. Cached and unknown values stay labelled; percentages are never added across accounts. Account selectors, refresh, hiding subscriptions and adding subscriptions remain available. Account setup, automatic switching, cross-agent reviews and task routing moved to Settings → Agents. Account and routing drafts survive background state updates.

API ledger analytics use requests recorded by Paddock. The period selector, request/token chart, provider totals, average recorded duration and failure count derive from the local ledger. Missing token and duration fields are disclosed. There are no fabricated trend comparisons or costs. The request log and export remain available. Blue and Inferno captures demonstrate that the glass responds to theme selection.

## Verification

Local evidence: `artifacts/workspace-review/`, with the final renderer captures in `glass/`. `scripts/workspace-review.cjs` renders fixed sample data without live sessions or provider requests. The four profiles cover desktop Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit, all running in a Linux container. Forty screenshots cover Tasks, Results, Projects, Usage, Consoles, Console Settings, Agent Settings, analytics and theme changes. Assertions cover removed controls, compact navigation, task history filtering, live project updates with focus preserved, an already-open report refreshing after an equal-length content change, account-specific quotas, analytics controls, routing drafts and theme colors. No page errors or document overflow were reported.

The profiles are emulated. They do not establish real Windows/macOS/iOS font rendering, physical-device behavior or native Windows maximized/fullscreen behavior. Native platform confirmation remains. Desktop tests run headlessly through Docker and mocked agents; no paid model requests are made by tests. The running user application is not restarted by this work.

Final command outcomes are recorded in `artifacts/workspace-review/VERIFICATION.md`.
