# Paddock 0.6.0-preview.45

Windows x64 and Android ARM64, ARMv7 and x64. Update the PC and phone together.

This release is built from the current development workspace and replaces preview.44. The saved-prompts removal in preview.44 is not included.

- Plan mode: each owner console has a Plan mode button in its header. Type a longer task and press Enter; the dispatcher splits it into tasks, routes each by size and waits for approval. Escape closes the field.
- The dispatcher defaults to the sending console's own account with its lightest discovered model, so a Claude console plans with Haiku. A dispatcher chosen in Settings > Agents still wins; without an eligible light model, Small routing plans it.
- Settings > Agents > Routing can start small plans (one or two small sequential tasks, no design work, no images) without approval. Off by default.
- The plan view uses the console's dark star surface, puts Approve at the top, shows one row per task with its worker and reviewer, and keeps criteria, files and routing reasons under Details.
- Fixed task text being masked: short environment values such as `32` no longer turn "320px" into "[redacted]".
- Image paths named in a message but not attached no longer fail the plan.
- Pi reports the real reason it cannot run, and free routes list only OpenRouter models that Pi itself offers.
- Deterministic UI checks (`scripts/ui-rules.cjs`): rendered, interaction, craft and source rules, with a good/bad comparison site (`docs/ui-rules.md`).

Windows is unsigned. Android previews keep their existing signing certificate. Physical-phone checks remain pending. Close active work before installing.
