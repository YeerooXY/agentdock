# Tasks into Projects: architecture proposal (Opus, 4 November 2026)

Planning only. Source f3fadec plus the uncommitted working tree. Route: Claude Opus, included subscription. Local worker skipped: Strata offline. This is one input for Astra review. No agreement exists yet and no guarantee is claimed.

## 1. Decisions

- Keep the durable task record as the work item. `tasks/<id>.json` already holds attempts (`rounds[]` with `attemptId`, `electron/task-contracts.cjs:7`) and split slices (`subtasks[]`). Scheduler jobs (`electron/scheduler.cjs:87`) and merge intents (`electron/merge-back.cjs:54`) persist separately. No new WorkItem/Run layer in this increment. A follow-up task links to its predecessor with an explicit `replaces` field.
- Remove the desktop Tasks navigation (`src/app.js:144`) and the phone Tasks button (`mobile/lib/main.dart:884`). Task lists move into project detail on both clients. TaskLoop, the scheduler, MergeBack and the `dock/*` task tools stay.
- The main process computes presentation once (new `electron/task-presentation.cjs`) and ships it in the summary DTO. Clients render it and do not recompute attention.
- Only Accept or Close resolves a task. Automatic supersession and newest-task suppression are removed.
- Live state holds every unresolved task with no cap. Resolved history, logs, diffs and check output are explicit paginated reads.

## 2. Current conflicts

| Location | Problem |
|---|---|
| `task-loop.cjs:271-276` `snapshot()` | Keeps only 20 newest settled tasks (`MAX_HISTORY`, `:66`). Older unresolved tasks disappear from both clients |
| `task-loop.cjs:279-285`, called at `:360` | Any new task marks every settled task in the same project or repository `supersededBy`, including unrelated subsystems |
| `src/project-activity.js:12-15` | Attention counts only tasks at least as new as the project's newest task |
| `mobile/lib/tasks_page.dart:14-19` | Second copy of the attention rule; its running set already differs (`queued`) |
| `task-loop.cjs:269` `view()` | Sends `finalDiff`, check output and log tail through the `tasks` slice |
| `task-loop.cjs:288`, `:298`, `:916` | Acknowledge, dismiss and accept ignore a failed `persist()` and report success |
| `task-loop.cjs:949` | Results store a status copied from task state, which goes stale |
| `workbench.cjs:105` | Agent close is authorized by console key alone |
| `main.cjs:846` | Desktop start binds `projectId` by folder match |
| `project-activity.js:28` | Tasks of deleted or unbound projects are dropped |

## 3. Writers and grouping

| Entity | Sole writer | Readers get |
|---|---|---|
| Task, attempts, slices | TaskLoop via `persist()` (`task-loop.cjs:198`) | `TaskSummary` in `tasks` slice; `TaskDetail` on request |
| Admission entry | Scheduler | `admission` field folded into the summary |
| Merge intent | MergeBack | detail only; reconciled at startup (`task-loop.cjs:167`) |
| Project, milestones, subsystem catalogue | Projects | `projects` slice |
| Report | Workbench results | `resultId` link. Task status always comes from the task |
| Console identity | Sessions | `consoleKey` as provenance |

Three separate groupings:

- **Subsystem**: an area within one project (Phone, SSH, Tasks). Projects owns `project.subsystems: [{id, name}]` (up to 30, names up to 40 characters). Tasks store `subsystemId`. Unknown ids show under Unsorted. Subsystems are never derived from folders.
- **Milestone**: a planned outcome in the revision-guarded project plan (`projects.cjs:78`). Tasks never mark milestones done.
- **Split slice**: an execution unit inside one task (`task-plan.cjs:202`). Shown only in task detail.

Project key:

1. If `projectId` is set and the project exists, the key is `{kind: 'project', id}`.
2. If `projectId` is set and the project is missing, the key is `{kind: 'removed-project', id}`. These tasks appear under "Other work" with the folder name.
3. If `projectId` is null, the key is `{kind: 'folder', key: repoKey}`. These tasks appear under "Other work". A matching registered project shows a hint and a **Move to project** owner action.

Folder matching is display only. It never sets `projectId`. Desktop start passes the project explicitly; this replaces `main.cjs:846`.

## 4. Schema v3 (additive, `migrateTaskRecord`)

- `revision`: persisted, incremented by each successful `persist()`. It replaces the in-memory `generations` for command guards.
- `subsystemId`.
- `replaces`: up to 5 ids in the same project key. The summary derives `replacedBy`. It does not resolve the older task.
- `dismissedAt`, `dismissReason` and `dismissedBy` keep their names and mean Close, so downgrades keep closed tasks closed.
- `supersededBy` becomes read-only legacy data and is never written again.
- `commands`: the last 20 `{commandId, action, at, outcome}` entries.
- `acceptance`: `{state, commandId, fingerprint, head, intentId}`, written before merge-back.

Older builds keep unknown fields because they spread the parsed record.

