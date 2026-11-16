# Tasks into Projects: Opus signoff

4 November 2026. Planning only. One bounded pass over the [consolidated plan](tasks-projects-plan-2026-11-04.md) and the [Astra review](tasks-projects-astra-review-2026-11-04.md). I did not read source, run commands or tests, or call any models.

**Verdict: AGREE WITH CONDITIONS.** The consolidated plan adopts every Astra BLOCK and AMEND item correctly. It needs the six corrections below, each a sentence or two. None of them reopens the architecture. The product defaults in §10 still need owner approval.

## Conditions

1. **Nested dispatch can deadlock (§3 "Model runtimes must not launch untracked nested workers").** If a counted model turn waits synchronously on a child dispatched by the scheduler, five waiting parents fill all five slots and their children can never be admitted. Correction: in this increment, managed adapters disable native nested spawning. The scheduler dispatches children only from a split parent that is quiescent and holds no slot. A turn that waits on its own child is refused rather than queued.

2. **File locks can block the whole project queue (§3 "project-fair admission with FIFO within a project").** If the first job in a project's queue waits on a file or checkout lease, strict FIFO stalls jobs behind it whose resources are free. Correction: FIFO order applies among jobs whose resources are available. A blocked job keeps its position and reports its reason, but it does not hold back eligible jobs. Admission acquires the project slot and all declared leases together, all or nothing, so no job holds some resources while waiting for others.

3. **Split-parent leases (§3 "A split parent waiting for its children … consume no executing-worker slot").** The plan does not say what happens to the parent's file leases. If the parent keeps leases that its children need, the children deadlock. Correction: when the parent splits, its leases are divided among the children or released. A parent waiting on children holds neither a slot nor overlapping file leases.

4. **Uncertain dispatch replay (§5, second paragraph).** Astra's rule is missing: a dispatch left uncertain by a crash requires inspection and is never replayed automatically. At present §6 says this only for finish_turn. Correction: add the rule to §5 for Start, Resume and Approve.

5. **Owner decisions and model agreement are mixed together (§10, §1, §5).**
   - "Five managed workers per project" is already an owner decision (§1). It should not appear as a recommended default. Correction: move it to a recorded owner decision.
   - "No Accept unverified" is a safety requirement both reviewers agreed on (§5). It is not a product default. The owner question is only whether a later Recheck-to-Accept flow should exist.
   - Astra's owner choice "explicit bulk Close of legacy backlog" is missing from §10. Correction: add it.

6. **Rollback and report-repair gaps (§9, §6).**
   - §9 requires quiescence before activation only. Correction: also quiesce workers, merge intents and report repairs before restoring a backup.
   - §6 omits Astra's rule that a later report-repair failure does not reopen previously completed turns. Correction: add it.

## Checks that passed

- **One writer:** §2 table and §8 packages match. TaskLoop is the sole task writer through a serialized path per parent. MergeBack is the sole intent writer, using IDs allocated by TaskLoop. The Scheduler owns leases. Results is versioned and never authoritative. Presentation is pure.
- **Lifecycle:** the precedence in §4 matches Astra's ordering. Warnings compose with classification. No row lets a done state hide live or uncertain workers.
- **Exact operations:** commandId plus payload digest, deduplication for the task lifetime, persistence before dispatch, Accept bound to exact artifacts and staging of the immutable artifact (§5). The intent recovery cases (§6) match Astra one for one.
- **Capacity:** five per project, no implicit account cap of one, global and account limits explicit and separate, owner consoles kept separate, and Stop never queued behind capacity (§3). These are consistent with §9 gates 3 and 4.
- **Report repair:** idempotent result identity, repair obligations persisted first, uncapped recovery list, and report retry that runs neither providers nor merges (§6).
- **Rollback:** restore into a separate directory, retain upgraded data, reconcile any Git publication made after the backup explicitly, and make no in-place downgrade claim (§9).

## Next step

The orchestrator applies conditions 1 to 6 as minimal edits to the plan, then the owner reviews §10. Once these edits land, this signoff becomes AGREE without another review round.
