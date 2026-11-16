# Queued inventory workflow comparison

The owner selected an inventory app and requested two fresh orchestrators with
the same four requests queued in order, without lead implementation advice or
patches after launch. The sequence builds a simple file-backed app, adds
locations/transfers, adds reservations/retry protection, then replaces direct
stock editing with an append-only movement ledger while preserving existing data.

Both routes used native subscription Codex `gpt-6.1-sol` at medium effort. They
started fresh sessions and resumed only their own thread for later requests.
The plain route disabled 62 discovered native skills, user configuration,
execpolicy files, inherited AGENTS documents and memory. Its child environment
contained no Paddock bridge. The Paddock route used a fresh scoped project through
the real Workbench, SharedHub, Turns, Projects, TaskLoop, SkillPacks and Knowledge
services. Standard Paddock instructions came from SharedHub, rather than a
manually coached implementation prompt. GUI-only services and keyed third-party
tools were unavailable in the isolated headless profile. This was a full relevant
workflow comparison, not a claim to exercise every optional external integration.

Prompts, isolation proof, native logs and run records are in
`.build/stockroom-control/`. Candidate folders are `.build/stockroom/cedar` and
`willow`. The candidate prompts contain no experiment labels or grading rubric.

## First pair is invalid for code-quality comparison

The selected unattended workspace-write policy denied shell execution on this
host. Both agents completed their conversational turns without producing an app.
No lead patches or corrective prompts were sent. No worker task launched in the
Paddock route. Code quality is ungraded, not a zero score or evidence for either
workflow. The owner was asked before another pair with equal full access.

Native CLI usage is cumulative across resumed turns. This was verified against
the exact two session logs. Summing the four stage counters would overcount usage.
The corrected counters are in `failed-usage-audit.json` and
`failed-run-summary.json`.

| Failed route | Input, including cache | Cached input | Output | Active elapsed | Standard API-equivalent |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plain | 236,839 | 222,080 | 749 | 55.6 s | $0.0592 |
| Paddock | 475,508 | 429,184 | 2,106 | 92.4 s | $0.1566 |

These are subscription calls, not metered API invoices or subscription-credit
conversions. Estimates use published [Sol rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
$2/M uncached input, $0.10/M cached input and $10/M output. Recorded cache writes
were zero. Peak request input was below 272k, so the API long-context surcharge
does not apply to this estimate. Shared lead/setup, preparation workers and
subsequent assessment are separate overhead, not silently assigned to one arm.
No savings or quality conclusion follows from blocked runs.
