# Reusable website research

## 1 November 2026 workflow repair

Worker injection now uses role-specific guidance, with a compact builder contract, creative planning topic, the full checklist for the first reviewer and targeted follow-up findings. The app source also adds bounded Strata text assistance and a deterministic rendered-copy check. The six-site audit, implementation details, validation and remaining live pilot are in [workflow repair](workflow-repair-2026-11-01.md). The historical sections below describe their dated implementation; source-app restart is required for the new tools and callbacks.

## 31 October 2026 update

The installed `web-ux-ui` skill now activates for an ordinary website request. Its overview defines brief → relevant references → visual direction → assets → implementation → verification/review → handover. The content topic contains a CTA playbook for local food, bookings, free downloads, SaaS plans, specialist shops and large catalogues. The original observations and limitations are indexed in `references/cta-study.md`.

The local study under `../agent-dock-loop/webstudy` covers 36 selected URLs, with two excluded after visual inspection, and twelve bounded desktop first-click cases. The captures do not measure conversion, complete transactions or establish physical-device support. Original third-party screenshots remain local; the installed pack distributes original summaries and public source links.

`electron/task-guidance.cjs` adds enabled website guidance to builder, planner and reviewer briefs through the task loop's `getInstructions` callback. It uses a task/parent title-and-criteria keyword check and includes overview, content, verification and the 70-item checklist as text. This supports workers without MCP or permission to read external skill directories. It retains worker tool permissions and does not grant image generation, browsing or deployment. The orchestrator still supplies the concrete brief, selected references, assets, direction and acceptance criteria. Missing capabilities return to the orchestrator; there is no new automatic cross-agent image-generation service.

The managed Codex/OpenCode (`.agents`) and Claude (`.claude`) skill copies were updated using Paddock's installer, with no conflicts. Current guide calls read the updated Markdown. **The new shared-instruction text and worker injection require a Paddock restart.** Running owner sessions were preserved. The attempted live research task remained queued for capacity and was stopped by the owner; it is not a successful live provider test. The reports were completed directly afterward.

An isolated bakery planning exercise used the installed skill from an ordinary request and selected relevant local-business references without a named-skill instruction. Its `artifacts/website-forward-test/PLAN.md` and `TRACE.md` distinguish text plans from generated concepts and unperformed build/device checks. The sixteen-build comparison remains unrun; its fixed answers and remaining prerequisites are in `../agent-dock-loop/bench/WEBSITE-READINESS.md`.

Validation on the final code changes: Windows `npm test` passed 624 tests with one existing skip. `npm run test:linux` passed the build, 619 Linux unit tests (six platform skips) and headless desktop suite. No paid model requests ran. The independent orchestrator has 51 passing tests; the local-model client has 22 passing mock-HTTP tests. Skill validation and the study's offline coverage/link checks passed. The full test run also exposed a real screenshot deduplication defect: pasting the same image across clock seconds created another file. The saved image path is now reused while that file exists; deterministic clock tests cover reuse, deletion/recreation and changed images.

These changes affect guidance and backend task/clipboard handling, with no page styling change. The desktop suite is a Linux headless check; it does not establish native Windows/macOS or physical phone rendering. Future website builds retain the four-platform visual requirement.

The following section records the earlier integration and its historical validation.

23 October 2026. App branch `main`, base commit `88409424c563967eed4c2749e9385f04fe46d64c`. Existing unrelated working-tree changes were preserved.

The October 2026 UX/UI research is now an application source feature rather than only a saved research report. The enabled shared Web design guide directs agents to `dock/website_guide`. That read-only tool returns one bundled topic at a time: overview, layout, visual, content, commerce, verification or sources. It covers marketing pages, services, portfolios, booking, applications and ecommerce without forcing a marketing hero onto every page.

Both CLI agents and API sessions already use the shared tool bridge. The new tool uses that existing authenticated path; it adds no network access, paid request, setting, approval gate or user data collection. Topic names are an allowlist and cannot be used as filesystem paths. The flat Markdown files are covered by the existing `guides/*.md` packaging rule.

`guides/web-design.md` includes compact routing and working defaults while retaining the existing page/security reviews and screen-preview preferences. Turning that guide off still removes its automatic instructions. The reference remains discoverable for explicit use.

The local `product-ui-ux` skill also received the same portable topic notes and task routing. The original research/video history, Rexdeco references and rating workflow remain intact. Validation passed with the skill-creator quick validator. The notes are also versioned in the Paddock website repository for reuse and provenance.

## Validation

- New bridge tests pass: discovery, all topic retrievals, default overview, malformed topics, traversal/inherited-property rejection and shared-guide opt-out.
- App build passes.
- Unit suite: 196 passed, one existing skipped test, zero failures.
- Desktop suite: smoke, workbench, console layout and optional setup pass. No paid requests were sent.
- A pre-existing smoke assertion expected one-based panel numbers while commands used each session's actual slot. It now checks rendered console identity against the actual session slot; this corrected the validation failure without changing app behavior.

## Activation and maintenance

The currently running app process has already loaded its tool registry. Relaunch the source app or use a future packaged build to expose `dock/website_guide` in that process. Live consoles were not stopped to force activation. The installed local skill's files are available for future website tasks now.

Recheck release-dependent, legal and numerical standard claims when applying them. Keep topic notes compact, original and source-linked. The full handbook, atlas, workbook, source register and research evidence remain in the original research deliverables; they are not injected into every agent context.
