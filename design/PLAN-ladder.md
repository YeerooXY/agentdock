# Ladder routing and worker consoles

Plan only · 30 October 2026. Source inspection; no application/browser launches or model requests. Model names are configurable examples from the agreed design.

## Goals

- Paddock's task runner owns scheduling, checks, retries, escalation and integration merges. A cheap model such as Haiku 5.5 handles owner conversation and one-line progress summaries.
- Spread ready slices across every eligible OpenCode, Strata, Codex and Claude worker within account/machine capacity. Preserve owner consoles across projects and retain recoverable progress.

Owner priority, verbatim: "user interacted with consoles should be priority, since they may have more than one project going on at the same time."

## Owner decisions

- **Pending owner confirmation — L1 ceiling:** retain the proposed rule that both easy fixes and entire slices rated difficulty 1–2 stay at L1 and become **Needs you** after one retry. Applying the ceiling to whole slices intentionally extends the agreed "Easy fixes never climb" rule. Keep this proposed behavior in the plan; record the owner's decision before implementation enables it.

## Fit with the existing loop

| Source | Preserve and extend |
| --- | --- |
| `electron/task-loop.cjs` | Extend task JSON, fingerprints, bounded progress and process-exit confirmation. `runTask()` currently reviews after failed checks; return failures directly to the builder. |
| `electron/task-plan.cjs` | Extend contracts, ownership, dependencies, approval and serialized worktree merges. Ratings exist, but routing uses the higher rating's size; use difficulty for the ladder. Reduce plan review to one coherence check. |
| `electron/task-routing.cjs`, `delegation.cjs` | Replace size/vendor preferences with capability, level, model-family and quota-account rules. Reuse read-only launches, parsing and redaction; protect existing review panels too. |
| `electron/sessions.cjs`, `console-layout.cjs` | Task subprocesses close stdin after their brief; interactive consoles use PTYs. Add managed steering adapters. Automatic placement bypasses `planOpening()`'s shrink/grow behavior and never calls `planGrid()`. |
| `electron/workbench.cjs`, `main.cjs` | Extend `dock/start_task`, trusted-renderer controls and Results. TaskLoop schedules; the existing `SharedHub` remains the tool/context bridge. |
| `src/app.js`, `src/task-loop-ui.js` | Extend the grid and Tasks with worker groups, protection and ladder/check columns; preserve focus and reading position. |
| `electron/mobile.cjs` | Advertised close/manage/switch/queue capabilities need worker-specific guards. Close already requires confirmation; task workers must use the hub's Stop and steering paths. |

Keep one task per repository and two tasks total initially. Replace the four-provider FIFO with configurable admission, separately from panel limits. **Accept** remains record-only. Make the execution modes explicit:

- **Current branch:** at most one builder per repository; slices edit the owner's existing checkout serially, preserving unrelated work. Create no integration branch, commits or merges. Dependencies advance after a verified slice passes; combined checks cover the accumulated changes. This requires extending the existing split path, which currently forces worktree mode (`task-loop.cjs:190`).
- **Worktrees:** parallel builders require the owner's explicit request for task worktrees and branches, per AGENTS.md, before any are created. A separate integration worktree starts from the recorded source HEAD; slice worktrees start from integration HEAD and merge back there. The owner's original checkout is never switched or merged into. Its uncommitted edits remain there and are excluded from these worktrees.

## Execution policy

1. Sol 6.1 or Opus reads the repository and plans contracts, acceptance checks, ownership, dependencies, difficulty, complexity and risk reasons. Retain code validation and one format repair. One short, read-only coherence check covers contradictions and omissions. Findings allow one planner correction, shown with the findings at **Approve plan**; further unresolved changes require owner review. No second automatic coherence check.
2. Dispatch ready slices across eligible account/endpoint + launcher + model combinations, subject to the execution mode. Record actual model family separately from launcher. New ladder configuration enables Claude building; legacy `claudeReviewsOnly` migration is defined below. Share capacity across launchers using the same quota account.

| Slice difficulty | Starting level | Example implementers |
| --- | --- | --- |
| 1–2 | L1 | Strata / Haiku / Luna |
| 3 | L2 | Sonnet / Terra |
| 4–5 | L3 | Sol / Opus, with a recorded reason for this level |

Complexity affects splitting/concurrency. Set final review when any slice has difficulty/complexity 4–5 or a recorded high-risk reason, including credentials, process lifecycle, recovery or integration contracts.

