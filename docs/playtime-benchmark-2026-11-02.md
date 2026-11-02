# Playtime workflow benchmark, 2 November 2026

The completed runs do not establish a cheaper or faster Paddock workflow. They demonstrate useful local/free implementation and better keyboard handling in several team outputs, alongside substantial coordination overhead, worker failures and scheduling delays. This is a diagnostic pass, not a controlled model ranking.

Each run received the same natural Playtime website brief and eight screenshots. The brief requested a creative, interesting, unique art style, a memorable first screen, thoughtful animations, a playable minigame and phone support. Coordinators chose their own direction. Luna briefed Sol itself; Haiku briefed Sonnet itself. Plans were not shared between arms.

Natural runs used native CLI processes with isolated configuration on the same host, without Paddock routing/design instructions. They were not Docker-container runs. Team runs received the Paddock workflow and wording/focus rules. The owner allowed host image fulfillment for this pass; each agent supplied its own prompts. Luna instead used its native image tool directly.

| Run | Lead effort | Planner | Elapsed | Preview |
|---|---|---|---:|---|
| Natural Sol | medium | self | 6m 09s | http://127.0.0.1:5190 |
| Natural Opus 5.5 | medium | self | 25m 02s* | http://127.0.0.1:5191 |
| Paddock Sol | medium | self | 24m 57s* | http://127.0.0.1:5192 |
| Paddock Sonnet 5.5 | medium | self | 16m 12s | http://127.0.0.1:5193 |
| Paddock Luna | xhigh | Sol medium | 43m 01s | http://127.0.0.1:5194 |
| Paddock Haiku 5.5 | xhigh | Sonnet medium | 35m 42s | http://127.0.0.1:5195 |

*Opus and Paddock Sol were interrupted by app freezes and resumed. Sol also had a read-only recovery attempt. Their elapsed values include interruption and recovery time, and their usage records omit unreported interrupted work. Opus's own log estimates about eleven minutes of interruption; that is not a precise active-time measurement. Other elapsed values include planning, image waits, worker queues, checks and handoff work.

Lead token records follow. Cache traffic is separate; reasoning is included in output, not added again. Claude new-input and cache-write categories are separate in the provider record. Codex new input is total input minus cached input.

| Lead | New input | Cache write | Cache read | Output | Included reasoning |
|---|---:|---:|---:|---:|---:|
| Natural Sol | 52,956 | 0 | 897,664 | 15,227 | 1,314 |
| Natural Opus* | 52 | 89,252 | 2,095,833 | 54,850 | 6,148 |
| Paddock Sol* | 191,096 | 0 | 8,246,528 | 38,791 | 7,846 |
| Paddock Sonnet | 92 | 139,547 | 4,391,244 | 41,166 | 8,094 |
| Paddock Luna | 396,455 | 0 | 20,966,912 | 196,959 | 134,290 |
| Paddock Haiku | 246 | 344,069 | 26,573,215 | 156,046 | 87,480 |

The lead rows exclude the following additional work. Worker input totals include the cached portion shown.

