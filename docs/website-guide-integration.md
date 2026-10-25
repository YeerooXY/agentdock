# Reusable website research

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
