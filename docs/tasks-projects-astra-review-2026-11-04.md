# Tasks into Projects: Astra architecture review

4 November 2026. Planning only. Reviewed the Opus proposal, acceptance draft and relevant TaskLoop, MergeBack, task-contracts, turn-completion, state-protocol and projection code. No implementation tests run.

**Verdict: acceptable after the mandatory amendments below.** This agrees with the architecture direction, not the proposal as currently written or permission to implement. The owner retains approval. Local Strata was reported offline; this native review was separately authorized. Native token usage is unavailable to this reviewer.

## Decision matrix

| Decision | Verdict | Required disposition |
|---|---|---|
| Durable TaskLoop task with rounds and split slices | AGREE | No second WorkItem/Run store. Explicit replacement links never resolve predecessors. |
| Projects hosts tasks on desktop and phone | AGREE | Preserve Other work, archived/removed projects, deep links and independent task reachability. |
| Subsystems, milestones and execution slices | AGREE | Separate immutable identities; no automatic milestone completion. |
| Server presentation and compact live summaries | AGREE | One TaskLoop writer; scheduler and Projects supply inputs. Clients render server decisions. |
| Presentation, acknowledgement and revision model | AMEND | Use the precedence and three revision purposes below. |
| Last-20 command receipts and unguarded legacy mutations | BLOCK | They cannot establish replay safety. Adopt durable operation identity and capability restrictions. |
| Accept unverified and same-intent retry | BLOCK | Require exact reviewed evidence and implement explicit intent reconciliation. |
| Report repair and turn completion | AMEND | Keep resolved repair work reachable and distinguish execution completion from owner resolution. |
| Phone project grouping and authority | AMEND | Opaque group IDs, sanitized labels, action-time authorization. |
| Older-binary rollback | BLOCK | Current migration rewrites schema versions. Use a bounded backup/restore procedure. |

## Corrected invariants

### Presentation and attention

Presentation is a pure function of bounded task, worker, admission, merge, project and storage facts. Reading summaries performs no Git, network or disk mutation.

Apply this precedence:

1. Inconsistent resolution plus active/unconfirmed workers or merge: recovery attention, never safely done. Preserve the recorded resolution for diagnosis; block Close/Accept and expose appropriate stop/reconciliation actions.
2. Deadline/manual intervention while a worker remains live: needs-you with Stop worker. Ordinary live execution, queued admission or merge: in-progress.
3. Quiescent accepted/closed: done. Report/storage repair remains a separate visible obligation.
4. Plan approval, stale evidence, failed/interrupted/stopped execution and other known intervention states: needs-you with state-specific actions.
5. Unknown/malformed state: needs-you, Inspect/recovery only. Never infer Accept eligibility from a catch-all state.

Warnings compose after classification; they are not unreachable first-match rows. Quiescence includes children, external workers, unconfirmed process exit, pending cancellation and merge/admission reservations. Retain leases until confirmed release. Closed-running legacy data cannot disappear behind `dismissedAt`.

Persist `attentionVersion` and `acknowledgedAttentionVersion`. A newly actionable condition increments the first, including recurrence after Resume. Acknowledge records only the displayed version. Transport updates and log lines do not create unread attention. `acknowledgedAt` remains compatibility metadata.

Use separate `controlRevision` for eligibility/artifact/binding changes, summary revision for displayed data, and existing asynchronous generation/operation guards. Do not replace the generation check in `task-loop.cjs:866–878` with a revision advanced only after successful writes. Log/report traffic must not invalidate an otherwise valid control action. Detail responses carry their own revision and connection/task identity.

### Commands and persistence

TaskLoop owns one serialized mutation path per parent task. Commit a validated candidate atomically before publishing it. Runtime callbacks must submit guarded mutations through that path; retaining mutable old job references after clone-and-swap would lose updates. Long operations reserve a durable operation identity, release the mutation queue while awaiting work, then commit against that identity and fresh authority.

Every side-effecting command, including Start, has an actor-scoped command ID and canonical payload digest. Persist its admission/outcome and affected attempt/intent identity before dispatch. Repetition returns that operation; a different payload under the same ID is rejected. Keep identities for the task lifetime; a 20-entry display cache may discard details, never deduplication evidence. Start resolves to a reserved task ID; after retention expires, reject expired tokens rather than execute again. An uncertain dispatch after a crash requires inspection, not automatic provider replay.

Disk failure returns no durable success and emits no committed candidate. Stop still attempts process termination when storage fails; report its physical outcome and unresolved bookkeeping separately. A storage warning cannot disable Stop or the storage-repair path.

### Acceptance and merge recovery

