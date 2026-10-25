# Mobile connection security review

19 October 2026 · preview 11 · focused review of pairing, saved devices and terminal transport.

Tests used disposable loopback servers and an Android emulator. No attacks were sent to the owner's running Paddock, router, physical phones, GitHub or third-party services. No real model or cloud-push calls were made. This is a focused engineering review, not a penetration-testing certification or a guarantee that all vulnerabilities have been found.

## Demonstrated issue and fix

**High impact, authenticated attacker required: buffered commands could run after revocation.**

In `electron/mobile.cjs`, removing a paired phone removed its token and started the WebSocket close handshake. The message handler still accepted frames arriving during that handshake. A previously approved phone could queue input immediately before removal and have it execute after removal. This did not allow an unpaired internet client to connect.

The test opens an authenticated socket, subscribes to a fixture terminal, sends `should-not-run` and immediately revokes the phone before the server processes that frame. Before the fix, the terminal's recorded writes contained that input. After the fix, the writes remain empty. `MobileCompanion.call()` now checks that the socket is open, the connection is registered, and its device object still belongs to the authorized device list before dispatching any action. Closing a connection alone is not treated as authorization revocation.

Reproduce safely with `node --test --test-name-pattern="revoking a phone" tests/mobile.test.cjs`. The fixture records strings instead of executing them in a real shell. The test fails against the previous dispatcher and passes with the guard.

## Additional hardening

- **Device isolation on Android:** PCs are keyed by certificate fingerprint, with separate encrypted tokens and routes. Switching invalidates the old socket generation, rejects pending requests, clears the terminal and composer, and retains the saved pairing. An old terminal view cannot emit commands into the newly selected PC.
- **Storage races:** metadata updates require an existing saved PC. A late alert registration, rename or route update cannot recreate a forgotten entry. Serialized writes preserve the previous registry on a storage failure; cancellation during a new pairing restores the previous registry.
- **Compressed frames:** the decompression sink enforces a 5 MiB output limit while receiving decoded chunks. Previously the size check happened after decompression. The regression test uses a small gzip payload that expands beyond the limit; it is rejected. An actual phone crash was not attempted or claimed.
- **Names:** bounded text, control and bidirectional-control character removal, and HTML escaping in desktop setup. The remote rename method targets only the authenticated phone, ignoring a supplied target ID. Changing a PC name leaves its identity and tokens intact.
- **Push configuration:** switching PCs does not delete the Firebase app/token used by another saved PC. A conflicting Firebase project is rejected. Token refresh callbacks are tied to the active connection generation.

## Attack and failure checks

| Check | Result and evidence |
| --- | --- |
| QR possession without PC approval | Cannot open a terminal or approve itself; `tests/mobile.test.cjs` |
| Wrong temporary request key; replayed invite; mismatched request ID | Rejected; only the requesting phone can claim the approved token |
| Denied, expired, canceled or superseded pairing | No authorized device created; cancellation after claim revokes that device |
| Vault/key access or desktop administration over mobile RPC | Unavailable; tested against the method allowlist |
| Browser-origin WebSocket hijacking | Rejected even with a fixture token and an attacker Origin |
| Phone trying to rename another phone | Only its own record changes; the other phone retains its token, name and connection |
| Revoked token reconnect | Rejected; a second approved phone remains connected |
| Duplicate input request ID | One terminal write; duplicate rejected |
| Malformed JSON, null/array payloads, binary requests | Error or connection closure; no extra terminal input |
| Console creation payload overriding command/folder/provider | Host defaults remain authoritative; unsupported payload fields are ignored |
| TLS identity mismatch | Connection fails before the unrelated server receives a bearer credential; real local TLS test in `mobile/test/connection_test.dart` |
| Failed or canceled second pairing | Original pairing survives; `mobile/test/saved_devices_test.dart` |
| Switching during pending input | Pending work fails; the new PC receives no replay; unit and two-host Android checks |
| Late write after forgetting a PC | Cannot recreate that entry; saved-device regression test |
| Device-name HTML injection | Rendered as input text; no injected image element in Chromium/WebKit checks |
| Plaintext credentials at rest | Windows fixture validates encrypted pairing persistence; Android uses FlutterSecureStorage. No new plaintext credential file is used by the app |
| Known production dependency advisories | `npm audit --omit=dev`: zero reported on the review date; this covers the npm advisory database, not every dependency ecosystem or unknown vulnerability |

Existing server constraints also include bounded pairing request bodies, request/connection limits and outbound backpressure. These are source-reviewed controls; a sustained public-network denial-of-service or router load test was not performed.

## Remaining boundaries

1. Pair only trusted personal devices. Each paired phone has broad control of the PC's consoles; there are no per-project roles, biometric app lock, MFA or sandbox boundary for a malicious approved phone. A stolen unlocked phone is significant exposure. Remove it from every PC where it was paired.
2. Pairing tokens persist until revoked. Certificate checks and QR expiry are separate from token lifetime. A cloned VM must get a fresh Paddock profile; copying server credentials also copies its identity.
3. Internet access depends on host, OS, firewall and router configuration. Keep router administration private. Direct forwarding has no upstream traffic-absorption service and cannot prevent an attacker saturating a home connection.
4. Forgetting a PC on an offline phone cannot revoke its server-side token or stop that PC's already configured push delivery. The confirmation explains removal on the PC as well.
5. Firebase delivery, token rotation across several real PCs, physical mobile-data roaming, and phone-vendor battery restrictions remain unverified here. Multiple PCs currently need the same Firebase project. Generic notifications do not yet route to their originating PC.
6. These are unsigned Windows and development-signed Android preview builds. Production signing, protected release keys, automated secret scanning and independent security review should precede a broader stable launch. A SHA-256 published beside an installer detects mismatched bytes but is not an independent trust anchor if the release account is compromised.
7. The application is still a preview. Approved agents and MCP tools retain their existing host privileges; this change does not sandbox their actions or solve prompt injection in project content.

Recommended next security work: optional app unlock, a device/access audit trail, explicit permissions for sensitive actions, release signing and a repeatable external review of the complete remote surface. These are recommendations, not silently enabled features.

The review follows the principle of checking authorization during message handling described in the [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html). Phone background and notification behavior should be verified against [Firebase's Flutter receive-message guidance](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages), including real devices.
