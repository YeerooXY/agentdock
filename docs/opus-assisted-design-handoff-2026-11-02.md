# Opus-assisted design handoff, 2 November 2026

This handoff covers the owner's feedback on the Playtime six-run benchmark. The owner prefers the solo Opus site to Paddock Sol. This is one owner's preference for one brief. It does not rank the models in general. No new benchmark, delegation or site edit was performed for this document.

## Evidence used

- `docs/playtime-benchmark-2026-11-02.md`: timings, token ledgers, worker outcomes and findings.
- `artifacts/playtime-six-run/02-natural-opus-windows.png`, `02-natural-opus-android.png`, `02-natural-opus-visible.txt`
- `artifacts/playtime-six-run/03-paddock-sol-windows.png`, `03-paddock-sol-visible.txt`
- `artifacts/playtime-six-run/audit-notes.md` line 18 contains the Opus canvas, keyboard and cropped-screenshot findings.
- Opus source: `verification/playtime-six-run/02-natural-opus/{index.html,styles.css,app.js,game.js}`.

The Mac and iPhone captures were not reopened for this review. At the size returned, the Android capture showed the layout order only and was too small for a typography check.

## Why the owner preferred Opus

**Palette.** The Opus page uses dusk purple, ember orange and warm paper. These colours come from the actual app screenshots: misty purple ridges, an orange sunset and dark translucent dials. The screenshots read as part of the page. Paddock Sol uses a sage, cream and forest-green storybook palette. Its app screenshot (`03-paddock-sol-windows.png`, "Inside Playtime") looks like a window from a different product. The palette does not contradict any facts, but it separates the art from the product.

**Composition.** The Opus page alternates screenshots in a zigzag, with taped photo-print frames, torn-paper section edges and a dark/light rhythm. It ends with a cabin illustration. Paddock Sol is clean and coherent, but it follows a familiar sequence: hero, numbered list, tabbed screenshot, game panel, two tips, FAQ and CTA band. The Opus layout is the more adventurous one.

**Game.** Fog Keeper has a premise tied to the product: distractions rise from the fog and the player stops them before they reach the study window. It has a bonus pickup, a loss condition and a 50-minute goal that mirrors the app. Firefly break is accessible, but it is a 20-second tap target with little tension.

**Arrows.** Paddock Sol's visible text contains `↗` or `↓` on nine controls or labels: For Windows, See how it works, Try a little break, Study session, Scroll to explore, See break ideas, both tip rows and Windows availability. The arrow is no longer a cue; it is a texture. Opus uses arrows on two controls (`Get Playtime →`, `Start studying ⟶`). Even that should be reduced to the one control that actually navigates or downloads.

## Candid critique of the Opus site

Measured or directly observed:

1. **The game cannot be scored from the keyboard.** The canvas has no `tabindex`, scoring is `pointerdown` only and the keyboard can only pause (`audit-notes.md:18`). This is the main functional defect.
2. **The cropped settings screenshot is used as a feature image.** Reference 06 was deliberately cropped badly. Opus placed it in "Your rules, written once", where the page presents it as a real view of the product.
3. **Wording defects.** The following patterns break the direct-wording baseline:
   - Slogan or "not X" framing: "No arguing with yourself, no willpower spent." "Five minutes of scrolling isn't rest." "A break should feel like a break."
   - Atmospheric filler: "Fifty minutes in four seconds. We sped it up." "Everything loud goes behind paper while you study." "Four layers between you and the evening." "Put the controller in the jar."
   - Footer em dash: "Playtime — study first, then play." The settings list also uses six em-dash separators ("Daily limits — how much…").
   - "Whitelisted websites only" should be "Allowed websites only".
4. **Paid-lead cost.** Opus recorded 54,850 output, 89,252 cache write and 2,095,833 cache read tokens, plus 2 images, with no worker offload. The resumed segment reported an estimated list price of $2.23. That figure excludes the interrupted work.
5. **Timing is contaminated.** The elapsed 25m 02s includes about 11 minutes of freeze, by Opus's own unverified estimate.

Speculative, needing a rendered check:

- The phone page is very long, about 11,200 px at 412 px wide. The two dark middle sections may feel repetitive on a phone.
- The italic serif accent and the ember-on-purple text may fall short of contrast requirements at small sizes. This has not been measured.

## Improvement backlog for the Opus site

Each item is bounded. The owner column shows the proposed route.