## 5. Presentation table

Bucket: **done** if and only if `state === 'accepted'` or `dismissedAt` is set. Otherwise **in-progress** while a process, queue entry or merge is live; otherwise **needs-you**. `unseen = bucket === 'needs-you' && !acknowledgedAt`. Acknowledge clears only `unseen`. Acknowledged and dismissed are modifiers, not states.

| Condition (first match) | Bucket | Label | Actions |
|---|---|---|---|
| `dismissedAt` | done | Closed, reason, by | Open report |
| `accepted` | done | Accepted, unresolved count | Open report |
| `acceptance.state === 'merging'` | in-progress | Merging | none |
| queued admission entry | in-progress | Waiting for capacity, position | Stop |
| ACTIVE state (`task-plan.cjs:6`) | in-progress | step | Stop |
| time limit reached, worker live (`task-loop.cjs:842`) | needs-you | Time limit reached; worker running | Stop worker |
| `plan-ready` | needs-you | Plan waiting for approval | Approve, Stop |
| `passed`, evidence current | needs-you | Checks passed; waiting for Accept | Accept, Close |
| stale check/review step or `verificationExpired` | needs-you | Changed since checks / Verification expired | Accept unverified (confirm), Close |
| merge failed or interrupted intent | needs-you | merge error | Accept again (same intent), Close |
| other `needs-you` | needs-you | first unresolved item | Accept, Close |
| `stopped` | needs-you | Stopped by you; work kept | Resume (split), Close |
| `failed` | needs-you | provider error | Close |
| `interrupted` | needs-you | Paddock closed during this task / error | Resume (split), Close |
| legacy `supersededBy` or `replacedBy` | unchanged | warning: Replaced by title | adds Close as replaced |
| `reportError` | unchanged | warning: Report not saved | adds Retry report |
| per-task storage error | unchanged | warning: Not saved to disk | mutations disabled |

Accept on stopped or interrupted work is unsupported today (`task-loop.cjs:902`).

## 6. Shared DTO

`TaskSummary` (built by `task-presentation.cjs`, written by TaskLoop):

```
id, revision, title, state, projectKey, subsystemId, workflow, split,
startedAt, finishedAt, resolvedAt, resolution, presentation {bucket, reason,
label, actions[], unseen, warnings[]}, round, maxRounds, sliceCounts,
implementer {label, model}, reviewer, error (<=300), unresolvedCount, resultId,
replaces[], replacedBy, acknowledgedAt, dismissedAt, supersededBy, admission
```

`TaskDetail` (`tasks.detail(id)`, `dock/task_status`) is the current `view()`. Clients fetch it on open and again when `revision` changes.

The phone projection (`projections.cjs:41`) keeps its current fields and adds `revision`, `projectKey`, `subsystemId`, `presentation`, `resolvedAt` and `replacedBy`. It never adds `originConsoleKey`, paths, criteria, diffs or logs. Removed-project detection depends on Projects, so TaskLoop reads a projects getter and republishes summaries when projects change. The slice keeps one writer (`state-protocol.cjs:17`).

## 7. Live state and history

- `live()` replaces `snapshot()`. It returns all unresolved parents plus tasks resolved in the last 7 days, up to 10 per project key. `MAX_HISTORY` is removed. `tasks.list` returns `live()`.
- `history({projectKey, subsystemId, before, limit <= 50})` returns tasks newest first with an opaque `{resolvedAt, id}` cursor, for desktop and phone.
- Resolved records stay in memory as compact summaries. Full records load for detail or accept. A persisted index is deferred until a 2,000-record fixture exceeds an agreed load-time bound.

## 8. Commands, authority and recovery

Mutations (`acknowledge`, `close`, `accept`, `stop`, `resume`, `approvePlan`, `setSubsystem`, `moveToProject`, `retryReport`) take `{id, commandId, expectedRevision}`.

