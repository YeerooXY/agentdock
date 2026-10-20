# Mobile controls and SSH verification

20 October 2026. Preview 15, developed on `main` from `aeb1c1a`.

## Delivered

- Wrapped terminal text preserves parsed colors, emphasis, Unicode and soft/hard line breaks. Copy remains plain text.
- Provider marks and colored names sit beside the chat title. Claude has a coral initial badge; it is not presented as an official logo.
- Draft text, caret, composer scroll and terminal reading positions stay with the PC/console identity.
- New consoles offer saved projects/folders, trusted Linux hosts, installed agents and current local Codex model choices. Model/effort/completion controls display the installed CLI's own menu.
- Android's system image picker uploads only the selected image and adds its path to the draft. Screenshot detection offers the picker on supported Android versions.
- Optional direct background alerts use the existing pinned connection, an Android foreground service and an ongoing notification. Firebase setup is unnecessary for this mode.
- Linux SSH profiles require explicit host-key verification. tmux preserves the remote process across SSH/Dock disconnects. Phone control uses the same PC connection.
- Download links and setup guides describe preview 15 and its compatibility limits.

## Automated and integration checks

- Flutter: **112 tests passed**; analyzer **no issues**. Includes rich text, preserved long-draft scroll/caret, large-text controls, project/agent selection, command targets after reconnect, attachment bounds and notification deduplication independent of device clocks.
- Host: **156 passed, 1 skipped, 0 failed**. Includes pairing authorization, revoked input, saved project/folder validation, fresh model allow-lists, trusted SSH choices, selected-console attachment uploads, image bounds/order, linked-folder refusal and revoked upload authorization.
- The actual installed Codex app-server returned **6 current model choices** through `model/list`. No model inference request was made.
- Real Linux integration: Windows OpenSSH connected to a disposable Alpine Linux SSH/tmux container on loopback through WSL. The scanned fingerprint matched the container console. A shell variable survived disconnect/reconnect. A substituted host key was rejected. Explicit Close removed the exact session, and closing it again succeeded. Ephemeral keys/container were removed.
- No paid AI request, production router change, user VM installation or restart of the running PC Dock was used for verification.

Desktop build, installer packaging, desktop smoke checks and packaged-app smoke checks passed. The packaged test exercised setup, a real terminal, bundled Node/Meshy tools, the MCP bridge, completion callbacks and restart/restore in an isolated profile.

Android release APKs built for ARM64, ARMv7 and x86_64. ARM64/ARMv7 signatures retain certificate SHA256 `eb163cfe175f13fa76a034b2edacb313b5ed38a10ad7ac11cf9056b1bc91d0d0`. Installing the x86_64 release over the existing emulator app preserved the paired PC and unsent image draft.

## Android emulator checks

Android 15 x86_64, with a loopback TLS server and synthetic terminal. This is separate from the user's phone and PC sessions.

- A 180-column terminal wrapped at readable size with colors; PC dimensions stayed **180×32**.
- Model controls sent `/model`, a separate Enter, Down and Choose. Opening/closing their UI preserved the message draft.
- Project/folder, Claude and saved Linux-host choices were inspected. Large system text retained readable wrapping and reachable controls.
- Notification permission was exercised. Direct mode kept one authenticated socket, paused terminal streaming in the background, received a completion notification without Firebase, and reopened Dock when tapped. **Stop alerts** disabled direct mode. No second terminal connection was created.
- The native photo picker selected a synthetic screenshot. One file was saved in the fixture project's attachment folder and its path appeared in the draft. No additional terminal input was sent.
- Reinstalling over the existing emulator app retained its saved PC. Updating the phone leaves the PC's consoles running.

Screenshots are individual files under `artifacts/mobile-controls/`, including `mobile-colored-wrap`, `mobile-live-model`, `mobile-project-chooser`, `mobile-ssh-chooser`, `mobile-large-text`, `mobile-image-draft` and `mobile-ready-notification`.

## Browser checks

SSH setup and the console chooser were checked in Windows Chromium, desktop WebKit, Pixel 7 Chromium and iPhone 13 WebKit profiles. All four screenshot sets were inspected for text wrapping, field/icon alignment, spacing, overflow, focus and dialog controls.

Checks cover explicit fingerprint confirmation, refusal before confirmation, preserving a scan when its confirmation is checked, saved host/agent selection, Escape, labels and targeted contrast rules. Dialog contents scroll at narrow heights. Screenshots and the structured record are in `artifacts/ssh/`.

Mac, Android-browser and iPhone coverage is **emulated on Windows**. It does not establish physical Safari font rendering, native iPhone support, real TalkBack/VoiceOver operation or physical-phone behavior.

## Limits and remaining checks

