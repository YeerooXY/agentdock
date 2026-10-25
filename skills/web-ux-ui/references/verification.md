# Verification and release

Record the page, revision, date, browser/engine, viewport, environment, tested states, evidence and unresolved checks. Separate automated results, manual inspection and real-user evidence.

## Platforms and input

Inspect rendered appearance and the primary journey on Windows Chromium, Mac Safari, Android Chrome and iPhone Safari, plus useful tablet widths and content breakpoints. Prefer real or remote devices. Otherwise use the corresponding engines/device profiles and explicitly say which checks were emulated. Desktop WebKit cannot establish actual macOS/iOS fonts, emoji, virtual keyboard, VoiceOver or physical-device behavior.

Check long content, text resizing to 200%, reflow at 320 CSS pixels, portrait/landscape, safe areas, viewport changes and touch targets. WCAG 2.2 AA target-size minimum is 24 by 24 CSS pixels with exceptions; around 44–48 pixels is a comfortable working default for frequent touch actions, not the AA threshold. Preserve content priority and task completion when rearranging.

Test keyboard order, visible/unobscured focus, menu escape and focus restoration, dialogs, validation, loading, failure and retry. Include hover/pointer differences and reduced motion. Check network requests, console errors, links, overflow and actual contrast. A zero-violation axe scan does not establish accessibility conformance.

## Performance

As reviewed 23 October 2026, good Core Web Vitals thresholds are LCP <= 2.5 seconds, INP <= 200 milliseconds and CLS <= 0.1 at the 75th percentile, assessed separately for mobile and desktop. Recheck definitions before reporting. Lab scores and localhost timings are not field performance; Lighthouse navigation TBT is not field INP.

Reserve media dimensions, prioritize the actual initial image when appropriate, lazy-load secondary media, compress assets and remove unnecessary scripts/fonts/SDKs. Test slower loading and interaction responsiveness. Don't publish invented speed scores or universal loading guarantees.

## Release review

Complete the shared guide's 20 page and 50 security items, using passed/checked, needs work or not applicable with a reason and evidence. Determine applicability from actual data flows, audience, jurisdiction and host. Don't add a decorative cookie banner, fabricate policies or collect personal data to satisfy a checklist. Surface actual unresolved issues with location and fix.

Review generated code. Check dependencies, production output, secret exposure, headers and host configuration. Local configuration is not proof of deployed headers, TLS, monitoring or account MFA. Preserve those as remaining deployment checks when no host has been selected.

Sources: [WCAG quick reference](https://www.w3.org/WAI/WCAG22/quickref/), [Web Vitals](https://web.dev/articles/vitals), [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/).
