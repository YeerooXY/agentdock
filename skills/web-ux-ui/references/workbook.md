# Web UX/UI verification workbook

Reusable project template, 23 October 2026. Use with the [design guide](handbook.md) and [reference atlas](atlas.md). This workbook contains planning prompts, task tests, and the workspace's required 70 review items. It is not a completed audit of the reference websites.

## 1. Establish the project and decision

Complete these fields for an authorized project. Keep unknown facts visible until their owner supplies them.

| Field | Record |
| --- | --- |
| Project, URL, repository, branch and commit | Current implementation being evaluated |
| Audience and access needs | Intended users, languages, devices, relevant accessibility needs |
| Entry route | Search, campaign, direct product link, returning account, invitation |
| Immediate task | What the person is trying to accomplish |
| Primary action | Exact action and its actual consequence |
| Required decision information | Product/service facts, price, conditions, eligibility, evidence |
| Business owner and jurisdiction | Actual entity and markets; do not infer from language alone |
| Data and integrations | Collected data, storage, processors, third parties, payment flow |
| Existing conventions | Brand, canon, terminology, components, tokens and constraints |
| Success and guardrails | Correct completion, comprehension, recovery, retained work, performance |
| Research question | The uncertainty that could change a design decision |

Write one realistic task: “Find a shelf that fits this measured space, determine the delivered price, and explain the return route.” Do not tell a participant which control to use.

## 2. Design specification before implementation

| Area | Required decisions |
| --- | --- |
| Hero or initial workspace | Actual heading, explanation if needed, action, evidence, next section |
| Reading order | Desktop, short phone, tablet and enlarged-text sequence |
| Navigation | Labels, active state, menu behavior, search, back and return context |
| Typography | Visible roles, family licenses, weights, languages, fallback and loading |
| Colors | Semantic tokens and measured default, focus, selected and error pairs |
| Imagery and icons | Purpose, rights, crop, responsive asset, alt text, consistent icon geometry |
| Motion | Trigger, meaning, duration convention, interruption and reduced-motion behavior |
| Waiting | Actual operation, immediate feedback, indicator, timeout/recovery, preserved work |
| Effects and cursors | Task benefit, input conditions, static/native fallback, cost budget |
| Components | Reachable states and transitions, including errors and permissions |
| Commerce | Variants, units, price basis, stock, delivery, returns, cart and payment states |
| Copy | Approved terms, supported claims, precise buttons, missing-fact owner |
| Performance | Route budget, intended hardware/network, field/lab measurement plan |

For each uncertain choice, record a competing option and a test that could distinguish them. Example: one versus two phone product columns, evaluated through accurate comparison of dimensions and price.

## 3. Device and browser evidence matrix

Use actual browser/version and hardware where available. Run relevant tasks on each required environment. A screenshot marks only the visible state inspected.

| Environment | Required observations | Evidence status to fill |
| --- | --- | --- |
| Windows desktop Chromium | Layout, icon alignment, keyboard, mouse, text and fractional display scaling | Actual host/browser/version and task results |
| Mac Safari | Actual fonts, native controls, trackpad, keyboard settings, VoiceOver | Real or remote Mac; otherwise emulation gap |
| Android Chrome | Touch accuracy, keyboard, autofill, toolbar, back, TalkBack, slower hardware | Real or remote Android; otherwise emulation gap |
| iPhone Safari | Safe areas, toolbar, keyboard, input zoom, text scaling, native pickers, VoiceOver | Real or remote iPhone; otherwise emulation gap |
| iPad Safari | Portrait, landscape, split view, keyboard/trackpad, touch | Device and window-size record |
| Android tablet | Resize, portrait/landscape, hybrid input, wide forms and grids | Device or explicitly generic emulation |

Add browser versions and other environments from the product's actual support policy. Cover 320 CSS px reflow, short phone height, 200% text resizing, 400% zoom where applicable, landscape, long text, blocked fonts, and actual supported languages. These are dimensions to test, not six universal screenshot widths.

Record viewport, device-pixel ratio, zoom/text setting, locale, time zone, color scheme, reduced-motion setting, consent state, authentication state, cache, and network. Inspect full-size screenshots for icon stroke weight, baseline alignment, line breaks, clipping, sticky overlaps, and content order.

## 4. Task walkthroughs

Run destructive or transactional cases in a controlled development/staging environment with synthetic data and payment sandboxes. On live sites, stay within authorized read-only observation. Never place a real order or send real email as an incidental check.

