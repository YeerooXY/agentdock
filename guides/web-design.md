# Web design and page review

Use this guide whenever you create, redesign or review a website or web page. Follow the user's brief, project instructions and existing brand. Keep your replies short and human. These are working requirements, not a claim that any page is legally compliant.

## Design the page

- For a new page, substantial redesign or evidence-based review, discover and call `dock/website_guide` with `topic: "overview"`, then read the relevant `layout`, `visual`, `content`, `commerce`, `verification` or `sources` topic. This bundled research covers marketing sites, web applications, shops, services, portfolios and booking flows. Keep small repairs scoped. Use the user's brief and existing brand; distinguish standards, observed patterns and working defaults. It adds no approval requirement.
- The first screen should establish the current task, relevant action and useful evidence. Returning app users need their work; a shop needs search and product decisions. Use concrete copy, semantic color roles and licensed readable type. Start with one font family; use a second only for a distinct role. Keep native pointers for ordinary browsing, meaningful motion with reduced-motion support, and feedback for actual loading. Never fabricate progress, social proof or performance claims.
- Inspect Windows Chromium, Mac Safari, Android Chrome and iPhone Safari, plus useful tablet widths. Prefer real or remote devices; otherwise inspect the corresponding engine/device profiles and label emulated coverage. Record remaining OS font, emoji, keyboard and physical-device checks. A narrow screenshot or clean automated scan is not proof of a complete journey.

- For image generation, follow the user's **Screen previews** preferences in `dock_context`. The default is your own image generator first, with Meshy only if it is unavailable or fails. When preview-first is enabled, an ambiguous request such as “improve this screen” should start with a preview for the user before a substantial redesign. Inspect the actual desktop/mobile screenshots and generate a flat 2D page concept from those references, not a 3D model. Save it in Results. Do not submit another paid task to retry a pending job.
- Discover Paddock’s built-in tools with `dock_tools` using connection `dock`. Save requested concepts and reviews with `dock/save_result`. For a requested review, keep its main report and selected screenshots together in Results. Keep routine verification screenshots, raw test data and logs in the project; link the evidence from the review note. Record actual test outcomes and remaining manual checks. Use `dock/notify` for a concise completion, question or error. Website reviews and Meshy fallback jobs are available there too. Other connected tools remain available through the same shared tool discovery.

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

## Required security review

Review these 50 items for every website and the code that serves it, alongside the page review. In a Paddock website review they are checklist indexes 20–69. Record each as passed, needs work, or not applicable with a reason in a project security note, with the evidence used: source, configuration, git history, dependency audit or a live request. A site without accounts, a database or payments still needs the items that apply to static hosting, forms and third-party scripts.

Whenever an item needs work, tell the user: send `dock/notify` and name the item, the location and the fix in your reply. Do not wait until the end of an unrelated task. Probe only sites the user owns or is authorized to test; use read-only requests and never submit real data, send real email or attempt to bypass a control on a live site.

