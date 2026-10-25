# Subscription refresh — 25 October 2026

Branch `main`, base commit `88409424c563967eed4c2749e9385f04fe46d64c`. Existing work was preserved. This review covers desktop Usage, phone Usage, and their new native usage readers.

The previous Refresh action polled only Codex. Claude readings came from its response status line, so idle accounts stayed unchanged. Refresh now runs a shared account queue on startup, every two minutes, and from either app. It deduplicates concurrent requests, limits native helpers to three at once, and has a 15-second per-account cooldown. Each account has its own checking/current/sign-in/failure state. A failed read retains its previous value and observation time; a passed reset never invents a zero balance. The phone polls an in-progress refresh without starting another check.

## Provider coverage

| Provider | Background reader | Verification |
| --- | --- | --- |
| Codex | Existing native `account/rateLimits/read`, separately for each profile | Existing native account and profile tests; shared coordinator regression |
| Claude Code | Native stream-JSON control `initialize` then `get_usage`, `skip_behaviors: true` | Real idle account returned two fresh quota windows in under a second, without a prompt |
| GitHub Copilot | Native framed SDK protocol `ping`, `account.getQuota` | Installed CLI returned its sign-in requirement; mocked quota/unlimited/framing tests passed |
| Kiro | Native V2 `/usage`, isolated tool-free agent, no inherited MCP servers | Installed CLI returned its sign-in requirement; plan/bonus parsing and fixed V2 command tested |
| Kimi Code | Temporary authenticated loopback native server, `GET /api/v1/oauth/usage` | Installed CLI returned its sign-in requirement; native endpoint and parser tested |
| Antigravity, Gemini CLI, Cursor, Grok, Droid | Included in the same cards and refresh results; background readers remain unavailable | Cards name their native usage command or dashboard. No fabricated balance or claim of automatic coverage |
| OpenCode, Qwen Code, Cline, Pi | Included with an explicit unavailable quota state | Their selected provider's allowance is separate from console token counts; no inferred percentage |

Full automatic quota coverage for every CLI remains incomplete. The common refresh architecture and five native provider readers are implemented. Authenticated quota retrieval for Copilot, Kiro and Kimi still needs the user's normal provider sign-in. Two-account Codex switching remains deferred at the user's request.

The Claude usage control API and Kimi local server API are experimental. Unexpected fields, missing limits and unsupported versions fail visibly. Kiro is explicitly pinned to V2 because V3 can treat `/usage` as a model prompt. Unknown V2 flags fail the command; there is no fallback that submits a model prompt. Native helpers close after the read or timeout and are also stopped on app quit.

Paddock never opens or copies provider login files. The providers' own CLIs handle authentication. Inherited API tokens and Paddock bridge credentials are removed from usage-helper environments. Claude uses its selected `CLAUDE_CONFIG_DIR`. The Kimi server binds only `127.0.0.1`, keeps authentication enabled, and its local bearer token remains in memory; it is never persisted by Paddock, logged, sent to the renderer, or put in an HTTP request URL. No conversation or model turn is created by these readers.

Only sanitized quota windows, plan label, provider/account ID, observation time and source are saved in the existing `%APPDATA%\Paddock\limits.json` cache. Latest readings replace the corresponding account. The phone receives these fields over its existing authenticated connection. The cache can be removed with Paddock closed; successful future checks recreate it. Provider sign-out and provider data deletion remain the provider's normal controls.

## Checks

- Production build passed; existing large-bundle advisory remains.
- Host suite: 280 passed, one WSL-specific skip, zero failures. Includes 12 new subscription-reader/coordinator tests and a phone refresh protocol test.
- `npm run test:desktop`: all four suites passed against staged Electron 44.9.3 and the changed source. Normal quit/restoration, input, live consoles, tools and setup were covered.
- Flutter: analyzer clean; all 164 tests passed. Thirteen usage tests cover refresh/polling, sign-in state, cache preservation, unknown values, reconnect, leaving during a read, 320/393/800 px at 200% text, and native quota labels/unlimited allowances.
- Four browser profiles passed: Windows Chromium, desktop WebKit, Android Chromium/Pixel 7 and iPhone WebKit/iPhone 13. Their captures were inspected for text, alignment, wrapping, controls and overflow. Keyboard navigation and selected axe checks passed. [Checks and captures](../.build/subscription-usage-20261025/checks.json).
- Usage sky preservation passed: state broadcasts retain the mounted sky and its moving stars. [Log](../.build/apply-update-20261025/usage-sky.log).
- Staged dependency audit: zero vulnerabilities. Live runtime activation is recorded separately by `.build/apply-update-20261025/apply-status.json`; successful source tests do not establish that the old running app has restarted.

