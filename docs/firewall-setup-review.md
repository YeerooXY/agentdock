# Phone setup: existing Windows firewall rules

26 October 2026. Source change; no installer or release tag published.

The setup screen previously displayed its Allow button unconditionally. Its
success indicator only survived the running process, and every click elevated
PowerShell and removed/recreated the app's rule.

The connection now inspects the existing rule at startup. Opening setup,
visiting Firewall and choosing Check again also inspect it without elevation.
The helper reads the effective Windows rule and its application, port, address
and interface filters. Matching rules show Already configured; missing and
outdated rules offer setup or repair. Unreadable status stays unknown.

An explicit setup action checks again before changing anything. A matching
rule is a no-op in both JavaScript and PowerShell. A completed change is read
back; cancellation or verification failure cannot report success. Address
changes invalidate pending checks. An unchanged connection is not restarted
when continuing setup. Tailscale peer scope, pairing and TLS are unchanged.

The status describes Paddock's own rule, not an end-to-end connection test or
an audit of every administrator/third-party firewall policy. Existing manual
rules can provide access without Paddock's rule; setup explains this and does
not prevent continuing.

## Verification

- `npm run build`: passed.
- `npm test` with a local PowerShell executable for the helper fixture: 315
  passed, five platform-dependent skips, zero failures. The loopback mobile
  fixture now supplies loopback adapter metadata rather than enumerating the
  host's physical adapters; its HTTPS/WebSocket traffic still runs locally.
- The real PowerShell helper ran against mocked NetSecurity responses: existing
  rules and repeated setup cause no mutation/elevation; missing rules, disabled
  rules, changed executable/address/adapter/port/protocol/profile/peer scope,
  normalized addresses and read failures are covered. No real firewall changed.
- `node scripts/mobile-firewall-check.cjs`: passed in headless Chromium with
  mocked IPC. Covers reopening setup, unchanged connections, configured,
  missing, outdated, checking and unknown states, cancelled approval, closing
  during a check and explicit removal. Desktop and narrow screenshots inspected.
- `npm run test:linux`: unavailable in this workspace because Docker is absent.
  `npm run test:desktop` also cannot start here: the environment rejects the
  Unix socket required by Electron. Full native desktop and real Windows
  firewall verification remain outstanding; the repository CI runs desktop
  checks on Windows, Linux and macOS.

Local visual evidence is generated in `artifacts/firewall-setup/` by the UI
check. It uses the built app stylesheet and the actual phone setup component.
