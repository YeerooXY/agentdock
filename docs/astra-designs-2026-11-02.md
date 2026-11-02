# Astra design passes, 2 November 2026

Two read-only GPT-6-Astra (high effort) passes via codex exec on the owner's extra credits. Links point at the working tree on 2 November.

## State store and sync protocol

Use a main-process store with immutable slices, revisioned subscriptions, and separate desktop/phone projections. Keep terminal output on its existing stream protocol.

The audit needs three corrections:

- Desktop updates do **not** always rebuild pages: Projects refreshes cards, Tools patches selected elements, and only selected pages call `renderPage()` on receipt. Full replacement remains inside `renderPage()`. See [app.js:884](C:/Users/7yeer/Projects/agent-dock/src/app.js:884) and [app.js:720](C:/Users/7yeer/Projects/agent-dock/src/app.js:720).
- The phone already sends heartbeat pings every 15/60 seconds. Server-side dead-client detection is missing. See [dock_client.dart:666](C:/Users/7yeer/Projects/agent-dock/mobile/lib/dock_client.dart:666).
- Compression, state coalescing, and terminal replay already exist: 150 ms state batching, conditional gzip, and sequence/epoch checkpoints. Preserve these capabilities. See [mobile.cjs:281](C:/Users/7yeer/Projects/agent-dock/electron/mobile.cjs:281) and [mobile-stream.cjs:40](C:/Users/7yeer/Projects/agent-dock/electron/mobile-stream.cjs:40).

1. **Slices, ownership, and writes**

Replace the aggregate assembled at [main.cjs:163](C:/Users/7yeer/Projects/agent-dock/electron/main.cjs:163) with:

| Slices | Authoritative writer |
|---|---|
| `shell`, `preferences` | Main: mode, grid, notices, settings |
| `sessions`, `panels` | Sessions/code-panel services |
| `queues`, `prompts` | MessageQueue, Prompts |
| `tasks`, `delegations` | TaskLoop, Delegation |
| `projects`, `projectProposals` | Projects |
| `accounts`, `agents`, `skills` | AccountProfiles, CliSetup, SkillPacks |
| `usage`, `usageHistory` | Usage coordinator: readings, freshness, ledger summaries |
| `results`, `imageJobs`, `setupRequests` | Corresponding Workbench services |
| `tools`, `keyMetadata`, `sshHosts` | SharedHub/integrations, vault metadata adapter, SSH |
| `mobileStatus`, `updates`, `screenshots`, `alerts` | Corresponding services |

Collections use `{byId, order}`; large reports, images, terminal bytes, and historical ledger pages remain explicit reads.

Services call `store.set(slice, dto)` or `store.patch(slice, {upsert, remove, order?})` **after successful persistence**. Copy inputs; never retain mutable service objects. Enforce one writer per slice. Derived selectors declare dependencies, including usage-account dependencies on sessions and installed agents currently calculated at [main.cjs:300](C:/Users/7yeer/Projects/agent-dock/electron/main.cjs:300).

At end-of-turn, coalesce writes against the previous committed value. Increment each changed slice once; unchanged values produce no revision. `store.transaction()` groups related synchronous writes. Notifications carry the complete committed batch.

Maintain independent revision namespaces for allowlisted desktop and phone projections. A private-only change must not advance the phone revision. Revisions reset under a new random server `epoch`; they are unrelated to project plan revisions.

2. **Wire protocol**

Use identical envelopes over restricted preload IPC and authenticated `/v2/events`. Preserve `/v1/events` during migration.

