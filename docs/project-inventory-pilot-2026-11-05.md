# Project inventory and knowledge-splitting pilot

Historical first-pass observation. For the later registered-project audit,
recovered Unity runtime scope, current implementation and refresh queue, see
[Project refresh](project-refresh-2026-11-05.md) and
[Knowledge implementation](project-knowledge.md). Retain this report's original
coverage and cost limits when interpreting its counts.

Observed 5 November 2026. Read-only metadata survey of 10 registered folders. These are roots, not ten independent software repositories. Results cover the default exclusion policy; complete does not mean every ignored/generated/private file was examined. Source-role counts are filename/path hints, not ownership or semantic facts.

## Inventory

| Registered folder | Observed files | Source-extension hints | Test/support hints | Coverage |
| --- | ---: | ---: | ---: | --- |
| Agentdock / Desktop and Android app | at least 8,384 | at least 1,256 | at least 106 | Partial: entry-limit |
| Playtime | 1,072 | 128 | 100 | Complete within filter |
| Robonslaught | at least 9,733 | at least 247 | at least 0 | Partial: entry-limit |
| SFDungeon / Simulator | 2,624 | 918 | 146 | Complete within filter |
| SFDungeon / Local study setup | at least 1,438 | at least 331 | at least 12 | Partial: depth-limit |
| Agent workflow / Orchestrator | 22 | 3 | 6 | Complete within filter |
| Agent workflow / Benchmark client | 46 | 33 | 4 | Complete within filter |
| Agent workflow / Website study | 262 | 4 | 0 | Complete within filter |
| Nemosite / Portfolio site | 412 | 25 | 2 | Complete within filter |
| Párhuzamos rendszerek | 32 | 0 | 0 | Complete within filter |

The retained [inventory summary](knowledge-pilots/inventory-summary.json) records the observation time, policy hash, per-rule exclusion counts and non-private excluded directory paths. Defaults exclude dependency/build/account folders and private filenames. Name rules such as `bin` and `Library` are conservative hints and can hide real project source; this is coverage of that filter, not proof of source completeness. Reads are live metadata observations, not an atomic or reconstructible source snapshot. The scanner does not interpret Git ignore rules. File counts include evidence, assets and historical material that may not be application source.

The small orchestrator contains five Python files, including two test files, plus queue fixtures and historical notes/logs. Website study contains four runtime scripts; images and evidence records account for much of its larger file count. The study-material folder has five docs-role, ten asset-role, two data-role and fifteen other-role files, with no recognized source-extension matches. A collection-oriented map is provisional until those types and their contents are reviewed; unrecognized languages and notebooks can otherwise be missed.

## First two responsibility maps

The method is in [knowledge-partitioning.md](knowledge-partitioning.md). Both maps are proposed interpretations, with source hashes, line hints, gaps and declared checks. They have not been imported into other projects' live knowledge.

| Pilot | Proposed sections | Machine-readable map |
| --- | --- | --- |
| Orchestrator | Queue decisions/routing; outcome recording/persistence; progress/stall observations; CLI/Paddock integration | [orchestrator.json](knowledge-pilots/orchestrator.json) |
| Website study | Study records/evidence checks; browser capture; bounded first clicks; report/playbook generation | [website-study.json](knowledge-pilots/website-study.json) |

This split crosses file boundaries where necessary. `next.py` participates in both scheduling policy and integration. A folder-only map would conceal that distinction. Conversely, one capture section groups related consent, control and screenshot helpers; it does not create a prose page for every function.

## Worked change-location checks

These examples were authored from the same source inspection. They demonstrate the proposed lookup shape; they are not a blind retrieval benchmark.

| Change | Start here | Neighbor/context |
| --- | --- | --- |
| Change orchestrator retry selection | `next.py:184 decide` | Queue validation and worker/reviewer routing |
| Map a Paddock outcome to queue state | `record.py:76 task_update` | Queue persistence and status input |
| Keep capacity waits out of stall detection | `watch_tasks.py:24 observe` | Task observation shape; caller owns intervention |
| Change emitted Paddock task arguments | `next.py:262 paddock_line` | Routing policy; emitted text does not execute the call |
| Change initial capture consent behavior | `capture.js:124 rejectOptionalCookies` | Browser capture and control sampling |
| Change first-click stopping behavior | `postclick.js:29 main` | Request filter and observed-step record; runtime not audited |
| Change report/playbook text | `build-analysis.cjs` | Preserved evidence and external Paddock content guide |
| Change study size/completeness expectations | `capture.js:52`, `validate-study.js:7` | Builder assumptions and evidence records |

## Useful findings and gaps

- Website-study report generation explicitly reads `../../agent-dock/skills/web-ux-ui/references/content.md` at `build-analysis.cjs:65`. The referenced file exists. Its contents were not semantically reviewed here. A repo-isolated context bundle would miss this dependency unless it is recorded.
- Orchestrator documentation calls scripts pure. Source shows that `next.main` logs actions and can notify, while `record.main` replaces queue files. The distinction between testable decision logic and CLI side effects belongs in its map.
- Website study has separate validation entry points: the package script checks capture inputs, while `validate-study.js` checks preserved evidence/report links. Neither was executed during this read-only pilot.
- Its README contains the decorative heading separator `Reviewed outputs â€” 31 October 2026`. This is flagged for that project; the pilot makes no target-source edits.
- Python AST parsing consumed 68,820 input bytes across five files and observed 52 test-function definitions. Definitions are not passing tests or measured coverage. JavaScript/manifest/document hashes consumed 70,997 bytes. These are hashed bytes, not semantically inspected bytes. Semantic inspection used selected excerpts, with byte coverage explicitly unknown; additional manual excerpts are not included in either total.
- No JavaScript parser/binding graph or immutable source store was produced. Observed source hashes cannot reconstruct code. Relationship and section proposals retain explicit uncertainty.

## Expansion order

1. Review whether these two small maps answer useful change-location questions and correct their boundaries.
2. Test the same procedure on the 46-file benchmark client, then the portfolio site with browser/worker/build boundaries.
3. Expand to Playtime and the simulator using package/runtime boundaries and an explicit treatment of historical/generated material.
4. Revisit Unity and Paddock with selective scopes and source extraction; do not turn their capped first pass into a complete map.

The existing persistent metadata/read service remains separate from this pilot. Automatic semantic partitioning, source snapshots, dependency-complete extraction and continuous upkeep are not implemented by this inventory. Findings live in Paddock; no source project scripts were imported or executed.

## Cost accounting

The [cost measurement note](knowledge-pilots/cost-measurement.md) records the
recovered coordinator usage as well as worker/reviewer usage. The 36-minute
initial run includes framework work, repairs and tests. Docs-only cost remains
unmeasured; the next scoped Unity sample will separate those phases.
