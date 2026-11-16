# Connected agents and website runs — 1 November 2026

Nine native CLI coordinators made real Paddock context and candidate calls. Cross-account routing is implemented through the common registry; it is not yet live for every installed CLI. The running Paddock process still uses its earlier adapters and needs a normal restart to load these changes. Existing owner consoles were preserved.

## What changed

- Named Codex account UUIDs survive saved routing validation and migration. The second account's native model list contains GPT-6-Luna, GPT-5.6-Terra and GPT-5.6-Luna. Luna performed the connector check; Terra performed the website review. No diagnostic or delegated worker was launched through the exhausted default Codex account.
- Ready local implementation remains first. Independent overflow uses eligible free allocations, then included accounts. Within the selected funding group, equally occupied accounts are ranked by the most remaining allowance; concurrent work can spread across accounts within ten percentage points. Metered routes require explicit assignment. Unknown and stale quotas remain explicit.
- Fresh account model discovery chooses smaller sufficient models and the strongest eligible discovered review tier. Tiers are model-name/configuration hints, not benchmark scores or proof that a model is universally strongest. Explicit custom routes remain intact.
- `task_candidates` now includes the complete installed-account inventory, reader status, worker support, available model metadata and the routing policy. `suggestion` is explicitly labelled as the reviewer suggestion.
- Added bounded incoming adapters for Cline, Gemini, Kimi, Droid and Pi. The latter four have live-account limitations below. Cline's file guard was verified through native tool calls. Pi uses its installed SDK with native authentication, in-memory settings, no automatic retry or compaction, and hard response/tool limits. Its SDK initialization passed without generation; the new incoming runner still needs a live completion after quota reset.
- Pi's OpenRouter reader distinguishes the selected model's pricing from the account's free-tier flag. It reports free-request exhaustion and paid balance separately. A zero-balance paid Kimi route cannot be advertised as free. Cline's selected native free route is discoverable while its remaining quota stays unknown.
- Corrected Kiro's exact MCP permission IDs and Cline's headless backend environment. Cline interactive mode has an upstream backend limitation and remains unverified. Codex gets Paddock-specific MCP approval configuration; ordinary filesystem permissions and Paddock policy gates remain separate.
- Startup context now includes the creative exclusions directly. It was shortened to retain the existing compact-context limit. The rule is local first, focused handoffs, one review, no automatic Paddock retry/fallback. Detected native retry events fail the task; some CLIs retain transport retries that they do not expose as configurable.
- Normalized OpenCode input now includes cache reads/writes and output includes reasoning, each once. Claude input also includes cache traffic. Previously these omissions made comparisons unreliable. [OpenCode's native usage contract](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts).

## Verification matrix

| CLI/account | Calls Paddock | Incoming delegation | Quota visibility |
| --- | --- | --- | --- |
| Claude | Verified live | Used for Pi implementation | Native reader |
| Codex sub1 | Verified live with Luna | Terra website review verified | Native reader; separate named profile |
| Antigravity | Verified live | File worker previously verified | Native reader |
| Copilot | Verified live | File worker previously verified | Native reader |
| OpenCode | Verified live | Existing Go and Strata paths | Go reader; local readiness |
| Kiro | Verified live after permission fix | Existing native path; earlier review verified | Native reader |
| Grok | Verified live | File worker previously verified | No connected quota reader |
| Cursor | Verified live | Not enabled: bounded subagent permissions unverified | Native reader |
| Cline | Verified live in headless mode | Free file worker verified, including guard audit | Selected free route known; remaining quota unknown |
| Pi | Earlier narrow local handoff succeeded; generic probe failed | SDK prepared; new live runner blocked by exhausted allowance | New OpenRouter reader: 50/50 free requests used |
| Qwen | No configured provider/authentication | Bounded safe profile still unverified | Unknown |
| Kimi | 403: subscription lacks Code access | Adapter tested with mocks; live blocked | Native reader may report sign-in/eligibility failure |
| Droid | 402: no active subscription | Adapter tested with mocks; live blocked | Unknown |
| Gemini | Individual account rejected as unsupported client | Adapter tested with mocks; live blocked | Unknown |

The deterministic origin/target matrix verifies common-tool dispatch without provider-specific caller restrictions. It does not represent 196 live model calls. Actual origin probes and actual target receipts are separate evidence. New source adapters and expanded inventory have not been loaded into the owner's already-running app.

The existing live context exposed local-first guidance but omitted the creative exclusions from its short summary. Those exclusions existed in the website/project references; the source startup summary now repeats them explicitly. Receiving instructions does not prove perfect compliance: Cline corrected invalid context arguments, and Pi repeatedly produced invalid tool scripts.

## Website results

- Bakery: http://127.0.0.1:5186/
- Playtime: http://127.0.0.1:5187/

Both use actual local drafts. The bakery has a composed bread/pastry scene beside practical visit information. Playtime uses text-free paper artwork with game objects at one end, study objects at the other, and a live accessible timer in the centre. The free Terra review found the first Playtime composition too decorative; one local-assisted correction added the central interaction. The final screenshots were inspected after that correction. The original changes-requested review is retained with a resolution note.

Both are presentable for visual feedback. The bakery is restrained and readable; Playtime is more distinctive and follows the requested ribbon direction. This is the agent's assessment, not owner aesthetic approval. Supplied bakery contact details remain placeholders, and no distributable Playtime installer was available. The site accurately explains the unavailable download. Neither website is labelled a demo.

PC Chromium, Mac WebKit, Android Chrome profile and iPhone WebKit checks passed for rendering, links, overflow, image loading, automated accessibility and relevant interactions. Only Windows Chromium is native to the host. The other profiles are emulated; physical-device and native Safari/font checks remain open. Playtime's timer was checked through start, pause, resume, elapsed-time catch-up, completion, restart and reset.

| Website work | Input tokens | Cached input, included at left | Output tokens | Measured execution |
| --- | ---: | ---: | ---: | ---: |
| Strata local, four useful portions | 2,163 | 0 | 4,433 | 28.329 s |
| Codex sub1 free, Terra review of both pages | 49,655 | 28,544 | 968 | 30.905 s |
| Two image generations | Unknown | Unknown | Unknown | 61.231 s |
| Website coordinating chat, Astra | 5,807,099 | 5,688,064 | 32,817 | Within website interval |
| Root coordinating chat, Astra | Recorded for whole audit below | Recorded below | Recorded below | Website share not isolated |
| Other subscriptions used for these website builds | 0 recorded worker requests | — | — | — |

The measured website interval was **13 minutes 59 seconds**, from the first local request through the final verified snapshot. Earlier brief recovery and later packaging are excluded. It is a lower bound on end-to-end effort, not a matched speed comparison. Subscription quota debit and image charges were not attributable from these counters. Total cloud savings remain unproven.

## Audit cost and the failed free-model case

Connector diagnostics are separate from the website figures. They used the connected accounts, including failed attempts, and are itemized in [the origin audit](origin-matrix-2026-11-01.md). A successful Cline incoming file task used 31,464 input tokens, including 8,672 cached, and 420 output in 16.985 seconds, with provider-reported cost zero. Two earlier guard-validation attempts added 63,009 input, 26,016 cached and 846 output; they are not omitted from the evidence.

Pi's generic coordinator probe produced 24 model responses, 34,386 input and 10,890 output in 60.178 seconds without a successful Paddock call. The allowance subsequently read 50/50 used; earlier in-flight harness failures have incomplete counters, so the entire quota change cannot be attributed solely to that one recorded run. No further Pi generation or paid fallback was attempted. The earlier tightly specified Pi-to-local handoff did work. This supports bounded direct work and enforced budgets, not using that small model as a general coordinator.

The local allowance-reader implementation took 108.453 seconds including its check, and one test expected the wrong value. That test and numeric underflow handling were repaired directly. Claude's subsequent Pi implementation was integrated with additional SDK isolation because the worker could not inspect the installed SDK outside its file permissions. These integration costs count against any workflow savings claim.

## Recovered coordinator usage

The earlier website report lacked these counters. They were subsequently recovered from this thread and its three child logs. All four identify **gpt-6-astra**. This missed the intended Sol/local/free orchestration policy. Cached input is included in total input; these are snapshots through the recorded timestamps, and the final response tail is excluded.

| Coordinator | Input | Cached input | Uncached input | Output |
| --- | ---: | ---: | ---: | ---: |
| Root audit + integration | 18,016,401 | 17,563,392 | 453,009 | 64,905 |
| /root/origin_audit | 11,731,084 | 11,600,128 | 130,956 | 33,502 |
| /root/website_runs | 5,807,099 | 5,688,064 | 119,035 | 32,817 |
| /root/native_targets | 12,170,478 | 12,045,056 | 125,422 | 28,514 |

Coordinator subtotal at 2026-11-01T20:50:21.614Z: **828,422 uncached input + 46,896,640 cached input + 159,738 output tokens**. Native per-response deltas matched each thread's cumulative counters; child threads are separate. Root work spans the entire audit and cannot be precisely assigned to either website.

The website helper plus its free Terra review used 140,146 uncached input, 5,716,608 cached input and 33,785 output tokens. Root integration and image costs are additional. The 2,163 local input / 4,433 local output tokens therefore do not establish a cheap run. This run supports the visual result and several connector repairs, while the economy target remains unmet.

Claude's Pi implementation took 250.551 seconds and reported 32 uncached input, 601,937 cache-read tokens and 27,303 output. Its older task recorder omitted cache-write details, so the exact total remains incomplete. These are additional audit-worker counters, not part of the four coordinator rows.

Future runs should use a compact new worker brief, the explicitly chosen Sol lead, bounded local/free work and a single suitable Luna/Terra review. Automatic Astra selection is now blocked without explicit escalation; this cannot recover the allowance already spent. Image token/price data, some failed diagnostic receipts, Kiro tokens and the final response tail remain missing. No invoice or total saving is claimed.

## Validation

Build passed. Windows: 834 passed, one skipped. Linux: 829 passed, six skipped, followed by all five headless desktop suites. Subsequent model-policy changes passed focused Windows and Linux checks. These tests use mocks; no paid model calls occur in automated tests.

## Remaining work

Restart Paddock to activate the new adapters, account inventory, Pi reader and startup instructions. Resolve the provider-specific eligibility gaps above. Verify Pi's new incoming runner after reset and Cline's interactive backend separately. Cursor and Qwen remain coordinators until their bounded worker permissions are verified. Run an equivalent solo-versus-team pilot with complete coordinator/image counters before claiming a cost or speed improvement.

Two completed implementation records remain in Paddock's `needs-you` state. The local record retains its original failed check, since repaired and independently verified. The Claude record's check became stale as concurrent integration changed the repository fingerprint. No workers remain active. The connected task tools expose no recheck or acceptance operation, and only the owner can accept task records; these records have not been marked passed on the owner's behalf.

Requested website report, assets and source ZIP are in Results. Detailed website evidence: `artifacts/team-website-rerun-20261101/REPORT.md`, `metrics.json`, `CHECKLIST.md`, `verification/`. Diagnostic evidence: `artifacts/agent-matrix/`.