Remove Accept unverified from this increment. Stale/expired evidence requires explicit Recheck, then review of the resulting artifact. The acceptance token binds task/control revision, reviewed fingerprint or immutable source tree, source HEAD, target repository/ref/OID, check/review evidence and actor authority. Unfinished slices block clean acceptance. Current, explicitly reviewed findings may retain a separately recorded owner override; that never waives freshness.

Revalidate after awaited refresh and under execution reservations. Stage the exact immutable reviewed artifact; comparing a fingerprint and subsequently staging changing files leaves a race. Target changes require fresh review. Recheck reruns declared checks; any required model review needs an explicit authorized run, never hidden automatic spending.

TaskLoop allocates and persists the acceptance operation/intent ID. MergeBack must accept that exact ID and expected source/target, and remain sole writer of the corresponding intent. Its current `accept(task)` generates IDs internally and returns any completed intent for a task; neither behavior provides this contract.

Recovery uses durable facts:

- Task reservation without an intent: no publication established; require explicit continuation.
- Prepared/checking/merging intent: inspect or resume that operation explicitly; never start another merge implicitly.
- Publishing intent: reconcile the saved checked merge commit and target. Exact target equality plus persisted checked-artifact evidence can establish publication. Ambiguous or advanced targets require inspection; ancestry alone is insufficient proof.
- Completed matching intent with task acceptance unsaved: repair accepted state without republishing. If that write fails, retain a visible recovery obligation.
- Failed/conflicted intent: retry may continue only an unchanged safely resumable phase. Changed artifact/target requires Recheck and a new linked intent; retain the old record.

Git, task JSON and Results do not form a transaction. Expose uncertainty explicitly. Never convert every interrupted intent to an ordinary retryable failure. Before external publication, revalidate current task/project/actor authority and target constraints.

### Reports and completion

Task state is authoritative; Results is a report with an explicit source revision. Use an idempotent task-to-result identity so a crash after report save but before task linkage cannot duplicate reports. Reject stale report completions; repair the latest committed report revision.

Persist a report-pending obligation before report work. Resolved tasks with report/storage recovery obligations remain reachable beyond the seven-day/ten-row window through an uncapped recovery list/count. Retry report performs no merge or provider execution. Ordinary history remains paginated.

Update `turn-completion.cjs:validate` explicitly: it currently rejects accepted tasks with `reportError`, but bypasses report checks for dismissed tasks. A parent turn may finish after quiescent, clean passed execution while owner Accept remains pending. Accepted/closed resolution with report-indexing failure may finish only with a durable visible repair obligation recorded in completion metadata. Missing explicitly declared deliverables still block completion. Active/uncertain workers always block it. Do not reopen previously completed turns merely because a later report repair fails.

### Grouping, compatibility and rollback

Internal `repoKey` never enters phone grouping/cursors. Allocate a stable opaque folder-group ID, map it server-side and send a separately sanitized display name. Removed-project groups also avoid raw folder paths. Redacting secrets alone does not strip paths. Existing session projection paths are a separate surface; this review makes no global path-free claim.

Provenance is necessary but insufficient for agent Close. Recheck stable console identity, current binding, task binding, permitted repository and current operation state at commit. Task moves and console moves invalidate outstanding action tokens. Keyless legacy tasks should be owner-only unless an explicitly bounded existing-session policy is approved.

Older phones still hide legacy `supersededBy` records; additive fields do not fix their presentation. Negotiate task capabilities. Unsupported clients retain limited reads with a clear update requirement; unversioned Close/seen must not silently resolve or acknowledge newer conditions. Archived projects currently disappear in the phone projection and need explicit task reachability.

`migrateTaskRecord` currently overwrites any schema version. Unknown newer schemas must fail closed in the new reader. Already released binaries cannot honor a new fence: do not claim safe in-place downgrade. Before activation, quiesce workers and back up all related stores and repository refs. Supported rollback restores that matching backup into a separate data directory, retaining the upgraded directory for recovery. Git publication after the backup prevents automatic rollback; reconcile it explicitly. UI-only rollback can retain the new backend/storage version.

## Fifteen failure tests

