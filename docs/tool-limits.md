# Recommended tools and tool limits

## Recommended tools

Settings › Tools › Recommended tools lists MCP servers from their own makers. Versions were pinned on 23 October 2026.

| Tool | Maker | Package or address | Key |
|---|---|---|---|
| Playwright | Microsoft | `@playwright/mcp` 0.0.83 | none |
| Chrome DevTools | Google Chrome | `chrome-devtools-mcp` 1.12.0 | none (needs Google Chrome) |
| Context7 | Upstash | `@upstash/context7-mcp` 4.4.4 | none |
| Notion | Notion | `@notionhq/notion-mcp-server` 2.5.2 | `NOTION_TOKEN` |
| Stripe | Stripe | `@stripe/mcp` 0.3.3 | `STRIPE_SECRET_KEY`; starts as Ask me first |
| GitHub | GitHub | `https://api.githubcopilot.com/mcp/` | personal access token, sent as a Bearer header |

Adding a tool does one of two things:

- **npm package:** installs that one package into `integrations/catalog/<tool>/<version>` in Paddock's data folder, with install scripts disabled. The download is recorded in the uninstall cleanup list.
- **Hosted server:** saves its address.

Keys come from Keys. A key reaches only that tool's process environment or request headers, never command-line arguments.

Not listed yet:

- Figma, Linear and Cloudflare: their official servers need a browser sign-in, which Paddock does not support yet.
- Sentry and Supabase: how they take keys is not yet confirmed.

## Limits per tool

Each connected tool under Shared tools has three settings, enforced by Paddock on every agent call:

- **Access:** Allowed, Ask me first or Off.
  - Ask me first shows a Windows dialog for each call: Allow once or Deny. A declined call is never sent.
  - Off disables the connection.
- **Max model:** the highest model a tool may use. This applies only to tools whose models Paddock knows; today that is Meshy.
  - For Meshy, the order is meshy-6-lite, meshy-6, meshy-7, meshy-7.1.
  - `latest` counts as meshy-7.1.
  - Meshy uses its best model when none is named, so Paddock fills in your maximum.
  - A request for a higher model, or for an unknown one, is blocked.
- **Daily budget:** a whole number per day, or empty for no limit.
  - **Meshy:** credits. Paddock reads the Meshy balance before each paid call and compares it with the first balance it saw that day. This counts all spending on the account that day, not just Paddock's. A call that starts under the limit can finish over it by its own cost.
  - **Other tools:** successful paid calls. For tools without Paddock data, every call counts.

Agents see a **Tool permissions** section in their shared instructions. It lists, for each tool:

- whether it is allowed;
- its maximum model;
- its budget and today's usage;
- whether it is turned off or not added yet.

When a limit blocks a call, the agent is told not to retry and to tell the user which limit stopped it.

Usage lives in `tool-usage.json` in the data folder. It resets each UTC day.
