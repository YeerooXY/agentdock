# Project and documentation refresh

Observed 5 November 2026. This is Paddock's read-only portfolio audit and refresh
order. It is not approval of other projects' goals, a code audit of every repo,
or permission to treat an old plan as the current implementation.

## Current findings

Six saved projects contain nine registered folders. The wider earlier survey
also included a study folder outside these six saved records. These counts
describe saved records and roots, not nine independent repositories.

| Project | Observed documentation | Record or coverage problem | Next refresh |
| --- | --- | --- | --- |
| Paddock, saved as Agentdock | README, module boundaries, knowledge implementation and dated handoff | Saved name is old; primary roadmap and two pending proposals concern earlier SSH/interface work. README still advertised separate Tasks/Results navigation at audit start. | Refresh current implementation guide and README; reconcile the saved overview with current work while retaining historical intent and pending proposals. |
| Playtime | README and MODULES describe Electron, MV3 extension, modules and study integration | Saved goals emphasize the seasonal background and the next step still asks for an earlier reload. These do not describe the breadth of the observed README. | Check the module map against current exports and record the actual active objective with the owner. |
| Agent workflow | Orchestrator SPEC, benchmark/study inputs and two prior proposed knowledge maps | Three distinct roots share one record. Orchestrator has no root README; its SPEC calls scripts pure although the earlier source inspection found CLI writes/notifications. | Produce one overview with three explicit components; revalidate the two pilot maps' hashes before adoption. |
| Robonslaught | README leads to AGENTS and a substantial system-based docs index | Saved next step is about Mall/Hospital routes. Current docs include many other systems; the active objective cannot be established from code alone. Whole-root inventory still misses runtime code because assets exhaust the cap. | Reuse the existing system docs, inspect changed responsibilities and current loaders. Audit runtime and editor source scopes separately. |
| SFDungeon | Simulator README distinguishes assumptions/evidence; local-setup README describes bot operations | One record covers two different runtimes. Saved next step describes an earlier rules update. Source counts include historical material. | Separate simulator facts from local automation facts; check evidence/version and run commands in each. |
| Nemosite | README maps generator, content, gallery and Worker behavior | Saved milestone concerns visitors; this cannot be marked done by source inspection. Saved goal is still plausible. | Check generator/Worker entry points and current verification; retain the visitor milestone until analytics evidence exists. |

Age alone does not prove a document wrong. Only the specific conflicts above
have been identified. Other behavior claims remain unverified until inspected.
No target project's source, plans or live record was rewritten by this audit.

## Source scopes and size selection

These are source-extension hints from metadata, complete within each declared
name filter. They are not function counts, code quality scores or proof of
semantic coverage. Counts exclude files classified as tests by that filter.

| Scope | Observed source files | Selection implication |
| --- | ---: | --- |
| Agent workflow orchestrator | 3 | Small candidate with CLI and persistence boundaries. |
| Nemosite | 25 | Alternative small candidate, with generator and edge Worker. |
| Playtime | 128 | Medium candidate with multiple cooperating runtimes. |
| Paddock Electron / desktop / phone | 197 / 76 / 84 | Large candidate: 357 source files across three runtimes, plus checks and provider integrations. |
| Robonslaught Assets/Scripts / Assets/Editor | 625 / 247 | Large game candidate. Scoped inventory recovered runtime code missed by the capped whole-root pass. |

Use small/medium/large to describe declared source scope, boundaries and task
coupling. Raw folder totals include captures, releases, copied sources, assets
and historical outputs; they must not determine the band. Paddock's nine-root
audit is metadata-only and does not establish a complete reference graph.

## What a settled project needs

1. Current identity, linked roots and one active objective. Separate owner intent
   from observed implementation; retire a next step only with evidence or an
   owner correction.
2. One short entry document naming the current architecture map, important entry
   points, checks, declared source scopes and known gaps.
3. Responsibility pages with source anchors and cross-system relationships.
   Preserve useful existing docs instead of generating a parallel replacement.
4. Explicit status for historical plans: planned, implemented, superseded or
   awaiting an owner choice. A test run or source inspection cannot approve intent.
5. A recorded code snapshot and doc observation. Modified time alone cannot
   certify semantic freshness. An update must identify affected responsibilities.

Paddock's shared project tools are bound to the current chat's project. This
audit can prepare the cross-project queue, but updates to another live project
must happen with that project linked. The current API cannot rename a project
or replace an already pending roadmap proposal; use the owner-facing project
controls rather than editing the live JSON behind the app.

## Comparison readiness

First refresh the chosen small repo, then medium, then large. Start measurements
only after each has an evidenced overview, runnable check definitions and a
frozen starting snapshot. Do not start three broad implementation races yet.

Both arms receive the same refreshed existing documentation, user request, code,
model settings, time limit and checks. Only the treatment receives Paddock's
additional knowledge map, generated notes and indexed retrieval. Preserve normal
search/read access in both arms. If full LSP is added, provide it equally or test
it as a separate condition. Generated treatment docs must not leak into the
baseline through its shared plan or context.

Record documentation initialization and maintenance separately from reusable
engineering and from common cleanup. Count lead, worker, review, repair and failed
usage; cached input is separate and remains a subset of input. Compare accepted
quality, regressions, omitted obligations, time and total usage. No savings or
reliability claim follows from this audit.

Raw bounded observations and hashes are retained locally in
`.build/project-refresh/registered-audit.json` and `source-scopes.json`.