3. Run approved build/unit checks, then relevant Docker desktop checks. Failures and ownership violations return directly to the builder with bounded evidence. Review requires all checks passing against the same revision/fingerprint. Missing commands or Docker remain **Blocked**, without escalation.
4. Choose the cheapest qualified read-only reviewer from a different actual model family than that attempt's builder. GPT variants through Codex/OpenCode share a family; Claude variants share a family. Register the configured distinct Strata model as `local-strata`, shared by direct HTTP and OpenCode-local routes; its slices require a non-Strata-family reviewer, such as Haiku or Luna. Confirm the served model's lineage during setup: a GPT/Claude model behind a local endpoint retains its upstream family. Other OpenCode-local models also use their actual lineage. The current code has no Strata/family registry; unknown lineage remains **Needs family setup**, and no eligible reviewer means **Waiting for reviewer**.
5. Permit one retry at the same level, then advance exactly one level: at most two builder attempts per level. Every edit reruns checks. L3 exhaustion becomes **Needs you**. Apply the proposed L1 ceiling to difficulty 1–2 slices and easy fixes as recorded under **Owner decisions**. Broader scope needs a revised rating/plan. Sign-in, transport, quota, infrastructure and stale-evidence errors consume no solution retries and never raise levels. Resume preserves counters.
6. In worktree mode, merge passing slices in dependency order after fingerprint/HEAD checks. Current-branch mode advances verified slices without Git merges. Always run combined checks. Large/high-risk changes get one whole-change review of contracts, the accumulated diff and steering, from a different family than the integration/final-fix builder. Other changes use slice approvals plus combined checks. Final findings return to their slice for checks and focused review. Re-review the whole change only after a scope revision. Conflicts preserve work as **Needs you**.

Use the latest reading per account/window; headroom is the smallest fresh reported percentage left. Retain 30-minute freshness and the 90%-used admission threshold. Within 10 points of the best headroom, choose the least occupied account and rotate ties. Unknown/stale usage stays labelled with a conservative configured allowance. Refresh before dispatch where supported. API estimates use configured rates and this app's ledger; Strata uses machine capacity. Conversation and reviews share budgets.

## Data model

Version and migrate existing task records without restarting them. Keep `subtasks` as the stored slice collection.

Slice 1 also versions saved routing settings before `settings.cjs` validation can fall back to defaults. Retain legacy settings and running-task assignments; build new level/family pools from recognized model metadata, preserving account choices, preference order, exclusions and reviewer preferences. Retain unrecognized entries as **Needs setup**. Preserve `claudeReviewsOnly: true` for legacy routing; new ladder roles explicitly allow Claude building and reviewing, visible at plan approval. A saved `false` keeps both roles allowed. Keep the migration idempotent and never rewrite active assignments.

| Record | Additions |
| --- | --- |
| Task | `schemaVersion`, `projectId`, `planRevision`, approved checks/policy snapshot, worktree authorization, final-review reason/state, event sequence. |
| Slice | Existing ownership/dependencies and ratings; risk reason, starting/current/maximum level, queue reason, assignments, latest check, worker-session reference. |
| Attempt | Stable ID; level and attempt number; builder account/launcher/model/family; source HEAD/fingerprint; check and review evidence; failure class; steering sequence consumed. |
| Worker definition | Launcher or API profile, model/family, level, role/edit capabilities, quota-group ID, concurrency allowance, availability and usage freshness. Strata defaults to `http://127.0.0.1:8080/v1`. |
| Console | Task/slice/attempt IDs, stable console key and launch ID, project/group, placement/hidden state, owner-managed flag, latest owner interaction and activity state. |
| Steering/event | Idempotency ID, ordered sequence, source console, target slice or unassigned task concern, plan revision, submitted text reference, delivery acknowledgement and reviewer inclusion. |

Persist transitions before dispatch; reconcile completion before retrying. Retain bounded redacted progress. Encrypt steering/drafts with OS-backed safeStorage and document retention/deletion. Resolve vault credentials in main; only explicitly bound MCP processes receive selected credentials. Keep keys out of agent environments, arguments and logs. Raw scrollback stays in memory.

## Exact owner-console priority

