# Native coordinator access — 1 November 2026

Nine native coordinators successfully called the real Paddock `dock_context` and `dock/task_candidates` tools. Each saw the local-first instruction, ready Strata, the exhausted default Codex account, and the other accounts returned by the running application. The named Codex account used GPT-6-Luna.

| Coordinator | Current result | Successful run / last blocked run |
| --- | --- | ---: |
| Codex sub1 | Context and candidates verified after explicit Paddock MCP approval setting | 7.567 s |
| Claude Code | Context and candidates verified | 10.667 s |
| Antigravity | Context and candidates verified | 36.311 s |
| GitHub Copilot | Context and candidates verified; native model GPT-6-Luna | 13.499 s |
| OpenCode Go | Context and candidates verified; explicit included Haiku route | 10.644 s |
| Cursor | Context and candidates verified in native ask mode | 18.116 s |
| Grok Build | Context and candidates verified | 19.315 s |
| Kiro | Context and candidates verified after correcting exact permission IDs | 13.242 s |
| Cline | Context and candidates verified after keeping the backend local | 15.983 s |
| Pi | Earlier explicit local-assist handoff succeeded; this generic coordinator probe failed its tool-use task and reached the timeout | 60.178 s |
| Qwen Code | No provider/auth selection in settings; native headless result exited 1 with zero reported input/output | 3.275 s |
| Kimi Code | Provider returned 403: current subscription has no Kimi Code access | 2.624 s |
| Factory Droid | Provider returned 402: no active subscription | 7.028 s |
| Gemini CLI | Provider returned `UNSUPPORTED_CLIENT` for the individual free tier and directed the account to Antigravity | 2.877 s |

These are owned native processes using the same shared bridge as the active console. A bounded loopback proxy forwarded real requests and recorded successful responses; it rejected delegation and other actions. No session belonging to the user was stopped. The old running application still returned its older candidate inventory. These origin checks establish access to the common registry, not live execution of every caller–target pair or loading of new source adapters into the existing app.

The current context response contained local-first guidance. It did not itself contain the three-stroke creative exclusion; website guides and project instructions remain separate sources. This audit does not claim that merely connecting MCP made every agent obey every design rule.

## Repairs

- Cline's shared backend retained the earlier process environment. The native MCP SDK inherits `process.env`; adding interpolation was not the fix. `prepareCli` now sets `CLINE_SESSION_BACKEND_MODE=local`. The final successful headless check used the existing native MCP inventory, preserving unrelated servers. Paddock's normal managed server merge remains in place. No bridge credentials are written to files. **Interactive Cline remains a limitation:** current source explicitly chooses backend mode `auto`, overriding this environment preference, except in its yolo/sandbox modes. This change does not claim an interactive-console fix, and it does not silently enable yolo. [Cline client source](https://github.com/cline/cline/blob/main/sdk/packages/core/src/extensions/mcp/client.ts), [CLI configuration](https://github.com/cline/cline/blob/main/docs/cli/cli-reference.mdx), [interactive backend selection](https://github.com/cline/cline/blob/main/apps/cli/src/runtime/interactive/session-runtime.ts).
- Kiro V3 exposed the MCP display name `@paddock/dock_context` but its headless permission matcher required the action ID `mcp_paddock_dock_context`. All three exact bridge action IDs now enter the launch trust list. Existing file permissions are retained; no shell permission or trust-all flag is added. The two display-selector attempts were blocked and counted. The final action-ID attempt succeeded.
- Codex sub1 succeeded with `mcp_servers.paddock.default_tools_approval_mode="approve"` for the restricted diagnostic bridge while keeping a read-only filesystem sandbox. Native command approval and MCP approval are separate settings. Product session integration belongs to the parent change. [Official MCP settings](https://learn.chatgpt.com/docs/extend/mcp).
- Windows wrapper argument handling was corrected in the diagnostic harness for Cline, Qwen and Gemini by using their installed native/Node entrypoints. Initial parse failures never reached model generation. Kimi rejects `--prompt` with both `--yolo` and `--plan`; its corrected prompt invocation exposed the actual entitlement error.

`node --test tests/cli-setup.test.cjs`: 20 passed. These tests include independent Cline process environments, preservation of other MCP servers, token-free saved configuration, exact Kiro grants and preservation of chosen file permissions. Full application validation is handled by the parent task.

## Usage and failed work

These numbers describe connector diagnostics, separate from website construction. Native counters differ in cache semantics; the raw receipts are retained rather than forcing an inaccurate cross-provider total.

| Account | Recorded diagnostic usage |
| --- | --- |
| Codex sub1 | Failed approval run: 47,526 input / 180 output, including 36,992 cached input. Successful run: 89,861 input / 347 output, including 78,720 cached input. |
| Claude | Successful run: 8 uncached input + 9,089 cache creation + 40,195 cache read; 660 output. One earlier probe ended with harness failure and has uncollected usage. |
| Antigravity | 69,101 input / 2,369 output; zero cache read. Reported thinking 1,852 is part of provider output accounting. |
| Copilot | Four deduplicated provider calls: 64,934 input / 404 output, 45,902 cache read and 19,020 cache write. Native result reported one premium request. |
| OpenCode Go | Three messages: 8 uncached input, 14,887 cache write, 16,734 cache read, 523 output plus 660 reasoning; 32,812 total. Provider cost metadata $0.002620515 describes the included route and is not an additional invoice. |
| Cursor | Native result: 35,155 input / 770 output, with 66,688 cache read reported separately. |
| Grok | 21,172 uncached input + 73,344 cache read; 1,584 output. |
| Cline Free | Unreachable-bridge run: 23,463 input / 309 output / 8,672 cache read. First fixed run: 46,533 / 518 / 13,008. Final preserved-inventory run: 46,072 / 539 / 13,008. Each reported cost zero. Both successful runs initially submitted an invalid context argument combination and corrected it; rule following was imperfect. |
| Kiro | Two blocked permission attempts and one successful attempt. Per-request token counters were not captured. Account-wide remaining credits changed during concurrent work; that change is not attributed exclusively to these probes. |
| Pi Free | Failed generic run: 24 completed model responses, 34,386 input / 10,890 output, no cache, no successful Paddock call; stopped at 60.178 seconds. Another earlier harness-failed attempt has unknown usage. Subsequent account reading was exhausted (50/50); no further request or model fallback was made. |

The Pi model repeatedly produced invalid tool scripts and continued despite the prompt's stop instruction. This is evidence against using that model as a general coordinator. Its earlier tightly specified extraction handoff remains valid evidence of a narrower capability. Hard response/tool budgets and direct bounded implementation are necessary; a prompt instruction alone did not cap the work.

Local assistance supplied the evidence checklist: 252 input / 136 output, 1.328 seconds. The checklist was checked and used. Coordinator cloud usage is not available here. Setup effort, failed attempts and incomplete counters prevent a net-savings claim.

Evidence: `artifacts/agent-matrix/origins/attempts.json`, `latest.json`, individual `evidence.json` files, and the read-only OpenCode/Copilot exported usage receipts. The first harness process failed while parsing a string-valued Pi message; already completed provider evidence survived, while the in-flight Claude/Pi receipts did not. No owned child process remained after the failure. The parser was corrected before further work.
