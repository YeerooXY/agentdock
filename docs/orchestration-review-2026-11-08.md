# Orchestration review, 8 November 2026

Scope: read-only review of stockroom round 4 (`.build/stockroom-round4/runs/paddock-2026-11-08T13-53-26-143Z`) against source revision f3fadec. No code, artifacts or benchmark were changed or rerun.

## What the evidence shows

**Coordinator input.** All four stages share thread `01a1bb6f…` (each `stage*.jsonl:1`). `runner.cjs:75` runs stage 0 with `exec` and later stages with `exec resume`. Cumulative `input_tokens` were 1.91M, 5.39M, 10.58M and 18.94M, so the per-stage deltas were 1.91M, 3.48M, 5.19M and 8.36M. Of the 18.94M total, 18.68M were cached (`stage4.jsonl:123`). Every model turn resends the whole thread, so growth follows the number of turns times the accumulated context. The resumed thread is a harness choice. Production Paddock does not impose it.

**Status repetition.** The 39 completed events that mention `task_status` break down as:
- 4 `dock_tools` schema lookups (for example `stage1.jsonl:24`)
- **35 actual `dock_call` status returns**: 9, 8, 8 and 10 per stage

Every status call passed `includeReport:true` with a `reportLimit` between 1000 and 3500, so the lead explicitly requested each report. The bulk came from fields that `view()` always spreads into the result (`electron/task-loop.cjs:271-275`, returned by `status()` at `:306-311`): `criteria` (up to 12,000 chars, `:316`), full `rounds`, `implementer` metadata, and `finalDiff`. `finalDiff` was non-empty in 5 of the 35 returns and empty in 30. It is capped at 60 KiB (`:785`). Five capped diffs come to roughly 300 KB, which fits the observed ~316k. The ~800k aggregate was not re-measured here. Serialized size is not rendered-token accounting, and I make no causal savings claim.

What actually repeated was the full job record, criteria included, on every poll. The lead also had no way to wait. `task_status` has no wait parameter (`electron/workbench.cjs:44`), while `delegation_status` already has one (`electron/delegation.cjs:361-370`, capped at 45 s). The 35 polls each cost one full-context model turn.

**Why no structural review ran.**
1. **Lead skill cap.** The lead role is eligible for six ordinary packs (`electron/skill-policy.cjs:18-23`), but `MAX_SELECTED = 5` (`:8`, `:81`) dropped thermo-nuclear from the lead summary (`stage1.jsonl:5`: "thermo-nuclear-code-quality-review: Automatic skill delivery limit reached"). The lead then copied that into the worker briefs ("Review skill … unavailable (delivery limit)", `stage1.jsonl:21`). The cap counts packs, but the lead receives one pointer line per pack. Worker briefs already have the real budget: byte caps of 32/48 KiB at `electron/skill-packs.cjs:288-289`.
2. **Review depends on dispatch, not on skills.** Reviewer-role skills reach a model only when a reviewer phase runs (`electron/main.cjs:564`). All four `start_task` calls passed `"reviewer":null` (`stage1.jsonl:21` and the matching lines in other stages). Non-split tasks never get a suggested reviewer (`electron/task-loop.cjs:327`, which only applies to split tasks). The shared guidance (`electron/shared.cjs:111,113`) never asks for a reviewer on substantive builds. No skill text can guarantee a review that is never dispatched.

**Candidate growth.** `store.js` has 1100 lines and `app.js` has 1153; the plain baseline has 342 each (`results-summary.json:95-103`). I only sampled the structure. `store.js` contains `parseV1`, `parseV2`, `parseV3`, `parseV4` and `upgradeToV4` (`.build/stockroom/yew/src/store.js:271-638`), about 400 lines of persisted-schema versions and migration. Each stage worker added a new schema version instead of revising the model. A structural reviewer would flag this, and none ran. Three initial check failures (`results-summary.json:30,44,58`) were repaired by the lead inside its own thread, which added more turns.

## Script vs coordinator boundary

