# Source register

Accessed for this research on 23 October 2026. This register distinguishes published findings, normative requirements, platform documentation, company guidance, direct website observations, and material listed for later viewing. The [guide](handbook.md) contains original synthesis and explicitly labeled working defaults.

We use primary publishers: W3C, browser/platform maintainers, the original research organizations, official company guidance, and the observed websites. Public summaries do not expose every study's raw data. Brand recognition and a polished page are not evidence that a particular design caused business success.

## Reading method and confidence

**Relevant body reviewed** means the substantive sections needed for the cited point were read, not every linked resource or the publisher's complete research library. **Selected transcript** means the relevant official transcript passages were read. **Frame samples** means the timestamped images were also inspected. **Description only** and **indexed excerpt** are weaker access levels and do not support claims about unobserved detail.

Where an article has been updated, its historical study population and methods still constrain its conclusions. Where browser documentation is dated, verify the actual target versions before implementing. Numerical layout, timing and file-size defaults proposed in the guide are our conventions unless explicitly attributed to a standard or metric definition.

## Research and design guidance

| Source | Type and material reviewed | Use and boundary |
| --- | --- | --- |
| [NN/G — Homepage Design Principles](https://www.nngroup.com/articles/homepage-design-principles/) | Original research organization's guidance; relevant body reviewed | Identity, purpose, examples and routes onward; not a universal hero template. |
| [NN/G — Scrolling and Attention](https://www.nngroup.com/articles/scrolling-and-attention/) | Published 2018 study discussion; relevant body reviewed | Early attention and continued scrolling; desktop study percentages are not universal fold rules. |
| [NN/G — F-Shaped Pattern of Reading on the Web](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) | Research clarification; relevant body reviewed | Several reading/scanning patterns exist; avoid treating F as a design stencil. |
| [NN/G — Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design/) | Design guidance; relevant body reviewed | Scale, hierarchy, contrast, balance and grouping. |
| [NN/G — Progress Indicators](https://www.nngroup.com/articles/progress-indicators/) | Usability guidance; relevant body reviewed | Feedback and choosing a waiting indicator; timing heuristics require context. |
| [NN/G — Animation Duration](https://www.nngroup.com/articles/animation-duration/) | Usability guidance, 2020; relevant body reviewed | Motion duration depends on scale and repetition; guide tokens are proposed conventions. |
| [NN/G — Dark Mode: How Users Think About It and Issues to Avoid](https://www.nngroup.com/articles/dark-mode-users-issues/) | User research/guidance; relevant body reviewed | Preference, context and readability concerns; no universal dark-mode advantage. |
| [NN/G — Applying Writing Guidelines to Web Pages](https://www.nngroup.com/articles/applying-writing-guidelines-web-pages/) | Historical study, 1998; relevant body reviewed | Concise, scannable, objective writing; historical percentage gains are not forecasts. |
| [NN/G — Why 5 Participants Are Okay in a Qualitative Study, but Not in a Quantitative One](https://www.nngroup.com/articles/5-test-users-qual-quant/) | Research-method guidance; relevant body reviewed | Distinguish problem finding from population measurement; cover distinct groups. |

## Ecommerce research

Baymard's public research articles synthesize its testing and benchmarks. We reviewed the public content, not the paid research library or raw participant data. Recommendations must still be matched to the catalogue and audience.

| Source | Material reviewed | Use and boundary |
| --- | --- | --- |
| [Baymard — Current State of Ecommerce Product Page UX](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux) | Public article, updated March 2026; relevant body | Product evaluation, option visibility, scale imagery and buying information. |
| [Baymard — Current State of Product Lists and Filtering](https://baymard.com/research-articles/current-state-product-list-and-filtering) | Public article, updated September 2025; relevant body | Comparing products, variation grouping and useful views. |
| [Baymard — How to Design Applied Filters](https://baymard.com/research-articles/how-to-design-applied-filters) | Public article, updated May 2026; relevant body | Applied criteria, removal and result context. |
| [Baymard — Checkout Flow UX Optimization](https://baymard.com/blog/checkout-flow-ux-optimization) | Public article, April 2026; relevant sections | Guest routes, effort, field clarity and recovery; no promised uplift. |
| [Baymard — Current State of Checkout UX](https://baymard.com/research-articles/current-state-of-checkout-ux) | Public article, updated November 2025; relevant body | Delivery/guest/error details and checkout evaluation. |
| [Baymard — Mobile Ecommerce UX](https://baymard.com/research-articles/mobile-ux-ecommerce) | Public summary/excerpts reviewed | Additional mobile-commerce context; not treated as a fully reviewed mobile research corpus. |

## Accessibility and interaction

WCAG's normative Recommendation defines conformance requirements. The Understanding pages explain individual criteria and exceptions. The guide distinguishes AA requirements from AAA criteria and from our more generous defaults.

| Source | Type and access | Use |
| --- | --- | --- |
| [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Normative Recommendation; relevant criteria reviewed | Overall requirements and scoped exceptions. |
| [W3C — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Explanatory body reviewed | Normal/large text thresholds and exact ratio comparison. |
| [W3C — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) | Explanatory body reviewed | Necessary UI/graphical information and adjacent colors. |
| [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Explanatory body reviewed | AA 24 CSS px criterion and exceptions; separate from touch-comfort defaults. |
| [W3C — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Explanatory body reviewed | Narrow/enlarged layouts and scoped two-dimensional exceptions. |
| [W3C — Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Explanatory body reviewed | AA minimum versus the preferred fully visible focused control. |
| [W3C — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | Explanatory body reviewed | Conditions for ongoing movement and auto-updating information. |
| [W3C — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Explanatory body reviewed | AAA criterion for disabling nonessential triggered motion. |
| [W3C APG — Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Authoring guidance; relevant body reviewed | Focus containment, background interaction and return behavior. |
| [GOV.UK Design System — Error Summary](https://design-system.service.gov.uk/components/error-summary/) | Official implemented pattern; relevant body reviewed | Linked summary and field errors, focus and consistent text. |
| [Unicode — Unicode Emoji, UTS #51](https://unicode.org/reports/tr51/) | Technical report; relevant sections reviewed | Presentation, sequences and rendering variability; no promise of identical vendor artwork. |

## Browsers, performance and device behavior

| Source | Type and access | Use and boundary |
| --- | --- | --- |
| [Google web.dev — Web Vitals](https://web.dev/articles/vitals) | Metric-owner guidance; body reviewed | LCP, INP, CLS, good thresholds, percentile and field context. |
| [Google web.dev — Optimize LCP](https://web.dev/articles/optimize-lcp) | Browser performance guidance; relevant body reviewed | Discovery, download, server and rendering delay. |
| [Google web.dev — Font Best Practices](https://web.dev/articles/font-best-practices) | Technical guidance; relevant body reviewed | Font loading, visibility and layout shift. |
| [Google web.dev — High-performance CSS Animations](https://web.dev/articles/animations-guide) | Technical guidance; relevant body reviewed | Prefer suitable transform/opacity work and profile the actual rendering. |
| [Google web.dev — Typography](https://web.dev/learn/design/typography) | Responsive design guidance; relevant body reviewed | Relative type sizes and useful line measures; actual language/font matters. |
| [Chrome — Prepare for Viewport Resize Behavior Changes](https://developer.chrome.com/blog/viewport-resize-behavior) | Version-specific platform explanation, Chrome 108; relevant body reviewed | Layout/visual viewport and keyboard behavior; distinguish WebViews and later versions. |
| [WebKit — Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) | Platform explanation, 2017; relevant body reviewed | Safe-area and edge-to-edge layout principles; use current syntax/support. |
| [MDN — hover Media Feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/hover) | Browser documentation; relevant body reviewed | Input capability rather than width as a hover condition. |
| [MDN — pointer Media Feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/pointer) | Browser documentation; relevant body reviewed | Primary pointer accuracy; hybrid devices need additional testing. |
| [MDN — cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/cursor) | Browser documentation; relevant body reviewed | Native cursor behavior and iPadOS limitations. |
| [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | Browser documentation; body reviewed | Detecting the user's preference and preserving meaningful states. |
| [MDN — length Values](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) | Browser documentation; viewport sections reviewed | Small, large and dynamic viewport units; actual keyboard behavior still needs testing. |
| [Playwright — Emulation](https://playwright.dev/docs/emulation) | Official test-tool documentation; relevant body reviewed | Simulated viewport, device, input and environment properties; not physical hardware evidence. |
| [Android Developers — Make Apps More Accessible](https://developer.android.com/guide/topics/ui/accessibility/apps) | Native platform guidance; body reviewed | Android's 48dp touch-target recommendation; native dp is distinct from web CSS px. |
| [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | Official indexed excerpt reviewed; JavaScript page limited direct text extraction | Native 44pt touch guidance; not a web conformance rule. |
| [Apple HIG — Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | Official indexed excerpt reviewed; JavaScript page limited direct text extraction | Determinate/indeterminate context; broader loading claims rely on the sources above. |

## Font choice and content design

| Source | Type and access | Use and boundary |
| --- | --- | --- |
| [USWDS — Typography](https://designsystem.digital.gov/components/typography/) | Government design-system guidance; relevant excerpts reviewed | Reading measure as a range and text-role guidance. |
| [Inter — Official Font Site](https://rsms.me/inter/) | Creator documentation; body reviewed | Features, optical sizes and license route; keep downloaded license. |
| [Braille Institute — Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) | Creator/publisher guidance; body reviewed | Distinctive letterforms and availability; test with the actual audience. |
| [Mailchimp — Writing Principles](https://styleguide.mailchimp.com/writing-principles/) | Company's own style guide; body reviewed | Useful, appropriate and truthful content; preserve our own voice. |
| [Mailchimp — Style Guide Summary](https://styleguide.mailchimp.com/tldr/) | Company's own style guide; relevant content reviewed | Concrete editing habits; no blanket import of a brand's house rules. |
| [Intuit Content Design — Mailchimp Voice and Tone](https://contentdesign.intuit.com/voice-tone/mailchimp/) | Current brand-owner guidance; relevant body reviewed | A specific voice can coexist with clear instructions; not a tone for every project. |

Commercial brand fonts seen on live pages are examples, not free resources. A publicly readable writing guide is not permission to redistribute it as our own skill. This deliverable uses short references and original synthesis.

## Privacy, consumer information and security

| Source | Type and access | Use and boundary |
| --- | --- | --- |
| [European Commission — Information for Individuals](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en) | Regulator/government information; relevant content reviewed | Personal-data information and rights; applicability depends on real data flows. |
| [Your Europe — Pricing and Payments](https://europa.eu/youreurope/citizens/consumers/shopping/pricing-payments/index_en.htm) | EU consumer guidance; relevant body reviewed, page checked January 2026 | Total price, payment commitment and optional charges; no universal tax/refund conclusion. |
| [OWASP — Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) | Maintainer's framework page reviewed | Technical assessment framework; this research did not perform an ASVS audit. |
| [MDN — Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy) | Browser header reference; relevant explanatory sections reviewed | Policy behavior and implementation reference; test the actual site's integrations. |

The workbook's 70-item review scope comes from the user's workspace instructions. It is a practical project checklist, not a claim that these four sources define every legal or security obligation.

## Videos and reviewed depth

| Source | Reviewed depth | Useful return points |
| --- | --- | --- |
| [Apple 2025 — Make a Big Impact with Small Writing Changes](https://developer.apple.com/videos/play/wwdc2025/404/) | Official transcript plus frames at 2:48 and 6:40 | Filler 1:18; repetition 6:12; reasons 7:13; word lists 9:23. |
| [Apple 2020 — The Details of UI Typography](https://developer.apple.com/videos/play/wwdc2020/10175/) | Selected transcript plus frames at 4:17 and 25:05 | Optical treatment near 0:44; custom-font scaling near 24:52. |
| [Apple 2025 — What's New in Safari and WebKit](https://developer.apple.com/videos/play/wwdc2025/233/) | Animation transcript portion plus frames at 4:05 and 10:35 | Animation chapter starts 1:46; later chapters not assessed at equal depth. |
| [Apple 2022 — Writing for Interfaces](https://developer.apple.com/videos/play/wwdc2022/10037/) | Selected official transcript; no frame capture | Purpose, anticipation, context and empathy. |
| [NN/G — Homepage Design Mistakes](https://www.nngroup.com/videos/homepage-design-mistakes/) | Description only; further-viewing item | Revisit first-screen hierarchy and false floors. |
| [NN/G — 5 Design Principles in Context: Stripe](https://www.nngroup.com/videos/5-design-principles-in-context-stripe/) | Description only; further-viewing item | Compare the publisher's analysis with our dated page evidence. |

The [atlas](atlas.md) includes sampled frames and explains the application. Timestamps are revisiting aids, not a claim of full continuous viewing.

### Inherited video notes

The installed product-ui-ux skill already contained notes from five YouTube videos. We read those notes for continuity; the following videos were **not rewatched or independently revalidated in this task**. Their prior notes are not fresh evidence for numerical claims.

- [UX Peak — mobile product-page study](https://www.youtube.com/watch?v=GGg61sdEjeI).
- [UX Peak — psychology examples](https://www.youtube.com/watch?v=2TlIg3VokY8).
- [UX Peak — design gap discussion](https://www.youtube.com/watch?v=U7jTCgIWS4w).
- [UX Peak — redesign examples](https://www.youtube.com/watch?v=zr37ibqXl1U).
- [Kole Jain — design fundamentals](https://www.youtube.com/watch?v=EcbgbKtOELY).

## Directly observed websites

These links support the dated observations in the atlas. Live content can change, so use the saved screenshots and manifests to understand the exact sampled state.

| Website/route | Evidence captured | Scope |
| --- | --- | --- |
| [Linear](https://linear.app/) | Six initial profiles and a desktop scroll | Software introduction and demonstration. |
| [Stripe](https://stripe.com/) | Desktop/phone and a desktop scroll | Regional software/payment introduction. |
| [Basecamp](https://basecamp.com/) | Six initial profiles and a desktop scroll | Task links, demonstration and authored explanation. |
| [GOV.UK](https://www.gov.uk/) | Desktop/phone and a desktop scroll | Search, categories and cookie-confirmation state. |
| [Apple MacBook Air](https://www.apple.com/macbook-air/) | Six initial profiles and a desktop scroll | Product imagery, regional banner and local navigation. |
| [IKEA frames and pictures](https://www.ikea.com/hu/hu/cat/keretek-es-kepek-10757/) | Desktop/phone, post-consent repeats and grid scrolls | Category comparison and responsive product rows. |
| [IKEA BILLY](https://www.ikea.com/hu/hu/p/billy-koenyvespolc-feher-00263850/) | Six initial profiles and six post-consent repeats | Gallery, dimensions, purchase information and overlay space. |
| [Patagonia men's jackets](https://www.patagonia.com/shop/mens/jackets-vests) | Desktop/phone and a desktop scroll | Phone catalogue; unresolved desktop interstitial. |
| [Notion](https://www.notion.com/) | Desktop/phone and a desktop scroll | Illustration, task explanation and action hierarchy. |
| [Mailchimp](https://mailchimp.com/) | Desktop/phone and a desktop scroll | Font-role pairing, photographic crop and trial route. |

## Access limitations and excluded material

The old GOV.UK writing-guide route redirected to a page whose substantive content was not recovered. A Google Fonts FAQ route returned insufficient usable content. A Material 3 accessibility-basics route and a web.dev dynamic-viewport route did not resolve usefully. They were excluded from substantive evidence; working alternatives are the official Android and MDN references above. Apple's JavaScript HIG pages were limited to the access level recorded in the table.

No paid study access, conversion analytics, actual-device lab, participant sessions, private business policies, or competitor source code was available for this task. The guide retains those boundaries instead of assigning unsupported scores.

## Maintenance

When applying a recommendation, confirm that its source and context still fit. Recheck browser support, legal rules, security dependencies and live examples at implementation time. Preserve the original access date when adding a new observation. Store concise original takeaways, a source, a counterexample and a verification task; do not accumulate copied articles or transcripts in the shared skill.
