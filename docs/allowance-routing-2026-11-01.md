# Native allowance and modular account routing

OpenCode Go allowance now follows the account and workspace selected in native OpenCode. The reader uses its existing login in memory, calls the fixed official quota endpoint with the workspace header, and returns only normalized limits. Credentials are not copied into Paddock storage, renderer data, arguments, logs or workers. An existing manual Go key is a fallback only when no native login is selected. Expired or unsupported native connections report their state rather than silently substituting another account.

Live read-only verification on 1 November 2026 returned 100% remaining in the five-hour window, 54% weekly and 77% monthly. These are independent account-wide windows; they must not be added together. Raw sanitized readings are in `artifacts/allowance-routing-20261101/allowance-verified.json`. The implementation follows OpenCode's [native quota reader](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/usage-limits.ts) and native account database. The installed OpenCode server's API schema did not expose a quota endpoint, so no new local server is needed for regular quota refresh.

Default task suggestions discover compatible installed accounts rather than requiring fixed Codex/OpenCode accounts. Tests cover Claude alone and Kiro plus OpenCode. Explicit custom pools, local-only routing, excluded models and existing role restrictions are preserved. Discovery is opt-in for custom pools. One available account produces one implementer and an explicit unavailable independent reviewer. The separate configured worker ladder is retained; this change does not invent new model-family mappings or rewrite its entries.

Candidate data now includes allowance status, observed time, plan when known, individual windows, remaining headroom, and sign-in state when known. Unknown and stale remain distinct from zero usage. Routing uses the most restrictive current window, rejects exhausted/reserved headroom, and balances eligible accounts within ten percentage points. Equal-time duplicate readings retain the more restrictive value. A failed refresh cannot make a cached low percentage look current. Fresh readings are reused; discovery does not trigger an inference call for every task.

Native launchers can use their account default model. OpenCode remains pinned to explicit Go/free routes, with no paid Zen fallback. A listed model still does not establish entitlement. Go can permit extra usage in provider settings, so a route name alone is not proof of no additional charge. Unknown entitlement requires a bounded capability check or owner setup before larger work. Included subscription use and local inference remain separate cost categories.

The running Paddock process was preserved. Restart Paddock when convenient to load these source changes; this report does not claim the existing process has been hot-patched.

## Checks

- Build passed.
- Initial focused suite: 127/127 passed.
- Full Windows Node suite: 726 passed, one skipped, no failures.
- Full Linux unit/build/headless desktop suite passed, including a repeat after the native-account precedence and candidate sign-in changes.
- Final allowance/routing regression suite: 22/22 passed, including the conservative equal-time quota merge added after the broad suites.
- Luna performed a bounded source review. Its finding about a legacy vault key overriding the selected native account was fixed and covered by a regression test.
- Live allowance verification made no model inference request. Automated tests used mocks and temporary storage; CLI compatibility probes were separately authorized live diagnostics.

This implements capability and allowance routing. It does not establish that the whole workflow is cheaper or faster. A subsequent benchmark must include coordination, setup, retries, cached input, rejected output, elapsed critical path and actual adopted work.

Creative restrictions now persist in the parent/project instructions and creative/worker briefs. The [Playtime artwork kit](../artifacts/playtime-assets-20261101/README.md) provides separate transparent assets and live text assembly. The [CLI audit](../artifacts/cli-console-audit-20261101/report.md) records native launch, message and Paddock-tool evidence separately.
