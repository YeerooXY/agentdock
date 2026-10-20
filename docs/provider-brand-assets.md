# Provider names, colors and logos

Reviewed 20 October 2026. Provider marks identify the connected service; Agent Dock has its own branding and does not claim sponsorship. All bundled images load locally. Viewing a meter, console badge or provider list makes no request to a logo service.

The five bundled images are unchanged official PNGs. These assets retain their owners' rights and brand conditions; they are not relicensed under Agent Dock's code license. The use here is a small identifier; icon-only controls include an accessible provider name. This review records the published guidance and our implementation choice, not a legal certification.

| Provider | Display | Source / decision |
| --- | --- | --- |
| OpenAI / Codex | OpenAI icon, blue meter | [OpenAI brand guidelines](https://openai.com/brand/) permit related-service identification subject to their terms. The unchanged icon is supplied by [OpenAI's developer site](https://developers.openai.com/favicon.png). |
| Cursor | Cursor icon, neutral badge | The [official brand resources](https://cursor.com/brand) provide icons to represent Cursor. Use the supplied [192px icon](https://cursor.com/marketing-static/icon-192x192-light.png), preserving colors and proportions. |
| OpenCode | OpenCode icon, neutral badge | The [official brand resources](https://opencode.ai/brand) provide OpenCode assets. The [official site icon](https://opencode.ai/favicon-96x96-v3.png) is included unchanged. |
| Claude / Anthropic | Official Claude icon, coral accent | Unchanged [Claude website favicon](https://assets.claude.com/95a868946ac8a31e5ff832e2899f294aa368b836.png), from [claude.com](https://claude.com/), identifies the selected service in the mobile app. [Anthropic trademark conditions](https://www.anthropic.com/legal/trademark-guidelines) remain applicable; this records provenance, not a separate permission grant or endorsement. |
| GitHub Copilot | Purple name/initial | [GitHub's current Copilot guide](https://brand.github.com/brand-identity/copilot) deprecates the old standalone logo. No suitable approved asset/use has been established here. |
| Gemini | Blue name/initial | [Google's brand guidance](https://about.google/brand-resource-center/guidance/) allows plain-text informational references and directs product icons to separate conditions. Permission for this icon use remains unverified. |
| Antigravity | Blue name/initial | Same Google guidance; product-specific logo permission remains unverified. |
| Grok | Neutral name/initial | [Official guidelines](https://x.ai/legal/brand-guidelines) permit accurate service identification with their exact downloadable logos. The linked asset download returned HTTP 403 during this review; no substitute artwork is bundled. |
| Kiro | Purple name/initial | Logo permission not established in this change. |
| Qwen | Violet name/initial | [Qwen's terms](https://qwen.ai/termsservice), section V, reserve the marks and prohibit unauthorized reuse. A redistributable logo permission was not established. |
| Kimi | Blue-violet name/initial | [Kimi's logo terms](https://www.kimi.com/zh-cn/policies/logo-usage-terms) limit the grant to media, news and noncommercial display. Applicability to redistributed software and downstream commercial use remains unverified. |
| Cline | Official dark app icon, neutral badge | [Cline's brand page](https://cline.bot/brand) supplies app icons for light and dark backgrounds. `App Icons/PNG/APP_ICON_DARK.png` is copied unchanged from its [official asset ZIP](https://cline.bot/assets/branding/brand/cline-brand-assets.zip). |
| Factory Droid | Orange name/initial | Logo permission not established in this change. |
| Pi | Peach name/initial | Logo permission not established in this change. |
| DeepSeek | Blue name/initial | [DeepSeek's agreement](https://platform.deepseek.com/downloads/DeepSeek%20User%20Agreement.pdf), section 4.5, reserves brand use. No separate logo permission is recorded. |
| Z.AI, Ollama | Named, colored badges | Logo permission not established in this change. |
| Other APIs and custom providers | Provider name and neutral initial | No logo is guessed, downloaded dynamically or borrowed from an unrelated service. |

“Permission not established” does not mean all use would be unlawful. It means this release keeps a plain name badge rather than claiming permission it has not verified. Colors are interface accents chosen for readability, not exact reproductions of brand marks.

The files live in `mobile/assets/providers/`, shared by Flutter and the desktop renderer. To add a logo, record its official source and applicable permission, preserve the original artwork, and add it to both identity mappings. Existing provider integrations and usage adapters are independent of the icon list. A logo or badge does not imply that subscription limits are available for that provider.