- **Idempotent**: a repeated `commandId` returns the recorded outcome. Close on a closed task returns `already: true`.
- **Guarded**: a revision mismatch returns `stale` with the current summary. Stop is exempt. Older phones' `tasks.seen` and `tasks.close` (`mobile.cjs:578`) stay unguarded because they are monotonic.
- **Write-ahead**: owner commands clone the record, apply the change, run `atomicJson`, then swap and emit. A failed write leaves memory unchanged and returns "Task state could not be saved". Runtime writes keep the current path.
- **Accept**: the command sends `expectedFingerprint`, and `expectedHead` for worktree tasks. After the awaited refresh (`task-loop.cjs:904`), a mismatch rejects with "Changed since you reviewed". Current-branch tasks record `acceptedAt` without Git changes. Worktree tasks persist `acceptance.merging` with `intentId` before `mergeBack.accept` (`:908`). Failure sets `acceptance.failed` and keeps the intent. Accept unverified requires `confirmUnverified: true` and is recorded.
- **Stop or Close**: Stop halts processes and keeps the work; the task stays unresolved. Close resolves without merging. It requires no live process, keeps the worktree and report, and needs a reason from agents. Worktree removal is a separate action.
- **Recovery** (constructor, `task-loop.cjs:150-170`): running tasks become interrupted. A task in `acceptance.merging` is reconciled against MergeBack: a completed merge sets `accepted`; otherwise `acceptance` becomes merge failed. A missing report is recorded again. Nothing replays automatically.
- **Report failure**: `reportError` (`:951`) shows a warning with Retry. Accept and Close still succeed, because the task file is authoritative.
- **Agent close** (`workbench.cjs:100`): two conditions must both hold. First, `originConsoleKey` matches the caller (provenance). Second, the caller's current project binding equals the task's `projectId`; for two unbound records, the `repoKey` must also match. Moving a console to another project revokes close. Agents cannot accept. The folder check in `tasks.status` only looks up the task and does not authorize. Keyless legacy tasks keep the session-id rule.
- **Phone**: pairing grants acknowledge, close with reason and history reads. Allowlisted DTO, validated cursors and clamped limits. New free text goes through `redactText`, and subsystem names are escaped when rendered.

## 9. User decisions

1. Does the project card count acknowledged needs-you tasks? Proposed: the card counts all of them; the badge counts only unseen ones.
2. Legacy backlog: hidden superseded or app-interrupted tasks reappear after migration. Proposed: a collapsed "Older unresolved (N)" group with bulk Close and a required reason. No automatic close.
3. Stop and Accept on the phone. Proposed: keep them desktop-only for now.
4. Allow Accept of stopped or interrupted work with confirmation?
5. Do subsystem edits bump the plan revision? Proposed: no.
6. Task start: in project detail with an explicit binding. "Other work" requires choosing a folder.

## 10. Older phones

Older phones read `state`, `acknowledgedAt`, `dismissedAt` and `supersededBy` (`tasks_page.dart:14`). These fields keep their meaning. Because the server no longer writes `supersededBy`, older phones show more attention, not less. Protocol 2 stays, with additive fields only. Older phones keep their Tasks page.

## 11. File ownership

| Stage | Files | Owner |
|---|---|---|
| A Contracts | new `electron/task-presentation.cjs`, `task-contracts.cjs`, new `tests/fixtures/tasks/presentation-cases.json`, `tests/task-presentation.test.cjs` | worker 1 |
| B Backend | `task-loop.cjs`, `tests/task-loop.test.cjs`, `tests/task-persistence.test.cjs` | worker 2, after A |
| C Wiring | `workbench.cjs`, `main.cjs` IPC | lead |
| D Projects | `projects.cjs`, `project-planning.cjs` | worker 3, parallel with B |
| E Desktop | `src/project-activity.js`, `src/projects-ui.js`, `src/task-loop-ui.js` inside project detail, `src/app.js` | worker 4, after B |
| F Phone | `electron/projections.cjs`, `tests/fixtures/state/dto/phone-task.json`, `mobile/lib/{state_models,projects_page,tasks_page,main}.dart` | worker 5, after B |

`presentation-cases.json` gives a record and project list with the expected bucket, reason and actions. Node checks `task-presentation.cjs` against it. Flutter checks that the phone renders the server values without local rules. It covers every table row, including legacy supersession, removed and unbound projects, queued, merging, stale, report failure and storage failure.

## 12. Rollout and rollback

1. A: no behavior change.
2. B: v3 fields and live/history. The Tasks page remains and consumes `presentation`. Rollback: older builds read v3 records, and `dismissedAt` and `state` are unchanged.
3. E: tasks appear in project detail. The navigation entry stays restorable for one release. Notifications and result links open project detail.
4. F: the new phone build moves the badge to Projects.
5. D ships independently; tasks without a subsystem appear under Unsorted.

Each stage runs `npm run build`, `npm test` and `npm run test:linux`, plus Flutter tests for F. Tests use mocked providers and temporary data with no paid calls. Desktop stages add the `AGENTS.md` keyboard focus checks after Accept, Close and Stop move a row.

## 13. Tradeoffs for Astra

1. **`replaces` chain or WorkItem container**: the chain keeps records and tools unchanged. A container gives one row per goal but adds a writer or file family.
2. **Server-computed presentation**: removes rule drift. New reasons then depend on the desktop version. Older phones fall back to raw fields.
3. **Write-ahead cloning**: copies `finalDiff` on every command. Moving diffs to a sidecar changes the format.
4. **Uncapped unresolved list**: about 0.5 KB per summary, so 300 tasks take about 150 KB before gzip. Is any absolute cap acceptable?
5. **Compact summaries or an index**: compact summaries still read every file at startup.
6. **Admission coupling**: TaskLoop must subscribe to scheduler changes. A scheduler slice instead adds a projection dependency.
7. **Unbound agent close**: still partly folder-based. The stricter option is owner-only close.
8. **Stale accept**: confirmation is convenient. A required recheck is safer but needs a new command.