1. **Protection:** owner-created consoles are owner-managed for their lifetime. A trusted owner focus/click, typing, paste, scroll, selection or panel-control action promotes an automatic worker to owner-managed immediately. Promotion is sticky until **Release to hub** or explicit closure. Output, hover, programmatic focus, protocol replies and hub-queued messages do not count. Store this in main by console key, across projects and restarts.
2. **Recency:** focused consoles, unsent drafts and active selections receive highest scheduling priority. Within that tier, focus precedes selection, then drafts; other owner-managed consoles touched within ten minutes come next, followed by older owner-managed work and automatic work. Break remaining ties by oldest pending submission, rotating projects for equal timestamps. The hub is owner-managed and follows these same tiers/ties, with no special precedence over a focused worker or its draft. Activity refreshes the ten-minute timestamp; expiry never releases layout protection. Persist drafts securely and treat unknown renderer activity as protected during a freeze/reconnect.
3. **Layout:** automatic placement uses truly vacant cells without changing grid dimensions, panel rectangles, order, focus, expansion or scroll position. Never call `planGrid()` from automation. Otherwise use that task's project worker page; keep the current page selected. If neither has room, run hidden or queue. Revalidate a main-process placement reservation immediately before committing it; a new owner interaction wins the race. User-requested moves affect only the explicitly selected panels; reject placement that would displace another protected panel.
4. **Capacity:** reserve one lane on an account/endpoint only while an owner-managed console there has an active owner-requested turn, pending owner submission, unsent draft, active selection, current focus or trusted owner interaction within ten minutes. Automatic hub summaries do not qualify. Release it when no console qualifies; an owner turn already occupying the lane counts toward the reservation. Preserve the last reservation while renderer activity is unknown. With one reserved lane and no spare capacity, automatic work queues as **Reserved for owner**. Hub submissions bypass automatic FIFO using the same recency tiers/ties as other owner submissions. Age background requests within their tier. Start at most one local-model invocation and one resource-limited Docker check concurrently. Hidden workers consume execution capacity. Stop new background admission under owner demand/resource pressure; existing turns finish without forced termination. Other applications/provider throttling can still delay work and must remain visible.
5. **Completion:** untouched finished panels close after the hub saves their outcome and confirms process exit. Owner-managed panels remain, including completed workers. **Hide** detaches presentation and preserves execution. **Stop worker** is an explicit click with the affected slice named; task-wide Stop names all affected workers. Budget/deadline exhaustion prevents new turns and requests owner action for a still-running worker. Automatic cleanup, page switches and renderer recovery never kill workers.

Default automatic visible-worker cap: **4**, configurable **4–6**, application-wide across groups. Strata/status worker tiles count; use one compact checks tile per task. The owner hub and owner-managed consoles are outside the automatic cap. Touching a worker transfers it out of that cap without triggering another automatic opening. Lowering the cap hides only untouched panels and never changes protected consoles.

Apply the same policy to paired phones. `mobile.cjs` already confirms `console.close`, but advertises broad capabilities. Add per-console worker/owner status and action capabilities: task workers, including promoted workers, reject generic close, account/model switch and setup paths; expose only the same named **Stop worker** confirmation through the hub, with current console key/launch ID checks. Ordinary owner consoles retain explicit, identity-checked close/switch actions. Worker input/queues use the steering mailbox and record owner interaction; background queue delivery does not. Enforce these guards in main for older clients too, and advertise worker actions only after their UI/backend are supported.

## UI per screen

| Screen | Behavior |
| --- | --- |
| Hub console | Project-scoped conversation, slice target selector, factual one-line progress and links to workers/checks. Cheap-model failure leaves deterministic status and task/slice controls usable. Coalesce summaries on state transitions; the model cannot schedule, merge, stop workers or alter check commands. |
| Consoles / project worker page | Label each worker `slice · model · L1/L2/L3`, with project and state accessible in its header. Strata and checks use compact live status consoles. Input stays available through a worker composer; protected panels show **Keep open** state and **Release to hub**. Hidden workers open here only on owner request, using a free slot or project page. |
| Tasks list/detail | Project filter; every slice shows state, model/level, latest check including stale/blocked, dependencies and queue reason. **Open console**, **Hide**, **Stop worker**, **Resume**, checks/diff/review history and steering remain available. Empty state offers **Open hub**. Preserve drafts, keyboard focus and reading position; announce significant state changes politely. |
| Tasks plan approval | Show contracts, ratings, risk/final-review reason, assignments and headroom age, dependencies, checks, execution limits and explicit worktree mode. Overrides validate capabilities, levels and family separation. Criteria/contract/ownership/dependency changes create a revision; merely attaching a concern does not. |
| Settings / Usage | Configure front end, planner, model-family level pools, Strata API profile, automatic panel cap and execution/resource budgets separately. Show account-wide windows, unknown/stale readings and configured cost estimates with their source. |
| Projects / Results / HUD | Project links open the relevant task/worker group by owner action. Results retains plan, ladder decisions, check/review evidence and steering references. HUD badges show state without replacing the selected console or opening overlays. |

Worker typing uses a composer and adapter mailbox: deliver through supported live input or show **Queued** until that worker's next turn. Batch adapters need turn-boundary continuation. Preserve worktree, console key and history across attempts; start no duplicate interactive agent. Record submitted messages, exclude raw keystrokes, and include acknowledged steering in reviews. New steering during verification blocks merging until consumed and reverified.

The hub front end proposes structured slice attachments; code validates project, IDs and revision. Ambiguous concerns remain **Unassigned** for owner targeting. Replan only when scope/contracts change; pause new affected dispatches while in-flight workers finish safely.

## Risks and recovery