| # | Change | Files | Acceptance | Route |
|---|---|---|---|---|
| B1 | Make Fog Keeper keyboard-playable: canvas `tabindex="0"`; arrow keys or Tab cycle the targeted distraction; Enter or Space removes it; a live region announces score and result | `game.js`, small hook in `index.html` | Full round, loss and restart work with the keyboard alone in Chromium and WebKit; the active element is never `body` | Local first, Kiro free next |
| B2 | Focus after end states: move focus to Restart on win or loss; return focus to the canvas after restart | `game.js` | Focus is preserved after repeated Enter/Space restarts, with Tab and Shift+Tab checked | Same worker as B1 |
| B3 | Replace the cropped settings screenshot with a correct reference or a live HTML settings list in the existing card style | `index.html`, `styles.css` (one section) | No deliberately bad reference is shown as a product image | Lead decides; local implements |
| B4 | Copy pass: replace the lines listed above with concrete statements and remove the em dashes | `index.html` | `dock/check_website_copy` is clean on the visible text and the owner accepts the wording | Lead (judgement) |
| B5 | Arrows: keep one directional glyph, on the download control, and remove the others | `index.html`, `styles.css` | At most one arrow glyph among the visible controls | Local |
| B6 | Contrast audit for ember-on-purple and the italic accents; adjust tokens only | `styles.css` `:root` tokens | WCAG AA on body text and controls in all four profiles | Local, with a deterministic contrast script |
| B7 | Phone rhythm: shorten or merge one dark section at 412 px or less | `styles.css` media block | Owner screenshot preference; no overflow at 320 px | Lead decides; local implements |

Preserve the dusk palette, torn-paper edges, taped frames, zigzag order, cabin illustration and the Fog Keeper premise. Exclusions: no arrow on every button, no art callouts or pointer labels, no three radiating strokes, no "demo" label and no slogan filler. All copy and controls stay live text, and the artwork stays text-free.

## Who should own what

| Role | Owner | Reason |
|---|---|---|
| Art direction and palette | Opus | The owner preferred its judgement here. Opus derived the palette from the product screenshots. |
| Plan and module contracts | Opus, same session | Splitting design from planning risks losing the direction at handoff. Luna's concept board was more adventurous than its finished page. |
| Coordination | Thin: Paddock routing plus the Opus lead, event-driven | Neither cheap-coordinator arm reduced recorded cost or time. Haiku+Sonnet reported $2.15 against Sonnet-led $1.41 and took 35m 42s against 16m 12s. |
| Bounded modules | Local Strata, then Kiro free, then included accounts | Kiro free produced accepted CSS and game code. Local Strata worked for small composition and a game when the context was small. |
| Final visual and copy review | Opus, once | The owner's preference is the acceptance criterion. One review, no loop. |

### Opus lead versus Opus planner with a cheaper executor

**Opus lead (recommended default).** Opus designs, writes the contracts, integrates worker output and does the final review. Integration is where direction is lost or kept. In every team arm, the paid lead had to repair worker output (benchmark rows "accepted with integration fixes"). Repairs that keep the art direction need the designer's judgement. Risk: Opus output tokens are the most expensive item in the ledger, so the lead must not write modules that a worker can own.

**Opus planner with a cheaper executor.** Opus produces a frozen design spec: tokens, section order, image prompts, module contracts and acceptance checks. Sonnet or Haiku then executes and coordinates. The measured evidence is against this for cost and time: the Haiku-with-Sonnet-planner arm cost more and took longer than Sonnet alone. That evidence used Sonnet as the planner, not Opus, so this variant is untested and should be measured rather than assumed. Expected failure mode (speculation): the executor flattens the composition into cards, as Haiku's page did after its hero.

Recommendation: run the Opus lead route first. Run the planner variant only as the measured comparison below.

## Routing bounded modules while keeping direction

1. Opus writes `contract.md` per module. It contains the files owned, the exported interface, the design tokens (copied, not described), the exclusion list and the acceptance commands. Workers receive the contract and their files only, never the conversation or the whole repository.
2. Interfaces, defined before dispatch:
   - `game.js`: `createFogKeeper(canvas, { onScore(n), onEnd({won, minutes}), announce(text) }) -> { start(), pause(), reset(), destroy() }`. It owns no DOM outside the canvas and its own live region.
   - `styles.css`: workers edit only their delimited section block. `:root` tokens are owned by the lead.
   - `index.html`: owned by the lead. Workers propose markup in their report.