1. Load 120 unresolved tasks, legacy supersessions and removed projects; all remain reachable with correct parent-only counts.
2. Acknowledge attention A, Resume, reach A again; new unread version survives delayed acknowledgements and log traffic.
3. Deadline with live worker, dismissed-running legacy record and unknown state all fail safe.
4. Concurrent runtime write and owner mutation preserve both changes; stale async capture cannot overwrite either.
5. Inject write failure at each command boundary; no committed success leaks; Stop still terminates.
6. Replay Start/Resume/Approve after restart and more than 20 commands; no duplicate attempt; changed payload is rejected.
7. Change source during staging, target during review, or authority during Accept; publication is refused.
8. Crash at every intent/publication/task-acceptance boundary; reconcile exact identity without duplicate merge.
9. Fail Results before/after saving and linkage; one report remains, repair stays reachable after seven days.
10. Exercise finish_turn for passed, accepted, closed, missing deliverables, report failure and live workers.
11. Move console/task bindings while commands wait; reject revoked authority, including legacy-keyless cases.
12. Inspect phone DTOs/cursors for paths/secrets; run an actual old decoder with superseded and archived records.
13. Paginate equal timestamps during concurrent resolutions using a documented snapshot boundary; discard stale detail/history responses.
14. Repeat migration, interrupt it, attempt newer-schema reading and execute the declared backup rollback on temporary data.
15. Run shared Node/Flutter presentation fixtures, large-summary performance checks and keyboard focus/deep-link checks across all states.

## Dependencies, tradeoffs and owner choices

**Owner decision: five executing workers per project**, in any eligible agent/account/model mix. Attribute every task, review, split slice and local-assist dispatch to its project; nested execution consumes the same five slots. Plan-ready workflows consume none. Global limits are separate explicit budgets. Account caps require user configuration or a verified provider concurrency restriction; remaining subscription quota does not establish a cap of one. Preserve file/checkout locks and actual local-server capacity. Console reservations remain separate from project grouping. Correct slot configuration is a prerequisite to claiming this behavior; this review changes no source or settings. The native Astra exception was explicitly approved.

First settle contracts and recovery fixtures. Backend persistence/commands and MergeBack/Results/turn-completion recovery must land together before activating new resolution behavior. Projects catalogue and opaque grouping can proceed independently against those contracts. Then wire IPC, history, capabilities and projections; validate desktop integration before removing navigation. Phone follows the stable DTO. Add MergeBack, Results, completion and compatibility files explicitly to the ownership manifest. No overlapping writers. Run mocked temporary-storage build/test/headless desktop checks, then Flutter checks for phone changes.

The eight Opus tradeoffs: retain replacement links; compute presentation server-side; accept bounded cloning initially but serialize every writer; impose no unresolved cap; defer an index until measured startup bounds fail; fold scheduler inputs into TaskLoop summaries; restrict unbound legacy authority; require fresh evidence instead of stale acceptance. Measure actual payloads and startup time before accepting the 0.5 KB estimate.

Owner decisions remain: count all needs-you tasks versus unseen badge; placement and explicit bulk Close of legacy backlog; desktop-only Accept/Stop initially; whether stopped/interrupted work gains a later Recheck-to-Accept flow; subsystem edits outside plan revision; explicit project/folder start selection. Recommended defaults match Opus except stale acceptance stays unavailable. Read-only legacy-phone restrictions and owner-only keyless legacy Close also need explicit product acceptance.

## Owner correction: autonomous Projects

This correction supersedes the earlier owner-facing workflow recommendations. Preserve the earlier technical evidence. Projects should provide current knowledge of the app and carry authorized work through verification and integration. Internal worker states belong in optional execution details. Routine completion requires no Seen, Accept or Close action.

### Initialization and adoption

Use one project initialization state machine: `uninitialized → discovering → usable → refreshing`; interrupted discovery resumes from durable checkpoints. Uncertainty is recorded per knowledge item, not a permanent project-wide block.

- **Greenfield:** the idea establishes the requested outcome and constraints. Produce a provisional component map, proposed stack and first runnable slice. Label these as proposals until implementation provides evidence. Ask only for choices that materially change scope, cost or consequences; infer reversible defaults. Implementation progressively replaces proposals with verified facts.
- **Existing repository:** bind its explicit location, inspect tracked and untracked structure without overwriting files, identify applications, entry points, dependencies, commands, boundaries and existing instructions. Preserve dirty work, current branch, owner documentation and historical plans. Distinguish observed structure from inferred design intent. Large repositories become usable after a bounded initial inventory, with uninspected areas visibly unknown.

The useful project view answers: what exists, how components connect, where to change a feature, how to run/check it, what is currently changing and what decision is actually blocked. Names and roadmaps require provenance. Keep project ID, repository binding and display name separate. A stale Agentdock label is a metadata correction, not a reason to rebuild identity. Old SSH milestones remain historical; remove their prominence when evidence shows they do not describe current work, without silently marking them completed or deleting them. Resolve a material naming/goal conflict once with the owner.

### Persistent project knowledge