```ts
type Cursor = {
  epoch: string;
  revs: Record<Slice, number>;
};

type ClientMessage =
  | { type: "hello"; protocol: 2; lastRev: Cursor | null;
      slices: Slice[]; compression: ("gzip" | "none")[] }
  | { type: "subscribe"; slices: Slice[] } // replaces subscription
  | { type: "ack"; subscription: string; batch: number }
  | { type: "resync"; subscription: string; slices: Slice[] }
  | { type: "pong"; nonce: string };

type Change =
  | { kind: "patch"; slice: Slice; baseRev: number; rev: number;
      upsert: Record<string, DTO>; remove: string[]; order?: string[] }
  | { kind: "replace"; slice: Slice; baseRev: number; rev: number;
      value: DTO }
  | { kind: "reset"; slice: Slice; rev: number; value: DTO };

type ServerMessage =
  | { type: "welcome"; protocol: 2; epoch: string;
      subscription: string; slices: Slice[];
      compression: "gzip" | "none" }
  | { type: "changes"; epoch: string; subscription: string;
      batch: number; changes: Change[] }
  | { type: "ping"; nonce: string }
  | { type: "error"; code: string; message: string };
```

Validate the entire batch, apply atomically, then notify subscribers and acknowledge. Require matching epoch, subscription, and `baseRev`. Ignore duplicate batches; request resync on mismatch. Subscriptions prevent gaps being inferred from unrelated slices.

Retain bounded projection history, initially 30 seconds/4 MiB. Resume from `lastRev` when available; otherwise reset affected slices, including deletions. A client without matching cached values sends `lastRev:null`. Subscription changes issue a new subscription ID.

Allow one unacknowledged state batch per connection. While blocked, retain dirty slice IDs and latest values, not serialized intermediate frames. After acknowledgment, compute from the acknowledged baseline or send resets. Never drop dependent patches arbitrarily. Pause sends above a 512 KiB socket high-water mark; resume below 128 KiB. Chunk oversized resets into numbered, bounded parts with atomic reassembly.

Command replies use a separate bounded reliable queue; never apply latest-wins to actions. Terminal delivery retains sequence/epoch recovery: backpressure triggers replay or a checkpoint, never dropped ANSI fragments. Add `launchId` to terminal envelopes.

Send server WebSocket ping every 15 seconds; terminate after two missed responses, with suspend/resume grace. IPC uses application ping/pong. Close persistently unresponsive clients, not merely busy ones.

Keep conditional gzip for negotiated WebSocket frames; use asynchronous compression and bounded decompression. IPC needs no compression. Preserve existing decompression-limit coverage at [connection_test.dart:20](C:/Users/7yeer/Projects/agent-dock/mobile/test/connection_test.dart:20).

3. **Persistence and refresh**

Make TaskLoop’s `persist(job)` resolve the parent, write atomically, then emit `{id, view}`. Make `changed()` an alias without a second emission. This covers currently silent timer writes at [task-loop.cjs:197](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:197). Failed writes publish a storage error, never a successful revision.

Projects already emits from both commit methods; the audit’s blanket persistence diagnosis is wrong here. See [projects.cjs:31](C:/Users/7yeer/Projects/agent-dock/electron/projects.cjs:31). Connect those events to both projections. Seed the store after loading persisted state.

Remove `refresh()` from [TaskLoop.snapshot():211](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:211). Schedule verification explicitly at startup, repository changes, and a bounded timer using existing refresh concurrency controls. Preserve awaited verification before acceptance. Reject asynchronous results whose task generation changed.

All snapshots become pure cached reads. Display refresh status/errors explicitly. Replace Tasks’ three-second renderer polling at [task-loop-ui.js:181](C:/Users/7yeer/Projects/agent-dock/src/task-loop-ui.js:181) with subscriptions.

4. **Desktop and phone subscriptions**

Desktop selectors declare dependencies: Projects watches projects/tasks/sessions; Tasks watches tasks/accounts; Results watches results/projects; Usage watches usage/history. Hidden views unsubscribe from rendering.

Patch keyed DOM nodes in place. Preserve terminal/editor/canvas nodes, dirty inputs, selection, IME composition, scroll, `<details>`, and open selects. Defer incompatible select changes until closure. When removing a focused control, focus its logical successor. Generic DOM morphing alone does not guarantee this.

Flutter gets typed slice models and separate connection, appearance, selection, and per-terminal notifiers keyed by PC/session/launch. Terminal writes notify only that terminal and its activity indicator. Remove the unconditional global notification at [dock_client.dart:962](C:/Users/7yeer/Projects/agent-dock/mobile/lib/dock_client.dart:962).