Mac, Android and iPhone browser coverage is emulated on Windows. Physical-device fonts, virtual keyboards, TalkBack/VoiceOver, iOS native app behavior and a physical phone update are not claimed. Unit checks use synthetic data, isolated directories and mocked providers; native probes read only usage/authentication status and send no model prompt.

## Page review

This matrix applies to both affected Usage views. Unchanged layout, identity assets and local-app disclosures retain the [earlier Usage review](usage-remaining-verification.md#page-review) and [phone review](mobile-usage-results-review.md#page-review). It is not a legal or accessibility certification.

| Item | Status and evidence |
| --- | --- |
| 1. Privacy | Checked: native authentication boundary, new background checks, cache fields and retention are described above. |
| 2. Terms | Checked: provider-native interfaces; the account-switching notice retains provider rate-limit restrictions. Sources below; no universal multi-subscription permission claimed. |
| 3. Refunds | Not applicable: no purchase/refund flow. |
| 4. Cookies/storage | Checked: no cookies; existing local quota cache, described above. |
| 5. Consent banner | Not applicable: no analytics or browser tracking added. |
| 6. Form consent | Checked: Refresh performs the shown usage check; no new personal-data form or marketing opt-in. |
| 7. Necessary data | Checked: quotas/timestamps only; no identity email, login file, transcript or raw diagnostic stored. |
| 8. Third-party SDKs | Checked: no new package; existing provider CLIs own requests/authentication. |
| 9. Dark patterns | Checked: unavailable/failed readings remain visible; sign-in remains the CLI's normal action. |
| 10. Fees | Checked: no test model call; quota percentages are not converted to an invented cost. |
| 11. Reviews | Not applicable: no testimonials or reviews. |
| 12. Claims | Checked: capability gaps and experimental APIs listed above and surfaced on cards. |
| 13. Accessible names | Checked: named Refresh, textual status, existing named progress bars; unlimited omits the numeric bar. |
| 14. Contrast | Checked: selected axe checks passed in four profiles; text accompanies state/color. |
| 15. Keyboard | Checked: focus/Enter navigation, disabled pending Refresh, existing form/console keyboard tests passed. |
| 16. Business details | Not applicable: no new commercial page. |
| 17. Children | Not applicable: no new targeting or age/data collection. |
| 18. Unsubscribe | Not applicable: no marketing messages. |
| 19. Licenses | Checked: no new visual assets, font or runtime library; existing [asset record](provider-brand-assets.md) applies. |
| 20. Deletion | Checked: local cache removal and provider-managed account deletion boundaries described above. |

## Security review of the change

Each row concerns the changed local-app reader/UI paths, not an audit of third-party provider services. Existing pairing, vault and credential controls remain in the [mobile security review](mobile-security-review.md).

| Item | Status and evidence |
| --- | --- |
| 21. Database credentials | Passed: no database credentials added. |
| 22. Public .env | Not applicable: no web deployment or environment file change. |
| 23. Hardcoded keys | Passed: no embedded key; inherited API/bridge tokens stripped. |
| 24. Authentication | Passed: provider-native login; Kimi local server keeps bearer authentication enabled. |
| 25. Authorization | Passed: desktop IPC and paired phone request path retained; no new public action. |
| 26. Other users' data | Passed: profile-bound readers; account/provider mismatch rejected in tests. |
| 27. Database rules | Not applicable: no database or rules added. |
| 28. Cloud storage | Not applicable: no cloud storage used. |
| 29. Admin routes | Not applicable: no admin route added. |
| 30. Debug pages | Passed: no debug endpoint enabled; Kimi uses its documented authenticated usage route. |
| 31. Build logs | Passed: fixtures use fake tokens; real native probe output contains only safe status/count/timing. |
| 32. Errors | Passed: fixed safe messages; raw stderr/provider errors never rendered. |
| 33. Repositories | Not applicable: repository visibility/history not changed; no secrets added. |
| 34. Frontend secrets | Passed: payload contains sanitized quota/state fields only. |
| 35. Server validation | Passed: main process chooses fixed readers; phone can request a boolean refresh, not commands/URLs. |
| 36. Input validation | Passed: numeric percentages, finite timestamps, response shape/account checks and response-size limits tested. |
| 37. SQL injection | Not applicable: no SQL introduced. |
| 38. NoSQL injection | Not applicable: no NoSQL introduced. |
| 39. XSS | Passed: new provider labels/status/error content is escaped; Flutter renders Text. |
| 40. CSRF | Not applicable to local IPC/paired WebSocket; existing authentication unchanged. Kimi request carries bearer auth. |
| 41. Uploads | Not applicable: no upload. |
| 42. Paths | Passed: helper working directory derived from app data; renderer cannot choose it. No login-file access. |
| 43. SSRF | Passed: only the owned Kimi server's literal 127.0.0.1 URL and fixed route; redirects rejected; non-loopback fixture refused. |
| 44. Password reset | Not applicable: provider-owned. |
| 45. Sessions | Passed: usage reads create no conversation; helpers close on completion/timeout/quit; existing consoles remain independent. |
| 46. JWT | Not applicable: no JWT signing or verification added. |
| 47. CORS | Not applicable to backend CLI calls; no browser-origin access or CORS change added. |
| 48. Rate limits | Passed: refresh deduplication, maximum three helpers, 15-second cooldown, two-minute automatic interval. Provider throttles remain explicit. |
| 49. Test environments | Passed: synthetic renderer/phone state and temporary profiles; real probes send no prompt. |
| 50. Default credentials | Passed: no shared/default provider credentials or auth bypass. |
| 51. Webhooks | Not applicable: none added. |
| 52. Payments | Not applicable: no checkout or payment processing. |
| 53. Object references | Passed: results must match the requested account/provider; tested cross-account rejection. |
| 54. Trusted roles/IDs | Passed: main-process account catalog supplies IDs; no caller-selected reader command or role. |
| 55. Sensitive logs | Passed: raw provider output is discarded; Kimi local token remains private in memory; safe-error tests. |
| 56. Source maps | Not applicable: local app build; no public source map deployment introduced. |
| 57. Dependencies | Passed for staged build: full npm audit reports zero vulnerabilities. |
| 58. Versions | Passed for staged build: pinned Electron 44.9.3; CLI protocol/version incompatibility fails visibly. Live activation evidence is separate. |
| 59. Prompt injection | Passed: no prompts are built from quota output; fixed RPC/route/V2 built-in command only. |
| 60. AI permissions | Passed: no model/tool request; Claude restricted mode/hooks disabled; Kiro tools/hooks/MCP disabled. |
| 61. Database privileges | Not applicable: no database added. |
| 62. Audit trail | Passed: branch/base revision, focused tests, native checks and update status/log paths recorded. |
| 63. Monitoring | Passed for local operation: failures are visible per account and each read is bounded. No hosted service introduced. |
| 64. Backup/restore | Not applicable to reproducible quota cache; existing conversation restoration smoke passed. No off-machine backup claim. |
| 65. Internal dashboards | Passed: native Kimi helper is loopback-only, authenticated and short-lived. |
| 66. Headers | Not applicable: no hosted site/HTML response introduced; existing Electron CSP unchanged. |
| 67. Cookies | Not applicable: no cookie added. |
| 68. Sensitive encryption | Passed: no provider secrets persisted by Paddock; paired phone TLS unchanged; local Kimi bearer is memory-only. |
| 69. Tenant isolation | Passed: separate profile homes and account-scoped cache replacement; no cross-account percentage aggregation. |
| 70. Generated code | Passed: source reviewed, unit/native/renderer/Flutter checks recorded above. |

## Primary sources checked

- [Claude Agent SDK changelog](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md), [published SDK types](https://unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.301/sdk.d.ts): experimental native usage control and quota shape.
- [Claude plan support](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): the October 7 update permits SDK/print/third-party usage within plan limits; it does not authorize rate-limit circumvention.
- [Copilot SDK usage and billing](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing): account quota snapshots and unlimited entitlements.
- [Kiro command reference](https://kiro.dev/docs/reference/slash-commands/), [Kiro configuration](https://kiro.dev/docs/custom-agents/configuration-reference/), [official Kiro Crew usage implementation](https://github.com/kirodotdev/KiroCrew/blob/main/src/kiro_crew/dashboard/handlers/sessions_parts/usage_scrape.py): V2 local usage command, credit pools and the V3 prompt hazard.
- [Kimi local server API](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/server-api.md): authenticated live account quota endpoint and independently reported windows.
- [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/): focused interface checks; no certification claimed.
