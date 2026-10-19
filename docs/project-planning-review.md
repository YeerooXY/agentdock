# Guided project planning review

19 October 2026. Covers Projects, new/edit project forms and the Roadmap dialog. Verification uses temporary profiles, fixture projects, unpaid shells and mocked CLI launches. No paid model requests, actual market research or changes to the user's saved projects were made.

## Result

New projects start as Planning. Goals, audience, success criteria and initial milestones are available in the first form. The user reviews four sections: brief, research/niche, infrastructure and roadmap. Each roadmap milestone needs a completion check. Only the trusted desktop review route can approve a section; the agent's tool stores a separate proposal. Changing an approved decision invalidates downstream approvals. Existing projects opt in through Plan project.

Infrastructure records the target, technical experience, optional preferred language, chosen stack, reasons, an alternative and trade-offs, hosting/cost, storage, security, testing, deployment, backups and recovery. Starting recommendations are optional examples. They do not install tools or claim to be the best choice for every project. Research fields collect source links, dates and uncertainties; no synthetic market evidence is created. Marketing strategy is deferred until completion.

Agents retrieve one section with its revision, propose changes, or append Later features. The calling session supplies the project binding. Proposals cannot activate a project or overwrite a pending proposal. Stale writes fail. User approval is an application workflow boundary, not an operating-system sandbox: an external CLI retains the permissions selected for its console.

The default Codex or Claude console can start a discussion through the CLI's supported initial prompt argument. Resuming that console does not replay the question. Other integrations receive their existing project instructions without an injected initial prompt. Live model responses and agent obedience remain unverified; tests inspect launch arguments without submitting a paid prompt.

Project data stays in `projects.json`. Readable `PROJECT.md`, `ROADMAP.md` and `LATER_FEATURES.md` copies live under the first project folder's `.agentdock/projects/<project ID>/`. Disk-copy errors preserve internal data and expose Retry. Redirected planning directories/files are rejected. These files are regenerated copies, not a portable import format or concurrent collaboration protocol. Deleting the project record leaves project files intact, as disclosed in the deletion dialog and [guide](projects-and-updates.md).

Active is green, with blue/amber/violet/gray labels for the other states. Folder buttons open the registered local path. The original Projects empty-state line, “Give your next idea a home,” was removed. Category and Next step labels use ordinary casing.

## Verification

| Check | Outcome |
| --- | --- |
| `npm run build` | Passed; existing bundle-size advisory remains |
| `npm test` | 139 passed, one environment-dependent WSL check skipped |
| `npm run test:desktop` | All four suites passed: native consoles, layout, vault, tools, Results, restoration and setup |
| `node scripts/planning-smoke.cjs` | Passed: creation, initial milestones, four explicit approvals, failed validation, draft retention, actual authenticated MCP proposals/rejection/edit, revision conflict, local files, scoped folder opening and restart |
| `node scripts/projects-smoke.cjs` | Passed: project editing/progress, project context, subfolder launch, panel shrink/grid expansion and metadata-only deletion |
| `node scripts/project-link-smoke.cjs` | Passed: linking a live console, unchanged shell process/files, actual MCP progress and restoration |
| `node scripts/planning-visual-check.cjs` | Passed across four browser profiles: forms, validation, approval, step drafts, folder link, keyboard Tab/Escape/focus return and horizontal overflow checks |
| Focused planning unit coverage | Approval order, required milestones/checks, revision conflict, owner-scoped tools, separate proposals, downstream invalidation, legacy opt-in, local copies/restart, redirected directories and Codex/Claude native/PowerShell/WSL prompt arguments |

Screenshots and records are in `artifacts/planning/`; representative screenshots and this report are saved individually in Dock Results. The profiles are Windows Chromium (1440×1000), Mac Safari via WebKit, Pixel 7 via Chromium and iPhone 13 via WebKit. A 720×500 desktop and 320px layout with a long unbroken project name were also checked. Screenshots were inspected for spacing, text wrapping, icon alignment, visible close controls, scroll behavior and colored states. Targeted axe text-contrast, button-name, form-label and dialog-name rules passed. These are targeted checks, not a complete accessibility certification.

Mac, Android and iPhone coverage is emulated on Windows. Actual macOS/iOS fonts, physical touch, virtual keyboards and screen-reader use remain unverified. These checks exercise the existing desktop HTML renderer; they do not add a hosted browser app or native mobile roadmap editor. The paired Android terminal can continue a planning conversation. Its native project-management UI is unchanged.