Projects currently reloads on reconnect, not project revisions: [projects_page.dart:57](C:/Users/7yeer/Projects/agent-dock/mobile/lib/projects_page.dart:57). Subscribe its list directly; revision-tag detail requests and discard stale responses. Apply the same rule to Results previews.

5. **Security**

Build allowlisted DTOs before storage, history, serialization, or logging. Never include credential values, OAuth material, pairing tokens/codes, private keys, resolved environments, authorization headers, credential-bearing URLs, or raw service configuration. Key metadata contains IDs, labels, and availability only.

Keep safeStorage and credential resolution in main; only explicitly bound MCP processes receive selected credentials. Preserve phone-specific redaction from [mobile-settings.cjs:35](C:/Users/7yeer/Projects/agent-dock/electron/mobile-settings.cjs:35). Authenticate subscriptions and recheck revocation before sending. Preserve existing command authorization at [mobile.cjs:312](C:/Users/7yeer/Projects/agent-dock/electron/mobile.cjs:312).

6. **Shippable migration and file ownership**

| Step | Exclusive ownership |
|---|---|
| Contract foundation | A: new protocol schema, fixtures, store, projection and transport modules; corresponding unit tests |
| Event correctness | B: `task-loop.cjs`, `projects.cjs`, their tests |
| Desktop consumer | C: `src/state-client.js`, `app.js`, affected desktop view modules and smoke tests |
| Flutter consumer | D: `mobile/lib/**`, `mobile/test/**` |
| Integration | A: `main.cjs`, `preload.cjs`, `mobile.cjs`, transport tests |

Freeze contract fixtures first. Then B/C/D proceed independently against them. A alone wires services and transports.

Ship the store behind a legacy snapshot adapter, then opt-in v2 consumers, then default v2. Retain v1 phone compatibility. Remove full-snapshot publishing and polling only after parity checks pass. No shared-file ownership across workers.

7. **Risks and verification**

- **Missed updates/aliasing:** unit tests for every persistence path, parent tasks, failed writes, immutable copies, no-op coalescing, pure snapshots.
- **Protocol divergence:** shared Node/Dart fixtures for gaps, duplicates, restart, subscription changes, deletion, slow acknowledgments, chunk limits, revocation, and terminal generations.
- **Focus loss:** desktop headless checks for repeated Tab/Shift+Tab/Enter/Space, editing during updates, removed controls, and empty/completed/error states.
- **Excessive Flutter rebuilds:** widget build counters; terminal traffic must leave Projects and the app shell untouched.
- **Refresh races:** delayed verification/detail responses must not overwrite newer state.

Future gates: `npm run test:linux`, which includes build, unit, and headless desktop tests ([run-tests.sh:5](C:/Users/7yeer/Projects/agent-dock/scripts/linux/run-tests.sh:5)), plus Flutter analysis/tests. Use mocked providers and temporary data.

No files changed, app/tests run, or model requests made. Delegation was skipped under your read-only constraint.
## Worker scheduler, agent communication and token-savings benchmark

The best fit is one durable scheduler around Paddock’s existing admission, ownership and verification machinery. Read-only inspection completed; no files changed, app/tests launched or model requests made. Local delegation was skipped under that restriction.

A) **Worker scheduler**

Three corrections to the audit:

- “No scheduler” overstates the gap. `CapacityReservations` already queues requests, respects owner reservations, checks account groups and limits local execution. What is missing is unified, durable scheduling across tasks, reviews and local assistance. [capacity-reservations.cjs:14](C:/Users/7yeer/Projects/agent-dock/electron/capacity-reservations.cjs:14)
- The suspected repository-reservation leak already has a `finally` release. [task-loop.cjs:280](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:280)
- `WorkerPlacement`’s 4–6 cap controls visible panels. It must remain independent of execution capacity. [worker-placement.cjs:4](C:/Users/7yeer/Projects/agent-dock/electron/worker-placement.cjs:4)

