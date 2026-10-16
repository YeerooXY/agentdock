# Web design and page review

Use this guide whenever you create, redesign or review a website or web page. Follow the user's brief, project instructions and existing brand. Keep your replies short and human. These are working requirements, not a claim that any page is legally compliant.

## Design the page

- For image generation, try your own image generator first. Use Meshy only if your own image generation is unavailable or fails. For page ideas, inspect the actual desktop/mobile screenshots and generate a flat 2D page concept from those references, not a 3D model. Do not submit another paid task to retry a pending job.
- Discover Dock’s built-in tools with `dock_tools` using connection `dock`. Save screenshots, test reports and generated concepts with `dock/save_result`; it keeps a copy in Results. Record actual test outcomes and remaining manual checks. Use `dock/notify` for a concise completion, question or error. Website reviews and Meshy fallback jobs are available there too. Other connected tools remain available through the same shared tool discovery.

- Establish the audience, page purpose and main action from the brief and existing project. Make reasonable assumptions explicit; ask only when a missing fact changes the work.
- Read the existing components and styles before adding new ones. Choose a clear hierarchy, consistent typography, spacing, colors and image treatment. Give the main action appropriate prominence. Avoid decorative clutter and generic sections without a purpose.
- Use real content and honest evidence. Keep labels clear, prices precise and paragraphs readable. Never invent customers, testimonials, statistics, certifications or business details.
- Design for narrow phones, tablets and desktops. Check long text, zoom, wrapping and touch targets. Preserve useful context between pages.
- Build relevant loading, empty, success, disabled and error states. Keep valid form input after failures. Show what happened and how to recover. Every visible control must work or clearly explain why it is unavailable.
- Prefer semantic HTML and native controls. Provide labels, accessible names, visible focus and reduced-motion support. Use animation to clarify changes without delaying the task.
- Keep pages fast: size and compress images, reserve media space, load secondary assets when needed, and avoid unnecessary scripts, fonts and tracking.

## Required review for every page

Review all 20 items for every page. Shared policies may live on dedicated pages with clear links. Record each as checked, needs work, or not applicable with a reason in a project review note. A screenshot or passing automated scan alone is not proof. Verify applicable requirements against current primary sources for the site's audience, jurisdiction and actual data flows. Do not silently invent missing policy facts or collect extra personal data just to complete this checklist.

1. **Privacy policy:** Where personal data is processed, provide accurate, accessible information about collection, purposes, sharing, retention, rights and contact details that matches the implementation.
2. **Terms of service:** Check whether terms are needed for the offered service and how users encounter them. Use the actual service rules and owner-approved details.
3. **Refund policy:** If selling, explain the real refund, cancellation and return process, including applicable consumer rights. Do not fabricate blanket exclusions.
4. **Cookie policy:** Inventory cookies, local storage and similar technologies. Explain their real purpose, providers and duration where required.
5. **Cookie consent banner:** Determine whether consent is required for the technologies used. If required, block nonessential technologies until consent, make rejection straightforward and allow later changes. Do not add a decorative banner to a site that needs no consent flow.
6. **Form consents:** Give clear purposes, separate optional marketing choices and link relevant privacy information. Test the actual submission and consent handling. Do not use preselected consent or demand consent when another basis properly applies.
7. **No unnecessary data:** Remove fields, collection, logging and retention that have no necessary purpose. Never expose keys or private data in client code.
8. **Third-party SDKs:** Review what each SDK sends, to whom and when, including before consent. Remove unused SDKs and document retained ones.
9. **No dark patterns:** Avoid disguised ads, fake urgency, forced extras, misleading buttons, obstructed cancellation and shame-based choices.
10. **No hidden fees:** Make totals, recurring charges, taxes or how they are calculated, renewal terms and commitments clear before purchase.
11. **No fake reviews:** Publish only genuine, supportable reviews with permission and appropriate disclosures. Label demos clearly and keep them out of live social proof.
12. **No unsupported claims:** Check evidence for performance, results, comparisons and guarantees. Remove or qualify claims that cannot be supported.
13. **Accessible alt text:** Describe meaningful images in context. Use empty alt text for decoration; provide accessible names for image controls and appropriate alternatives for charts and media.
14. **Color contrast:** Measure text and interface contrast, including hover, focus, error and disabled states as applicable. Target WCAG 2.2 AA; do not rely on color alone to communicate meaning.
15. **Keyboard navigation:** Test the full task with a keyboard: order, focus visibility, menus, dialogs, escape and returning focus. Avoid traps and inaccessible hover-only controls.
16. **Business details:** Check required identity, contact and registration information for the business and jurisdiction. Ask for missing facts instead of inventing them.
17. **Children's data:** Determine whether children are an intended audience and which age and parental-consent rules apply. Implement an appropriate flow only where needed; never assume one universal age threshold.
18. **Email unsubscribe:** If sending marketing email, provide and test a working unsubscribe mechanism. Distinguish marketing from necessary service messages and honor the relevant rules.
19. **Font and image licenses:** Verify rights to use fonts, images, icons, video and other assets. Keep attribution and license records where required.
20. **Data deletion requests:** Where personal data is held, provide a usable request route and an actual handling process. Explain applicable retention limits and exceptions accurately; a dead link is not a deletion process.

## Verify and hand over

Inspect the rendered page at phone and desktop widths. Walk through the primary action, navigation, forms, errors, consent behavior and keyboard flow. Check links, overflow, focus, network requests and console errors. Fix concrete failures before calling the work done. Report the result briefly; link the review note and mention only unresolved items that matter. Never claim a legal or accessibility certification from this checklist.

Primary references to consult when relevant: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) and [European Commission data protection information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en). Check the appropriate regulator for other jurisdictions.