Use the existing pieces and add no new architecture. `start_task` already gives each role a fresh, bounded context (`main.cjs:561-566`). The coordinator should only plan, dispatch with a reviewer, wait, read a compact result and accept. Waiting and polling are deterministic and belong in the server.

In the benchmark harness, fresh stages are a one-line choice in `runner.cjs:75`: use `exec` for every stage, with a script-written stage brief containing the prior summary and file list. This is harness-only. It drops cache reuse and is an unmeasured tradeoff, so don't treat it as a production finding.

## Minimal patch plan (ordered)

1. **Compact status by default.** File: `electron/task-loop.cjs` (`status()`, beside `view()`).
   - Add `detail = false`.
   - Compact output keeps an explicit whitelist: `id`, `state`, `title`, `error`, `unresolved`, `diffStat`, `changedFiles`, `outcome`, `usageSummary`, `finishedAt`, `log`, and per round only the check `{state, outcome, exitCode}` and review `{state, verdict, findings}`. Keep `reportPending`/`report` unchanged.
   - `detail:true` returns today's full view, including `criteria`, `finalDiff` and complete rounds.
   - `electron/workbench.cjs:44`: add `detail` to the schema and description. In `:172`, `close_task` passes `{ detail: true }` because it needs `originConsoleKey`/`originConsoleId`. Alternatively, keep both fields in the compact whitelist.
   - Snapshot, UI and mobile use `view()`/`snapshot()` rather than `status()` (grep found no renderer or mobile caller), so they are unaffected. `turn-completion.cjs:59` reads jobs directly.
2. **Server-side wait.** Same files. Add `waitSeconds` (0-45), copying `delegation.cjs:364`: `await Promise.race([this.pending.get(id), sleep])` before building the result. Keep the "call again" contract and add no automatic retries.
3. **Remove the pack-count cap.** File: `electron/skill-policy.cjs:8,81`. Delete `MAX_SELECTED`; the byte caps in `skill-packs.cjs:288-289` remain the worker limit. Update `tests/skill-policy.test.cjs:148`. If the owner wants a count limit, apply it to worker roles only.
4. **Make the reviewer decision visible.**
   - `electron/task-loop.cjs:327`: when `reviewer` is omitted (`undefined`), use `suggested.reviewer` for non-split tasks too. An explicit `null` still means no review.
   - `electron/shared.cjs:111`: add one sentence: "Assign a reviewer for substantive builds; reviewer:null only for tiny work or the owner's choice."
   - This uses only discovered eligible accounts and no paid fallback. If the suggestion is a metered account, the existing metered-assignment rule still requires an explicit assignment.

## Checks per step

1. In `tests/task-loop.test.cjs` and `tests/workbench.test.cjs`:
   - Default status omits `criteria` and `finalDiff`.
   - `detail:true` returns both byte-identical to `view()`.
   - `includeReport` still returns `report`/`reportPending`. Extend `tests/task-status-pending-report.test.cjs`.
   - Repo mismatch still rejects.
   - `close_task` ownership tests still pass.
2. Waiting resolves early when the job finishes and returns after the cap otherwise, using fake timers.
3. With seven automatic lead packs, all are listed. The worker byte-cap test still reports oversize packs.
4. Omitted reviewer: the suggestion is applied. Explicit `null` keeps no review. A reviewer equal to the implementer still rejects.

Run `npm run build`, `npm test`, and `npm run test:linux` for the changed desktop paths. No paid calls.

## Unknowns and skipped checks

- I did not reproduce the exact rendered tokens per status return or the ~800k/224k/31k/27k breakdowns. I only confirmed the 5/30 `finalDiff` split and the code path.
- I did not measure the shares of the 8.36M stage-4 delta that came from status polls, the lead's own `Get-Content` reads, browser scripts or repairs.
- Fresh versus resumed lead sessions is untested. Cache reads are cheaper, and a fresh session may cost more per stage.
- Whether the UI relies on omitted-reviewer behavior for non-split starts is unverified. Check the renderer start call before step 4.
- I skipped a full audit of `app.js` and every test suite run, and did not inspect the round-2 baseline records beyond `results-summary.json`. This is one run against an earlier baseline, so no generalization.
