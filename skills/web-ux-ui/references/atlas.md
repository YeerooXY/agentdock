# Website and video reference atlas

Screenshots from the original study are not redistributed. Open the live pages to inspect their current state.

Observed 23 October 2026. Companion to the [design guide](handbook.md). These are dated examples of composition and content, with conditional lessons for our work. We have no access to the organizations' conversion data or experiments.

## How the evidence was collected

Ten public URLs from nine organizations were opened in 36 initial browser/profile combinations. Eight IKEA combinations were repeated after rejecting optional cookies through the visible control. Additional scroll captures show selected lower-page content. The original study kept 56 page screenshots, six video frames, the capture scripts and manifests; they are not part of this skill.

| Profile | Viewport in CSS pixels | Execution and limits |
| --- | --- | --- |
| Windows desktop | 1440 × 1000 | Headless Chromium 156.0.8078.4 on Windows; desktop browser rendering |
| Desktop WebKit | 1440 × 1000 | WebKit 27.2 on Windows; engine comparison, **not actual Mac Safari** |
| iPhone profile | 390 × 664 | WebKit with iPhone 13 device settings; **emulated** |
| Android phone profile | 412 × 839 | Chromium with Pixel 7 device settings; **emulated** |
| iPad profile | 810 × 1080 | WebKit with iPad generation 7 settings; **emulated** |
| Android tablet layout | 800 × 1280 | Chromium with mobile/touch settings; generic viewport, **not a named device** |

All captures used device scale factor 1. The phone viewports differ in both width and height. A difference between them cannot be attributed to the operating system alone. Font rasterization, emoji artwork, native keyboards, browser chrome, screen readers, thermal performance, and physical touch behavior require real-device checks.

Every URL received desktop Chromium and iPhone-profile coverage. Linear, Basecamp, Apple, and the IKEA product page received all six profiles. The scripts waited for document readiness and fixed delays. These delays do not measure loading speed. There was no horizontal document overflow in the 36 initial sampled states; this does not establish complete responsive behavior.

The study inspected ten contact sheets and selected original screenshots. Actions were limited to loading public pages, rejecting optional cookies where available, and scrolling. We did not test orders, accounts, forms, consent network behavior, or security controls. Public screenshots remain contextual reference material; do not reuse brand assets in our products.

## Software introductions: four different compositions

*Desktop evidence. Compare the space allocated to language, navigation, demonstration, and action.*

*Phone evidence. These are WebKit profiles on Windows, not physical iPhone captures.*

### Linear: product imagery within a dark identity

