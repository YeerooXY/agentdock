# Projects: current application knowledge and autonomous work

Owner correction, 4 November 2026. This supersedes the previous task-administration product contract. Planning only; no source, runtime configuration, project data or existing Results were changed.

## Product contract

The person describes a goal and works with agents. Paddock maintains a useful, current model of the application across sessions, handles ordinary worker operations within existing authority, and asks for input only when a consequential decision genuinely needs the owner.

Projects is the application's maintained overview: current identity and work, component responsibilities and connections, feature-change entry points, and how to run/check it. Worker management is an optional detail view. Results holds useful deliverables.

Owner requirement, 5 November 2026: extra-cost project knowledge/indexing and AI
documentation maintenance must be optional. Provide an enforced off switch;
automatic model maintenance requires explicit opt-in and a bounded usage policy.
Turning knowledge off preserves saved data and ordinary console operation. This
does not disable execution safety or task-ownership checks. Controls and product
integration remain unimplemented; storage/read helpers and pilot maps alone do
not complete the workflow.

Withdraw routine owner Seen/Accept/Close workflows, mandatory worker-report cards, task-card-first Projects and owner cleanup of old worker attempts. Retain exact-operation deduplication, single writers, fresh evidence, safe integration/isolation, recovery and five executing workers per project. Automatic integration must act under the owner's existing scope; a worker cannot approve broader scope or invent owner approval.

## What is missing today

The screenshots show operational worker reports, failed/replaced attempts, duplicates and internal architecture documents filling Results. The Project card still names Agentdock and promotes old SSH draft milestones.

Source inspection explains the gap:
- electron/shared.cjs records a dock_context receipt; it does not maintain the application's architecture.
- electron/turn-completion.cjs records a short outcome/next step. It does not reconcile architecture, current scope and the old roadmap.
- electron/project-planning.cjs exports existing planning fields to PROJECT/ROADMAP files. Exporting stale fields is not a current knowledge system.
- electron/task-loop.cjs record() saves every worker report through Results, creating owner-facing operational clutter.

There is currently no end-to-end guarantee that project structure and documentation stay current after independent coding sessions. The managed-work gates below are the missing mechanism.

The stable project ID and repository bindings stay. The owner's correction establishes Paddock as the current display identity; Agentdock remains a historical/search alias. Old SSH milestones remain historical, not silently completed or deleted. No live metadata is edited by this planning task.

## Reviewed product architecture

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
3. **End of change:** identify the exact artifact/diff and run applicable authorized code/integration checks. Commit the task completion together with a durable pending_doc_delta obligation in its task record/journal. Mark affected interpretations dirty, then coalesce and refresh them asynchronously. The documentation queue has its own sub-budget but shares the five executing models per project. Do not block ordinary completion on a synchronous prose-model call, lose pending maintenance, or call stale prose fresh. A later worker can receive the last verified contract labelled stale plus current generated facts and the intervening exact diff. Refresh consequential contract assurance before any action that depends on it. Publish a concise outcome and chosen deliverables, not worker reports.

Five executing workers share each project's pool across all managed entry points. Preserve exact-operation deduplication, immutable evidence, file/checkout isolation and existing branch/workspace permissions. Deterministic rechecks and routine integration proceed automatically within owner-authorized scope. Provider correction attempts remain bounded by authorized rounds, routing and spend; uncertainty never permits duplicate dispatch or paid fallback.

File watchers trigger refresh but cannot prove freshness. Compare fingerprints at gates to catch missed events, external edits and branch changes. Checkpoints bind extraction and integration to their source snapshot; stale outputs cannot replace newer knowledge. After crashes, reconcile operation journals and repository facts before resuming. Recovery uses actual effects; it never blindly replays a model or merge.

Native CLI hooks can inject context and observe completion where supported. Arbitrary terminals, disabled hooks and bypassed adapters cannot be guaranteed to read or enforce knowledge. Label those sessions unmanaged; detect their resulting repository changes and refresh before the next managed operation. Strong guarantees apply only to mediated execution with enforceable tool boundaries.

### Decisions, Results and migration

Replace the routine task-attention list with an exceptional decisions inbox: new scope, unapproved spending, destructive action, incompatible owner requirements or an unresolved consequential choice. Each entry explains the consequence and recommended next action. Acknowledgement is optional; a decision resolves the entry. Recoverable technical failures stay internal while authorized recovery remains possible. Notify once when owner input is necessary, rather than for each worker transition.

Automatically resolve routine execution as verified, integrated, cancelled or failed with retained evidence. These dispositions do not imply owner approval or milestone completion. The integration service acts under the existing owner authorization; a worker cannot grant itself broader authority. Freshness and target checks remain mandatory even though the owner no longer clicks Accept.

Results admits explicitly requested deliverables or useful artifacts selected by an established owner preference: a release package, usable design, requested analysis or final document. Worker logs, briefs, failed/replaced attempts, routine reports and intermediate architecture drafts stay in execution history. Update one logical deliverable revision instead of creating duplicate cards. Completion requires declared deliverables, not an automatic report for every worker.

Migrate clutter non-destructively: classify known operational records, retain IDs/files/provenance and provide archive access and undo. Consolidate duplicate deliverable links without deleting versions. Preserve ambiguous records until classified. Old unresolved engine records undergo internal reconciliation; do not create an owner bulk-Close chore or declare live work resolved.

## Concrete owner-facing journeys

New project: choose a folder and describe the desired application. Paddock infers reversible defaults, asks only material questions, and prepares a proposed component map plus the first runnable increment. As work lands, proposed nodes become evidence-backed implementation facts. The person does not fill in a task-management board.

