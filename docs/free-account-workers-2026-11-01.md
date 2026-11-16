# Local and free-account teamwork

Antigravity, GitHub Copilot and Grok Build now have native implementation and review adapters alongside Claude Code, Codex, Kiro and OpenCode/Strata. Any console connected to Paddock can discover these workers and call the same task tools. Provider login stays with its CLI. Restart Paddock to load the new adapters; existing consoles were preserved.

## Selection and handoff

- Discover candidates once, including local readiness, account funding, allowance freshness and limiting quota windows. Preserve custom routing pools.
- Send suitable small/medium implementation to ready local inference first. Split plans distribute independent portions between local and eligible free accounts. Dependent tasks can return to local; an ancestor's assignment does not count as concurrent work.
- Prefer known free allocations before included subscriptions when cloud work is needed. Metered accounts require an explicit task assignment. Unknown funding remains unknown. Installation and model availability do not establish a free entitlement.
- Use the native account default unless a model is explicitly selected. Antigravity extra G1 credit spending is disabled for workers.
- Give workers acceptance criteria, file ownership, necessary references and checks. Carry current shared/project guidance into each worker; keep website composition and asset exclusions when applicable.
- One coordinator integrates work and requests one useful review. Direct tasks on local and the three new native worker accounts default to one round. Shared guidance requests `maxRounds: 1` for other task accounts unless the owner requests a fix loop. Existing Claude/Codex/Kiro/OpenCode cloud defaults remain unchanged.
- File implementation and read-only review have separate tool permissions. Native worker shell execution and MCP calls are blocked; Paddock runs the configured deterministic checks. Worker instructions forbid nested delegation.
- Task status and reports separate local/cloud attempts and free/included/metered/unknown funding. Missing counters and coordinator coverage remain explicit. Failed attempts count.

Settings → Agents → Routing exposes account discovery, free-cloud preference and funding overrides. Entries use an account ID and `free`, `included`, `metered` or `unknown`. An explicit `unknown` override takes precedence over inferred plan labels. Without an override, the latest reported plan is used where available.

## Live checks

Each native worker read a small task file and wrote the expected JSON using file tools. These manual opt-in probes are separate from automated tests.

| Worker | Result | Elapsed | Input | Output | Cached input, included in input |
| --- | --- | ---: | ---: | ---: | ---: |
| Antigravity | Correct file | 16.96 s | 25,772 | 861 | 0 |
| Grok | Correct file | 7.90 s | 61,798 | 463 | 47,488 |
| Copilot, first attempt | Could not write: required `apply_patch` was absent from the tool list | 11.45 s | Unknown | Unknown | Unknown |
| Copilot, after tool-list fix | Correct file | 10.49 s | 15,036 | 231 | 9,866 |
| Kiro free account | Bounded routing/parser review; no confirmed defect | 60.45 s | Unknown | Unknown | Unknown |

Grok reported a nominal cost of $0.055142 for its probe. This does not establish what the account was charged or whether its allocation is free. The first Copilot run reported one premium request; its original detailed stream was overwritten by the corrected probe, so missing counters cannot be reconstructed from that artifact. The manual probe script now preserves each run in a timestamped directory.

Kiro's review is task `f07b4f15-237c-4da0-a185-d1ac65890501`, Result `f916262b-9486-44ad-9160-a1cf70b44beb`. It reviewed the native parsers and funding selection before the subsequent independent-task balancing change; that change has deterministic dependency and routing coverage.

Strata supplied three bounded contributions: Antigravity event parsing, parser test cases, and independent-assignment counting. The local calls used 919 input and 2,023 output tokens across 12.69 seconds. The second draft reached its output limit. Integration corrected terminal/error handling, overflow checks, unsafe dictionary keys and a graph traversal that incorrectly grouped sibling tasks together. Useful portions were retained; no local request was retried automatically.

The coding CLIs used substantial context even for these tiny probes. Prefer coherent deliverables over many trivial cloud requests. These are adapter checks, not an equivalent-output cost or speed benchmark. Coordinator usage is incomplete, so this work establishes no net savings claim.

## Cline status

Paddock detects Cline as installed. The managed CLI responds as version 3.0.73, and its `paddock` MCP entry is enabled. No credential values were read or copied. This inspection does not establish authenticated model access, a successful Paddock tool call, free allowance or delegated-worker readiness. Cline is not registered as a task worker by this change.

## Verification

Native adapter coverage includes context delivery, implementation, read-only review, final/error parsing, cache normalization, failure retention, cancellation and private-prompt cleanup. Routing coverage includes local/free/included priority, explicit metered assignments, funding overrides, single-provider installations, custom pools and independent/dependent work distribution.

Visual evidence: `artifacts/provider-routing/`. Settings were exercised using Windows Chromium, Desktop Safari/WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles. Saving, reviewer choices, labels, contrast and overflow checks passed. Browser/device profiles were emulated on Windows; real macOS/iOS fonts and physical-device behavior remain unchecked.

Build passed. Windows unit/integration tests: 782 passed, 1 skipped, 0 failed. Linux unit/integration tests: 777 passed, 6 skipped, 0 failed; the complete headless desktop suite passed. Results are recorded under `artifacts/provider-workers/`. Automated tests use mocks and temporary directories; no paid model requests run in them. A matching accepted Playtime concept pilot, including coordinator input/output, cached input, failures and elapsed time, remains necessary to compare total savings.
