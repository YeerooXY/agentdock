# Copilot allowance display

The existing background Copilot reader successfully queried the signed-in native CLI through `ping` and `account.getQuota` in 840ms on 1 November 2026. No model prompt or user-session input was sent. The account returned Chat 97.5% remaining, Completions 100%, and a Premium interactions feature with zero entitlement and `hasQuota: false`.

The card was hidden by the saved `copilot:default` visibility preference. It can be shown immediately in the running app through Usage → Add subscription → GitHub Copilot → Refresh, or the new Hidden accounts control after restarting into the updated UI. No current user console was interrupted or replaced.

Corrected the allowance interpretation:

- Chat, Premium interactions and Completions are separate pools. An empty premium pool cannot exhaust usable Chat. The main Copilot ring prefers Chat when reported. This also applies to previously cached readings without pool metadata.
- Features explicitly reported as having zero entitlement and no quota are omitted rather than displayed as fully consumed. Real exhausted allowances remain visible.
- Honor the native `isUnlimitedEntitlement` flag as well as the older -1 entitlement representation.
- A reset timestamp already passed or within one minute of the check does not establish a reliable future reset. Leave the reset time unavailable instead of immediately marking a fresh response stale. The observed API returned timestamps around the time of checking; no monthly reset was invented.

Verification: focused subscription/quota suite passed 19 tests. The four-profile Usage test adds a hidden Copilot account using this response shape, verifies 97.5% on its ring, two separate feature rows, no false exhaustion/staleness, and visibility persistence. Inspected all four screenshots under `artifacts/usage-recovery/*-copilot.png`. Coverage is Windows-hosted Chromium, desktop WebKit/Safari profile, Pixel 7 Chromium profile and iPhone 13 WebKit profile; OS font rendering and physical-device behavior remain unverified. Build and full regression logs: `artifacts/usage-recovery/copilot-quota-*.log`.

Final checks passed: build; Windows unit suite 744 passed / one skipped; Linux Docker unit suite 739 passed / six skipped; headless desktop suite. The display corrections require a Paddock restart. Its existing Copilot reader and Add subscription control already work in the current running version.
