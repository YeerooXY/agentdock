# Agent Dock

Local Windows desktop app. Keep user-facing copy short, direct and factual. Preserve any applicable parent writing instructions.

- Encrypt credentials at rest with OS-backed safeStorage. Resolve them in the main process. Only explicitly bound MCP server processes may receive their selected credentials in the environment. No plaintext fallback, renderer read-back, keys in logs, credentials in arguments, or vault keys in agent-console environments.
- Subscription limits are account-wide. Do not add percentages across sessions or infer limits from token counts. Unknown and stale values must remain visible.
- The API ledger covers requests made through this app. Costs are estimates from explicitly configured rates, not provider invoices.
- Never run paid model requests during tests. Use mocked HTTP and temporary data directories.
- Hide/collapse must preserve sessions. Killing sessions requires an explicit UI action.
- Use npm run build, npm test and npm run test:desktop for relevant changes.
