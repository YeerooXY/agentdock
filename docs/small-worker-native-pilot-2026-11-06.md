# Smaller-worker implementation trial

Haiku 5.5 completed the nominal migration checks, but this trial did not establish
a same-time, equal-quality replacement for Sonnet. The free North Mini route
failed before implementing code. A concise-brief follow-up showed a possible
context benefit within Haiku, with important timing and quality limitations.

No live Nemosite files, model defaults, allowance settings or deployments changed.

## Design and routes

The same frozen build migration, source fixture and 12 acceptance checks from the
[cross-module trial](cross-module-native-pilot-2026-11-06.md) were reused. Five
completed Claude implementations passed all 12 checks first time. These checks
include clean/stable builds, preserved source/private-asset bytes, regenerated
Worker references, page/CSP/link checks and 18 mocked endpoint tests. They do not
prove absence of every bug.

Candidates were included-subscription `claude-haiku-5-5` and the verified
zero-price `openrouter/cohere/north-mini-code:free` route through Pi. Local Strata
was offline. One fresh `claude-sonnet-5-5` implementation supplied a matched
control for the follow-up. All candidate implementations stayed on their
specified model; no stronger model repaired their code.

Claude workers requested medium effort, 32 native turns and an 8,192-token output
cap. Pi had a 24-response budget per condition, no retries/compaction/extensions,
and only file tools. Its model catalog advertised 64K maximum output; this was
not the same per-response cap as Claude. The free account reported 50 requests
available before the batch; 28 assistant responses were observed across its two
attempts. Both had SDK-reported cost zero.

## Detailed shared plan

The first pair used the same approximately 630-word Sonnet plan in every copy.
This isolates the implementation worker, while already supplying much of the
context documentation might otherwise provide.

| Candidate and condition | Worker elapsed | Nominal checks | Uncached input | Output |
| --- | ---: | --- | ---: | ---: |
| Earlier Sonnet source-only control | 50.5 s | 12/12 | 37,446 | 7,216 |
| Haiku source only | 87.8 s | 12/12 | 65,123 | 19,613 |
| Haiku with index available | 129.0 s | 12/12 | 78,084 | 24,926 |
| North Mini source only | 20.8 s to failure | Not completed | 274,016 | 2,218 |
| North Mini documented condition | 19.9 s to failure | Not completed | 217,639 | 2,683 |

Haiku read the compact index but did not open canonical prose. The full plan
already described locations, operations and obligations. Thus this pair is not
a clean test of semantic prose helping a context-starved worker.

Both free attempts ended with `Provider finish_reason: error`. Each wrote only
an operations manifest; neither implemented the code. This is not evidence that
the underlying model cannot solve the task. The source-only manifest also had
invalid copy destinations, but the provider failure prevents a completed-work
comparison. Neither attempt should be counted as a fast successful job.

The controller initially skipped the documented free condition after the first
error. The lead classified it, rechecked the free allowance and ran that already
planned independent condition once. The source-only case was not retried, and
the route/model stayed unchanged.

## Concise-brief follow-up

Before new calls, a separate three-attempt design was frozen. All workers got the
same approximately 90-word architecture instead of the detailed plan. Documented
Haiku also received two exact original canonical sections, approximately 340
words, labelled as inferred pre-migration reference data. This ensured prose was
actually supplied. It was not a live Paddock context-endpoint measurement.

| Candidate and condition | Worker elapsed | Worker + nominal checks | Checks | Uncached input | Output |
| --- | ---: | ---: | --- | ---: | ---: |
| Sonnet source only | 45.5 s | 117.7 s | 12/12 | 40,363 | 6,974 |
| Haiku source only | 154.6 s | 228.4 s | 12/12 | 74,121 | 32,832 |
| Haiku with supplied notes | 107.7 s | 139.5 s | 12/12 | 67,001 | 23,822 |

The documented Haiku attempt used less recorded input/output and less raw time
than its source-only counterpart. That is a useful pilot signal, not a replicated
speed or savings result. Both Haiku follow-up attempts hit the output cap once;
continuation work is included. Sonnet had no continuation. There was one run per
condition, with provider/cache variation and no timing-equivalence threshold.

The combined column includes worker execution and the original host checks,
excluding the additional quality probe, review, brief construction and upkeep.
It is not the time to an accepted production change. Host verification was: roughly 68 seconds per
detailed-plan Haiku case, and 74/72/32 seconds for concise Haiku source, Sonnet
source and Haiku documented respectively. File-copy implementations and local
I/O affect those times. Planning/brief creation, review and study setup are also
separate. Reusing the planner artifact here does not prove that planning is free
on future tasks.

## Independent quality review

Source review identified different handling of directory links. A harmless
synthetic canary directory outside each case's public source tree was linked
into that tree. This additional probe is separate from the 12 original checks;
it did not read or expose real private files.

| Implementation | Result with directory link |
| --- | --- |
| Detailed-plan Haiku source only | Built and copied the external canary into output |
| Detailed-plan Haiku index condition | Skipped the link |
| Earlier Sonnet control | Skipped the link |
| Concise Haiku source only | Deliberately rejected the unsupported link |
| Concise Haiku with notes | Built and copied the external canary into output |
| Matched concise Sonnet control | Skipped the link |

