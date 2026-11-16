# Standalone engineering skill pilot

Verdict: inconclusive for adoption or savings. One corrected plain/skill pair
per skill completed outside Paddock. The pipeline works, but the small fixtures,
scoring flaws and single samples cannot establish which skills improve work.

## Engineering skills

The optional group now contains Project documentation, pstack, Ponytail and
Thermo-Nuclear Code Quality Review. Documentation supports a numbered source-backed
map using Paddock Knowledge or ordinary files in a standalone repository. Installing
it does not enable automatic upkeep or bypass Knowledge Off.

## Experimental conditions

The corrected wave used native Claude Code 2.1.318 with claude-sonnet-5-5 in all
eight sessions, signed in to an included Pro subscription. Every pair had the
same task text, source hash, model, effort, permissions and execution bounds.
Order alternated across tasks. There was one repetition per condition.

Both arms used safe mode, disabled skill auto-discovery, a strict empty MCP
configuration and no session persistence. Available tools were Read, Grep, Glob,
Write and Edit. No Paddock task wrapper, hooks or MCP servers were used by the
trial agents. Initialization events confirmed zero MCP servers and zero
automatically discovered skills. This forced-on comparison excludes passive
installed-skill discovery metadata overhead; that must be measured separately
before deciding to install or enable a bundle by default. Local CLI help records that safe mode disables
CLAUDE.md/customization discovery and restricted mode confines file tools to the
working directories. Native admin-managed policies were not independently audited.

Skill files were exported from the Paddock distribution cache before the corrected
wave; the app was not called to run the skills. The actual selected upstream
instructions were supplied through the native append-system-prompt-file option,
not merely described or installed. The documentation arm supplied its entrypoint
and standalone protocol. The selected source bodies match their recorded hashes;
transcripts show no writes to skill context. Future runner defaults read native
agent skill folders, accept --skills-root, run outside the repository tree and
check the complete copied skill tree before/after execution.

## Corrected-wave observations

| Skill | Plain seconds | Skill seconds | Plain input / output tokens | Skill input / output tokens |
| --- | ---: | ---: | ---: | ---: |
| project-documentation | 22.9 | 25.9 | 28,510 / 1,969 | 47,506 / 2,366 |
| ponytail | 8.1 | 8.8 | 27,340 / 819 | 32,841 / 826 |
| pstack | 21.1 | 23.2 | 36,267 / 2,269 | 75,316 / 2,689 |
| thermo-nuclear-code-quality-review | 9.9 | 10.8 | 27,525 / 1,037 | 44,941 / 1,148 |

Timings include native CLI startup, reading, inference and artifact writing.
Those components were not profiled separately; these are raw single samples,
not speedup/regression claims. Source/skill-copy preparation is recorded separately.
Input includes cache reads and repeated context across requests, not only unique
prompt text. Cache is also reported separately. Native dollar estimates are
API-equivalent, not subscription invoices.

## Quality and scoring audit

- Documentation: both covered expiry and cancellation despite narrow regex
  failures. Neither explicitly explained that local abort cannot undo server
  work. The skill output added scope/evidence limits, but did not supply stable
  section IDs. Guidance alone did not enforce the proposed document structure.
- Ponytail: both produced the same effective patch. After inspection, both passed
  six runtime edge cases. The automatic task checker itself is static.
- pstack: both plans cite real files with explanatory text. The bare-path check
  and undisclosed list-size bounds produced false failures. Both discuss the
  send/recording gap and the missing durable/idempotent guarantee. This serial
  test does not exercise pstack's multi-model playbooks.
- Thermo-Nuclear: both found the two planted structural faults with real quotes.
  The plain response added an unproven concurrency assertion. One pair cannot
  establish a difference in false positives.

Raw automated scores are preserved. Manual adjudication is separate. No score
was silently revised to favor a condition, and no winner is declared.

## Calibration failures and total cost

An earlier eight-session calibration wave used entry-wrapper instructions.
Transcript inspection showed Ponytail and pstack never loaded their actual
upstream skills. Those two treatments are invalid full-skill tests. The entire
wave remains recorded as setup/calibration cost; it was not discarded. The runner
was repaired and the eight-session corrected wave used explicit skill text.
There were 16 native model calls across both waves, without automatic provider
fallback or retries of individual failed outputs.

A Paddock-routed fixture-authoring worker and one focused validity reviewer were
separate from the experiment. Their usage, coordinating usage, installation and
future documentation upkeep must be added before a total-cost comparison. Local
inference was offline. No savings claim is supported.

## Next experiment

Fix and freeze explicit output contracts/checkers before further inference.
Use real tasks on a small repository first, then medium and large repositories.
Nemosite remains the small-repository candidate; these fixtures are not that test.
Then compare smaller workers with/without docs against a fixed stronger-model
baseline; the current single-model pilot says nothing about that capability tradeoff.
Use identical snapshots, native model versions and budgets, with at least five
interleaved pairs per chosen task before a comparative claim. Retain failures,
timeouts, repairs, cache effects and source/skill version hashes.

Measure documentation initialization, source changes, upkeep and later retrieval,
including stale obligations, unsupported claims and missing IDs. Evaluate skills
individually before a combined bundle. A subsequent Paddock arm can measure app
integration separately; the first comparison remains outside Paddock as requested.

## Reproduce and inspect

`node scripts/standalone-skill-pilot.cjs` prepares without inference. `--run`
explicitly makes included-subscription calls. `--task=<id>` selects a task and
`--skills-root=<folder>` supplies portable installed skills. No automatic model
fallback occurs. Infrastructure failures stop the run; bounded task failures
remain recorded. This runner is not part of npm test.

Corrected data: `.build/skill-pilot/standalone-Cd1A69/`. Calibration data:
`.build/skill-pilot/standalone-cXRkSl/`. Results contain paired input hashes,
artifacts, native traces/usage and separate manual/context audits. Captured CLI
isolation evidence is in `.build/skill-pilot/native-isolation-evidence.json`.
No production repository, branch or application feature setting was changed by
trial agents. Model-written patches were inspected before separate runtime checks.