- Physical Android hardware-button screenshot detection still needs a device check. ADB screenshots do not trigger Android's screenshot callback and are not evidence for that feature.
- Real-device Doze, vendor battery management, extended mobile-data use and VPN routing need field checks. A foreground service does not guarantee instant delivery or survival after force-stop/reboot. Reopen Dock to reconnect.
- The user has not created a VM yet. Its address, SSH credentials, installed agent and subscription login still need setup. The Linux transport itself was tested.
- VM file browsing, image uploads, shared MCP forwarding, automatic Results/usage capture and completion hooks are outside this first SSH increment. Remote consoles display **open** instead of guessing readiness. tmux does not survive a VM reboot.
- Automatic remote checks and Close use SSH-key authentication. An unreachable host can leave a saved console needing reconnect before it can be ended.
- Updated PC features require Windows preview 15. The new Android reading/typing UI works with older hosts; direct-alert fallback on older hosts can miss completions during a disconnect.
- Existing build notices include the large desktop bundle and Firebase plugin Kotlin migration warning. No new dependency was added.
- Separate repository follow-ups: no top-level project LICENSE was found; choose an explicit license before presenting the project as licensed FOSS. The API response view in `src/app.js` still uses the decorative label “IN PROGRESS”; it was recorded for later wording cleanup.

## Required page review

Applies to the changed mobile console, live-control and creation sheets, image-picker flow, notification settings, pairing disclosure, update controls, desktop SSH settings and console chooser. This is a scoped review, not legal or accessibility certification.

| Item | Result |
| --- | --- |
| 1. Privacy information | Checked: Android and SSH guides describe local drafts, selected image uploads, attachment retention, device credentials, host metadata, OS notifications and optional Firebase. This app does not add an author-hosted data service. |
| 2. Terms | Needs work: no top-level project license was found. No new hosted-service terms or sales flow is introduced; an owner must choose the intended FOSS license. |
| 3. Refund policy | Not applicable: these screens do not sell anything or take payments. |
| 4. Storage disclosure | Checked: encrypted draft/view state, paired-device data, host profiles, attachment copies and their deletion routes are described. |
| 5. Cookie consent | Not applicable to these local/native flows: no marketing cookies or new trackers. Existing optional SDK disclosures remain. |
| 6. Form consent | Checked: direct alerts require a user switch and OS permission; image selection is explicit; SSH trust requires a separate fingerprint confirmation. |
| 7. Data minimization | Checked: no remote private-key copies, no automatic screenshot reading, no background terminal streaming, bounded image/metadata storage. |
| 8. Third-party SDKs | Checked: no new SDK. Existing Flutter, xterm, QR/ML Kit and optional Firebase remain. Images use the Android system picker; SSH uses local OpenSSH/tmux. |
| 9. Dark patterns | Checked: alerts are optional and stoppable; denied permissions have a recovery path; no automatic paid request or image submission. |
| 10. Fees | Checked: no Dock relay fee or mandatory cloud account. Battery/data and each user's provider costs remain distinct from app pricing. |
| 11. Reviews | Not applicable: no testimonials or customer review claims. |
| 12. Claims | Checked: mocks are labelled synthetic; real Linux transport is distinguished from the user's uncreated VM. Real-device and remote-hook limits are stated. |
| 13. Image/control labels | Checked: provider names accompany marks; controls have labels/tooltips, and shared decorative marks do not replace names. New arrow controls have direction semantics. |
| 14. Contrast | Checked for affected desktop dialog text/controls with targeted axe rules; native screenshots inspected. Arbitrary agent terminal colors and every platform state are not certified. |
| 15. Keyboard/navigation | Checked: dialog focus, Escape, native input separation, touch selection, scrolling and stale-target guards. Full physical-device assistive-technology review remains. |
| 16. Business details | Not applicable: no seller, checkout or new public business page. Repository issue links remain the support route. |
| 17. Children's data | Not applicable to this change: no age field, child-targeted service or new collection of children's data. |
| 18. Email unsubscribe | Not applicable: these features send no email. Direct alerts can be stopped in settings or their ongoing notification. |
| 19. Asset licenses | Checked: no new external font/image asset. Existing provider asset records remain; Claude uses a text badge. Project licensing is separately unresolved under item 2. |
| 20. Deletion | Checked: forgetting a PC removes its drafts/view state; PC device removal revokes access; removing a host deletes its saved record/known-host file; attachment copies can be removed from their documented project folder. No author-held account is created. |

References consulted: [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/), [Android foreground services](https://developer.android.com/develop/background-work/services/fgs/service-types), [screenshot detection](https://developer.android.com/about/versions/14/features/screenshot-detection), [photo picker](https://developer.android.com/training/data-storage/shared/photo-picker), [OpenSSH](https://man.openbsd.org/ssh_config), [Claude model controls](https://code.claude.com/docs/en/model-config), [Codex app-server](https://developers.openai.com/codex/app-server).
