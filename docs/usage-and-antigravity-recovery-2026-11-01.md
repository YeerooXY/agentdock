# Usage and Antigravity recovery

Implemented 1 November 2026. Requires a Paddock restart for the main-process changes.

## Usage

- Claude and Codex use their most restrictive shared quota for the main ring. A fully used weekly quota shows 0% and red/gray account styling even when the 5-hour window has 100% remaining. Exhausted model-specific pools do not disable other pools.
- Preserve exhausted styling until a fresh reading reports allowance. A passed reset time alone cannot manufacture capacity. Cached and unavailable readings retain their status.
- Remove the Current badge, fresh-reading timestamps, provider source footers and redundant default-account labels. Preserve custom labels, plans and the selector for multiple accounts. Quota labels are 15px, reset labels and action text 14px; controls have larger hit areas.
- Hidden accounts has a visible header control. Restoring works even if discovery temporarily omits that account. Hide/show changes account visibility without ending any console.
- Restored `antigravity:default` in the user's saved visibility preferences, preserving other hidden accounts. The previous settings file is backed up beside it as `settings.json.usage-visibility-20261101.bak`. Restart loads the change; the running app can also restore it through Add subscription.

## Antigravity

Persist exact conversation UUIDs in the encrypted workspace save and launch restored consoles with `--conversation <UUID>`. Separate chats in the same folder retain separate identities. New consoles start fresh.

Install the managed `paddock-conversation` hook in Antigravity's `~/.gemini/config/hooks.json` on launch. SessionStart and PreInvocation invoke the local metadata helper. It records the UUID for the matching Paddock session/launch and never stores prompts or transcript contents. User hooks are preserved and backed up; disabled managed hooks remain disabled. Hooks are inert outside Paddock Antigravity launches, including quota probes.

For older saves without IDs, recover from `last_conversations.json` only when one saved Antigravity console uses that exact workspace and the UUID's local database exists. Multiple unidentified consoles in one workspace remain ambiguous; use Antigravity's `/resume` picker rather than guessing a shared latest thread.

Provider references: [resume command](https://antigravity.google/docs/cli/commands/resume/), [hooks](https://antigravity.google/docs/hooks/). Installed CLI tested: 1.4.12.

## Verification

- Focused restoration, hooks, quota and CLI setup tests: 36 passed. Covers exact-thread persistence, concurrent chats, legacy recovery ambiguity, cache validation, hook configuration preservation, real helper invocation with synthetic input, no prompt retention, and restrictive quota selection.
- Windows unit suite: 741 passed, one platform-specific skip. Build passed. Guidance/context tests after the final wording update: 11 passed.
- Linux Docker unit suite: 736 passed, six platform-specific skips. Headless desktop suite passed, including quit/reopen restoration, console preservation and Tasks.
- `scripts/usage-recovery-check.cjs` and existing `scripts/usage-subscriptions-check.cjs` passed on Windows-hosted Chromium desktop, WebKit desktop Safari profile, Chromium Pixel 7 profile and WebKit iPhone 13 profile. Inspected screenshots for quota and restoration states; checked contrast, names, labels, overflow, readability, hide/show and fresh/cached reset transitions.
- Browser profiles are emulated. Actual macOS/iOS fonts, physical touch and OS behavior remain real-device checks. Screenshots and logs: `artifacts/usage-recovery/`.
- Owned native Antigravity probe with an exact UUID displayed five matching saved-history fragments without a model prompt. Private messages were compared in memory and not retained in the probe output. No user console was stopped. Live hook execution on a new model invocation remains a next-use check; synthetic handler and launch integration tests passed. Probe record: `artifacts/antigravity-usage-20261101/resume-verification.json`.
- Installed the managed global hook and confirmed it in the native `/hooks` PreInvocation submenu, without a model request. This CLI lists PreInvocation but does not display SessionStart in that menu; PreInvocation supplies identity capture on the first and subsequent model invocations. Initial probe assertions inspected the event-type menu instead of its submenu; corrected navigation confirmed the configured handler. Evidence: `artifacts/antigravity-usage-20261101/hooks-verification.json`.

## Creative workflow follow-up

Read Antigravity's saved review, result `36b9b7aa-e98d-48d8-9443-d7ffb9419865`, and inspected the separate `portfolio-starter` source and supplied desktop screenshot. Its zinc palette, text hero, three About cards and repeated project cards match the user's complaint. Its verification records responsive and interaction checks but no comparison with a selected creative concept. That evidence does not establish the agent's full internal reasoning or tool history.

The compact startup instructions now explicitly name the creative step for a new direction. Worker guidance requires the selected concept or authorized unattended selection rule, preserves palette/artwork/composition, and compares a representative rendered section before expansion. Existing selections and small repairs reuse their scope. This is stronger instruction and review guidance, not a runtime filesystem lock or a guarantee that every external CLI follows instructions. No additional manager/reviewer loop was added.

The portfolio was inspected without edits. Its decorative uppercase role label in `src/components/Hero.tsx` was flagged to the user. The report's broader local-model onboarding proposals were not treated as approved implementation instructions.