[Live page](https://linear.app/)

**Observed:** a dark surface, large left-aligned introduction, substantial open space, and a product demonstration below. The signup route remains in the header. Inter Variable appears in the sampled CSS font declarations. On the phone, the heading wraps and the broad desktop demonstration becomes much smaller.

**Useful pattern:** identify the product category and place an actual interface near the explanation. A restrained visual system can let product imagery supply detail.

**Decision for our work:** decide whether a demonstration must merely identify the interface or teach a particular task. If teaching matters, provide a meaningful crop or sequence on narrow screens.

**Wording finding:** the downstream heading “A new species of product tool” is metaphorical and provides little task information. Use the actual capability as our section heading. This finding was reported during the research.

**Limits:** appearance does not establish readable contrast across animation frames, keyboard behavior, or signup completion.

### Stripe: a distinctive surface around concrete payment tasks

[Live page](https://stripe.com/)

**Observed:** the URL resolved to the Hungary-facing region. Light content sits with a saturated color ribbon. Large introductory text combines category and scope. A purple signup action and a Google account route are visible; sales remains a separate route. The phone version condenses and stacks content. The sampled principal font declaration is sohne-var.

**Useful pattern:** distinguish self-service intent from a sales conversation. Explain the actual category before expecting a visitor to interpret abstract artwork.

**Decision for our work:** a dynamic color field needs contrast measured against its rendered frames, a static fallback, reduced-motion behavior, and a resource budget. A computed text color alone may miss blending and overlays.

**Limits:** duplicated text nodes in the DOM are not evidence of duplicated visible headings. We did not test account creation or assess financial claims.

### Basecamp: a demonstration and a directory of tasks

[Live page](https://basecamp.com/)

**Observed:** desktop gives considerable space to a product example and a compact directory of explanatory links. On the phone, the introduction and actions precede the demonstration. Graphik is the principal declared family. Background color differed among sessions; the cause was not established.

**Useful wording:** “Manage projects, coordinate teams” names work directly. A longer authored explanation further down supplies character through concrete product discussion and a personal voice.

**Decision for our work:** responsive design can change information priority, not merely shrink the columns. Keep the reading and focus order coherent when changing placement.

**Wording finding:** the introduction asserts uniqueness without specifying the relevant distinction. Our copy should supply that distinction. The exact example was reported during the research.

**Limits:** the page's displayed customer/usage claims were not independently verified. Color differences are not evidence of an OS-specific theme.

### Notion: restrained UI framing and recognizable illustration

[Live page](https://www.notion.com/)

**Observed:** a white surface, heavy headline, black illustration, a blue primary action, and a quieter demo route. Supporting content names work with content, answers, and automation. Phone content centers and stacks, with the product example following the introduction. Sampled CSS names a NotionInter family.

**Useful pattern:** keep illustration, product demonstration, and conversion controls in distinct roles. Reuse a consistent illustration language instead of mixing unrelated decorative assets.

**Decision for our work:** ensure the category and actual workflow remain understandable when the illustration is removed. Use the supporting explanation to specify the product's scope.

**Wording finding:** the customer-proof heading describes customers as the “most ambitious companies,” an unsupported comparison. In our work, a factual customer heading and genuine permission-backed evidence are sufficient.

**Limits:** visible logos establish what the page displays; they do not establish our right to reuse them or verify individual customer relationships.

## Responsive comparisons beyond phone width

*Linear: the broad demonstration is visually dense on narrow screens. Desktop WebKit is a Windows-hosted engine check.*

*Basecamp: tablet space supports a different composition from the short phone view. These captures support layout observations; actual macOS font rendering remains untested.*

## Task search and photographic marketing

### GOV.UK: the task is the introduction

[Live page](https://www.gov.uk/)

**Observed:** recognizable identity, a prominent search field, and categorized routes. Blue, white, and clear typographic levels establish the structure. The sampled font stack includes GDS Transport and Arial. A cookie-rejection confirmation remained at the top, with a control to hide that message.

**Useful pattern:** a service directory can prioritize search and named tasks immediately. It does not require a large product-marketing illustration.

**Decision for our work:** design both the initial consent state and the confirmation state. A dismissed choice can still leave a message that affects the usable first screen.

**Limits:** this capture does not validate all government journeys, all accessibility requirements, or the site's cookie behavior. The remaining confirmation explains part of the screenshot's vertical allocation.

### Mailchimp: two font roles and a photographic crop

[Live page](https://mailchimp.com/)

**Observed:** the region presented EUR context. A serif headline contrasts with sans-serif interface text; sampled declarations include Means Web and Tally/Graphik. A darkened photograph supports yellow actions. The phone crop changes the visible photographic composition. “Start Free Trial” identifies a specific next route.

**Useful pattern:** a second font family can contribute a defined brand role while labels retain a consistent UI face. Plan image crops as part of the layout.

**Decision for our work:** measure text contrast against the actual crop and all relevant image states. Place verified trial duration and billing consequences near the commitment. A concise button does not replace those facts.

**Wording finding:** the downstream heading “Design with ease” omits the specific assistance. Our copy should name the operation and supported help.

**Limits:** we did not test trial terms or account flow. Displayed ratings, endorsements, and customer counts remain unverified page content.

## Product storytelling and the fold

### Apple MacBook Air: imagery, regional UI, and buying context

[Live page](https://www.apple.com/macbook-air/)

**Observed:** large hardware imagery, a regional selection banner, and financing/promotional content occupy substantial height. The short phone capture ends before the price and buying action; the taller Android profile exposes more. A lower desktop capture shows product-specific navigation with a buying route. CSS declares SF Pro text/display roles.

**Useful pattern:** product photography can identify a familiar physical product immediately. A persistent local product navigation can support continued evaluation.

**Decision for our work:** test the complete visible stack, including regional, consent, and promotional UI. Evaluate short heights as well as narrow widths. Treat commercial font licensing separately from visual inspiration.

**Wording finding:** the product highlights frame an upgrade using “isn’t just” and “game changer.” This is the contrastive promotional formula our wording baseline excludes. Retain verified hardware facts and describe their relevant consequences.

**Limits:** viewport height and regional state confound a simple iOS/Android comparison. These screenshots establish neither hardware claims nor the performance of Apple's purchase flow.

## Shops: product detail and comparable lists

### IKEA BILLY: dimensions and buying details beside the gallery

[Live product](https://www.ikea.com/hu/hu/p/billy-koenyvespolc-feher-00263850/)

**Observed:** the Hungarian desktop page places a large gallery beside identity, finish, dimensions, price, ratings, delivery checking, quantity, and an add-to-cart action. The captured white 80 × 28 × 202 cm item displayed 22,990 Ft including VAT. This is a dated observation, not a current price offer. The Noto IKEA font stack contains language and currency fallbacks.

On phone and tablet, imagery takes much of the initial view and buying details continue below. A floating chat entry shares the lower viewport. The initial cookie panel occupied most of the short phone screen; the optional-cookie rejection control required access farther down the panel. Supplementary captures show the page after rejection.

**Decision for our work:** preserve dimensions, selected option, price basis, delivery context, and purchase state. Test the combined height of gallery, header, consent, and chat. A long fallback font stack does not imply many visual font roles.

**Limits:** no variant, availability, cart, or checkout flow was tested. Rejecting optional cookies through the UI does not verify what requests were blocked.

### IKEA frames and pictures: comparison density changes by layout

[Live category](https://www.ikea.com/hu/hu/cat/keretek-es-kepek-10757/)

**Observed:** the desktop list combines filters and a multi-column grid. The sampled phone list uses a single product per row, with image and details side by side, plus horizontal filter controls. Dimensions, price, and options supply comparison information.

**Useful pattern:** the amount of information needed to compare an item can justify one product per phone row. Two columns are a choice to test, not a mobile-shop requirement.

**Decision for our work:** prototype cards using the longest real title, meaningful dimensions, price format, unavailable state, and actual variant count. Choose the column count after inspecting those cards.

**Limits:** the screenshots show selected scroll positions. Filtering, back-navigation state, and result updates were not exercised.

### Patagonia jackets: catalogue observed, desktop unresolved

[Live category](https://www.patagonia.com/shop/mens/jackets-vests)

**Observed:** the phone profile showed category context, subcategories, filtering/sorting, and a two-column product list. A cookie panel occupied the lower area; a feedback tab sat at the side. Desktop Chromium returned an interstitial containing a waiting message and support information, despite HTTP 200.

**Useful pattern:** apparel imagery can support a denser visual list when the remaining comparison information fits. Inspect the impact of overlays on usable product space.

**Decision for our work:** verify rendered content, not only HTTP status. A capture can succeed technically while failing to show the intended catalogue.

**Limits:** the interstitial's cause is unknown. It does not establish an outage, a general desktop failure, or an engine incompatibility. This case is not suitable for ranking desktop responsiveness against the other brands.

## What the comparisons support

| Question | Observed pattern | Counterexample or boundary | Decision for our work |
| --- | --- | --- | --- |
| Must a hero be sparse? | Linear uses broad open space. | Basecamp presents dense task links and a substantial demonstration. | Match density to the task and existing knowledge. |
| Must every hero have a centered heading? | Notion centers its introduction. | Linear aligns left; GOV.UK emphasizes search. | Choose the relationship among text, evidence, and action. |
| Should phones use the desktop order? | Some software pages retain broad ordering. | Basecamp changes introduction priority. | Specify phone reading order explicitly. |
| Must a phone shop use two columns? | Patagonia shows two columns. | The sampled IKEA list uses one detailed row. | Preserve information needed to compare. |
| Are dark sites inherently better for software? | Linear uses dark surfaces. | Stripe, Basecamp, and Notion use light or colored surfaces. | Select semantic colors, then test legibility and context. |
| Are two fonts excessive? | Several sites use one principal family. | Mailchimp separates serif headline and sans-serif UI roles. | Require a useful role for each family. |
| Does one phone capture establish OS behavior? | Profiles display different content amounts. | Width, height, region, overlays, and host fonts differ. | Isolate variables and verify on actual devices. |
| Should famous-brand wording be copied? | Several introductions name real work. | Promotional metaphors and unsupported comparisons also appear. | Transfer the specific information pattern; edit claims independently. |

These are comparative observations, not statistical results. We selected recognizable sites across different tasks; the sample is neither random nor representative of all successful websites.

## Video study: inspected material and applications

The videos below were studied through official transcripts and the indicated frame samples. We did not continuously watch every session. Timestamps identify useful passages to revisit and keep visual conclusions separate from transcript summaries.

### Make a big impact with small writing changes — Apple, 2025

[Session and transcript](https://developer.apple.com/videos/play/wwdc2025/404/). Reviewed the writing discussion and inspected frames at **2:48** and **6:40**. Useful chapter starts: **1:18** filler, **6:12** repetition, **7:13** reasons, **9:23** word lists.

The examples show how a short interface can still repeat information or explain an obvious action. Application: edit each message against its immediate purpose, preserve the necessary consequence, and maintain consistent terms. The guide's rewrite examples are original and conditional on actual product behavior.

### The details of UI typography — Apple, 2020

[Session and transcript](https://developer.apple.com/videos/play/wwdc2020/10175/). Reviewed selected optical-size and scaling passages; inspected **4:17** and **25:05**. Useful revisit points: **0:44** optical sizing and approximately **24:52–25:24** custom-font scaling.

The session distinguishes type roles and text/display treatment. Application: compare small text and large headings at their real sizes and test scaling. The native UIFontMetrics example teaches a principle; it is not web implementation code or a requirement to use Apple's font.

### What's new in Safari and WebKit — Apple, 2025

[Session and transcript](https://developer.apple.com/videos/play/wwdc2025/233/). Reviewed the animation portion and inspected **4:05** and **10:35**. Animation begins at **1:46**; later layout, effects, and media chapters were not assessed in equivalent depth.

The relevant demonstration connects progress and animation to timelines. Application: evaluate whether motion reveals a state or merely adds movement. A feature announcement does not establish support across our target browsers. Check current compatibility, progressive enhancement, and reduced motion before implementation.

### Writing for interfaces — Apple, 2022

[Session and transcript](https://developer.apple.com/videos/play/wwdc2022/10037/). Reviewed selected transcript passages on purpose, context, anticipation, and empathy. No frame samples were captured for this session.

Application: define the decision for each screen before shortening its wording. Keep necessary context, including relevant privacy information. Shortness alone is not the quality criterion.

### Further viewing: listed, not watched in this task

- [NN/G: Homepage Design Mistakes](https://www.nngroup.com/videos/homepage-design-mistakes/), July 2024. Page description reviewed; use it to revisit false floors and hierarchy. No independent frame-based conclusions here.
- [NN/G: 5 Design Principles in Context: Stripe](https://www.nngroup.com/videos/5-design-principles-in-context-stripe/), October 2026. Page description reviewed; useful comparison with our dated Stripe capture. The video itself was not inspected.

An earlier skill contained notes from five YouTube studies. Those inherited notes were read for continuity. They were not revalidated as new video evidence. Specific percentage-uplift claims from those notes are not carried into this guide.

## Evidence files and remaining checks

The capture manifests, scripts, original screenshots and contact sheets stayed with the original study. The handbook's four proposed color themes are independently measured in [palette-contrast.csv](../assets/palette-contrast.csv); their results do not describe these brands' colors.

Remaining work for any implementation: actual Mac Safari, iPhone Safari, Android Chrome, and tablet checks; keyboard and screen-reader tasks; zoom and enlarged text; reduced motion; native keyboard and autofill; consent request inspection; performance measurements; real content and policies; and sandbox purchase/error flows. The [verification workbook](workbook.md) turns these into project checks.
