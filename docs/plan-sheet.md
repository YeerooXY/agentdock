# Plan sheet

Replaces the planning dialog (23 October 2026). Design source: [planning scenarios](research/planning-personas.md) and the HTML concept in `artifacts/plan-concept/`.

## What changed
- **Independent sections.** Brief, Research, Setup and Roadmap are reviewed on their own. Approving the roadmap starts the project; the others are optional and can be marked **Not needed**. The old "Approve the earlier sections first" rule is gone. Editing a section only resets that section's approval; only a changed roadmap pauses the project.
- **Layout.** A near full-window sheet. Left: project, section list with status (Approved, Proposal, Not needed, Draft, Not started) and the reference board. Right: the selected section.
- **Read first, edit when needed.** Sections open as text. Empty fields show one "+ Add …" line instead of an empty box. **Edit** shows larger, auto-growing fields. Drafts survive switching sections and closing.
- **Fewer fields.** Setup shows four (tools and why, where it runs and cost, data and security, testing and backups). Older Setup answers stay under **More detail**. Only the goal, the tools and the included scope are required to approve their section; Research needs one finding.
- **Roadmap.** Included / Not included, a milestone editor (title, done-when, reorder, remove) and Later features.
- **Proposals.** One waiting proposal per section, shown as before/after per field with Accept, Edit and Reject. Plans with the old single proposal are read as before.
- **References.** Files and images are copied into the project's planning folder (`.agentdock/projects/<id>/references`) so agents can read them; links accept http(s) only. Add by button, latest screenshot, link field or drag and drop. `dock/project_plan` lists them, and `PROJECT.md` records them.

## Verification
- `npm run build` passed; `npm test`: 194 tests, 193 passed, 1 skipped.
- `npm run test:desktop` passed; `scripts/projects-smoke.cjs` passed.
- `scripts/planning-smoke.cjs` (real Electron, real MCP bridge): read mode, drafts, Not needed, approval errors, suggested tools, references with thumbnail, roadmap approval without earlier sections, milestone editor, proposals for two sections at once with accept and reject, restart persistence, no overflow at 760 px, no page errors.
- `scripts/planning-visual-check.cjs` on Windows Chromium, Mac Safari (WebKit), Android Chrome (Pixel 7) and iPhone Safari (iPhone 13): flow passes, axe colour-contrast/button-name/label/dialog-name checks report no violations, no horizontal overflow. Mac and phone profiles are emulated; real macOS/iOS font rendering and touch behaviour are not verified. Found and fixed: the close button scrolled out of reach on phone widths.
- The real Agentdock project (copy of `projects.json`) opens with its waiting roadmap proposal shown as a diff and an enabled **Approve roadmap** button.

Remaining: drag and drop from Explorer was not automated; reference thumbnails are only generated in the desktop app.
