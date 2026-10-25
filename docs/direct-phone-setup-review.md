# Direct phone setup review

Reviewed 17 October 2026. Scope: desktop Phone setup, Android pairing/help errors and the setup guide. Source changes follow `v0.6.0-preview.1`; no new installer or APK was published for this wording update.

Setup now leads with the existing direct local-network connection. It no longer tells every user to install Tailscale. Remote access guidance sits under **Away from home**, with a keyboard-operable disclosure and spaced controls on narrow screens. Error messages refer to the unavailable network/address. Existing TLS, pairing, permissions, credentials and VPN compatibility are unchanged. The proposed internet relay is documented separately in [remote-access-proposal.md](remote-access-proposal.md); it is not implemented or deployed.

## Verification

- `npm run build`: passed.
- `npm test`: 89 passed, one WSL-dependent skip, zero failures.
- `npm run test:desktop`: all four suites passed.
- `flutter analyze`: no issues. `flutter test`: all five tests passed, including narrow pairing layout, error draft retention and rejected pairing data.
- `node scripts/mobile-visual-check.cjs`: passed Windows Chromium, desktop WebKit/Safari, Pixel 7 Chrome and iPhone 13 WebKit/Safari profiles. Inspected the connection and expanded remote-help screenshots from all four profiles. Text wraps, controls retain spacing, the disclosure has visible keyboard focus, and long dialogs scroll. Enter opens/closes the disclosure; Tab/Escape and selected axe contrast/name/label checks pass. No page errors or horizontal overflow.

Mac and phone browser checks are emulated on Windows. They do not establish actual macOS/iOS font rendering or physical-device behavior. The Android copy passed Flutter's widget checks; a new APK/native-device visual run was not performed for this copy-only change. Real-phone pairing and live Firebase delivery remain pending as recorded in [android-review.md](android-review.md).

Evidence: `artifacts/mobile-views` and individual screenshots in Paddock Results. No real account, paid request, user console or live mobile configuration was changed in verification.

## Required page review

All twenty items apply to the affected screens as recorded below. This is a scoped review, not legal or accessibility certification.

| Item | Status and reason |
| --- | --- |
| 1. Privacy | Checked: no new collection or transfer; existing [data-use notes](android-setup.md#data-use-and-privacy) remain linked. |
| 2. Terms | Not applicable: no new service or account. |
| 3. Refunds | Not applicable: no sale. |
| 4. Cookies/storage | Checked: no new storage or tracking. |
| 5. Consent banner | Not applicable: no new nonessential tracking. |
| 6. Form consent | Checked: connection remains an explicit Enable action; no new consent collection. |
| 7. Unnecessary data | Checked: no fields, logs or credentials added. |
| 8. Third-party SDKs | Checked: no new dependency or SDK. |
| 9. Dark patterns | Checked: local use no longer implies a VPN installation/account; disable/remove behavior is unchanged. |
| 10. Hidden fees | Checked: current local use needs no relay fee. Proposed hosting costs are clearly estimates in a separate proposal. |
| 11. Fake reviews | Not applicable: no testimonials or reviews added. |
| 12. Claims | Checked: distinguishes current LAN/VPN access from unimplemented internet relay support. |
| 13. Alt text | Checked: no new image; existing named controls retained. |
| 14. Contrast | Checked: selected axe checks pass in all four profiles; disclosure uses a native open state and focus outline. |
| 15. Keyboard | Checked: Enter toggles the native disclosure, focus stays visible, Tab stays in the dialog, Escape closes it. |
| 16. Business details | Not applicable: no new business or operator service. |
| 17. Children's data | Not applicable: no child-directed collection. |
| 18. Unsubscribe | Not applicable: no email. |
| 19. Asset licenses | Checked: existing styles/icons; no new font or image asset. |
| 20. Data deletion | Checked: no new stored data; existing device removal and local-data behavior is retained. |
