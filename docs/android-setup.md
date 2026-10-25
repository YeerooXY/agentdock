# Paddock on Android

Leave Paddock running on your PC, then use your phone to work in the same consoles. The Android app shows one terminal at a time. You can switch consoles, start one with your saved defaults, view Results, and check usage.

This is an Android preview. iPhone support comes later. The owner verified a physical phone sending commands over mobile data on 18 October 2026. The new matching-code approval flow is tested separately; live Firebase delivery still needs verification.

## Install and pair

1. Use the current [Windows and Android downloads](../README.md#downloads) on both devices for new pairing. Existing pairing is preserved during an upgrade. Most phones use the **arm64** APK. Android 7 or later is required. The APK uses a development signing key; a future store build may require uninstalling this preview first.
2. Put the PC and phone on the same Wi-Fi or local network. **No extra app or account is needed** for this connection. To connect from anywhere, use [Tailscale](#anywhere-with-tailscale).
3. On the PC, open **Settings → Devices → Connect a phone**. First-time setup also offers **Connect my Android phone next**.
4. Select the PC's Wi-Fi or Ethernet address and enable the connection. Use **Refresh addresses** if you just changed networks. The **This PC only** address cannot be reached by your phone.
5. On **Router**, choose **Allow Paddock in Windows Firewall** if needed. Windows asks for administrator approval for a rule scoped to Paddock's executable, TCP port, address and network adapter. Open **Pair phone → Show QR code**. In Android, choose **Scan QR code**, or paste the code. The code expires after five minutes and works once. Scanning only requests access. Compare the six-digit code on both screens, then choose **Codes match — Allow** on the PC. Deny a request you did not start. Requests expire after two minutes; Cancel on the phone or closing PC setup withdraws an unclaimed request.
6. Keep the PC awake with Paddock running. Closing Paddock to its tray preserves the connection and consoles; choosing Quit stops them.

Current source builds keep the PC awake while an agent is marked Thinking or a Paddock API request runs. You can switch this off in **Settings → Desktop**. The screen can still turn off, and normal sleep resumes when work finishes. For phone access while every console is idle, the PC still needs to remain awake. This setting was added after the 0.6 preview 1 installer.

Same Wi-Fi mode accepts private network peers, and its firewall rule allows only the local subnet. Tailscale mode listens only on the PC's Tailscale address and accepts only Tailscale peers (100.64.0.0/10). Paddock never opens a router port.

A paired phone can type commands using the console's existing permissions. This is access to your PC, so pair only devices you control. **Remove** beside a phone immediately revokes its token. **Turn off** stops mobile access without ending local consoles.

### How long does pairing last?

The saved pairing token has no automatic expiry and survives normal restarts and compatible updates. The PC must stay awake, Paddock's connection must be enabled, and a saved local or internet address must remain reachable. Router, address or port changes can require updating the connection and pairing again. Clearing app data, removing the phone or replacing the PC's certificate also requires pairing again. The current PC certificate lasts five years; certificate expiry eventually needs renewal and re-pairing. The short QR/request expiry applies only while adding a phone.

## Multiple computers and phones

- **Name this PC:** Windows → Settings → Devices → Connect a phone → Connection → This PC's name → Save name. Saving only a name keeps the connection open.
- **Name this phone:** Android → Devices → the pencil beside This phone. You can also enter the name before pairing. Offline PCs learn a changed phone name the next time you connect.
- **Add a PC:** Android → Devices → Add computer, then scan that PC's QR and approve its matching code. Existing computers stay saved. Each PC can approve up to nine phones.
- **Switch:** tap the saved computer in Devices. Paddock shows its name above the console, opens its connection and restores your last selected console during that app session. The other PC keeps working. Switching clears the old terminal display and command draft so they cannot be sent to a different computer.
- **Rename only on this phone:** open the computer's three-dot menu. This is a local label; the PC name and other phones? labels stay as configured.
- **Forget one computer:** its three-dot menu → Forget computer. Other saved PCs are kept. For revocation, remove the phone on the forgotten PC too; an offline PC may still send alerts until you remove it there.

Existing single-PC pairings migrate automatically into encrypted device storage. Names and addresses are labels and routes; the saved certificate fingerprint still identifies the server. Renaming does not replace its certificate or token. Give a cloned VM a fresh Paddock profile rather than copying an existing PC's pairing credentials.

Cloud alerts on multiple PCs currently require the same Firebase project on those PCs. Paddock preserves the shared phone registration when switching; it refuses a conflicting setup that would break another PC's alerts. If Google rotates the registration token, reconnect to each PC to refresh it. Alerts are generic and opening one does not yet select its originating PC automatically. Live multi-PC Firebase delivery is unverified.

A Windows VM running Paddock can be added once its network address is reachable. A Linux SSH connector and an integrated desktop remote-host selector are not included. New consoles on Android use the selected PC's configured defaults.

## Updates

Android preview 6 puts account usage first, with separate pink-blue bars for each reported limit, reset times and pull-to-refresh. Unknown and stale readings remain labeled. API estimates stay separate from subscription limits. The console's Send button and borders also follow the pink-blue theme.

The scrolling fix from preview 5 is included. Tap **Command or message** to write a prompt, or the keyboard button beside the terminal controls for direct input. Touching the terminal closes the keyboard without deleting your draft. The mobile UI update works with Windows preview 4 or later; Results settings are controlled by the connected Windows PC.

On the phone, tap **Updates** on the connection screen, **App updates** above your consoles, or **Settings → General → Updates**. From preview 12, **App updates** is under the **⋮** menu. These controls work without a paired or reachable PC. **Check for updates** contacts GitHub directly; **Download update** opens the matching APK in your browser. **All downloads** also works if the version check fails. Open the APK to install it over the existing app. Android may ask you to allow installs from your browser. Upgrades signed with the same key preserve pairing; do not uninstall or clear app data first. Reopen Paddock to reconnect. Updating only Android leaves PC consoles running.

Android preview 13 adds **Wrap text**, text selection and copying, saved drafts per console, colored agent labels, and a console dropdown on the chat name. These work with older PC hosts. Choosing an agent for a new console, browsing filenames and closing a console require **Windows preview 13**. Console links and model/command shortcuts remain available. See [mobile terminal controls](mobile-controls.md).

Preview 14 changes subscription meters to **percent left**, with provider colors and locally bundled icons where reviewed brand assets are available. A 62% bar means 62% remains. Unknown and stale values stay explicit; API cost still means estimated spending. This Android display change works with older PC hosts. Install Windows preview 14 separately when you want the same display in desktop Usage and the HUD. [Provider asset notes](provider-brand-assets.md).

On the PC, use **Settings → Updates** to check, download and install a newer Windows build. The PC verifies the download's size and SHA-256 before offering installation. Update both devices when a release asks for matching versions. Checks are manual and contact GitHub; no terminal content or keys are sent. Preview builds offer newer previews as well as stable releases.

## Anywhere with Tailscale

Updated 24 October 2026: Tailscale replaces direct internet through the router and Duck DNS. Tailscale connects your devices over an encrypted WireGuard network, so there is no port forwarding, public address or dynamic DNS to maintain. [Tailscale](https://tailscale.com/download) has a free personal plan; check its current terms.

1. Install Tailscale on the PC and sign in.
2. Install Tailscale on the phone, sign in to the **same account** and turn it on.
3. In Paddock, open **Settings → Devices → Connect a phone**. Choose **Anywhere · Tailscale**, select the PC's Tailscale address (100.x) and press **Enable connection**. If no address is listed, sign in to Tailscale on the PC and press **Refresh addresses**.
4. On **Firewall**, allow Paddock. The rule covers only Paddock's port on the Tailscale address, from Tailscale devices.
5. Pair from **Pair phone**. To test, turn off the phone's Wi-Fi and keep Tailscale on.

The phone still checks the PC certificate pinned during pairing, so Tailscale adds a second encrypted layer. Keep the PC awake with Paddock running. Tailscale keeps the same 100.x address for a device, so the pairing keeps working when your home IP changes.

### Moving from direct internet

When an older setup used **Direct internet**, Paddock switches it to **Same Wi-Fi** on start and shows a note in Phone setup. Paired phones stay paired and keep working on Wi-Fi. Choose **Anywhere · Tailscale**, then pair again or enter the Tailscale address in the phone's **Connection** screen. Remove the old port-forwarding rule from your router and any Duck DNS token you no longer need from **Keys**.

## Optional completion alerts

Choose **Usage → Notifications → Stay connected** for direct background alerts. Allow Android notifications when asked. Paddock keeps one authenticated connection to the selected PC, receives status changes, and pauses terminal output while backgrounded. An ongoing notification shows the connection and offers **Stop alerts**. No Firebase account or server is needed.

The PC and its route must remain available. Android power saving, force-stop, a reboot or network loss can delay or stop delivery; reopen Paddock to resume. For long waits, review Android's battery setting for Paddock. This is optional and uses more battery/network time than cloud push. It watches the selected PC; other saved computers remain paired.

**Firebase alerts** is a separate option for devices with Google Play services. Expand it under Usage → Notifications and use **your own Firebase project**. Direct mode suppresses that phone's Firebase sends on preview 15 hosts; turning direct mode off restores its existing registration. There is no Paddock cloud relay or shared billing account.

1. Open the [Firebase console](https://console.firebase.google.com/) and create a dedicated project. Google Analytics is not needed.
2. Add an Android app with package **`com.yeeroo.agentdock.mobile`**. Download its **`google-services.json`**. You do not need to rebuild the APK or add the Firebase SDK yourself.
3. In **Project settings → Cloud Messaging**, check that the Firebase Cloud Messaging HTTP v1 API is enabled.
4. In **Project settings → Service accounts**, generate and download a private key. Keep this project separate from other apps. Administrators can instead create a dedicated sender service account with the **Firebase Cloud Messaging API Admin** role and generate its JSON key. The key must belong to the same project as the Android configuration.
5. In Paddock's **Phone setup → Alerts**, choose **Import Firebase files**. Pick `google-services.json`, then the service-account JSON. Paddock checks the package and project, then encrypts the private key on this PC. Never paste that key into a chat or commit it to Git. You can delete the original download after importing it.
6. On Android, open **Usage → Notifications → Firebase alerts → Enable alerts** and allow notifications. Then send a test alert. Google Play services and an internet connection are required.

The PC sends a generic “An agent needs your attention” alert through Google. It does not send terminal text, project names, code, or model API keys through FCM. Tapping a phone notification opens Paddock; open the ready console from the switcher. Windows notification clicks open the related console, result, or review directly.

If a test fails, check the project match, Cloud Messaging permissions, Android notification permission, and Play services. Re-enable alerts after changing projects or reinstalling the app. Android force-stop and device power restrictions can prevent background delivery until you open the app again. Delivery is not guaranteed.

## Who pays?

The phone talks to **your PC** over your own connection. Paddock operates no relay and collects no cloud fee. Tailscale may route an encrypted connection through its relay when a direct path is unavailable; this is part of your Tailscale service, not an Paddock server. Its Personal plan is for personal, non-commercial use; check the plan appropriate to your use. [Tailscale pricing](https://tailscale.com/pricing), [connection types](https://tailscale.com/docs/reference/connection-types).

Firebase Cloud Messaging is currently a no-cost product. This setup does not deploy Cloud Run, Functions, a database, or storage. Google project limits and service terms still apply. Do not enable unrelated paid services just to configure alerts. Mobile carrier data and your chosen AI subscriptions/API calls remain your costs. [Firebase pricing](https://firebase.google.com/pricing), [FCM HTTP v1 setup](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

### Can alerts work without Firebase?

Yes: **Stay connected** is implemented from Android preview 15. A foreground service keeps the selected PC connection available with an ongoing notification. Android Doze and vendor battery restrictions can still delay delivery; it is not a guarantee of instant alerts. [Android background restrictions](https://developer.android.com/training/monitoring-device-state/doze-standby).

Preview 15 PC hosts provide event IDs so reconnects avoid duplicate alerts and can deliver recent unread events. Older PC hosts use console-state transitions, which can miss a completion while disconnected. UnifiedPush/ntfy is not integrated.

## Data use and privacy

- Only the selected terminal streams. Updates are compressed and batched, and reconnects request missing output or a bounded screen snapshot. Commands are never resent automatically after a disconnect.
- Switching away from Console stops terminal streaming. Backgrounding closes the connection unless Stay connected is enabled. Direct mode receives status only with a 60-second WebSocket keepalive; it does not poll or stream terminal text. Firebase remains a separate optional delivery route.
- Results downloads its list first. A picture or report loads when you open it; larger images need another tap. Markdown previews do not load remote images. Web links open in your browser only when tapped.
- **Data saver** is on by default. Usage shows compressed application bytes for the current app session, not TLS, VPN, Firebase, or carrier overhead. It is not a billing meter.
- **Check for updates** contacts GitHub for public release metadata. **Download update** sends your browser to GitHub's APK download. These requests expose ordinary connection information, such as your IP address, to GitHub; they send no pairing credentials, projects, terminal text or model keys. Update downloads are not included in the private-connection byte counter.
- The connection uses HTTPS/WSS with the PC certificate pinned during pairing. PC device tokens, certificate key, FCM tokens, and Firebase service-account credentials are encrypted with Windows safeStorage. The phone stores its pairing credential through Android Keystore-backed secure storage. There is no plaintext fallback for PC secrets.
- Phone console style and motion preferences are stored locally through the same secure-storage library. They are not sent to the PC or a third party. Change them in **Settings → Appearance**; clearing the Android app's storage removes them.
- Paddock contacts no address-check or DNS service. Tailscale is optional; when you use it, Tailscale coordinates the connection under its own account and privacy terms, while console traffic stays end-to-end encrypted between your devices. Chosen connection settings are stored locally. Removing a phone deletes its device record. **Remove firewall rule** removes Paddock's Windows rule with administrator approval. Turning off mobile stops its listener. A narrow firewall rule may remain until explicitly removed; no service listens while mobile is off.
- Google receives the Firebase installation/registration identifiers and generic alert metadata needed to deliver notifications. The public Firebase app configuration is stored on Android; the service-account private key stays on the PC. No Google Analytics SDK is enabled. Tailscale has its own account and network data practices. [Firebase privacy information](https://firebase.google.com/support/privacy).
- QR scanning uses Google ML Kit locally. Google states that scan images/results stay on the device, while the SDK sends performance and usage metrics and may request updates. Paste a code instead if you prefer not to use scanning. [ML Kit privacy information](https://developers.google.com/ml-kit/terms).
- Code, terminal output, selected Results, account usage, configuration names and shared instructions go directly from your PC to its paired phone. Key values, endpoint URLs and connection bindings stay on the PC. Terminal buffers and opened previews stay in app memory; reconnect credentials persist until forgotten. The phone app does not upload these to Paddock hosting.
- Image attachments use the Android system picker. Android 14+ screenshot detection only offers the picker; it does not read screenshots automatically. Chosen images are resized, re-encoded without EXIF/location metadata and sent over the paired TLS connection into the selected local project's `.agentdock/mobile-attachments` folder. Uploads are capped at 4 MiB; each project keeps at most 128 copies/64 MiB. Remove old copies from that folder on the PC. They are not automatically deleted or sent to an AI.
- Unsent message drafts stay in OS-backed encrypted storage on the phone, separately for each PC and console. Sending or clearing a draft removes it; forgetting a PC removes its drafts. Up to 128 recent drafts are retained, with a combined target of 1 MiB of text. Drafts are sent only when you press Send. **Copy** puts selected terminal text on Android's clipboard. The optional file picker reads names inside the selected console's working folder, not file contents.
- **Devices → computer menu → Forget computer** clears that computer's saved pairing. Other computers and their alert registrations remain saved. Also **Remove** the phone on the PC, especially if it was offline when forgotten. Remove Firebase setup on the PC to erase its saved key/tokens; revoke the service-account key in Google Cloud if you want to invalidate it everywhere. Clearing app data/uninstalling removes the phone's local data. Deleting Results permanently removes the saved copies from disk, not project originals or copies already exported elsewhere.

The author does not hold your private connection or project data. There is no author-hosted account to delete. Manage Tailscale and Google accounts with those providers. For app problems, use the [repository's issue page](https://github.com/YeerooXY/agentdock/issues); do not post pairing codes, keys, or private reports.

## Code changes in Results

Requested outputs share their task's group and console name. One unread group counts as one badge, even with several files. When optional file-change capture is enabled, Paddock also takes a folder snapshot at the start of a tracked task and saves its diff when it finishes.

Results keeps requested outputs saved by agents: documents, images, designs, reports, datasets and exports. Ordinary answers, small edits, progress messages and routine checks create no Results entry. Use **Add files** to keep another file. **Settings → General → Results → Also capture file changes** optionally copies code diffs and changed images; it defaults off. The first update to this policy turns legacy capture off once; later opt-ins persist. Turning it off discards unfinished captures, and turning it back on starts with the next turn. Existing Results and explicitly saved/imported outputs remain available. This PC setting also controls captures viewed on the phone.

Claude's prompt/stop hooks and Paddock's API requests start/end tracking automatically. For Codex and other MCP agents, call **`dock_context` before editing** on each new task. Finish with **`dock/notify`** (`kind: ready`) or **`dock/finish_turn`**; supported completion hooks also finish it. Shell commands and agents that skip the start call cannot be reconstructed reliably afterward.

Existing uncommitted edits are the starting point, so they are not presented as new work. If multiple consoles work in the same or nested folders, the report says authorship overlaps. This is a before/after folder record, not proof that one agent authored every change. Intermediate edits that cancel out leave no final diff.

Ignored/build folders, generated dependencies such as `.deps`, Paddock's `.agentdock` metadata, obvious credential files, and known vault secrets are excluded or redacted. Binary files, large files, and captures that hit limits are identified as omitted. Capture is bounded to avoid stalling the PC and is not a secret scanner or backup. Baselines are held in memory; a crash or restart can lose an unfinished turn. Completed Results stay until deleted. Review a report before sharing it.

## Results browsing and attribution

Results are grouped by console/chat, then by completed prompt. Summaries and saved files appear first; project, Git and capture information are under Details. Their recorded project and working folder remain attached. The console name is historical: renaming a reused console does not relabel old results. A non-Git workspace containing child repositories captures only files directly in the workspace, leaving sibling project folders out. Open a console in the actual project folder to capture its files. Old results without a saved project ID retain their recorded working folder. Overlapping consoles in the same folder can still produce overlapping diffs; these are labeled as folder activity, not proof of authorship. Old dependency-only captures are hidden from the gallery without deleting source files or stored reports.

Pictures in a turn share a gallery with Previous/Next and viewed markers. Only opened pictures are marked viewed. The phone fetches each picture on demand and keeps the larger image optional. Internal JSON is collapsed; code reports use the diff view. Empty code snapshots are no longer generated.
