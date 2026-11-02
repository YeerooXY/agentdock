# Modular provider accounts

Additional account support is declared in `electron/provider-account-capabilities.cjs`. Account storage, desktop selectors, session launches, usage readers and bounded task candidates consume that registry. Adding a verified isolation adapter no longer requires extending a Claude/Codex list in those consumers.

| Provider | Additional accounts | Native storage override | Usage reader | Existing conversation switch |
| --- | --- | --- | --- | --- |
| Codex | Yes | `CODEX_HOME` | Yes | Yes, existing restrictions apply |
| Claude Code | Yes | `CLAUDE_CONFIG_DIR` | Yes | Yes, existing restrictions apply |
| Gemini CLI | Yes | `GEMINI_CLI_HOME` plus file-storage overrides | Unavailable | Unavailable |
| Pi | Yes | `PI_CODING_AGENT_DIR` | Provider-dependent | Unavailable |
| Other catalog providers | Default account only | Isolation remains unverified | Provider-dependent | Unavailable |

Separate accounts use native provider sign-in. Gemini uses `/auth`; Pi uses `/login`. Creating an account does not copy default credentials. Native provider credential files remain provider-managed. Named profiles clear inherited authentication variables, including names ending in `_API_KEY`, `_AUTH_TOKEN`, `_ACCESS_TOKEN` and `_OAUTH_TOKEN`. Tools that require such inherited variables need explicit credential bindings.

Gemini's installed CLI treats `GEMINI_CLI_HOME` as a home root and appends `.gemini`. Its default OAuth keychain entry is shared, so named profiles force both `GEMINI_FORCE_FILE_STORAGE=true` and `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true`. These overrides are mandatory for this adapter. Pi uses its configured directory directly; inherited `PI_CODING_AGENT_SESSION_DIR` is removed. MCP settings for both providers are written into the selected profile.

These behaviors were checked against the installed Gemini bundle and Pi 1.4.0 source, without reading real credentials. Provider upgrades still require adapter checks. The registry keeps the affected behavior in one place; it does not guarantee compatibility with every future CLI.

Saved profiles remain in storage when their adapter disappears or loses support. Sign-in and launch controls refuse unavailable profiles. Their names can still be changed and their records removed.

Sign-in completion for Gemini requires a nonempty native credential file. Pi also requires a populated credential field in its native JSON account map; `{}` is insufficient. These checks establish local evidence, not server-side credential validity. Codex and Claude retain their existing command-exit checks. Usage readings retain their own freshness and sign-in status.

## Verification

- Windows unit suite: 855 passed, one platform-specific skip, zero failures (856 total).
- Focused account/isolation/switch tests: 33 passed after the Pi MCP, credential evidence and focus changes. The final registry/migration cleanup also passed nine core tests.
- Production Vite build passed.
- Linux unit checks passed: 850 passed, six platform-specific skips, zero failures. All five desktop smoke scripts passed headlessly in Docker. The final tiny registry/migration cleanup was checked separately with the nine core tests above.
- Chromium on Windows and Chromium Android profiles, plus WebKit Mac and iPhone profiles: provider selection, unsupported-provider disabling, Gemini account creation with mocked sign-in failure, retry without duplicate records, state refresh preservation, Tab, Shift+Tab, Enter and Space passed.
- Screenshots inspected for all four profiles, including the expanded support section and account row. No horizontal overflow. Screenshots and machine-readable checks are in `verification/modular-accounts/`.
- Mac, Android and iPhone coverage is emulated. Real-device rendering, native account sign-in and live Gemini/Pi subscription use remain unverified. No paid provider requests were made by tests.

## Model contributions and review disposition

Local Strata supplied the registry draft and capability/migration suggestions. The coordinator integrated that output, corrected catalog handling and prototype lookup, and implemented the dependent consumers. Gemini's bounded attempt exited with code 1 before producing an artifact; its error suggested sign-in but did not establish a quota problem. No retry or paid fallback occurred. Kiro remained reserved and reached its task time limit without launching a provider process or modifying files.

Pi completed one independent source review using the discovered free OpenRouter route `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`. Its raw review is `modular-account-review.md`. The coordinator checked its observations against source. Broad credential scrubbing is documented above; Gemini's home-root behavior is commented in code; Pi's empty-auth evidence is covered by a regression test.

Corrections to the raw review: Pi does use the managed MCP file; usage accounts retain saved profiles regardless of recorded limits; the original integration tests already covered Gemini credential evidence. The review's assertion that a byte-size check rejects Pi `{}` was incorrect and prompted the additional credential-field check. Review findings are source observations, not live authentication results.

Pi reported 326,811 input tokens, 5,560 output tokens and 249,888 cached input tokens, with reported cost zero. Those figures cover that worker only. Gemini's failed attempt, Kiro scheduling, local assistance and coordinator usage are not included in those totals. No cloud-savings claim is made.

Paddock's completion tracker refused to close the turn because the expired Kiro task `3b060502-0a79-44db-85ec-0502e7f4de31` remains `needs-you`. Its final status confirms a reservation timeout with no implementation artifact. The shared task API exposes no dismissal action. User attention in Tasks remains necessary for tracking cleanup; implementation and verification are complete.