The duplicated task caps and `plan-ready` blocking are real. [task-loop.cjs:185](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:185)

Use these persisted types:

```ts
Job {
  id, workflowId, parentId?, projectId, revision,
  repoKey, targetRef, baselineOid, isolation,
  dependencies[], contractHash, authorizationRef,
  phase, state, queueSequence, attemptId?
}
ResourceRequest {
  jobId, attemptId, phase,
  accountId?, quotaGroupId?, model?, funding?,
  worktreeId?, reads[], writes[],
  branchMode?: "exclusive" | "scoped",
  modelUnits, localUnits, checkUnits, mergeTarget?
}
Lease {
  id, attemptId, resourceKeys[], generation,
  acquiredAt, processIdentity?, status
}
QueueView {
  sequence, position, eligiblePosition,
  blockedBy[], enqueuedAt, revision
}
Verification {
  artifactHash, inputHashes, contractHash,
  checkDefinitionHash, environmentHash, results[]
}
```

`repoKey` should retain the canonical Git common-directory identity already calculated at startup; checkout paths alone do not identify shared repositories. [task-loop.cjs:243](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:243)

Resource rules:

- **Current branch:** default to exclusive mutation of that checkout. Allow scoped concurrent edits only with enforceable disjoint file ownership and immutable read inputs. Git index operations and branch changes remain exclusive. Unrestricted CLI workers require exclusive access or an authorized worktree.
- **Worktrees:** each worker owns its checkout. Independent worktrees can execute concurrently; overlapping target-file ownership requires dependencies or an explicit integration plan. Creating branches/worktrees still requires the user’s authorization.
- **Files:** normalize paths, account for Windows case folding and symlinks, and conservatively reject uncertain glob overlap. Extend existing plan ownership validation to ordinary tasks. Existing post-edit ownership checks detect violations but cannot prevent shared-checkout damage. [task-plan.cjs:87](C:/Users/7yeer/Projects/agent-dock/electron/task-plan.cjs:87), [task-plan.cjs:278](C:/Users/7yeer/Projects/agent-dock/electron/task-plan.cjs:278)
- **Accounts:** concurrency belongs to `quotaGroupId`, not a model name or console. Reuse registry concurrency and unknown-allowance policy; revalidate eligibility before dispatch. Preserve owner reservations, exhausted-account exclusion and explicit metered assignments. [worker-registry.cjs:15](C:/Users/7yeer/Projects/agent-dock/electron/worker-registry.cjs:15)
- **Machine:** Settings supplies global model concurrency, local inference capacity and check capacity. Count active owner turns once. Decreasing limits prevents new admissions without terminating sessions.

Acquire each stage’s resources atomically; never reserve an account while waiting for a branch. Parent workflows consume no additional slot. Checking needs filesystem/check resources, not a model slot.

The state machine separates execution state from phase:

```text
submitted → waiting-dependencies → queued → running(phase)
running(planning) → plan-ready
plan-ready + approval → waiting-dependencies
running(implementation) → queued(check)
running(check) → queued(review) | needs-attention
running(review) → ready-to-integrate | needs-attention
ready-to-integrate → queued(merge) → running(merge/check)
                  → verified → accepted
running → waiting-answer | stopping | failed | interrupted
stopping → stopped | termination-unconfirmed
```

`plan-ready`, dependency waits and question waits hold no execution lease. Their artifacts remain stored. Approval validates the recorded baseline before enqueueing.

Return queue position and blocking resources immediately from `start_task`. Use owner priority, aging and project round-robin scheduling within priority classes; allow eligible jobs past blocked jobs. Position means queue order, not guaranteed execution order. Publish revisioned updates to desktop and Flutter, including “Waiting for account”, “Waiting for files” and elapsed queue time. Mobile currently lacks a task-change subscription. [mobile.cjs:115](C:/Users/7yeer/Projects/agent-dock/electron/mobile.cjs:115)

