# Provider names, colors and logos

Reviewed 20 October 2026; seven logos added 23 October 2026. Provider marks identify the connected service; Paddock has its own branding and does not claim sponsorship. All bundled images load locally. Viewing a meter, console badge or provider list makes no request to a logo service.

Twelve images are bundled. Each is the owner's own artwork, unchanged except for size; SVG-only marks were converted to 192 px PNG because the phone app shows PNG. These assets retain their owners' rights and brand conditions; they are not relicensed under Paddock's code license. The use here is a small identifier; icon-only controls include an accessible provider name. This review records the published guidance and our implementation choice, not a legal certification.

| Provider | Display | Source / decision |
| --- | --- | --- |
| OpenAI / Codex | OpenAI icon, blue meter | [OpenAI brand guidelines](https://openai.com/brand/) permit related-service identification subject to their terms. The unchanged icon is supplied by [OpenAI's developer site](https://developers.openai.com/favicon.png). |
| Cursor | Cursor icon, neutral badge | The [official brand resources](https://cursor.com/brand) provide icons to represent Cursor. Use the supplied [192px icon](https://cursor.com/marketing-static/icon-192x192-light.png), preserving colors and proportions. |
| OpenCode | OpenCode icon, neutral badge | The [official brand resources](https://opencode.ai/brand) provide OpenCode assets. The [official site icon](https://opencode.ai/favicon-96x96-v3.png) is included unchanged. |
| Claude / Anthropic | Official Claude icon, coral accent | Unchanged [Claude website favicon](https://assets.claude.com/95a868946ac8a31e5ff832e2899f294aa368b836.png), from [claude.com](https://claude.com/), identifies the selected service in mobile and desktop. [Anthropic trademark conditions](https://www.anthropic.com/legal/trademark-guidelines) ask for prior approval of uses and materials. No such approval is recorded here; asset provenance alone does not grant permission. |
| GitHub Copilot | Purple name/initial | [GitHub's current Copilot guide](https://brand.github.com/brand-identity/copilot) deprecates the old standalone logo. No suitable approved asset/use has been established here. |
| Gemini | Official Gemini CLI icon | Full-colour icon from the official [Gemini CLI brand kit](https://geminicli.com/brand-kit/) (`gemini-cli-icon_full-color@4x.png`, resized). Its [logo and icon guidelines](https://geminicli.com/brandassets/gemini_cli_logo_icon_guidelines.pdf) describe the icon for places where Gemini CLI is offered separately from its name, and forbid altering it or its gradient. |
| Antigravity | Official Antigravity icon | Full-colour icon from the official [Antigravity press assets](https://antigravity.google/press) (`antigravity-icon__full-color.png`, resized). The page publishes the files for download; no separate usage terms were shown. |
| Grok | Neutral name/initial | [Official guidelines](https://x.ai/legal/brand-guidelines) permit accurate service identification with their exact downloadable logos. The guidelines page and asset download returned HTTP 403 on 20 and 23 October 2026; no substitute artwork is bundled. |
| Kiro | Official site icon | [kiro.dev](https://kiro.dev/) site icon (`/icon.svg`, rasterized). No brand page or usage terms were found; this is identification of the installed CLI. |
| Qwen | Violet name/initial | [Qwen's terms](https://qwen.ai/termsservice), section V, reserve the marks and prohibit unauthorized reuse. A redistributable logo permission was not established. |
| Kimi | Blue-violet name/initial | [Kimi's logo terms](https://www.kimi.com/zh-cn/policies/logo-usage-terms) limit the grant to media, news and noncommercial display. Applicability to redistributed software and downstream commercial use remains unverified. |
| Cline | Official dark app icon, neutral badge | [Cline's brand page](https://cline.bot/brand) supplies app icons for light and dark backgrounds. `App Icons/PNG/APP_ICON_DARK.png` is copied unchanged from its [official asset ZIP](https://cline.bot/assets/branding/brand/cline-brand-assets.zip). |
| Factory Droid | Official site icon | [factory.ai](https://factory.ai/) site icon (`/favicon.svg`, rasterized). No brand page or usage terms were found. |
| Pi | Official site icon | [pi.dev](https://pi.dev/) site icon (`/favicon.svg`, dark-scheme colours, rasterized). No brand page or usage terms were found. |
| DeepSeek | Blue name/initial | [DeepSeek's agreement](https://platform.deepseek.com/downloads/DeepSeek%20User%20Agreement.pdf), section 4.5, reserves brand use. No separate logo permission is recorded. |
| Z.AI | Official site icon | [z.ai](https://z.ai/) site icon (`z-cdn.chatglm.cn/z-ai/static/logo.svg`, rasterized). No brand page or usage terms were found. |
| Ollama | Official site icon | [ollama.com](https://ollama.com/) apple-touch icon (`/public/apple-touch-icon.png`, unchanged). No brand page or usage terms were found. |
| Other APIs and custom providers | Provider name and neutral initial | No logo is guessed, downloaded dynamically or borrowed from an unrelated service. |

“Permission not established” does not mean all use would be unlawful. It means this release keeps a plain name badge rather than claiming permission it has not verified. Colors are interface accents chosen for readability, not exact reproductions of brand marks.

The files live in `mobile/assets/providers/`, shared by Flutter and the desktop renderer. To add a logo, record its official source and applicable permission, preserve the original artwork, and add it to both identity mappings. Existing provider integrations and usage adapters are independent of the icon list. A logo or badge does not imply that subscription limits are available for that provider.

The desktop shell chooser, console header, fullscreen tabs and HUD use these same identifiers. Logos retain their original colors and proportions; project colors apply to separate dots and usage bars. The chooser always includes the service name, and icon-only console marks have accessible names. Unknown providers retain an initial rather than an invented logo. Provider branding remains secondary to Paddock.

Trademark use depends on purpose, jurisdiction and the particular mark. A small integration identifier does not itself establish permission or infringement. OpenAI's guidelines allow compliant use subject to their conditions; Anthropic's published conditions are stricter. Review applicable rights before distributing a branded build, and use a name badge when a required approval cannot be obtained. This is a provenance record and implementation review, not a legal opinion.
