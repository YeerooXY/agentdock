# Appearance v2 and Tailscale: verification, 24 October 2026

## Changes

- **One theme for the whole window.** Paddock, Hot pink, Blue, Violet, Void (new), Redline, Cyber, Arctic, Inferno, RGB and Plain. The theme colors the sidebar, buttons, toggles, focus rings, settings and consoles. The separate accent setting and the duplicate Pink option are gone; a saved RGB accent becomes the RGB theme. Each console can still use its own theme.
- **Lighting:** Static, Breathing, Wave, Spectrum cycle and Reactive, with Slow/Normal/Fast. Wave reads each frame's window position, so one wave crosses every console and the sidebar edge. All lighting animations start at the document time origin, so they stay in phase.
- **Sky:** a canvas per console with a five-step scale (Off to Galaxy), drift, twinkle and shooting stars. Arctic snows, Inferno shows embers, Cyber falling data, Redline speed streaks, RGB rainbow stars.
- **Openings:** procedural canvas effects, under 1.6 s, at most two flashes: Inferno fireball with sparks and smoke, Arctic spreading frost and shards, Blue lightning, Violet portal, Void collapse, Hot pink neon tube and glitter, Redline speed streaks, Cyber glyph rain and glitch, RGB shockwave and confetti, Paddock rings, Plain fade. Closing adds a short themed dissolve.
- **Settings** open as a layer over the app: categories on the left, one setting per row with 16 px text, a close button and Esc. Phones show the categories as a scrolling row.
- **Text size per console:** A− / A+ in each console header and in the full-screen toolbar, from −4 to +10 px. It applies to that console only and is remembered in this window. Narrow consoles hide the status label and slot number first so every control stays visible. Checked by `scripts/text-size-check.cjs`.
- **Android app:** the same themes, Void, lighting, star scale and openings. The theme colors the whole app. Fixed: an opening requested while its page was still sliding in never played.
- **Phone connection:** Same Wi-Fi or Anywhere · Tailscale. Direct internet through the router, UPnP mapping and Duck DNS updates are removed. Tailscale mode listens only on the PC's 100.x address, accepts only 100.64.0.0/10 peers, and its firewall rule allows only that range. Saved direct-internet setups fall back to Wi-Fi with a notice. The phone explains how to reach a Tailscale address.

## Image assets

The supervisor generated the continuous Blue replacement with the built-in image generator on 24 October 2026. The generated PNG is retained at `.build/codex-prompt-runs/2026-10-24/assets/blue-continuous.png`; optimized WebP copies ship at `src/textures/blue.webp` and `mobile/assets/textures/blue.webp`. The other ten source textures were inspected; none has Blue's hard side bands. The generated artwork is used as a texture, not as product UI evidence.

The later page-background extension and asset checks are recorded in [console-themes-review.md](console-themes-review.md#prompt-3-themed-backgrounds-and-tools-layout).

## Checks

| Check | Result |
| --- | --- |
| `npm run build` | Pass |
| `npm test` | 224 pass, 0 fail (new Tailscale, migration and firewall-scope tests) |
| `npm run test:desktop` | Pass (navigation helpers close the Settings layer first) |
| `flutter analyze` | No issues |
| `flutter test` | 147 pass |
| Android debug APK | Built (`mobile/build/app/outputs/flutter-apk/app-debug.apk`) |
| Desktop screenshots | Windows Chromium and Mac WebKit at 1440×900; Android Chrome (Pixel 7) and iPhone Safari (iPhone 13) profiles. No page errors or horizontal overflow. |
| Opening frames | All eleven desktop themes and all eleven phone themes captured mid-animation |

Screenshots: `artifacts/appearance-v2/`. Mac, Android and iPhone browser checks are emulated engine and device profiles.

## Not yet checked

- Physical Android phone: the new APK, lighting performance and openings on a real GPU.
- A real Tailscale connection between the PC and a phone, including the Windows Firewall rule on the Tailscale adapter.
- Real macOS and iOS font rendering.
- CPU use of Wave lighting with nine consoles open over a long session.
