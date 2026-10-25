# Dependency security update — 24 October 2026

The updated project installs cleanly with **zero npm audit findings**, including development dependencies. The original audit contained five high and two moderate entries. Build, unit tests, desktop checks and the unpacked Windows application pass with the replacement dependencies.

Work remains on `main`, based on `88409424c563967eed4c2749e9385f04fe46d64c`, turn `5a532c42-6081-4670-9630-c2084b325e09`. Existing uncommitted work is preserved.

## Changes

| Component | Previous | Updated |
| --- | --- | --- |
| Electron | 44.7.2 | 44.9.3, pinned with its install-script allowance |
| body-parser, SDK path | 2.3.0 | 2.4.0 |
| body-parser, Meshy path | 1.20.8 | 1.20.9 |
| fast-uri | 3.1.8 | 3.1.9 |
| Meshy validation | Zod 3.25.76 | Zod 4.6.7 with scoped record-call compatibility |
| npm's bundled Undici | 6.29.0 | 6.29.1 |
| npm's bundled ip-address | 10.7.2 | 10.7.4 |
| Bundled Node | 24.19.0, built-in Undici 7.29.0 | 24.22.1, built-in Undici 7.30.1 |

Meshy 0.6.4 still calls the single-argument `z.record()` API. The build redirects only Meshy's Zod imports through `electron/meshy-zod.cjs`, which supplies the string-key argument required by Zod 4. Other packages retain their normal imports. No Zod 3 fallback is used for Meshy's schemas. The pinned override and direct Zod dependency keep this reproducible. Remove the adapter and override when Meshy supports the patched API directly.

npm's current official releases still contain the affected bundled libraries, and npm overrides cannot replace those copies. The local `12.2.1-paddock.1` archive substitutes the two compatible upstream patches, preserves upstream code and licenses, and records its provenance. [Rebuild instructions and removal condition](../vendor/README.md). Two builds produced the same SHA-512. The repack adds a 3.23 MB source artifact and requires maintenance until upstream npm includes these fixes.

Node's built-in HTTP client is outside npm audit's package coverage. The bundled runtime was also updated to the [Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1), with its official Windows x64 SHA-256 pinned. Runtime preparation refreshes the matching Node license. Source launches prefer the prepared runtime for helpers; the system Node installation is unchanged.

The packaged smoke test's existing file allowlist now includes the MiroFish helper already produced by the project, and checks the actual bundled npm version.

## Verification

Windows locked `node_modules/electron/dist/resources/default_app.asar` during installation because the user's Paddock session was running. npm rolled back the install. The running app and consoles were preserved. A copy of the current working files in `.build/dependency-check-20261024` was used for clean installation and verification; this was not a branch switch or a reset of the workspace.

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed, zero vulnerabilities |
| Full `npm audit` after installation | Passed, all severity counts zero |
| `npm run build` | Passed; existing bundle-size warning remains |
| `npm test` | 222 passed, one skipped before the runtime-selection regression test was added |
| Tests under bundled Node 24.22.1 | 223 passed, one skipped, zero failures |
| `npm run test:desktop` | All four suites passed with Electron 44.9.3 |
| Source runtime selection | Unit check covers prepared runtime preference and pre-preparation PATH fallback; real Electron setup smoke passes after that change |
| `npm run pack` | Passed, isolated unpacked Windows x64 application |
| `npm run test:packaged` | Passed: setup, real terminal, restart/restore, bundled Node, offline npm installation and CLI launch, MCP bridge and Meshy discovery without system Node on PATH |
| Meshy migration regression | All 28 tool schemas compile; records/defaults/strict fields/output records work; mocked valid calls pass; oversized and invalid requests never reach the mock API |
| Reproducible npm archive | Two builds have the same pinned SHA-512; all three upstream input archives pass integrity checks |

Meshy compatibility tests use a dummy key, an HTTP fixture on loopback, and a subprocess network guard that rejects external destinations. No paid model request or generation job was submitted. Packaging was tested locally; no installer was published or installed over the running app. This dependency change does not alter page layouts; no new four-profile visual claim is made.

Evidence is in `artifacts/dependency-security/`. The original audit and failed live-install log remain at `artifacts/dependency-audit-before.json` and `artifacts/dependency-install.log`. Installer tooling still emits transitive-package deprecation warnings; the current full audit reports no vulnerabilities for those packages.

## Applying to the running source copy

The source files and lockfile are updated. **The active workspace's installed dependencies still use the old versions until installation can complete.** Windows must release the running Electron files first. Use Paddock's **Quit** action; closing its window only hides it to the tray. Then run these commands from an external PowerShell window in the project folder:

```powershell
npm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm run prepare:runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime preparation failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
npm start
```

Electron's first launch downloads its pinned binary when needed. Quit/relaunch ends current processes; saved consoles reopen according to the existing restoration setting. No process was stopped to force this update.

## Advisory sources

- [Electron certificate mitigation](https://github.com/advisories/GHSA-jr5w-w6x2-84p9).
- [body-parser compressed-body handling](https://github.com/advisories/GHSA-27r3-jxmh-p828).
- [Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [upstream fix](https://github.com/colinhacks/zod/pull/6652), and [Zod 4 migration guide](https://zod.dev/v4/changelog).
- [fast-uri scheme handling](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).
- [Undici content encodings](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) and [EventSource parsing](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685).
- [ip-address zone parsing](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).

These checks cover the reported dependency findings and compatibility of the update.