| Arm/work | Account route | Input / cache / output | Outcome |
|---|---|---|---|
| Sol composition | Local Strata | 233 / 0 / 841 | Used |
| Sol game | Local Strata through OpenCode, medium | 65,062 / 50,737 / 10,023 | Accepted with integration fixes |
| Sol explorer | Pi free coding model, medium | 46,440 / 0 / 9,268 | Task failed after files; useful partial output retained |
| Sol review | Kiro free, native default | Unknown | Completed |
| Sonnet game | Local Strata through OpenCode, default | 178,341 / 164,154 / 15,472 | Accepted with integration fixes |
| Sonnet review | Kiro free, native default | Unknown | Completed; several actionable fixes |
| Luna plan | Default Codex account, Sol medium | 333,420 / 295,168 / 7,942 | Completed in 4m 55s |
| Luna composition | Local Strata | 377 / 0 / 1,800 | Incomplete; proposed asset-heavy direction rejected |
| Luna game attempt | Local Strata through OpenCode, medium | 163,291 / 135,422 / 4,888 | Output limit; no files |
| Luna routine | Kiro free, native default | Unknown | Files integrated; task checks became stale |
| Luna game attempt | Pi free coding model, medium | 74,697 / 0 / 20,736 | Failed; code did not match the page contract and was replaced |
| Luna review | Claude included, medium, default model | 89,429 / 55,327 / 6,350 | Completed after owner-reservation queue; four concrete findings fixed |
| Haiku plan | Claude included, Sonnet medium | 61,395 / 33,319 / 11,742 | Completed in 1m 35s |
| Haiku styling attempt | Local Strata through OpenCode, medium | 62,706 / 41,156 / 351 | Output limit; no useful file |
| Haiku styling | Kiro free, native default | Unknown | CSS integrated with lead repairs; stale task checks |
| Haiku game | Kiro free, native default | Unknown | Game integrated with lead repairs |
| Haiku game review | Pi free Nemotron 3 Ultra, high requested | 45,222 / 0 / 13,340 | Review completed; stale after unrelated CSS edits; game-only coverage |

The Pi failure text suggested sign-in, but that diagnosis was unconfirmed: both failed coding tasks generated files/tokens and recorded fourteen assistant turns. The runner's response limit and broad authentication-word matching were material diagnostic problems. The source fix now emits a specific budget-limit event and removes Pi sign-in advice inferred from generated text. Existing benchmark records retain their original errors.

Image counts: Sol solo 1, Opus solo 2, Paddock Sol 2, Paddock Sonnet 4, Luna 3 native calls, Haiku 4. Image token/cost figures were not exposed. Luna's direct image calls were omitted by the CLI JSON item stream; its native session log and saved images confirmed them. Claude can emit multiple result events while processing background notifications: use cumulative `modelUsage` and final cumulative cost, not only the last segment's `usage` or a sum of cumulative costs.

Provider list-price estimates reported by the completed Claude CLI invocations were $2.2303906 for the resumed Opus segment and $1.4091564 for Sonnet. These are not subscription debits, and they exclude unknown image usage and other providers. Exact account credit consumption and total monetary savings cannot be established from these records. Default Codex's subscription window was exhausted, but the owner explicitly authorized extra credits. The separate free Codex account was blocked at 2%, so Luna used the authorized default account.

Haiku reported $1.91813663 for coordination plus $0.2330399 for its Sonnet plan, totaling $2.15117653 for those two invocations. That is about 53% above the Sonnet-led invocation's reported $1.4091564, despite substantial free implementation. This compares reported CLI list-price estimates only, not complete costs or subscription debits. Haiku took 35m 42s against Sonnet's 16m 12s. Neither cheap-coordinator arm demonstrated lower recorded cloud usage or elapsed time.

Source preparation and parent audit overhead are separate from website runs. The free Codex Terra high worker implementing effort support recorded 4,226,119 input, including 4,033,024 cached input, and 27,932 output tokens. Parent code integration, image relay, recovery, browser checks and this report also consumed resources; their complete cloud ledger is unavailable here. A local source-assistance draft used 278 input and 274 output tokens. Do not present a sum of the website rows as the total cost of this entire conversation.

The most useful qualitative findings:

- Natural Sol was fastest and produced a distinctive island illustration. Its game loses keyboard focus to the body after timer completion, catches, victory and restart. Its copy includes “Try the interactive demo” and “Seven sparks. Well caught.” Those outputs are preserved for comparison.
- Natural Opus produced the richest game interaction, Fog Keeper, with incoming distractions and win/loss states. It included the intentionally cropped settings screenshot. Game scoring is pointer-only; the canvas lacks keyboard focus, while keyboard support is limited to pausing. Generic decorative copy remains.
- Paddock Sol combines coherent landscape art, clear screenshot selection and a keyboard-operable firefly game. It preserves focus through the tested game and dialog transitions. It uses much more recorded cloud usage than solo Sol; interrupted timing and incomplete worker usage prevent a clean cost ratio.
- Paddock Sonnet uses separate artwork layers and parallax. Its game keeps focus through a full round and restart in Chromium and WebKit. “Every minute has a place” remains in its copy, mobile hero contrast is weaker, and most implementation was still performed by the paid lead.
- Luna has direct copy and strong final focus handling, including preserving focus outside the game when its timer ends. Its concept board was more adventurous than the finished page. The game is a guided activity with little challenge. Its broad routing attempt produced no accepted local game code; paid coordination and repairs were substantial. Xhigh reasoning accounted for 134,290 output tokens.
- Haiku delegated substantial CSS and game implementation to Kiro and used a free Pi model for a game-only review. The layered sunrise hero is distinctive, but its copy remains hard to read over the artwork, and the rest of the page returns to repeated cards and section rows. It recreated app interfaces rather than displaying the bad cropped settings screenshots. The keyboard game preserves focus through pause, loss and restart in Chromium and WebKit; the Chromium skip link leaves focus on body. It required significant paid integration and game-balance repair. The lead's tracker completed the 50-second round after it added glow recovery; parent checks independently covered loss/restart and keyboard controls.

Haiku's handoff overstates two details: local failure at 351 output tokens does not prove the CSS file was inherently too large, and its Kiro CSS task is `needs-you`, not an overall passed task. Pi's raw review contains five findings but its structured findings list contains two; the coordinator acted on those two. Review-result parsing needs investigation. Finished `needs-you` tasks are retained as unresolved/stale records, without pretending the user accepted them.

Independent browser coverage used Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles. All six sites loaded without page errors or horizontal overflow in those profiles. Additional 320px and keyboard/game checks are retained locally. Full-page captures scroll first to activate intersection animations. Device scale factor 1 avoids WebKit's bitmap-size limit. These are emulated Mac/phone checks, not real macOS/iOS fonts, physical touch or screen-reader certification.

The next workflow changes should target observed overhead:

1. Return compact, incremental task status and account discovery. Paddock Sol received about 83 KB of guide output, 106 KB of account discovery and 169 KB of task-status output. Avoid repeatedly returning full logs and unrelated repository changes.
2. Add structured file ownership and scope checks/diffs to those files. Separate coordinator edits currently make worker checks stale. Shared-repository diff noise also limits this benchmark's isolation.
3. Queue independent component work explicitly or use a single approved parallel plan. Separate task launches in one repository are currently rejected while another is active; more requested workers therefore did not mean parallel execution.
4. Fit local assignments to their context and output budgets. Haiku's local styling task failed after only 351 output tokens, so file size alone does not establish the cause. Investigate effective context occupancy and output reservation, use bounded file chunks with explicit interfaces, and preserve useful partial files. Distinguish budget exhaustion from authentication failure.
5. Keep routine coordinator reasoning and waiting cheap. Use the strong planner for the substantive plan, compact worker contracts, event-driven waits and one final review. Test lower coordinator effort before assuming xhigh is economical.
6. Track queue time, model time, image fulfillment, retries and actual effective effort separately. Preserve owner reservations, but expose queued work clearly so an agent does not mistake a reservation for slow inference.

Code changes pushed during this work: `c1796b5` provider effort dispatch, `6ef3706` its verification documentation, and `eaef5fe` Pi budget/error diagnostics. Build, 840 Windows unit tests (one skipped), Linux unit/headless desktop checks and 103 targeted task/Pi checks passed after the diagnostic fix. The app was not restarted during the benchmark to load these final changes. No packaged release or production deployment is claimed.

Raw local evidence is under `artifacts/playtime-six-run/`; generated sites are under `verification/playtime-six-run/`. Cline was excluded after the reported freezes. No Astra escalation, external site publication or computer shutdown was performed.