| Task | Test steps | Expected evidence |
| --- | --- | --- |
| Orientation | Open the actual entry route; identify purpose, offer, next action and important condition | User explanation; screenshot of that state |
| Primary action | Activate using pointer, keyboard and touch as applicable | Correct destination/result, clear feedback and focus |
| Navigation | Open/close menu; use Escape and Back; return from detail | Predictable focus, route, selected state and scroll |
| Search | Complete, misspell, clear, submit; simulate no matches and failure | Preserved query, useful recovery, distinct result states |
| Filters | Select, remove, clear, cancel/apply, navigate back | Matching results and accurate applied criteria |
| Product choice | Compare images/dimensions; choose available and unavailable options | Correct image, identity, price, stock and action |
| Cart | Add configured item; adjust quantity; remove/undo; change stock in sandbox | Synchronized totals and understandable recovery |
| Checkout | Guest/sign-in; delivery; payment success, failure, pending and interrupted return | Valid server-confirmed status, no duplicate order/charge |
| Form errors | Submit missing/invalid input; recover; try long values and autofill | Persistent labels, retained valid input, linked errors |
| Waiting | Slow a request; interrupt/reconnect; retry an operation | Truthful status, safe retry, no invented percentage |
| Consent | Accept, reject, change preference, revisit and expire choice | Matching storage/network behavior where required |
| Keyboard | Tab/Shift+Tab complete task; Enter/Space; Escape; visible focus | Correct order, no trap, focus stays visible and returns |
| Screen reader | Navigate headings, controls, errors and dynamic result | Meaningful names, relationships, announcements and state |
| Motion | Enable reduced motion; interrupt transitions; pause ongoing movement | Information remains available; controls remain responsive |
| Font/icon fallback | Block fonts; enlarge text; test target OS and emoji | Readable text, no lost action names, stable wrapping |
| Network and console | Inspect first load and transitions with consent states | Document actual relevant errors and requests |

A passing automated scan complements these tasks. It cannot substitute for them or establish complete WCAG conformance.

## 5. Measurements and findings

### Performance record

