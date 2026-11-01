# Tool discovery

An absent connection does not establish that Paddock lacks an integration. The compact context names every built-in integration. `dock/setup_status` returns an `integrations` catalog with setup readiness, connection state and its Tools location.

`dock_tools` includes non-callable setup notices for built-ins awaiting setup or disabled by the user. A connection lookup accepts the built-in ID or display name, case-insensitively. Enabled connections continue to return their actual provider schemas and connection errors. Discovery does not install tools or enable disabled connections.

The installation snapshot distinguishes `setup-required`, `ready-to-connect`, `connected`, `disabled`, `unavailable` and `unknown`. A configured connection is not evidence that an analysis provider is ready. Test it and inspect its capabilities before use.

Regression coverage is in `tests/tool-discovery.test.cjs`. Verified on 31 October 2026 with `npm run build`, `npm test` (657 passed, one skipped), and `npm run test:linux` including the headless desktop suite. The workspace `AGENTS.md` also records the discovery rule and Chrome localized-manifest lookup.

Restart Paddock to load main-process changes. Existing consoles are preserved until the user chooses to restart.
