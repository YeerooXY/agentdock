# AgentDock workflow repair — 1 November 2026

The six-site trial supports changing the orchestration pattern. It does not demonstrate that cheaper models, more reviewers or optional local availability reduce total cost. Keep one capable lead, give local inference a concrete bounded output, run deterministic checks in code, and review specific defects. Establish a distinctive composition before implementing the full page.

## What the evidence establishes

| Observation | Consequence |
| --- | --- |
| Solo Astra used 93,803 cloud output tokens across two briefs; optional-local Astra used 88,544; Terra/Luna/Sol used 340,920. | The orchestrated path used 3.63 times the solo cloud output volume. This is a volume comparison, not a measured price comparison. |
| Each Terra-managed site had four builder passes and four reviews. Bakery still omitted required business facts and added an unrequested editor. | Repeated review did not repair the missing intake or preserve scope. Diagnose missing facts and role fit before allocating another round. |
| Both optional-local Astra runs made zero local-model calls. | Merely mentioning a local helper does not establish delegation or savings. Assign an actual bounded deliverable and inspect adoption. |
| Bakery local output encountered budget/argument and Windows encoding failures; its final draft was discarded. Playtime adopted a small local scaffold. | Client reliability and integration matter. Local token volume is not a useful-output metric. The benchmark client was repaired after the frozen runs. |
| The owner ranked the orchestrated sites last on both briefs; the technical reviewer gave its Playtime page 94/100. | Technical correctness and owner visual preference need separate evidence. |
| The 22 measured build threads made zero Paddock MCP calls. | Direct Paddock bookkeeping calls did not cause those build totals. Injected guidance and workflow structure may still affect work; the experiment does not isolate their causal costs. |
| The parent benchmark run used 269,596 output tokens, including compactions. Responses containing its 39 Paddock calls used 7,670 output tokens, about 2.85%. | Benchmark setup, monitoring, repairs and reporting were substantial. The 2.85% is response-level attribution, not a precise marginal tool cost. Reuse a tested runner rather than rebuilding the experiment. |

Sources: [frozen comparison](C:/Users/7yeer/website-benchmark/20261101/COMPARISON.md), [owner review and corrected usage audit](C:/Users/7yeer/website-benchmark/20261101/HUMAN-REVIEW-AND-USAGE.md), [provider ledger reconciliation](C:/Users/7yeer/website-benchmark/20261101/records/build-provider-ledger-audit.json). One trial per brief/workflow cannot establish a general model ranking. Provider prices and subscription multipliers were not measured.

Wording violations remain preserved in the experiment: Playtime-C `index.html:88` includes “Built around your day”; Playtime-C2 `index.html:118` includes “One session at a time.” Bakery-T contains visibly corrupted Hungarian. Those frozen submissions were not edited.

## Changes implemented in the app source

**Bounded local assistance.** `dock/local_assist` accepts a small supplied text task for extraction, drafting, critique or creative composition. It uses only the saved credential-free loopback Strata profile and discovers the loaded model. It provides no file access, shell, connected tools, agent chain or cloud fallback. It defaults to 2,048 output tokens with reasoning disabled; callers can choose bounded output/reasoning settings. The request deadline is 90 seconds. Repeated IDs in the same console/turn reuse the last 128 cached requests until app restart, including failures. No automatic retry occurs.

The helper records model, usage, duration, status and project/turn attribution in the existing API ledger. Missing usage stays unknown. Prompts and answers stay out of the ledger; no Task or Result is created for a helper call. Text returned by the model is unverified input to the lead. The helper does not reserve resources against other separately launched local sessions. A timeout can leave server-side computation running.

**Role-specific guidance.** Builders receive a compact website contract. Planners also receive the creative brief; the first reviewer receives the full 70-item checklist. Follow-up reviews retain the obligations and inspect current findings/regressions without another copy of the full library. Reference topics remain available on demand. The lead still reads relevant references and supplies concrete facts, selected direction, assets and acceptance criteria.

For the same minimal website task, the revised builder guidance is 2,958 characters and first-reviewer guidance is 18,496 characters. The equivalent current four-topic library contains 39,162 characters before the surrounding task prompt. These are source-text sizes, not tokenizer counts or measured benchmark savings. Project context and task-specific input add to each actual request.

**Targeted corrections.** Fix prompts retain the latest completed review and current failed checks. They no longer concatenate superseded findings and old check failures. A skipped review does not erase the most recent completed findings. Follow-up reviewers receive the previous findings and current check evidence. Full history is preserved in the task record. Existing routing selections, configured round limits and verification fingerprints remain intact.

**Concrete copy checks.** `dock/check_website_copy` inspects supplied rendered visible text for known slogans, website-demo labels, promotional reversals and likely encoding defects. It returns matched evidence and positions without an AI call. It leaves legitimate controls such as “Book a demo” and “Preview your schedule” alone. This narrow matcher does not prove complete compliance, factual accuracy or writing quality. The lead must inspect matches in context.