- **Adapters:** prove mailbox/continuation before claiming delivery. Strata needs bounded repository read/edit tools; reuse `api-run.cjs` transport/accounting with a restricted tool surface.
- **Recovery:** main owns watchers, timers, queues, process identity, buffers and durable progress independently of Tasks polling. Renderer reload reconnects by launch ID/sequence. App restart marks tasks interrupted; **Resume** reconciles identity/repository state and existing merge-crash records. Never replay uncertain requests automatically.
- **Quota/review:** test shared quota groups and family identity across launchers. Summaries cannot pass checks or approve work.
- **Contention/drift:** bound Docker resources; retain ownership/fingerprint guards and serialized merges. Many protected consoles may queue all automatic work; show that reason.
- **Compatibility/privacy:** test old task/layout migrations and steering deletion. Preserve safeStorage and credential boundaries without plaintext fallback.

## Ordered small slices

Difficulty measures reasoning risk; complexity measures moving parts, relative to this list. Implementer levels use the ladder above. Each slice includes focused mocked validation and its affected desktop cases; slice 12 covers combined scenarios. Dependencies are prerequisites, with file ownership ordered where it overlaps. Slices 1–4 run headless with Tasks status; real worker consoles activate only after slices 5–7. Slice 6 uses simulated worker panels for its UI checks.

| # | Deliverable and acceptance | Depends on | Difficulty | Complexity | Suggested implementer |
| --- | --- | --- | --- | --- | --- |
| 1 | Version task/attempt/steering contracts and saved routing level/family pools, including the explicit `claudeReviewsOnly` mapping above. Test idempotence, preserved choices and interrupted jobs. | — | 3 | 3 | L2 · Terra/Sonnet |
| 2 | Gate review on successful required checks; separate infrastructure failures and stale evidence. Assert zero reviewer calls on check failure. | 1 | 2 | 2 | L1 · Luna/Haiku |
| 3 | Worker registry, family/quota groups and headroom routing; prove shared-account and unknown-usage behavior. | 1 | 3 | 3 | L2 · Terra/Sonnet |
| 4 | Headless ladder attempts, proposed L1 slice/fix ceiling and one coherence check; prove retry/escalation bounds survive Resume. Report Tasks status; create no visible consoles before slices 5–7. | 2, 3 | 3 | 3 | L2 · Terra/Sonnet |
| 5 | Main-process owner-interaction registry and capacity reservations for worker and existing owner consoles; prove two-project priority and freeze protection. Production hub identity and submission binding activate with row 9, using the same tiers. | 3 | 4 | 4 | L3 · Sol/Opus; concurrency risk |
| 6 | Free-slot placement, project worker pages, hidden panels and cap. Test no automatic grid growth, shrink, re-slot or `planGrid()` call; desktop fixtures preserve rectangles, keyboard focus and scroll. Define mobile per-console capabilities. | 5 | 3 | 4 | L2 · Terra/Sonnet |
| 7 | CLI worker/session bridge and composer; one worker consumes mailbox steering. Enforce desktop/mobile Stop, switch and queue guards; test stale/older phone requests cannot bypass them. | 4, 6 | 4 | 5 | L3 · Sol/Opus; lifecycle risk |
| 8 | Strata adapter, restricted edit tools, status console and ledger hooks; mocked endpoint completes a small slice. | 3, 7 | 3 | 3 | L2 · Terra/Sonnet |
| 9 | Hub conversation, encrypted steering and one-line summaries; attachments are acknowledged and review-visible. | 7, 8 | 3 | 4 | L2 · Terra/Sonnet |
| 10 | Tasks/approval controls and routing settings; show level, check, dependencies and hidden-console access. Desktop tests cover keyboard controls, retained focus/drafts and Tasks layouts at 984/390 px. | 4, 6, 9 | 3 | 3 | L2 · Terra/Sonnet |
| 11 | Combined checks and conditional whole-change review. Test serialized current-branch slices create/merge no branches, and explicitly requested worktrees merge only into task integration; Accept stays record-only. | 4, 9 | 3 | 3 | L2 · Terra/Sonnet |
| 12 | Combined recovery/regressions: freeze/reload, main restart, merge crash and input/cleanup races across competing projects, full grids and desktop/mobile steering; update task/storage docs. | 10, 11 | 4 | 5 | L3 · Sol/Opus; recovery risk |

**Row 6 status: partial.** Placement is a tested prototype; project-page and hidden-panel UI, cap integration, and desktop fixtures remain to be implemented.

Future implementation validation: `npm run build`, `npm test`, then `npm run test:linux`, whose Docker runner executes `npm run test:desktop` on a virtual display. Use mocked HTTP/processes and temporary data; submit no paid model requests. Run affected desktop cases in slices 6 and 10; slice 12 runs the combined suite. This planning task runs none of those launch commands.
