# Source-first native pilot

Verdict: inconclusive for savings or semantic documentation benefit. The coding
task produced the same correct patch in all three conditions. The planning task
exposed an output-budget problem and produced plans needing review.

## Conditions

Six included-subscription Claude attempts ran outside Paddock. The effective
model was `claude-sonnet-5-5`, low effort, throughout. Each task had identical source, tests,
README, package bytes and task prompt across its three copies. Initialization
reported no automatically discovered skills or MCP servers. The runner requested
safe/restricted mode, exposed only Read/Grep/Glob/Write/Edit, removed Paddock
environment variables and used no Paddock task wrapper or nested agents. No
shell/LSP capability was supplied. Local Strata
was offline. No metered fallback or additional attempt followed the batch.

- S: source only, with optional documentation explicitly unavailable.
- O: the unchanged original `docs/application-map.md`, available on demand.
- C: the same canonical map plus frozen bounded source packets and a compact
  index produced by the new context engine.

C's notes retained their original unverified status. The projection supplied
line handles into the canonical Markdown rather than rewriting its prose or
assigning it fabricated historical hashes. Packets were precomputed because
command execution was disabled equally in all conditions. This measured packet
delivery through native Read, not the live Paddock endpoint or live on-demand
capture. No production Nemosite file was edited.

## Coding result

The frozen task added `Retry-After: 30` to temporary 503 responses while
preserving existing headers, 429 behavior and owner delivery when a receipt
fails. Every attempt made the same two-line patch. Each passed the same 18
mocked tests and five held-out endpoint checks. Tests and docs were unchanged.

All three used Read on `worker/contact.mjs` followed by two edits. None read
optional documentation or packets. The former large documentation penalty did
not recur in this retrieval-only task, but this does not establish a benefit
from documentation: the agents did not use it.

## Recorded usage

One attempt per cell. Input includes cached input; uncached input is their
arithmetic difference. Output and cache have separate costs and are not
interchangeable. Raw elapsed time includes provider, cache and native tool
variation and is not a speed ranking.

| Task | Condition | Input including cache | Cached input | Uncached input | Output | Seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Coding | S | 22,244 | 17,044 | 5,200 | 942 | 16.8 |
| Coding | O | 22,296 | 17,084 | 5,212 | 945 | 16.0 |
| Coding | C | 22,762 | 17,356 | 5,406 | 961 | 13.9 |
| Planning | S | 168,122 | 136,551 | 31,571 | 6,568 | 59.6 |
| Planning | O | 82,937 | 59,004 | 23,933 | 4,110 | 45.6 |
| Planning | C | 95,371 | 69,499 | 25,872 | 4,485 | 44.9 |

Total: 413,732 input including 316,538 cached input, and 18,011 output tokens.
Native execution took 196.6 seconds across the six serial attempts. Successful
deterministic preparation took about 0.93 seconds and made no model calls.
One earlier preparation failed because source selection included excluded test
paths; filtering was corrected before inference, preserving common test inputs.

These are worker observations, not total system cost. Initial documentation,
earlier planning, implementation, failed preparation work and this coordinator's
usage remain separate. Native USD estimates are API equivalents, not subscription
charges. No monetary saving is calculated.

## Planning and retrieval

The planning task asked how to make build output disposable and support a clean
checkout. The oracle was frozen before inference. All plans recognized that
`dist/content.js` and `dist/image-sizes.js` must be preserved before clearing
output, that CSS/client scripts are inputs, and that `worker/projects.mjs` is
generated. O and C explicitly described the held-image conflict guard; S
mentioned byte comparison without explaining the conflicting-bytes abort.

All plans need corrections. They made unsupported assumptions about Git tracking
or whether regeneration necessarily dirties a checkout. O and S suggested an
import owner in `worker/contact.mjs` without tracing it; the actual projects
import is in `worker/index.mjs`. S's proposed smallest cut also needs asset-source
separation before replacing the existing held-asset exclusion. No plan was
approved or applied. Labels were withheld during checklist grading, although
answer text could reveal the condition; this was not a fully blind audit.

C read the compact index. Neither O nor C read canonical prose, and no source
packet body was read. Thus this batch provides no direct evidence that semantic
prose improved implementation. There were zero native tool errors and zero
unauthorized edits across all six attempts.

## Output limit and next measurement

All planning attempts hit the shared 2,500-token output cap. Native continuation
messages confirm one continuation each for O and C and two for S. S repeated
part of its answer. Reported usage includes that work. Lower raw usage in O/C
cannot be attributed to documentation from this run.

None of the planners' terminal `result` strings alone was valid JSON. Full
streamed answers could be assembled and parsed after removing fences/preambles,
but this is a transport repair, not successful strict JSON delivery.

The runner now accepts a validated `maxOutputTokens` option, exposed as
`--max-output-tokens=`, and reports output-limit continuation counts. Its default
remains 2,500. Mocked tests verify explicit limits, hidden launches and rejection
before model launch for invalid limits. No new live attempts tested this change. The production build and full suite
pass after the harness correction: 1,308 passes, two skips. Tests use mocked
launches and no live model requests.

Before another batch, freeze a common bounded answer length and sufficient
planning output allowance, then confirm no output-limit continuation contaminates
the comparison. Keep docs optional. Several repetitions and a task that actually
retrieves obligations are needed before an adoption or savings decision.

Raw plans, hashes, native traces, test logs, grading and usage are retained under
`.build/source-first-native-2026-11-06/`. `verification.json` records checks and
limitations; `runner-used.cjs` preserves the runner used for these six attempts.
