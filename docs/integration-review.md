# Optional tools integration review

Source changes prepared on 19 October 2026:

- REA: optional pinned local package, shared investigation routing, and JSON
  Schema Draft 2020-12 support for its advertised tool inputs. Installation
  completion, reuse, failure recovery, context visibility and invalid-argument
  rejection are tested through a real MCP subprocess fixture.
- MiroFish: 17 agent tools over the official backend's Flask routes, loopback
  endpoint validation, a model-free identity probe, selected-text multipart
  upload, polling, explicit 1–40 round bounds and no automatic retry. A bundled
  standalone adapter is exercised through Dock's actual bridge against a mock
  HTTP backend. No paid simulation or persona interview was performed.
- Creative tools: seven ArtCraft CLI/MCP form presets. Choosing one prepares a
  disabled form and does not install, save, connect or start an app. Agents are
  instructed to retain existing preferred tools and check real feature support.
- Download retention: public tool-repository download helper and persistent
  source/location inventory; existing folders are not overwritten, incomplete
  attempts remain listed, existing agents are not claimed as Dock downloads,
  Git hooks/ambient provider credentials are not inherited, and the uninstall
  hook offers only manual review. Profile deletion remains off by default.

Validation:

- `npm run build` passed.
- 19 focused checks passed across REA, MiroFish, download retention, integrations
  and CLI setup. The bundled MiroFish helper runs without relying on the app's
  `node_modules` location.
- The last full suite reported 140 passes, 10 failures and one skip. All 10
  failures match the previously observed host restrictions: seven network-interface
  calls and three Windows-drive/WSL assumptions. The later Git-launch boundary
  check also passed in the focused run.
- `npm run test:desktop` was attempted. Electron aborts because this host disallows
  a required local socket, before the UI checks run. Windows application, NSIS
  installer/uninstaller UI and native analysis-provider checks remain pending.
- The setup smoke test now checks the REA/MiroFish cards and verifies that a
  creative preset stays disabled and creates no active connection; it still
  needs execution on a supported desktop host.
- A real local-LLM MiroFish simulation and compatibility with community forks
  have not been verified. The official backend's Zep Cloud requirement remains.

No version bump, installer publication, release or GitHub push is included.
