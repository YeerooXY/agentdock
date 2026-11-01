# Antigravity allowance reader

Paddock now reads Antigravity's native `/usage` panel. Previously Antigravity had no registered background reader, so opening or using its console could not populate the Usage page.

The reader opens an owned, hidden terminal, waits for the CLI prompt, submits only `/usage`, parses the quota panel, and closes its own process. It never submits a model prompt. The CLI owns authentication. Account identities and terminal contents are excluded from returned readings.

Each model group retains separate weekly and five-hour windows. The reported remaining percentage is converted to used percentage for Paddock's existing display. Relative reset times come from the CLI and have the same minute-level precision. Missing, partial, or unrecognized data remains unknown. A 20-second timeout bounds failed reads.

Permission and workspace settings apply only to the helper session. A live check with Antigravity CLI 1.4.12 returned all four quota windows in approximately 2.6 seconds and left the user's settings file unchanged. The existing owner console remained running.

The reader joins Paddock's existing refresh, freshness, and shutdown handling. Restart Paddock to load the new main-process code, then refresh Usage.

Verification evidence is under `artifacts/antigravity-usage-20261101/`. Unit fixtures cover fragmented terminal output, separate model groups, invalid percentages, incomplete panels, sign-in, timeout, shutdown and process cleanup. Live evidence uses the native quota command; automated tests use mock terminals and make no provider requests.

Provider reference: [Antigravity model quotas](https://antigravity.google/docs/cli/commands/usage/).

Validation: `npm run build` passed; Windows `npm test` passed 734 tests with one skipped; `npm run test:linux` passed its unit and headless desktop suites. The running Paddock process was preserved and still needs a restart to load the reader.