Add a Project Knowledge service with one writer and immutable revisions plus a change journal in project storage. This stores knowledge, not duplicate tasks/runs. Each item has stable ID, kind, scope, evidence references, relevant content hashes, repository snapshot, extractor/version, verification time, freshness and provenance. Repository identity plus HEAD alone is insufficient: include dirty/untracked inputs and relevant configuration. Generated exports into the repository are optional and never overwrite owner-authored documents.

Separate:

- Machine-checkable facts: files/modules, imports, declared APIs/routes, package scripts, schemas, dependency versions and actual test results.
- Semantic interpretation: component responsibilities, rationale, suggested change locations and suspected boundaries. Mark these as hypotheses or reviewed interpretations, with supporting references and unresolved contradictions.
- Owner intent: goals, constraints, approved decisions and milestone criteria. Code scans cannot replace these.

Generate the connection map and planner entry-point index from evidence. Semantic summaries link to that evidence and update only for impacted areas. Static imports establish declared dependencies, not proof of every runtime interaction. Enforce only executable policies backed by actual adapters/checks; prose alone is context. Project initialization never implies permission to run arbitrary imported scripts.

### Mandatory managed-work gates

1. **Session start:** resolve binding, reconcile repository changes and select the current knowledge revision. Supply a compact context bundle with relevant instructions, architecture entry points, constraints and stale areas. The managed adapter records delivery; it does not claim the model understood it.
2. **Worker admission:** require project, authorized outcome, owned paths/isolation strategy, knowledge revision, operation identity, checks and remaining authorized budget. Refresh affected stale evidence before a consequential action. Block incompatible leases or missing authority. Record the actual brief, recommended/actual model and routing reason, difficulty estimate and progress for optional inspection.
3. **End of change:** identify the actual diff, run applicable authorized checks, extract changed facts, refresh affected interpretation and commit a knowledge revision referencing that exact artifact. Stage verified integration against the current target under existing locks. Publish a concise project outcome and any chosen deliverable. Knowledge-update failure remains a recoverable internal obligation; do not claim verified freshness until committed.

Five executing workers share each project's pool across all managed entry points. Preserve exact-operation deduplication, immutable evidence, file/checkout isolation and existing branch/workspace permissions. Deterministic rechecks and routine integration proceed automatically within owner-authorized scope. Provider correction attempts remain bounded by authorized rounds, routing and spend; uncertainty never permits duplicate dispatch or paid fallback.

File watchers trigger refresh but cannot prove freshness. Compare fingerprints at gates to catch missed events, external edits and branch changes. Checkpoints bind extraction and integration to their source snapshot; stale outputs cannot replace newer knowledge. After crashes, reconcile operation journals and repository facts before resuming. Recovery uses actual effects; it never blindly replays a model or merge.

Native CLI hooks can inject context and observe completion where supported. Arbitrary terminals, disabled hooks and bypassed adapters cannot be guaranteed to read or enforce knowledge. Label those sessions unmanaged; detect their resulting repository changes and refresh before the next managed operation. Strong guarantees apply only to mediated execution with enforceable tool boundaries.

### Decisions, Results and migration

Replace the routine task-attention list with an exceptional decisions inbox: new scope, unapproved spending, destructive action, incompatible owner requirements or an unresolved consequential choice. Each entry explains the consequence and recommended next action. Acknowledgement is optional; a decision resolves the entry. Recoverable technical failures stay internal while authorized recovery remains possible. Notify once when owner input is necessary, rather than for each worker transition.

Automatically resolve routine execution as verified, integrated, cancelled or failed with retained evidence. These dispositions do not imply owner approval or milestone completion. The integration service acts under the existing owner authorization; a worker cannot grant itself broader authority. Freshness and target checks remain mandatory even though the owner no longer clicks Accept.

Results admits explicitly requested deliverables or useful artifacts selected by an established owner preference: a release package, usable design, requested analysis or final document. Worker logs, briefs, failed/replaced attempts, routine reports and intermediate architecture drafts stay in execution history. Update one logical deliverable revision instead of creating duplicate cards. Completion requires declared deliverables, not an automatic report for every worker.

Migrate clutter non-destructively: classify known operational records, retain IDs/files/provenance and provide archive access and undo. Consolidate duplicate deliverable links without deleting versions. Preserve ambiguous records until classified. Old unresolved engine records undergo internal reconciliation; do not create an owner bulk-Close chore or declare live work resolved.

Withdraw plan sections 1/4's task-administration objective and routine acceptance table, section 5's blanket prohibition on authorized automatic integration, section 6's mandatory task-to-Results reports, section 7's task-card-first Projects design, section 9's owner backlog cleanup, and section 10's Seen/Close defaults. Replace section 8's voluntary worker narrative updates with the knowledge gates above. Previous review agreement covers engine safety, not this revised product contract; the lead must update the plan accordingly.