**Website presentation.** The working guidance and repository instructions now keep development status in the handoff. Do not call the website a demo or add development-status banners. Keep necessary action limitations accurate: an unavailable installer, unsent form, price or privacy consequence still needs a precise explanation where the visitor acts.

No paid model requests, new benchmark builds, website redesigns, branch changes or app restarts were performed for this repair. Existing unrelated working-tree changes were preserved.

## How the creative role should work

The creative role can run in the lead or through one local-helper call. It does not need a permanent additional agent. Give it the real facts, supplied assets, visitor action, owner preferences and relevant current screenshot. It returns three short spatial ideas, each changing at least two of composition, information order, evidence treatment and interaction.

Each idea specifies one distinctive visual feature, why it fits this content, desktop arrangement, phone adaptation, interaction, asset needs and one cost. For a bakery, a continuous product counter with anchored visit information is a different composition from a stack of product cards. It still requires real product assets and must not invent stock or business details. Examples are starting points, not templates to repeat across sites.

The creative role then writes an image prompt with placement, scale, cropping, type, negative space and the primary action. The image generator renders that idea. A text-only model cannot generate the screen image. Follow the existing preview preference; a comparison sheet can show the alternatives in one generation when practical. The owner selects an open direction before substantial implementation. An authorized unattended exercise uses its declared selection rule and records the absence of owner selection.

The builder receives the selected composition and the one distinctive element it must preserve. Build a representative section first and compare it with the concept. If it became another set of equal cards, correct that mismatch before expanding the page. The creative step ends with a usable handoff; it does not restart during every small fix. Technical scores cannot approve the owner's visual taste.

## Operating pattern to test next

| Work | Default executor | Bounded outcome |
| --- | --- | --- |
| Read existing facts and identify consequential gaps | Lead, with local extraction when useful | One compact factual brief; ask only for missing facts that change the result |
| Link, encoding, overflow and test checks | Deterministic scripts/browser checks | Reproducible evidence with no model inference for mechanical decisions |
| Composition ideas or isolated component | Local helper when ready | One result with explicit constraints, acceptance checks and adoption/rejection reason |
| Select/integrate architecture and implementation | Capable lead | Working requested scope, preserved design and verified actions |
| Review | One focused reviewer when warranted | Confirmed defects with evidence; one targeted correction as the initial allowance |

Use direct work for small changes. A separate worker must replace work the lead would otherwise do, or supply a needed capability. Do not have both independently regenerate the same output. Start bounded website delegations with `maxRounds: 2` (one build and one correction), then inspect the cause before allocating more attempts. The code does not silently overwrite existing user routing or limits. The two-round allowance is a proposed working default, not an empirically optimal setting.

Do not add another manager around Paddock's task loop or run an outer REVIEW after the inner review. Project updates should record verified milestones. Save requested deliverables; keep logs and routine verification evidence in the project. Local extraction and draft checks do not need separate Task and Result entries.

## Pilot and acceptance criteria

Before another whole-site comparison, check that the configured local endpoint and browser runner work. Test representative sections from the bakery and Playtime briefs using identical facts, assets, tools and predeclared time/output limits. Compare a capable solo lead with the revised lead-plus-local workflow. Repeat the pair before drawing a broad conclusion; choose the overall spending allowance before starting paid runs.

Record uncached input, cached input, output including reasoning, compactions, elapsed time, failed requests and local adoption. Count cloud tokens spent checking or redoing local work. Retain unknown usage as unknown. Compare actual configured rates only where available; subscription token volume is not an invoice. Keep benchmark setup and independent judging separate but visible.

Acceptance requires the requested facts and interactions, no known copy-rule violations, correct encoding, and the same affected-page verification on all four platform profiles. Record real-device gaps. Have the owner compare compositions and the finished result separately from technical findings. Call it an improvement only if useful local output survives integration, total measured cost/time improves within the agreed tradeoff, and required quality plus owner preference are maintained. A single successful protocol test cannot establish these outcomes.

## Activation and validation

The new tools and role-aware callbacks need a source-app restart. The running owner's consoles were left intact. Bundled skill references were updated; already injected instructions in existing conversations remain their earlier versions. The server at the saved local endpoint was unreachable during this repair. This is a readiness limitation, not evidence against the model's quality. No live inference or savings claim is made.

Validation: `npm run build` passed. The Windows full unit run passed 713 tests with one existing skip; the subsequent affected-module run passed all 32 tests, including the four newly added copy checks. The final `npm run test:linux` passed its build, runtime preparation, 712 Linux unit tests (six platform skips), and all five headless desktop suites. Mocked tests cover local-only routing, unknown usage, failed/incomplete output, Unicode, deduplication, concurrency, input bounds, caller attribution, bridge validation, prompt roles and review-history retention. The first full regression run exposed a missing-round-history assumption introduced in this change; it was corrected and the affected tests plus final Linux run passed.

Raw logs stay under `.build/workflow-repair/` and are not Results deliverables. The desktop suite ran in Linux Docker with a virtual display; it does not establish native Windows/macOS or physical-phone behavior. This change affects backend tools, prompts and documentation; it makes no website visual change.