Record field source and collection window separately from a controlled lab run. For Core Web Vitals, retain the mobile/desktop segment, URL/origin scope, sample availability, and 75th-percentile values. Current good thresholds: LCP ≤2.5 seconds, INP ≤200 milliseconds, CLS ≤0.1. Missing telemetry remains unknown. [Web Vitals](https://web.dev/articles/vitals).

For lab runs, record hardware or CPU throttle, network, cache, tool version, route and repeated-run variability. Diagnose LCP stages and interaction stalls. Measure the actual search, save, filter and purchase tasks. A navigation Lighthouse score does not provide field INP.

### Color record

For each pair record token, rendered foreground/background, state, size/weight, required ratio, measured ratio and result. Include image/gradient/overlay states. Do not round a failing result into a pass. Keep normal text and large-text rules distinct; assess necessary UI boundaries and state indicators separately. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

### Finding record

| Field | Example format |
| --- | --- |
| ID and location | PDP-04, product purchase panel, selected size |
| Observed behavior | State exactly what happened and on which setup |
| Consequence | What decision or action is obstructed |
| Evidence | Screenshot, task steps, trace, request, source/configuration |
| Severity | Blocked task, incorrect outcome, repeated friction, or visual refinement |
| Frequency and confidence | Observed count and limits; distinguish inference |
| Proposed fix | Concrete behavior, content or layout change |
| Verification | Reproducible task and expected result |
| Owner and status | Responsible person, next action, remaining dependency |

## 6. Required page review: items 1–20

This section preserves the workspace requirements. For every actual page review, copy each row into the project review note and record **checked**, **needs work**, or **not applicable**, with evidence or a reason. Start unreviewed. Shared policy pages can supply linked evidence across routes. The template's presence is not a completed check.

| No. | Item | Evidence or verification to record |
| --- | --- | --- |
| 1 | Privacy policy | Match the accessible policy to actual collection, purpose, sharing, retention, rights and contact routes. |
| 2 | Terms of service | Determine applicability; verify owner-approved service rules and how the user encounters them. |
| 3 | Refund policy | Verify actual cancellation/return process and applicable consumer rights; test the request route. |
| 4 | Cookie policy | Inventory cookies, local storage and similar technology, provider, purpose and duration. |
| 5 | Cookie consent banner | Determine whether consent is required; test blocking, rejection and later changes against actual requests. |
| 6 | Form consents | Verify purpose and legal basis, separate optional marketing, policy links and recorded choices. |
| 7 | No unnecessary data | Check fields, analytics, logs and retention for a necessary purpose; keep private values out of clients. |
| 8 | Third-party SDKs | Record what each retained SDK sends, to whom and when, including before consent. |
| 9 | No dark patterns | Inspect purchase/cancel/decline flows for misleading actions, forced extras, fake urgency or obstruction. |
| 10 | No hidden fees | Verify totals, taxes or calculation basis, recurrence, renewal and commitments before purchase. |
| 11 | No fake reviews | Retain provenance, permission and disclosures; keep demo material out of live social proof. |
| 12 | No unsupported claims | Link performance, comparisons, results and guarantees to evidence; revise unsupported wording. |
| 13 | Accessible alt text | Check meaningful images, decorative images, image controls, charts and media alternatives in context. |
| 14 | Color contrast | Measure applicable text/UI states to WCAG 2.2 AA and verify information also has non-color cues. |
| 15 | Keyboard navigation | Complete the task; inspect order, focus, menus/dialogs, Escape, focus return and traps. |
| 16 | Business details | Verify real identity, contact and applicable registration details for the actual market. |
| 17 | Children's data | Determine intended audience and applicable age/parental rules; avoid a universal threshold assumption. |
| 18 | Email unsubscribe | Test marketing unsubscribe in a controlled flow and distinguish necessary service messages. |
| 19 | Font and image licenses | Keep license/permission and attribution records for all retained assets. |
| 20 | Data deletion requests | Verify a usable request route, actual handling, retention limits and applicable exceptions. |

Consult current sources for the relevant audience, jurisdiction and data flows. Starting references: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [European Commission data protection](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en), and [EU consumer pricing](https://europa.eu/youreurope/citizens/consumers/shopping/pricing-payments/index_en.htm). These do not replace business-specific facts or a jurisdiction-specific assessment.

## 7. Required security review: items 21–70

For an authorized website and its serving code, record **passed**, **needs work**, or **not applicable**, with evidence and a reason. Start unreviewed. Review source, configuration, history, dependencies and authorized requests as appropriate. Do not expose secret values in findings or artifacts.

When an actual item needs work, notify the user promptly with the item, location and proposed fix; use Dock's notification tool when available. A missing project assessment in this reusable template is not a discovered vulnerability. The external reference websites were not security-audited.

### Secrets, identity and exposed surfaces

| No. | Item | Evidence or verification to record |
| --- | --- | --- |
| 21 | Exposed database credentials | Inspect source, history, built clients and public files without printing secrets. |
| 22 | Public .env files | Check ignore rules, deployed output and an authorized read-only request returning 404. |
| 23 | Hardcoded API keys | Verify host secret storage and absence from source/history; rotate exposed credentials if found. |
| 24 | Authentication | Check maintained provider/library, password rules and MFA; record owner-service MFA evidence. |
| 25 | Authorization checks | Identify every protected server action and verify requester permission enforcement. |
| 26 | Access to other users' data | Use synthetic accounts to test isolation in an authorized test environment. |
| 27 | Open database permissions | Inspect database rules and public access configuration. |
| 28 | Cloud storage configuration | Verify private buckets/rules, with intentional public resources documented. |
| 29 | Admin routes | Verify authentication and authorization on pages and APIs. |
| 30 | Debug pages | Check production output/routes for debug, test and unintended status surfaces. |
| 31 | Build logs | Inspect CI configuration and samples for secret exposure; record sanitized evidence. |
| 32 | Verbose errors | Trigger controlled errors; verify visitor-safe messages and protected diagnostic detail. |
| 33 | Leaked repositories | Confirm intended visibility and secret-history review. |
| 34 | Frontend secrets | Inspect production bundles; all exposed configuration must be public by design. |

### Inputs, requests and sessions

| No. | Item | Evidence or verification to record |
| --- | --- | --- |
| 35 | Client-side-only checks | Confirm the server repeats applicable validation and authorization. |
| 36 | Input validation | Verify server checks for type, length, allowed values and relevant business constraints. |
| 37 | SQL injection | Inspect parameterized queries and boundaries; avoid string-built SQL from inputs. |
| 38 | NoSQL injection | Inspect query construction and prevent raw user-built query objects. |
| 39 | Cross-site scripting | Verify context-appropriate escaping and safe handling of rich content; inspect innerHTML/eval use. |
| 40 | Cross-site request forgery | Verify appropriate origin/token/SameSite protection on state-changing requests. |
| 41 | File uploads | Check type/size limits, safe names, storage outside executable paths and safe serving. |
| 42 | Path traversal | Verify resolved input-derived paths stay within the intended directory. |
| 43 | Server-side request forgery | Verify fixed/allow-listed destinations and handling of redirects and resolved addresses. |
| 44 | Password reset | Verify expiry, single use and account-enumeration protections in a test flow. |
| 45 | Session management | Check expiry, rotation at login and invalidation at logout. |
| 46 | JWT secrets | Verify private strong unique signing material and pinned accepted algorithms. |
| 47 | CORS | Confirm only necessary origins and no wildcard with credentials. |
| 48 | Rate limits | Inspect and test applicable login, signup, form, API and AI limits safely. |
| 49 | Test and staging environments | Verify disabled/protected previews or absence of real data. |
| 50 | Default credentials | Confirm unique non-default credentials across relevant services. |

### Payments, dependencies and AI

| No. | Item | Evidence or verification to record |
| --- | --- | --- |
| 51 | Webhook signatures | Verify signature and replay protection using provider test events. |
| 52 | Server-side payment checks | Verify server-confirmed price, status and subscription state; test duplicate delivery safely. |
| 53 | Direct object references | Test synthetic record IDs under distinct authorized accounts. |
| 54 | Trusted IDs and roles | Confirm identity and roles come from a trusted session, with per-action checks. |
| 55 | Sensitive logs | Inspect redaction and sample logs for tokens, passwords, emails and private messages. |
| 56 | Source maps | Verify production maps are absent or private, including deployment configuration. |
| 57 | Dependency vulnerabilities | Run the stack's audit; resolve high/critical findings or document each accepted reason. |
| 58 | Outdated packages | Check supported versions for runtime, build, test and deploy tools. |
| 59 | Prompt injection | Verify AI features treat retrieved page/file/user content as untrusted data. |
| 60 | AI tool permissions | Verify actions use the requesting user's permissions and confirm risky operations. |
| 61 | Database user permissions | Inspect least-privilege grants and separation of administrative duties. |

### Operations and delivery

| No. | Item | Evidence or verification to record |
| --- | --- | --- |
| 62 | Audit logs | Verify reviewable records of deployments and sensitive actions, with safe contents. |
| 63 | Monitoring and alerting | Check route/form monitoring, alert destination, owner and a safe alert test. |
| 64 | Backup and restore | Verify off-machine source/data backup and an evidenced restore exercise. |
| 65 | Internal dashboards | Verify internal tools and drafts are protected from public access. |
| 66 | Security headers | Inspect HSTS, CSP, framing protection, X-Content-Type-Options, Referrer-Policy and Permissions-Policy; walk pages and inspect refusals. |
| 67 | Cookie flags | Verify Secure and appropriate SameSite, plus HttpOnly for session cookies. |
| 68 | Encryption of sensitive data | Verify HTTPS and encryption of sensitive stored data. |
| 69 | Tenant isolation | Verify separation across customers in data access, jobs, storage and caches. |
| 70 | Generated code review | Read and understand generated changes; run checks appropriate to their behavior before release. |

The numbers above match the human-facing workspace checklist. Dock's checklist uses zero-based indexes: subtract one, so item 21 is index 20 and item 70 is index 69. Use [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) to deepen the relevant technical assessment and [MDN's CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy) when configuring policy. Policy enforcement needs testing with the actual resources and integrations.

## 8. Research completed for this guide

This table reports the work behind the research deliverable. It does not assign checklist passes to the public websites.

| Work | Actual outcome | Limit |
| --- | --- | --- |
| Source review | Primary research, standards, platform guidance, writing guidance and video material reviewed; register supplied | Selected public material; no claim of exhaustive literature coverage |
| Live page capture | 36 initial page/profile combinations and eight IKEA post-consent combinations | Public-page observation; no full task audit |
| Screenshot inspection | Ten contact sheets inspected, with selected original screenshots | Windows-hosted engines and emulated devices |
| Initial overflow sampling | No horizontal document overflow in 36 captured initial states | Does not test every route, overlay, interaction, zoom or language |
| Capture completion | All 36 initial captures completed without a script-level navigation/capture failure | Patagonia desktop showed an interstitial rather than the intended catalogue |
| Page errors | Captured page exceptions in Stripe phone WebKit, IKEA product desktop WebKit, and both Patagonia profiles | Recorded in manifest; cause/impact not diagnosed; no claim of clean consoles |
| Video material | Four Apple sessions reviewed through transcripts; three also sampled visually at six timestamps | No continuous full-session viewing claimed |
| Proposed palettes | 28 foreground/background checks passed their specified 4.5:1 or 3:1 targets | Seven pairs per palette; not complete component-state or theme verification |
| User validation | Not performed | Design recommendations remain contextual defaults and hypotheses |
| Real mobile/Mac checks | Not performed | Actual OS fonts, emoji, native controls and assistive technology remain open |

Raw evidence remains in the local `evidence` folder. Keep future verification with its project, route, branch/commit and date. Save meaningful design decisions and selected evidence with the primary deliverable; avoid presenting routine logs as a separate research result.

## 9. Handoff record

State what changed, why, what was tested and what remains open. Link the page/security notes and relevant evidence. Separate implemented behavior, verified behavior, and proposed work. Name unresolved items that affect release or the user task. A screenshot, generated concept, review score, or completed template is not a legal or accessibility certification.