3. Route order: ready local model first, for files under the measured working budget. Next, eligible free/included routes. Current discovery shows Antigravity and Copilot signed-in with `workerSupported=true`, at 99.06% and 91.7% left, but their **funding is unknown**. Remaining quota does not establish model-level free entitlement. Source verification shows unknown funding ranks below free and included; it does not make these accounts categorically ineligible. The user already reported these free-tier accounts earlier in the conversation. Persist that account classification and discover the eligible model/allowance route; do not ask the user to repeat the same authorization. Until routing metadata is corrected, do not describe unknown-billing calls as proven free.
4. Keep chunks small. Pi coding tasks hit turn and response budgets (14 turns, files produced). Local Strata failed on large contexts: Luna's game hit the output limit and Haiku's styling stopped at 351 output tokens. The cause of the 351-token stop is **not measured**; file size alone is unproven. Give each local worker one file section and a stated output budget, and keep partial files.
5. Overhead is measured. Paddock Sol received about 83 KB of guide output, 106 KB of account discovery and 169 KB of task status. Coordinator edits also made worker checks stale. To reduce both: discover once, return incremental status, run scoped diffs on owned files and check only those.

## Fair next comparisons against natural Opus

Stage 1 is a bounded repair, because it has lower creative variance. Run backlog items B1, B2, B4 and B5 on a fresh copy of the Opus site.

| Arm | Setup |
|---|---|
| A | Natural Opus, solo, medium, no Paddock |
| B | Opus lead through Paddock: B1/B2 to a local or Kiro worker, B5 to local, B4 by the lead, one Opus review |
| C | Opus planner (one invocation) plus Sonnet medium executor, same workers |

Stage 2 is a fresh-site comparison with the original Playtime brief and eight screenshots. Run it only if Stage 1 shows B or C at or below A on cloud usage, with gates passed.

For every arm, record:

- Cumulative `modelUsage` per model: new input, cache write, cache read, output and included reasoning. Use the final cumulative cost, not a sum of segments.
- Worker rows: route, input/cache/output, and outcome (accepted, repaired or failed). Count failed attempts and retries.
- Review usage, and coordinator wait or polling usage.
- Image count and route (Stage 2).
- Elapsed time split into model, queue, image, check and owner-wait time. Restart any run interrupted by an app freeze, rather than mixing resumed segments.
- Billing class per route: local, known free, included, unknown or metered.

Acceptance gates, the same for all arms:

- No page errors and no horizontal overflow in Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles, plus 320 px. Label these as emulated.
- Fog Keeper: a full round, loss and restart by keyboard; the active element is never `body`.
- `dock/check_website_copy` clean; at most one arrow glyph on the controls; no em-dash separators.
- Palette tokens unchanged unless the change is deliberately framed. Compare by sampling against the product screenshots.
- Blind A/B screenshot preference from the owner, recorded as preference only.

## Unresolved gaps

- Persisting the user's previously stated free-tier setup for Antigravity/Copilot and verifying eligible model routes.
- The cause of the local 351-token stop and the effective context occupancy of local workers.
- Pi review parsing: five raw findings became two structured findings.
- Opus timing without freezes; interrupted-segment usage is missing.
- Mac and iPhone real-device rendering, which has not been checked.
- Whether the queue rejection of parallel tasks in one repository is fixed. B1/B2 and B5 cannot run in parallel without it.

## Next actions

1. Orchestrator: persist and verify the existing free-tier account information; expose any actual model-entitlement gap. This handoff does not require repeating prior authorization.
2. Orchestrator: create the Stage 1 copies and contracts (`game.js` interface above), then run arms A to C with the ledger fields listed.
3. Do not change the live site from this document. Repairs to Paddock (incremental status, scoped checks, parallel queue) are separate tasks.

## Parent verification and handoff entry point

The benchmark records show Copilot signed in with 91.7% remaining in all four team arms. Antigravity was signed out or unknown in some discovery snapshots, but Sonnet and a later Luna snapshot saw it signed in with 99.06% remaining. Both were discovered, neither received a website task. Known-free funding preference explains the ranking pressure; the records do not establish every coordinator's exact reason for omitting them.

Start the next session by reading this document and `docs/playtime-benchmark-2026-11-02.md`. Preserve the original benchmark outputs. The user requested this proposal and notes; the next repair/benchmark batch has not been launched by this document. The one-arrow limit above is a proposed test constraint, not a universal user rule: the lasting preference is to avoid repetitive arrows on routine controls. Compare monetary estimates and actual credit usage where exposed, not raw token totals across differently priced models. A Codex technical review can replace a separate technical review round while Opus retains final visual judgement; measure that variant rather than assuming it is cheaper.
