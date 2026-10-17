# Agent Dock on Android

Leave Dock running on your PC, then use your phone to work in the same consoles. The Android app shows one terminal at a time. You can switch consoles, start one with your saved defaults, view Results, and check usage.

This is an Android preview. iPhone support comes later. Live Firebase delivery and physical-phone testing are still pending; the terminal connection has been tested with an Android emulator and real Windows consoles. See [verification](android-review.md).

## Install and pair

1. Install the matching Windows and Android builds from the [0.6 preview release](https://github.com/YeerooXY/agentdock/releases/tag/v0.6.0-preview.1). Most phones use the **arm64** APK. Android 7 or later is required. The APK uses a development signing key; a future store build may require uninstalling this preview first.
2. Install [Tailscale](https://tailscale.com/download) on the PC and phone. Create **your own account** and sign in on both. Nobody needs the Agent Dock author's account. For use only on the same Wi-Fi, you can skip Tailscale.
3. On the PC, open **Settings → Android → Connect a phone**. First-time setup also offers **Connect my Android phone next**.
4. Select the PC's Tailscale address, usually starting with `100.`, and enable the connection. Use **Refresh addresses** if you just connected Tailscale. For same-Wi-Fi use, select the PC's local network address instead.
5. Open **Pair phone → Show QR code**. In Android, choose **Scan QR code**, or paste the code. The code expires after five minutes and works once. Treat it like a temporary password.
6. Keep the PC awake with Dock running. Closing Dock to its tray preserves the connection and consoles; choosing Quit stops them.

Current source builds keep the PC awake while an agent is marked Thinking or a Dock API request runs. You can switch this off in **Settings → Desktop**. The screen can still turn off, and normal sleep resumes when work finishes. For phone access while every console is idle, the PC still needs to remain awake. This setting was added after the 0.6 preview 1 installer.

Windows Firewall may need an inbound TCP rule for port **47831** on the selected private network. Allow only the network/address you intend to use. Do not forward this port on your router or expose it publicly. Tailscale device approval or access rules can also block the connection.

A paired phone can type commands using the console's existing permissions. This is access to your PC, so pair only devices you control. **Remove** beside a phone immediately revokes its token. **Turn off** stops mobile access without ending local consoles.

## Optional completion alerts

Terminal access works without Firebase. To get alerts while Android is in the background, use **your own Firebase project**. There is no Agent Dock cloud relay or shared billing account.

1. Open the [Firebase console](https://console.firebase.google.com/) and create a dedicated project. Google Analytics is not needed.
2. Add an Android app with package **`com.yeeroo.agentdock.mobile`**. Download its **`google-services.json`**. You do not need to rebuild the APK or add the Firebase SDK yourself.
3. In **Project settings → Cloud Messaging**, check that the Firebase Cloud Messaging HTTP v1 API is enabled.
4. In **Project settings → Service accounts**, generate and download a private key. Keep this project separate from other apps. Administrators can instead create a dedicated sender service account with the **Firebase Cloud Messaging API Admin** role and generate its JSON key. The key must belong to the same project as the Android configuration.
5. In Dock's **Phone setup → Alerts**, choose **Import Firebase files**. Pick `google-services.json`, then the service-account JSON. Dock checks the package and project, then encrypts the private key on this PC. Never paste that key into a chat or commit it to Git. You can delete the original download after importing it.
6. On Android, open **Usage → Enable alerts** and allow notifications. Then send a test alert. Google Play services and an internet connection are required.

The PC sends a generic “An agent needs your attention” alert through Google. It does not send terminal text, project names, code, or model API keys through FCM. Tapping a phone notification opens Dock; open the ready console from the switcher. Windows notification clicks open the related console, result, or review directly.

If a test fails, check the project match, Cloud Messaging permissions, Android notification permission, and Play services. Re-enable alerts after changing projects or reinstalling the app. Android force-stop and device power restrictions can prevent background delivery until you open the app again. Delivery is not guaranteed.

## Who pays?

The phone talks to **your PC** over your own connection. Agent Dock operates no relay and collects no cloud fee. Tailscale may route an encrypted connection through its relay when a direct path is unavailable; this is part of your Tailscale service, not an Agent Dock server. Its Personal plan is for personal, non-commercial use; check the plan appropriate to your use. [Tailscale pricing](https://tailscale.com/pricing), [connection types](https://tailscale.com/docs/reference/connection-types).

Firebase Cloud Messaging is currently a no-cost product. This setup does not deploy Cloud Run, Functions, a database, or storage. Google project limits and service terms still apply. Do not enable unrelated paid services just to configure alerts. Mobile carrier data and your chosen AI subscriptions/API calls remain your costs. [Firebase pricing](https://firebase.google.com/pricing), [FCM HTTP v1 setup](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Data use and privacy

- Only the selected terminal streams. Updates are compressed and batched, and reconnects request missing output or a bounded screen snapshot. Commands are never resent automatically after a disconnect.
- Switching away from Console stops terminal streaming. Backgrounding the app closes its private connection; FCM handles optional background alerts. There is no background terminal polling.
- Results downloads its list first. A picture or report loads when you open it; larger images need another tap. Markdown previews do not load remote images. Web links open in your browser only when tapped.
- **Data saver** is on by default. Usage shows compressed application bytes for the current app session, not TLS, VPN, Firebase, or carrier overhead. It is not a billing meter.
- The connection uses HTTPS/WSS with the PC certificate pinned during pairing. PC device tokens, certificate key, FCM tokens, and Firebase service-account credentials are encrypted with Windows safeStorage. The phone stores its pairing credential through Android Keystore-backed secure storage. There is no plaintext fallback for PC secrets.
- Google receives the Firebase installation/registration identifiers and generic alert metadata needed to deliver notifications. The public Firebase app configuration is stored on Android; the service-account private key stays on the PC. No Google Analytics SDK is enabled. Tailscale has its own account and network data practices. [Firebase privacy information](https://firebase.google.com/support/privacy).
- QR scanning uses Google ML Kit locally. Google states that scan images/results stay on the device, while the SDK sends performance and usage metrics and may request updates. Paste a code instead if you prefer not to use scanning. [ML Kit privacy information](https://developers.google.com/ml-kit/terms).
- Code, terminal output, selected Results, and account usage go directly from your PC to its paired phone. Terminal buffers and opened previews stay in app memory; reconnect credentials persist until forgotten. The phone app does not upload these to Agent Dock hosting.
- **Forget this PC** clears the phone's pairing data. Also **Remove** the phone on the PC, especially if it was offline when forgotten. Remove Firebase setup on the PC to erase its saved key/tokens; revoke the service-account key in Google Cloud if you want to invalidate it everywhere. Clearing app data/uninstalling removes the phone's local data. Deleting Results removes saved copies, not project originals or copies already exported elsewhere.

The author does not hold your private connection or project data. There is no author-hosted account to delete. Manage Tailscale and Google accounts with those providers. For app problems, use the [repository's issue page](https://github.com/YeerooXY/agentdock/issues); do not post pairing codes, keys, or private reports.

## Code changes in Results

Dock takes a folder snapshot at the start of a tracked task and saves a diff when it finishes. Images, test reports and code changes share the turn's batch and console name. One unread turn counts as one badge, even with several pictures.

Claude's prompt/stop hooks and Dock's API requests start/end tracking automatically. For Codex and other MCP agents, call **`dock_context` before editing** on each new task. Finish with **`dock/notify`** (`kind: ready`) or **`dock/finish_turn`**; supported completion hooks also finish it. Shell commands and agents that skip the start call cannot be reconstructed reliably afterward.

Existing uncommitted edits are the starting point, so they are not presented as new work. If multiple consoles work in the same or nested folders, the report says authorship overlaps. This is a before/after folder record, not proof that one agent authored every change. Intermediate edits that cancel out leave no final diff.

Ignored/build folders, obvious credential files, and known vault secrets are excluded or redacted. Binary files, large files, and captures that hit limits are identified as omitted. Capture is bounded to avoid stalling the PC and is not a secret scanner or backup. Baselines are held in memory; a crash or restart can lose an unfinished turn. Completed Results stay until deleted. Review a report before sharing it.
