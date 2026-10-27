# Release check

Build Paddock with `npm run build`, then run:

```sh
node scripts/release-check/walk.cjs
node scripts/release-check/walk.cjs --only 2.11,5.1 --profiles pc
```

To create the HTML checklist from the existing full walk without launching browsers or replacing evidence, run `node scripts/release-check/walk.cjs --report-only` in the coordinator's environment. This writes only `checklist.html`; it preserves `results.json`, screenshots and `checklist.md`.

Requires installed project dependencies, Playwright Chromium and WebKit, and `artifacts/console-layout/fixture.json` from the existing console-layout checks. Install browser engines separately before an offline run. The walker reads the desktop rows in `docs/release-inventory.md`; section 9 is excluded.

Profiles are PC Chromium (1440 × 1000), Mac Safari engine (1440 × 1000), and narrow Chromium (760 × 900). Mac is emulated. Every automated case starts in Classic; each item's first case also runs in Arctic (`icy`). Appearance cases explicitly select the named theme. All pages request reduced motion and screenshots freeze CSS animations.

Each run replaces `artifacts/release-check/latest/`. Open `checklist.html` in your browser. Screenshots are grouped by case with profile and theme labels; click a thumbnail to inspect the full-size image. Read the findings and manual checks, select **Not seen**, **Looks good**, **Needs work**, or **Cut**, and add decisions and reproduction steps under **Notes**. Scrollable app screens can contain more content than a screenshot shows.

The progress bar counts items with a status other than Not seen. Filter by status or **Has findings** to focus the review; manual checks appear separately from automated findings. Statuses and notes save in localStorage by item number and carry forward in the same browser, so recheck them when the evidence changes. If browser storage is unavailable, the page keeps edits while it remains open and shows a reminder to export them. **Export notes** downloads a Markdown file with every item's status and notes. Export notes and copy the evidence folder before rerunning. The page uses inline CSS and JavaScript and relative image paths; keep the `images/` folder beside it. `checklist.md` remains available for a text review and is not updated by edits in the HTML page.

`results.json` records page errors, document/content overflow measurements, four accessibility checks within the item's main element, incomplete accessibility checks, blocked requests, and missing fixture responses. A check mark means these automated checks found no issue; the human still reviews appearance and behavior. Failed navigation or capture remains visible with any available screenshot. Exit code 1 means evidence could not be completed; visual/accessibility findings are recorded without stopping the remaining cases.

Manual rows explain checks that need the desktop backend, operating system, filesystem or provider. Confirm these in a separate desktop review. No real installs, credentials, SSH connections, model requests or native notifications run here. IPC is an in-memory fake; network access is limited to this run's static server, with WebSockets blocked. The wrong-port preview is intentionally blocked. Results and API replies are synthetic. Account limits remain account-wide; the ledger represents app requests and is not a provider invoice.

Implementation is in `scripts/release-check/items.cjs`, `fixture.cjs`, `walk.cjs`, and the HTML report template `review-html.cjs`. Cases prepare a fresh cloned state, then use the existing renderer controls. Add a case-specific `setup` for interactions after navigation, or `manual: true` with a reason. Set `scrollMain: false` for a case whose popover dismisses on outside scroll. Missing inventory entries fail early. Do not replace failed cases with successful screenshots of a different screen.

Do not run Node or browsers in the authoring sandbox. Run validation and the walk in the coordinator's environment.