**Merge-back** needs a lease keyed by repository and target ref across all workflows. Existing serialization is only per parent job. [task-plan.cjs:291](C:/Users/7yeer/Projects/agent-dock/electron/task-plan.cjs:291)

Under that lease, validate ownership, immutable artifact/check hashes, target HEAD and unrelated working changes. Construct the candidate merge in an authorized staging worktree; run affected checks and final integration checks on its exact tree. Apply only if the target still matches the expected revision. Otherwise requeue/revalidate. Preserve conflicts and partial output; never reset owner changes. Keep check evidence scoped to owned files **and declared dependencies**, with repository-wide verification for final integration.

Persist merge intent before Git mutation and completion afterward. Extend the existing exact-parent crash reconciliation rather than blindly replaying merges. [task-plan.cjs:352](C:/Users/7yeer/Projects/agent-dock/electron/task-plan.cjs:352)

On failure, release resources after process exit, retain artifacts and usage, and block dependents. Keep uncertain processes quarantined; lease expiry alone must not imply termination. Explicit resume creates a new attempt after reconciliation. No automatic paid fallback. Hide/collapse preserves execution. Existing delayed capacity release for unconfirmed processes is worth retaining. [task-loop.cjs:535](C:/Users/7yeer/Projects/agent-dock/electron/task-loop.cjs:535)

Migration ownership:

| Owner | Files and deliverable |
|---|---|
| Scheduler | New `scheduler.cjs`; `capacity-reservations.cjs`, `task-contracts.cjs`: durable queues, leases, recovery, settings contract |
| Execution/integration | `task-loop.cjs`, `task-plan.cjs`, `delegation.cjs`, `local-assist.cjs`: replace independent caps, implement scoped verification and serialized merge-back |
| Protocol/UI | `workbench.cjs`, `worker-sessions.cjs`, desktop task UI, `mobile.cjs`, Flutter models: compact events, questions, visible queue |
| Usage | `workflow-usage.cjs`, `native-token-usage.cjs`, `message-usage.cjs`: invocation attribution and complete accounting |

One integrator owns `main.cjs` wiring. Introduce schemas first; migrate persisted tasks conservatively; route every execution entry point through admission before removing old caps. Keep panel placement separate. Later validation should use mocked providers and temporary repositories, including contention, cancellation, crashes and stale merges, followed by the prescribed build/unit/headless desktop checks.

B) **Agent communication and measurable token savings**

Current tools expose task creation/status and bounded local assistance. `local_assist` rejects concurrent requests instead of joining admission. I found no registered `dock/ask`; treat it as a new capability. [workbench.cjs:24](C:/Users/7yeer/Projects/agent-dock/electron/workbench.cjs:24), [local-assist.cjs:44](C:/Users/7yeer/Projects/agent-dock/electron/local-assist.cjs:44)

Use one versioned message envelope:

```ts
Message {
  id, workflowId, taskId, attemptId,
  from, to, sequence, replyTo?, contractRevision,
  type: "brief" | "question" | "answer" |
        "progress" | "result" | "cancel",
  payload, artifactRefs[], createdAt
}
```

A **brief** contains deliverable, exact interfaces, owned files, permitted reads, baseline, selected design references, exclusions, acceptance checks, budgets and escalation conditions. The lead receives the overall objective and dependency map. Workers receive their contract, relevant source slices and dependency outputs. The reviewer receives the final diff, acceptance criteria and check evidence. Additional context is requested explicitly.

Use a Sol/Sonnet substantive plan under repository policy; preserve an explicitly selected creative lead. Discover routes once, refresh stale readings when necessary, and assign suitable bounded work to Strata, then eligible free/included accounts. Claude and Codex use the same protocol. Workers do not create nested managers.

A **result** contains outcome, changed-file hashes, artifact references, checks with revision, unresolved findings, questions and usage receipt IDs. The lead records accepted/repaired/rejected output. Worker self-reported success never substitutes for verification.

