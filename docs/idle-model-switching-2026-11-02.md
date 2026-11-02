# Idle model and effort switching

Implemented 2 November 2026 in the current checkout. Running PC and phone installations require updated builds; no active user console was restarted or switched during verification.

The phone's Model and effort sheet now sends a pinned request to the PC instead of typing slash commands or navigating terminal menus. The PC accepts changes only for idle local Claude Code and Codex owner consoles. It resumes the same saved conversation under the same account with the selected model and effort. The existing staged handoff checks the replacement's conversation identity and exact unsent native draft before retiring the original process. Failed replacement leaves the original console available. Phone composer text also stays intact.

The sheet warns before Apply: “Applying settings resumes this chat and reloads its saved conversation. The next message may process earlier messages again and use extra tokens.” Startup does not submit a user prompt. Selecting Agent default for effort uses the provider's configured default.

Model choices come from the selected account's native metadata: Codex app-server `model/list`, and Claude Code's restricted, nonpersistent `initialize` response. Claude effort levels come from each returned model. Apply refreshes and validates the catalog again. There is no arbitrary model entry or automatic API fallback. Catalog membership describes an offered choice; the provider still enforces inference entitlement. Discovery and tests send no paid inference request.

Requested settings are labelled “selected” until newer provider metadata reports the effective model and effort. The automatic “Usage reached …%” account-switch banner has been removed from the phone console. Manual account menus and account usage pages remain available. Older PC hosts cannot apply the new phone controls; the sheet explains that the PC needs updating.

Other providers, workers, remote consoles, active turns and attention states have no new switching adapter. Claude in WSL retains the existing draft-bridge limitation. The existing Codex identity check still uses its local `/status` command; incompatible output fails the handoff. This change removes model-menu automation rather than guaranteeing compatibility with every future CLI version.

## Verification

- Production desktop build passed.
- Final Linux run: 842 unit tests passed, 6 skipped; all headless desktop checks passed. Log: `.build/idle-model-linux-final.log`.
- Final Windows full run: 846 passed, 1 skipped, 1 failure in the unchanged task-loop test “integration findings use the remaining rounds with the main implementer.” That test passed immediately when run alone. An earlier Windows full run passed. The task-loop code was left unchanged.
- Focused native handoff/mobile transport/model discovery tests: 83 passed before the final idle-state guard. The final Linux suite includes that guard and the new tests.
- Flutter analysis clean; full Flutter suite: 349 passed. Focused phone control/visual tests also passed after the screenshot fixture changes.
- Android debug APK built at `mobile/build/app/outputs/flutter-apk/app-debug.apk`. This is a local verification build, not a published release.
- Keyboard checks exercise Tab, Shift+Tab, Enter, Space and Escape around the affected controls. Busy, failed, stale-launch, unsupported-host, pending-choice and duplicate-Apply cases are covered.
- Screenshots inspected: `verification/idle-model-switching/android.png` (393×852), `iphone.png` (390×844, Flutter iOS target profile), and `narrow-large-text.png` (320×900, 150% text). These are Windows Flutter test renders with loaded Roboto and Material Icons, not physical Android/iPhone or Safari checks. No website or desktop layout was changed. Actual device model switching and native typography remain unverified.

The local Strata file task could not start because Paddock already had an unrelated task running for this repository. Its assigned files were left alone. Local assistance supplied a selection-normalization component and bounded review. The component was integrated with corrections; the final local review's two findings were rejected after checking the actual validation call and internal argument flow. No token-savings claim is made. Unrelated terminal viewport work and existing untracked files were preserved.