21. **Exposed database credentials:** No database URLs, users or passwords in source, client code, history or public files.
22. **Public .env files:** `.env` and similar files are git-ignored, absent from the deployed output and return 404 on the live site.
23. **Hardcoded API keys:** Keys live in the host's secret store, not in source or history.
24. **Authentication:** Logins use a maintained provider or library, strong password rules and multi-factor sign-in where offered. Owner accounts for the host, domain, email and analytics use multi-factor sign-in.
25. **Authorization checks:** Every protected server action checks who is asking.
26. **Access to other users' data:** One user cannot read or change another user's records.
27. **Open database permissions:** No public read or write rules.
28. **Cloud storage configuration:** Firebase, Supabase and S3-style buckets and rules are private unless deliberately public.
29. **Admin routes:** Admin pages and APIs require authentication and authorization.
30. **Debug pages:** No debug, test or status pages in production.
31. **Build logs:** CI and build logs do not print secrets.
32. **Verbose errors:** Visitors see plain messages, never stack traces or provider errors.
33. **Leaked repositories:** Repositories are private where intended, and history contains no secrets.
34. **Frontend secrets:** Client JavaScript contains only values that are public by design.
35. **Client-side-only checks:** The server repeats every validation and permission check.
36. **Input validation:** The server checks type, length and allowed values for every input.
37. **SQL injection:** Queries use parameters, never string-built SQL.
38. **NoSQL injection:** Query objects are never built directly from user input.
39. **Cross-site scripting:** Output is escaped for its context; no untrusted `innerHTML` or `eval`.
40. **Cross-site request forgery:** State-changing requests check origin, tokens or SameSite cookies.
41. **File uploads:** Uploads are limited by type and size, stored outside executable paths and served safely.
42. **Path traversal:** File paths built from input cannot leave the intended folder.
43. **Server-side request forgery:** The server fetches only fixed or allow-listed hosts.
44. **Password reset:** Reset tokens are single-use, expire and do not reveal whether an account exists.
45. **Session management:** Sessions expire, rotate on login and end on logout.
46. **JWT secrets:** Signing secrets are strong, private and unique; algorithms are pinned.
47. **CORS:** Only the origins that need access are allowed; never `*` with credentials.
48. **Rate limits:** Login, signup, contact forms, APIs and AI endpoints are rate limited.
49. **Test and staging environments:** Preview and staging URLs are disabled, protected or free of real data.
50. **Default credentials:** No default or shared passwords on any service.
51. **Webhook signatures:** Incoming webhooks verify signatures and reject replays.
52. **Server-side payment checks:** Prices, payment status and subscriptions are confirmed on the server.
53. **Direct object references:** Changing an ID in a request does not expose another record.
54. **Trusted IDs and roles:** APIs take the user and role from the session, not the request body.
55. **Sensitive logs:** Logs contain no tokens, passwords, emails or private messages.
56. **Source maps:** Production source maps are absent or private.
57. **Dependency vulnerabilities:** `npm audit` or the stack's equivalent reports no unresolved high or critical issues, or each one has a recorded reason.
58. **Outdated packages:** Dependencies, including build and deploy tools, are on supported versions.
59. **Prompt injection:** AI features treat page, file and user content as data, not instructions.
60. **AI tool permissions:** AI actions use the requesting user's permissions and confirm risky actions.
61. **Database user permissions:** The app's database user has only the rights it needs.
62. **Audit logs:** Deployments and sensitive actions are recorded somewhere the owner can review.
63. **Monitoring and alerting:** Someone is alerted when the site or its forms stop working.
64. **Backup and restore:** Source and data have an off-machine backup and a tested restore path.
65. **Internal dashboards:** Internal tools and drafts are not publicly reachable.
66. **Security headers:** Responses send HSTS, a Content-Security-Policy, framing protection (`frame-ancestors` or `X-Frame-Options`), `X-Content-Type-Options`, `Referrer-Policy` and a `Permissions-Policy`. Test pages under the policy and check the console for refusals.
67. **Cookie flags:** Site cookies use `Secure`, `SameSite` and, for session cookies, `HttpOnly`.
68. **Encryption of sensitive data:** All traffic uses HTTPS; sensitive stored data is encrypted.
69. **Tenant isolation:** Multi-user apps keep each customer's data separate.
70. **Generated code review:** Generated code is read, tested and understood before release.

## Verify and hand over

Inspect the rendered page at phone and desktop widths. Walk through the primary action, navigation, forms, errors, consent behavior and keyboard flow. Check links, overflow, focus, network requests and console errors. Fix concrete failures before calling the work done. Report the result briefly; link the review note and mention only unresolved items that matter. Never claim a legal or accessibility certification from this checklist.

Primary references to consult when relevant: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) and [European Commission data protection information](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en). Check the appropriate regulator for other jurisdictions.