Proposed `dock/ask` routes a worker’s focused question to its lead by default. Include the missing fact, affected contract, options and whether work is blocked. Only the lead escalates owner decisions. A blocking worker checkpoints and releases its execution lease. Tool-less workers return the same structured question through their final response.

Persist redacted payloads, deduplicate by message ID, acknowledge consumption and reject stale contract revisions. Existing steering is limited to Codex/Claude/Kiro and stores text only in memory, so restart-safe bidirectional mail requires additional infrastructure. [worker-sessions.cjs:7](C:/Users/7yeer/Projects/agent-dock/electron/worker-sessions.cjs:7)

Extend `task_status` with `sinceRevision`, bounded summaries and artifact pagination. Deliver completion/question events without model polling. The measured motivation is concrete: Paddock Sol received approximately 83 KB of guides, 106 KB of discovery and 169 KB of status. [benchmark:80](C:/Users/7yeer/Projects/agent-dock/docs/playtime-benchmark-2026-11-02.md:80)

**Benchmark protocol**

Existing evidence supports useful local/free contributions, integration costs and coordination failures. It establishes no savings: interrupted usage, Kiro counters, images and parent work are incomplete; solo/team instructions differed. Owner preference favored natural Opus. [benchmark:5](C:/Users/7yeer/Projects/agent-dock/docs/playtime-benchmark-2026-11-02.md:5), [benchmark:20](C:/Users/7yeer/Projects/agent-dock/docs/playtime-benchmark-2026-11-02.md:20), [benchmark:33](C:/Users/7yeer/Projects/agent-dock/docs/playtime-benchmark-2026-11-02.md:33)

The routing report proves specific connector paths, not 196 live combinations or economy; recovered coordination alone included 46.9 million cached-input tokens. [routing verification:36](C:/Users/7yeer/Projects/agent-dock/docs/team-routing-verification-2026-11-01.md:36), [routing verification:81](C:/Users/7yeer/Projects/agent-dock/docs/team-routing-verification-2026-11-01.md:81)

Start with the proposed bounded Opus repairs; keep fresh-site creation separate. [handoff:91](C:/Users/7yeer/Projects/agent-dock/docs/opus-assisted-design-handoff-2026-11-02.md:91)

- Pilot three paired runs for instrumentation. Then preregister 12 representative deliverables × three paired repetitions: 36 pairs, 72 runs. Increase the sample if pilot variance requires it.
- Compare solo strong agent against the same strong lead plus Paddock workers. Fix source snapshots, assets, instructions, model versions/effort, acceptance criteria, repair budgets and cache policy. Randomize order; isolate repositories and sessions.
- Count setup, lead, workers, review, failed attempts, repairs, cached traffic and coordination through final handoff. Preserve failed trials and freeze/restart overhead. Report elapsed model, queue, checks and owner-wait time separately.
- Join records by workflow/attempt/provider invocation IDs; deduplicate cumulative counters. Existing task aggregation explicitly excludes coordinating chat and marks completeness false. [workflow-usage.cjs:22](C:/Users/7yeer/Projects/agent-dock/electron/workflow-usage.cjs:22)
- Define cloud tokens as disjoint new input + cache write + cache read + output, counting reasoning once. Free/included cloud calls count. Report local usage separately, provider-native totals by model, monetary estimates separately, and a common-tokenizer sensitivity analysis. Unknown counters block the headline claim.
- Blind reviewers to arm/provider. Use deterministic functional gates plus randomized artifact assessment by two independent reviewers; include owner visual preference, screenshot harmony and gameplay engagement. Predefine quality scoring and adjudication.

Claim **“at least 20% fewer cloud tokens at equal or better accepted quality”** only when complete accounting yields a paired token-ratio estimate whose one-sided 95% upper confidence bound is ≤0.80, with uncertainty clustered by deliverable, and acceptance/quality comparisons exclude degradation. Otherwise report the measured estimate and uncertainty. Limit the claim to the tested workload.

A wording issue encountered remains untouched: `message-usage.cjs:83` uses “Claude transcript · main agent”, contrary to the metadata-separator preference.