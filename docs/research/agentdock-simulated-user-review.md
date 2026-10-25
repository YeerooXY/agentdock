# Paddock simulated-user review

22 October 2026. Development build on `main`, base commit `88409424c563967eed4c2749e9385f04fe46d64c`; existing uncommitted work included. Research and test files were added for this review. Application behavior was left unchanged.

Paddock has a coherent job: keep several agent consoles organized by project and let someone check and continue their work from an Android phone. The clearest initial audience hypothesis is people who already use coding-agent CLIs. A person new to those tools faces several decisions before seeing a useful conversation.

The recommended first improvement batch is a clearer first conversation, a quick path for an existing folder, a visible phone reply action, and a useful destination for every completed prompt. These recommendations concern completing the main task. Demand for them still needs real-user evidence.

## Method and evidence

This is one AI evaluator's script-assisted cognitive walkthrough using four hypothetical user perspectives. There were **zero recruited participants**. The perspectives are reusable test scenarios, not validated customer personas. The evaluator already knows the app and used selectors and the right-click gesture to navigate it. Completion content was synthetic. No customer quotes, adoption forecasts, willingness-to-pay claims or participant success rates were generated.

The approach uses simulation to identify hypotheses and prepare a human study. [NN/G's guidance on synthetic users](https://www.nngroup.com/articles/synthetic-users/) distinguishes those uses from evidence about actual people. Source checked 22 October 2026. This review did not run the UXAgent service or an independent panel of agents.

| Evidence | Coverage and boundary |
| --- | --- |
| [Desktop walkthrough](../../artifacts/simulated-users/walkthrough.json) | 16 recorded UI states in real Electron with a disposable profile; two local PowerShell consoles, project creation, invalid-folder recovery, Settings, saved Results and an empty completion. Provider login and a first AI response were not exercised. |
| [Browser profiles](../../artifacts/simulated-users/profiles.json) | Six rendered states each on Windows Chromium, emulated Mac Safari/WebKit, Pixel 7 Chromium and iPhone 13 WebKit: first use, new project, Usage, Keys, phone setup and Results. Replay data isolates layout from network/backend actions. These are 24 captures, not 24 user sessions. |
| [Earlier native verification](../settings-space-permissions-review.md) | Reused evidence from 22 October for manual Terminal keys, synthetic folder/tool prompts and stale-target rejection in an Android emulator. No new native-phone session was run for this study. |
| [Scenario definitions](simulated-user-scenarios.json) | Assumptions, tasks, checkpoints and nonleading questions for repeating the review and preparing real-user sessions. |

Windows Chromium and Electron ran on Windows. Mac, Android browser and iPhone checks were emulated on Windows. Actual macOS/iOS font rendering, physical-device behavior, provider-specific startup prompts and an internet/router connection remain unverified here. Reading the source supplements the phone evidence; it does not establish that a new phone user will discover the controls.

The Vite build passed with its existing chunk-size warning. Recorded states had no page errors; browser captures had no document-level horizontal overflow. Visual inspection covered all four profiles, including labels, icon alignment, wrapping, spacing and focus outlines. Long dialogs require vertical scrolling. Eight key source files have matching start/end hashes in the walkthrough record. The test app and its two shells were closed afterward. The installed app and live consoles were untouched; no paid AI request or agent installation was made.

## Four perspectives

| Hypothetical user | Job they came to do | Observed friction | Likely request to validate |
| --- | --- | --- | --- |
| First-time coding-agent user | Get help with something in an existing folder | First use presents 14 agent choices, an optional launch checkbox and an empty nine-panel grid after setup. General welcome copy gives little explanation of the purpose. | Explain the account/software requirements and guide one first conversation with a visible launch action. |
| Existing CLI user with several projects | Organize current work and find the correct completed result | Two named consoles work in one folder. One-time options use right-click. Saving an existing folder as a project automatically opens a four-stage planning flow. | Attach an existing folder quickly; expose launch options; keep console identity and previous outcomes easy to find. |
| PC user continuing from Android | Read an answer, reply and answer a permission prompt | PC setup explains same-Wi-Fi and the need to keep Paddock running. The collapsed native console exposes chat through a thin handle with a semantic label but no visible word. | A visible Message/Reply action, obvious active PC/chat, and clear recovery when the connection stops. |
| User checking privacy and costs | Understand account access, optional API requests and phone access | Keys clearly describes local encryption. Usage leads with API totals while provider-account data is unknown. API templates appear even with no keys saved. | Distinguish provider-account usage from optional API spending and show whether an API connection is ready. |

These are predicted needs, inferred from the tasks and observed interface. The owner's earlier feedback is useful context from one person; it is not four independent sources of customer research.

## Prioritized findings

Priority means recommended order for a future change, not measured frequency or a commitment to implement it. Observed behavior has direct evidence; predicted effects require human validation.

### SU-01 — Make the first useful conversation explicit

**Priority 1. Observed:** `src/first-run.js` says “Make yourself at home.” and “Your folder. Your agents. Ready to go.” The fresh profile shows 14 agent choices. The launch checkbox is unchecked. Completing setup with a valid folder opens nine empty panels; the New console text is primarily revealed on hover. Clicking a plus launches the selected shell successfully. Invalid-folder errors preserve the entered path. Default agent permissions were `default` in this run.

**Hypothesis:** Someone familiar with chat apps may not understand why they need an installed agent, which account to use, or why setup ends without a conversation. More experienced CLI users may understand these steps immediately.

**Recommendation:** State the purpose plainly, show the installed/available state of the selected agent, explain the selected sign-in route, and offer an explicit **Open first console** action. Keep the consequence of starting a CLI visible. A proposed heading is **Set up Paddock**, followed by **Open agent consoles in your project folders and check them from your phone.** Keep first-run helper text readable at normal size; the larger Settings typography does not cover this screen.

**Completion check:** From a fresh profile, a person can explain what will open, identify the required account/software and reach the first prompt without help. Validate the real provider sign-in path separately. [First-use capture](../../artifacts/simulated-users/01-first-use.png), [empty grid](../../artifacts/simulated-users/03-empty-console-grid.png).

### SU-02 — Give existing folders a quick project path

**Priority 1. Observed:** New project asks for goals, audience, success criteria and milestones alongside the folder. Its action is **Save planning draft**. Saving the test's existing Website folder automatically opens Project brief, followed by Similar apps & niche, Infrastructure and Roadmap. An **Open console** action remains available after closing the dialog; this is an added planning detour, not proof that console launch is blocked.

**Hypothesis:** A person bringing a working repository may expect project organization to take a name and folder. Planning questions may make Paddock feel like a separate project-management commitment.

**Recommendation:** Offer **Open existing folder** and **Plan a new project** paths. Preserve the existing planning workflow for people who choose it. Give one-time console options a visible button in addition to the current right-click route.

**Completion check:** Attach a working repository and open its console without a planning discussion; deliberately enter planning and confirm its approvals still work. Verify that someone can discover launch options without being told the gesture. [New project](../../artifacts/simulated-users/06-new-project.png), [automatic plan](../../artifacts/simulated-users/08-project-planning.png), [two named consoles](../../artifacts/simulated-users/05b-two-consoles.png).

### SU-03 — Put a visible reply action on the phone console

**Priority 1. Observed, narrower coverage:** In `mobile/lib/main.dart`, the collapsed console's `enter-chat` control is a 40px tap region with a 96×4px gradient handle. It has an accessibility label, **Enter chat mode**, but no visible text. Terminal keys is separately visible, and the earlier native review verifies its explicit manual input and stale-target protection.

**Hypothesis:** Someone can find how to press a terminal key yet overlook how to send a normal message. A semantic label helps a screen reader; a sighted new user still needs a discoverable action.

**Recommendation:** Label the entry **Message** or **Reply** and preserve the current console identity, model/effort choices and manual Terminal keys behavior. Keep the PC-awake requirement visible during connection setup. Same-Wi-Fi setup already explains that it needs no router rule; do not treat port forwarding as a prerequisite for local use.

**Completion check:** Hand someone an already paired phone on a collapsed console and ask them to reply, without naming a gesture. Exercise a folder prompt, cancellation and a lost connection on a physical phone. [Native evidence and limits](../settings-space-permissions-review.md#mobile-permission-prompts).

### SU-04 — Give every finished prompt a useful destination

**Priority 1. Observed:** A saved report appears under the Website console and opens correctly. A separate fixture completion with no saved artifact opens Results with **No results were saved for this prompt.** The previous report remains; the result count stays one. This fixture generated no actual AI answer, so it does not demonstrate that an answer was lost.

**Hypothesis:** A user receiving a completion alert expects the completed answer or a clear way to reach it, including work that produces only text. The empty message explains the artifact state but supplies little outcome context.

**Recommendation:** Keep exact prompt/chat attribution and provide a readable completion outcome or a pinned route to that prompt's answer. Show an honest unavailable state when the answer cannot be recovered. Preserve the notification routing fix and avoid taking someone to unrelated terminal output.

**Completion check:** Complete a file-producing prompt and a text-only prompt, then another prompt in the same console. Open each earlier notification and find the corresponding outcome. Repeat after a result is deleted. [Saved result](../../artifacts/simulated-users/13-completed-results.png), [no saved result](../../artifacts/simulated-users/15-no-saved-result.png).

### SU-05 — Clarify account usage and optional API readiness

**Priority 2. Observed:** Usage begins with API requests/tokens/estimated cost. Lower Codex and Claude cards report no account usage yet. The existing labels already limit cost estimates to requests through Paddock and say they are not invoices. API Settings lists OpenAI and Anthropic templates while Keys contains zero entries. Keys correctly describes encryption on the Windows computer and use through configured connections.

**Hypothesis:** Someone signing in through a CLI may confuse the empty API ledger with their subscription usage, or read a template entry as an established connection. This is a clarity concern, not evidence of an incorrect bill.

**Recommendation:** Separate provider-account usage and optional API spending visibly. Use an explicit **Key needed** or **Not configured** state for templates, based on actual readiness. Link each missing state to the relevant setup action.

**Completion check:** Without help, a CLI account user can explain which figures concern their account, which actions make API requests, and whether each listed connection can be used. [Usage](../../artifacts/simulated-users/10-account-usage.png), [API templates](../../artifacts/simulated-users/11-api-settings.png), [Keys](../../artifacts/simulated-users/12-key-storage.png).

### SU-06 — Correct the shared drag handle's ARIA

**Priority 2; confirmed automated finding.** Axe reports `aria-prohibited-attr`, impact serious, for `.window-drag-handle`: `aria-label` is on a generic `div` without a role that permits naming. The markup is in `src/app.js`. It repeats on Usage, Keys and Results across all profiles: one shared defect, not twelve independent defects. The modal captures did not report it.

Remove the unsupported name from the nonsemantic drag region or implement an appropriate semantic control with its full keyboard behavior. Adding a button role alone is insufficient. Retain accessible window controls and verify keyboard alternatives. Rerun the profile audit and manually check window controls and focus. [Raw axe output](../../artifacts/simulated-users/profiles.json). The [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) informed this review, checked 22 October 2026; an automated scan does not establish full accessibility compliance.

## What already supports the main job

Two live consoles can use the same folder and retain different names. Folder validation retains the person's input. Results supplies console identity, a readable report title and a working preview. Keys explains the local protection boundary. Phone setup exposes local versus internet connection choices and the running-PC requirement. The previous native work gives permission prompts manual controls without automatic approval or replay. Preserve these behaviors while simplifying entry to them.

The strongest next product claim to test is **Organize your existing agent work and continue it from your phone.** Existing CLI users have a concrete task to compare with their present terminal setup. The broader noncoder audience remains a separate hypothesis. The brief's download target measures distribution; successful first conversations, unassisted return to the correct work and voluntary reuse would answer the usability question more directly.

## Real-user pilot prepared by this review

Recruit separately from people who know CLI agents and people who only know chat apps. Include a person who wants phone continuation. Obtain permission before recording; use a sample folder and synthetic prompt rather than credentials or private project material. Do not imply that this simulated review established those segments.

Give tasks in this order, withholding names of the controls being tested:

1. Explain what you think this app helps you do, then begin work in the supplied folder. Show where you would check the account requirements.
2. Open a second piece of work and return to the first. Explain which folder and agent each uses.
3. Save the existing folder so you can find it again. Observe whether planning is expected or helpful.
4. On a paired phone, read the current output and reply. Answer a sample folder prompt; then recover from a deliberately stopped test connection.
5. Find the outcome of an earlier completed prompt after another finishes. Include both a saved report and a text-only answer.
6. Explain the account-usage and API-cost displays and show where you would remove phone access.

Record task completion, wrong turns, assistance, interpretation of labels and the person's actual words. Ask what they use today and which repeated task Paddock would replace. Record individual observations without turning a small pilot into demand percentages. A hypothesis weakens when people complete the task unassisted, understand the current flow, or prefer a different solution. Repeat the same tasks after a proposed change.

## Page review record

All 20 items below apply to the reviewed first-use, project, phone-setup, Usage, Keys and Results views. This task added no shipped data flow or policy. Unchanged retention, SDK and distribution questions remain in the [earlier page review](../settings-results-controls-review.md#page-review) and [phone privacy guide](../android-setup.md#data-use-and-privacy). “Checked” is limited to the evidence stated here.

| Item | Status | Evidence or reason |
| --- | --- | --- |
| 1. Privacy policy | Needs work for distribution | Existing guide describes local and paired-phone data. Owner/jurisdiction details and physical-device data-flow verification remain open in the earlier review. No policy facts were invented. |
| 2. Terms | Not applicable to this study | No hosted service contract or purchase was introduced. Provider account terms remain external. |
| 3. Refund policy | Not applicable | Reviewed screens sell nothing. |
| 4. Cookie/storage policy | Checked within scope | Disposable local profiles and synthetic Results were used. No tracking/storage feature was added. Existing persistent-storage documentation is linked above. |
| 5. Cookie consent | Not applicable to study | No new analytics, ads or nonessential browser storage. The browser replay blocked external HTTPS requests; that does not audit native SDK traffic. |
| 6. Form consent | Checked within exercised flows | Setup and project saves require explicit submission. Invalid input is retained. Phone access was not enabled, and no real key was entered. |
| 7. Unnecessary data | Checked for evidence collection | No credentials or real conversation contents were collected. Host-local folder paths, PC name and private network addresses can appear in raw development captures; use synthetic data for external sharing. |
| 8. Third-party SDKs | Needs work for distribution | Existing Firebase/ML Kit and other dependency review remains open. No SDK was added; physical-device network behavior was not tested here. |
| 9. Dark patterns | Needs work | Optional launch and phone setup remain explicit. SU-02 records the automatic planning detour and recommends a direct existing-folder path. |
| 10. Hidden fees | Checked for displayed wording; comprehension needs work | Usage labels API estimates and their boundary. SU-05 addresses the account/API distinction. No purchase or paid model call was exercised. |
| 11. Fake reviews | Not applicable | No testimonials. Hypothetical perspectives and fixture reports are identified explicitly. |
| 12. Unsupported claims | Checked | Simulation, observations, predictions, emulation and untested paths are distinguished. No customer counts, certification or product-market-fit claim. |
| 13. Accessible names/alt text | Needs work | One shared prohibited ARIA label, SU-06. No missing image alternative was reported in the captured axe scope; that is not a full screen-reader assessment. |
| 14. Color contrast | Checked in captured states | WCAG-tagged axe scan reported no contrast violation in these states. Focus outlines were inspected. Full native/disabled/hover/zoom coverage was not repeated in this study. |
| 15. Keyboard navigation | Needs work to complete assessment | Programmatic typing and Escape were exercised; visible focus was inspected. A full unassisted keyboard-only task, window move alternative and screen-reader checks remain. |
| 16. Business details | Needs work before distribution decisions | Commercial identity/contact obligations remain unresolved in the earlier review. This study adds no sales flow. |
| 17. Children's data | Not applicable to studied task | Development-console scenarios add no child-directed flow or age collection. Audience policy was not established by simulation. |
| 18. Email unsubscribe | Not applicable | No email or marketing message was sent or added. |
| 19. Font/image licenses | Needs work for distribution | No shipped assets were added. Existing provider icons and complete distribution license inventory remain unverified, as recorded earlier. |
| 20. Deletion requests | Checked by documentation within scope | Existing guide and earlier review describe local Results/key/phone removal and external provider boundaries. This study cleaned up its own profile; it did not repeat every deletion path. |

## Repeat the collection

From the repository root:

```powershell
npm run build
node scripts/simulated-user-review.cjs
node scripts/simulated-user-profiles.cjs
```

The first script creates and cleans a disposable Electron profile under `test-data`; it launches local PowerShell only and uses its own test bridge for synthetic completion data. The second replays the renderer with those fixtures through a loopback server. Screenshots and JSON are written under `artifacts/simulated-users`. A successful script exit means evidence collection completed; consult `profiles.json` for audit failures. Interpretations in this report are an evaluator's judgment, not outputs of an autonomous persona-testing product.

Open Results for this report, selected screenshots, raw test records and the reusable scenarios. The recommendations await a product decision and real-user validation; no application fix or milestone approval is claimed by this study.
