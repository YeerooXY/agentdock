# Knowledge pilot cost measurement

The first pilot combined implementation of the inventory system, repairs,
manual responsibility maps, review and verification. It is not a docs-only or
per-repository benchmark. Recorded native usage was recovered on 5 November 2026;
this supersedes the earlier unknown coordinator usage for that pilot only.

The machine-readable baseline is [cost-baseline.json](cost-baseline.json).
It covers the native Codex turn from 11:52:26 to 12:28:19 UTC, about 36 minutes.
The coordinator's cumulative counters were monotonic across that exact turn.

| Agent | Role | Observed duration |
| --- | --- | --- |
| Codex gpt-6.1-sol | Coordination, implementation/repairs, source inspection, maps and verification | Overall turn about 36 minutes, including waits |
| Pi north-mini-code free route | Failed bounded inventory implementation attempt | 121 seconds |
| Claude CLI default, exact model unreported | One focused independent review | 188 seconds |

Three agents were involved, including the coordinator. Worker/reviewer durations
overlap the overall wall time and must not be added to it. Failed work remains
in the accounting. Local Strata was offline; the Antigravity routes were not
eligible on the discovery readings for this run.

Combined recorded usage was 11,019,551 input tokens, including 10,867,509 cached
input tokens, plus 97,786 output tokens. Uncached input was 152,042 tokens.
Codex reasoning output is already included in its output figure. Provider
tokenizers and usage semantics differ; these totals are workload observations,
not an invoice, normalized model comparison or subscription-quota percentage.

Pi reported zero cost. The other routes used included subscriptions. No metered
fallback was launched. An incremental dollar cost cannot be established from
these counts or attributed portions of flat subscriptions. Do not substitute
public API rates for the owner's subscription bill.

## Next clean measurement

For the next repository sample, separate reusable engineering from documentation:

1. Inventory and deterministic extraction.
2. Initial responsibility draft.
3. Evidence/quality review and any repairs.
4. One controlled update and its documentation delta.

For every phase capture start/end, route and actual model if reported, attempts,
input, cached input, output, accepted section IDs and coverage gaps. Keep failed
attempts and coordinator work. Use a bounded fresh context so the entire long
conversation is not repeated for every task. Record missing measurements as
unknown. Report monetary estimates only with explicitly configured rates,
separately from actual billing and subscription allowance readings.

Compare accepted sections and successful change-location/update questions,
not tokens alone. The initial two maps have authored lookup examples; a blind
retrieval test and per-document cost are still unmeasured.

## Robonslaught sample

The capped first pass observed 9,733 files and 247 C# source-extension matches.
All 247 observed matches were under `Assets/Editor`; runtime gameplay was not
mapped by that pass. Asset-heavy directory traversal exhausted the budget.

Use a scoped Unity pilot: inspect `Assets/Scripts` and relevant editor helpers,
then link selected `Assets/Scenes` and `Assets/Prefabs` references. Art/audio and
large binary content initially contribute metadata. Infer real responsibilities
from code and references before naming gameplay sections. Do not extrapolate
from those 247 editor files to the full game.

Time-box the first single-subsystem documentation sample to 15 minutes as an
experimental budget. This is not an estimate or promise for documenting the
whole game. Measure accepted output and all phase usage before projecting a
larger pass. Target source remains read-only under the Paddock pilot.