Existing project: choose the folder, let Paddock inventory it without executing imported scripts or changing source, then request the next change. Existing instructions, owner docs, dirty/untracked work and the current branch are preserved. Ambiguous boundaries or consequential conflicts can require one targeted question. Unknown areas stay labelled instead of being fabricated.

Work detail is optional and records the actual subagent brief, planned approach, difficulty estimate labelled as an agent estimate, recommended route, actual model/account when verified, why it differed, progress and checks. Missing native model verification is shown as unknown. No user must rate tasks or choose every worker.

Default outcome: a short account of what changed and where it can be tried, plus useful requested artifacts. Ordinary subagent completion requires zero owner resolution clicks. Pause/Cancel and manual review remain optional controls. A person can inspect why something failed without receiving a notification for every attempt.

## Exact concurrency and integration rules

Five managed workers execute per project, with any eligible mix of agents/accounts/models. Planner, implementation, review, split children and local assist share that pool; waiting parents, queued requests and plan-ready workflows do not consume execution units. A sixth waits. Two projects can run five each unless a separately configured global budget or actual resource constraint blocks them.

Remove the unverified account-one fallback and any stale-quota policy that silently recreates it. Account caps need user configuration or a verified provider constraint. Funding, allowance freshness and paid-spend permission remain separate from concurrency. Do not silently substitute models, buy credits or add paid fallback.

Admission is fair among resource-eligible jobs. Acquire newly required execution/lease bundles together; blocked jobs do not hold up disjoint eligible work or retain partial capacity. Stop remains available at full capacity. Unconfirmed process exit retains its leases.

Current-checkout editing stays exclusive unless write scopes and repository-wide mutation restrictions are enforced. Parallel editing normally uses explicitly authorized isolated workspaces, followed by one serialized checked publication lane. Do not create branches/worktrees without the required authorization. Managed adapters disable native nested spawning; split parents finish their model turn and release/partition conflicting leases before children start.

Integration uses an immutable verified artifact, current target/authority and exact durable operation identity. System task resolution records its actor, policy and evidence; it never pretends the user clicked Accept. A crash-uncertain dispatch or publication is reconciled, not automatically replayed. Internal task lifecycle remains inspectable but is not exposed as owner chores.

## Implementation order and ownership

1. Product/data contracts: project identity, active outcome vs historical scope, knowledge facts/interpretations/intent, freshness, worker metadata, internal dispositions and exceptional decisions. Freeze shared fixtures first.
2. Project Knowledge: one writer and journal, non-destructive initialization/adoption, bounded fact extraction, subsystem contracts and source-keyed queries. Project metadata stays with Projects; knowledge does not become another task/run store.
3. Managed-work gates: shared context bundle, adapter delivery receipt, admission token, actual-diff/check coverage and committed knowledge delta before freshness claims. Cover external edits, concurrent updates, restart and failed persistence.
4. Autonomous execution policy: TaskLoop owns tasks/attempts, Scheduler owns resource leases, MergeBack owns checked publication intents. Routine authorized integration/resolution is automatic; exact-operation and authority tests remain mandatory.
5. Project presentation: current application overview, architecture and run/check access, optional Work detail and exceptional decisions. Desktop and phone use the same knowledge/presentation contracts. Preserve focus and existing visual direction; this document does not select a new visual design.
6. Results migration: deliverable-purpose allowlist and one logical artifact with versions. Put operational records in execution history/archive with stable IDs, retained files and undo; do not make the owner clear a backlog. No automatic deletion of ambiguous/manual outputs.

The integrator exclusively owns main/preload/shared/adapter wiring. Knowledge, execution/scheduler, desktop and phone implementation packages receive distinct file ownership before dispatch. Do not add this wholesale to the existing large UI/main functions. Failed intermediate persistence must not activate partial integration contracts.

## Acceptance criteria

The revised tasks-projects-acceptance-2026-11-04.md specifies the future tests. In particular, demonstrate independent sessions and external edits without user reminders, correct planner entry points, automatic authorized completion with zero routine owner task-resolution clicks, no worker-report cards/notification storm, and safe five-per-project execution. Generated facts and semantic interpretations must remain distinguishable.

Run build/unit/headless desktop and applicable Flutter checks during implementation using temporary data and mocked providers. No implementation tests or runtime behavior are claimed by this planning correction.

## Review and handling record

The same native architecture reviewer assessed the owner correction. Its recommendations above are integrated directly. Earlier Opus/Astra agreement remains evidence for engineering safety; it does not approve the withdrawn administrative product contract. No extra manager/signoff loop was started.

Local Strata was offline. Native/coordinator token totals are unavailable; no savings claim is made. The project UI/UX skill was applied to the two journeys and supplied screenshots. The screenshots establish clutter and stale presentation; they do not prove keyboard, screen-reader or performance behavior.

The prior plan is retained in the internal .build/plans/tasks-projects-before-owner-correction.md snapshot. This correction is kept in the existing project document and creates no new Results cards. Existing application data and Results entries remain unchanged.

## Indexed knowledge protocol refinement

The owner supports offering project creation after choosing an unbound starting folder. The concrete indexed-knowledge/retrieval proposal is in [project-knowledge-protocol-2026-11-04.md](project-knowledge-protocol-2026-11-04.md): flat immutable responsibility IDs with numbered directory views, source-first reverse lookup, semantic-only stored contracts with materialized signatures, exact pinned source extraction, fine-grained sound dependency checks and asynchronous bounded small-model maintenance. Opus 5.5, Astra and the owner-relayed Gemini 4 Argon assessments are reconciled; each returned AMEND. This is lead reconciliation, not an additional unanimous signoff. Token targets are pilot hypotheses, not measured savings. No new Results cards were saved.