The quicker documented Haiku follow-up therefore does not meet the requested
equal-quality gate. Its unfiltered recursive copy also copies held assets before
removing them, whereas other implementations filter them during copying. The
normal fixture has no links, explaining why the original checks passed.

The rendering suffix remained byte-identical in all three concise-brief
implementations. Endpoint logic, styles, original tests and opaque data stayed
protected. These are positive bounded checks, not a production-readiness claim.
No coordinator edit or additional model repair hid the quality findings.

## Usage and heavy use

Cached input is recorded separately in `verification.json`. For example, concise
Haiku source-only input was 1,134,408 tokens including 1,060,287 cached tokens;
the documented case was 503,231 including 436,230 cached tokens. Comparing only
the large totals would misrepresent their uncached work. Different model tiers,
tokenizers and subscription weights also prevent converting these figures into
credit savings without further evidence.

There were seven native attempts in this turn: four initial implementation
conditions and three prospectively declared follow-up conditions. Failed free
requests and output-limit continuations remain in the ledger. No metered
fallback, automatic harness retry or stronger-model repair was used.

This study did not rerun map upkeep. The prior upkeep attempt remains unaccepted
after broken-reference and semantic review, so its remaining repair cost is
unknown. Initial authoring, coordinating-agent usage and historic preparation
costs are incomplete. A heavy-use saving has not been demonstrated.

The next useful implementation test would give a smaller worker bounded source
excerpts, precise edit operations and deterministic file/link guards. That can
test whether stable knowledge replaces repeated planning while preserving
quality. Repeated independent tasks would then be needed to measure success
rate, end-to-end latency, review/repair work and upkeep amortization.

Raw plans, input hashes, native metrics, free-route audits, nominal checks and
quality probes remain under `.build/small-worker-native-2026-11-06/`.

## Bounded generator follow-up

A new prospective pair gave Haiku and Sonnet identical initial files, a fixed
module interface and the same exact bootstrap excerpt. The host handled opaque
file operations, Python and Worker path changes, ignore rules and generator
wiring. A common deterministic helper rejected linked inputs and outputs before
cleanup, excluded held assets before copying and preserved old output on
preflight failure. Four isolated helper checks passed. This helper is an
experimental fixture utility, not an installed product feature or an OS sandbox.

Each model could change only `scripts/build-inputs.mjs`. No repairs, automatic
retries or fallback calls occurred. Both used the signed-in included Claude
subscription. Local inference was offline. The free route was not retried.

| One attempt per model | Code edit | Edit and host checks | Code-call API equivalent |
| --- | ---: | ---: | ---: |
| Haiku 5.5 | 14.23 s | 80.14 s | $0.00397 |
| Sonnet 5.5 | 10.55 s | 77.14 s | $0.03707 |

Both passed all 12 migration checks and the additional linked-directory probe.
The renderer suffix remained byte-identical. Host scope checks confirmed that
each model changed only its assigned module. A single Sonnet review received
both implementations without model labels and accepted both, with no blocking
findings. It took 18.57 seconds and cost $0.06154 API-equivalent. Its coverage
was the two modules, the common helper and supplied evidence; the lead checked
the deterministic wiring separately. Full production quality is not established:
assets are synthetic, endpoint tests are mocked and Python uses an empty
manifest with stub PIL. Visual, deployment and filesystem-race behavior were
not verified.

The sequential implementation/check/review batch took 175.86 seconds. Scripted
fixture preparation took another 7.50 seconds. These figures exclude the lead's
earlier fixture/helper drafting, source inspection and manual integration work;
they are not complete time-to-accepted-job measurements. File-heavy host
verification dominated each implementation/check interval. One pair does not
establish a repeatable speed difference or a general model-quality result.

The three native calls totalled **$0.10258 API-equivalent**. These are estimates
using the observed global standard rates, including separate one-hour cache
writes, cache reads and output/thinking tokens. They match native reported
estimates. Each observed request was below Haiku's 100K pricing threshold.
The rates were checked against [Anthropic's pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing)
on 6 November 2026. Calls ran within the subscription; the estimates are not
additional billed charges or a conversion into subscription credits.

Haiku used 49,532 input tokens including 39,835 cache reads, plus 3,268 output
tokens. Sonnet used 22,784 input including 17,224 cache reads, plus 1,312 output.
Haiku's lower dollar estimate therefore does not mean fewer raw tokens.
Coordinating-chat usage, browsing and prior planning are unavailable in this
ledger. Shared review cost also exceeds either code call, so edit-only savings
cannot be presented as whole-workflow savings. No map upkeep occurred.

The result supports a further test of bounded smaller-worker edits with
deterministic support. It does not isolate documentation: both candidates
received the same focused source context and helper. Raw frozen inputs,
outputs, checks, review, timings and accounting are in
`.build/worker-split-next/`.

## Documentation and onboarding

The owner clarified that onboarding and long-term application structure are
valuable independently of implementation savings. A separate evaluation should
ask fresh agents or people to locate a responsibility, explain entrypoints and
dependencies, identify constraints and find relevant tests, with and without the
optional map. Measure time to an accurate answer, missed obligations, retrieval
volume and upkeep cost as the code changes. Verify answers against source.
The implementation trials above do not measure that benefit. Proposed criteria
are recorded in `.build/worker-split-next/onboarding-criteria.json`.