During review, the long Infrastructure form could scroll its heading and close control out of view. The heading now stays visible and the step navigation remains available. The visual fixture was also corrected to wait for the browser's asynchronous dialog-close/focus event before checking focus.

## Required page review

These outcomes apply to the affected Projects page and its dialogs. Existing unrelated pages are outside this change. This is a record of applicable checks, not a legal certification.

| Item | Status | Evidence and applicability |
| --- | --- | --- |
| 1. Privacy policy | Checked | The [project data guide](projects-and-updates.md) documents local metadata/copies and selected-agent context. Planning adds no hosted Dock account or telemetry. Provider data practices still apply when the user opens an agent discussion. |
| 2. Terms | Not applicable | No new hosted service, account or contractual checkout. Existing agent/provider terms continue to apply. |
| 3. Refund policy | Not applicable | No payments or credits sold by these screens. |
| 4. Cookies/storage | Checked | Local JSON, generated Markdown and in-memory unsaved drafts are documented. No tracking cookies introduced. |
| 5. Consent banner | Not applicable | No nonessential web tracking added. |
| 6. Form consents | Checked | Save, proposal review, rejection and approval are explicit actions. No marketing consent fields. Discuss with agent uses the user's default integration. |
| 7. Necessary data | Checked | Only project decisions and progress are recorded. No new personal contact fields, usage telemetry or credential fields. Initial draft fields can remain unfinished. |
| 8. Third-party SDKs | Checked | No new dependency. Optional discussion uses existing CLI integrations. Starting recommendations are local text, with no remote request when selected. |
| 9. Dark patterns | Checked | Draft saving and closing remain available; no automatic approval or implementation. Existing projects are not silently migrated. |
| 10. Hidden fees | Checked | Plan editing and local recommendations make no model calls. The guide identifies the user's agent account/API billing for optional discussion. No cost guarantees. |
| 11. Fake reviews | Not applicable | No testimonials or social proof. All verification projects are fixtures. |
| 12. Unsupported claims | Checked | Sources/open questions are distinct from real customer evidence. Suggestions do not claim universal superiority. CLI obedience and physical-device coverage are not claimed. |
| 13. Alt text | Checked | No new content images. Close control has an accessible name; folder/terminal icons accompany text. |
| 14. Contrast | Checked | Targeted axe text-contrast checks passed for all captured profiles. Project states also have text; planning approval also has checkmarks. |
| 15. Keyboard navigation | Checked | Native inputs/selects/dialogs, Tab within the dialog, Escape, focus return and errors exercised. Close remains visible while the body scrolls. |
| 16. Business details | Not applicable | No new commercial landing or checkout page. Existing repository identity remains available. |
| 17. Children's data | Not applicable | No child-directed feature or age collection introduced. Test education projects are synthetic. |
| 18. Email unsubscribe | Not applicable | These workflows send no email. |
| 19. Asset licenses | Checked | Existing app icons/fonts retained; no new third-party visual assets. Technology advice is original wording with primary references. |
| 20. Deletion | Checked | Project record deletion remains available; generated local copies, startup instructions, agent history and Results have distinct retention, explicitly documented. No claim of erasing provider-held data. |

References: [W3C use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) and [European Commission information for individuals](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en). The latter informs review of disclosure/deletion applicability; this local feature makes no claim of legal certification.

Technology and launch behavior were checked against [TypeScript](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html), [Tauri](https://v2.tauri.app/start/), [Compose](https://developer.android.com/compose), [Flutter](https://docs.flutter.dev/resources/architectural-overview), [Godot](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html), [Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli) and [Claude CLI reference](https://code.claude.com/docs/en/cli-reference), plus installed CLI help. Choosing a starting stack is a product recommendation based on those capabilities, not a fact established by the documentation alone.

## Phone pairing answer

Code inspection confirms saved device tokens have no automatic expiry. They persist through normal restarts and compatible upgrades. Reachability still depends on the PC, network and saved endpoints. QR invitations expire after five minutes; approval requests after two minutes. The current PC TLS certificate lasts five years, and the Android client checks certificate validity as well as its pinned identity. Revocation, data reset, changed endpoints or certificate replacement/expiry can require setup or pairing again. No networking behavior changed in this task.
