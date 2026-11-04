# Mobile console output

Status: proposal for owner review. No output redesign is included in preview 36.

## Evidence

The supplied Codex screenshot shows large inherited indentation, text ending before the sentence is complete, blank bands between fragments, and a native composer and status footer underneath Paddock's own message and model controls. It shows the visible result, not the original PTY bytes. Claude's accumulating bottom separators are owner-reported and still need a recording or captured terminal stream.

The shared terminal stream keeps desktop columns and rows (`electron/mobile-stream.cjs`, `mobile/lib/dock_client.dart`). The phone does not own the desktop PTY size. This protects the desktop session, but resizing a terminal layout and reflowing prose are different operations.

`TerminalViewport` already offers Wrap text and Grid. Wrap text uses `TerminalReadingView`, which converts terminal cells to a rich text span. It preserves the desktop's interior gaps, indentation and hard line breaks. Grid preserves the terminal layout and scales it to fit. Neither provides semantic messages or reconstructs text that the CLI never drew.

`terminalReadingSpan` shortens rule-only lines and skips adjacent repeated rules. `terminalReadingText` does not apply the same normalization. A rule separated by a blank row, a redraw footer, or a wrapped fragment can escape the current rule handling. Selection/copy and display should derive from one representation.

## Proposed common mobile experience

Use two explicit modes: **Read** for answers and **Console** for exact terminal interaction. Keep the existing theme choice and live controls. Read should present flowing paragraphs and lists, horizontally scrollable code and tables, and expandable tool output. Preserve the reader's position during updates. Show activity and model information once in Paddock's controls. Console remains available for unsupported layouts, troubleshooting and exact screen inspection.

Start with one shared, typed output representation: paragraph, list, code, table, tool output, activity, prompt and unknown terminal block. Rendering, selection and copy consume this same representation. Keep the authoritative raw terminal stream intact. Normalization changes display only and never writes to a console or resizes the desktop PTY.

Use structured conversation events where a provider exposes them and the account/session binding is verified. Otherwise parse conservatively from terminal snapshots, label unknown blocks internally, and retain exact Console access. Never infer missing answers or silently delete arbitrary dashed lines: those can be code, tables or document content.

## Shared behavior and provider differences

| Scope | Common handling | Provider-specific evidence needed |
| --- | --- | --- |
| Codex | Reflow answer text, bound spacing, retain code indentation | Identify native composer, status footer, task/progress blocks and actual message boundaries. Prefer verified structured events where available. |
| Claude Code | Same reading renderer and controls | Recognize footer separator/status regions across redraws and widths. Keep separators inside answer/code content. Capture the reported accumulation before writing a filter. |
| Antigravity, Copilot, OpenCode, Cursor, Grok, Kiro, Qwen, Kimi, Cline, Droid and Pi | Same Read/Console contract | Capture each installed CLI's ordinary answer, code, tool progress, question and error states. Enable only adapters that pass these captures; a common renderer does not imply a common CLI protocol. |
| Shell, custom commands and unknown CLIs | Exact Console mode remains reliable | Do not guess prose or remove terminal controls from arbitrary programs. Offer conservative reading when content can be classified safely. |

Model switching is a separate capability. The current resume-based setting adapters support Codex and Claude Code. The marker fix is shared by both adapters, including account switching; it does not claim native model-switch support for every listed provider. Remote consoles, worker consoles and unsupported adapters retain their existing restrictions.

## Acceptance before implementation ships

- Replay recorded streams for every enabled adapter at narrow and wide desktop widths, phone portrait/landscape, keyboard open/closed, reconnect and conversation resume.
- Compare prose, Unicode, code indentation, tables, warnings and links against the source. No missing answer text or duplicated messages.
- Verify progress updates replace progress, repeated CLI footer rules do not enter answer history, and dashed code remains unchanged.
- Use one output model for display, copy and selection. Preserve scroll position and selection during streaming.
- Verify menus, questions and permission actions against the current launch. Mode changes never send input. Tab, Shift+Tab, Enter and Space preserve logical focus.
- Unknown layouts use the Console fallback without dropping output. No paid model requests in automated tests.

## Delivery boundary

Preview 36 ships the reproduced draft-marker timing fix and the already committed mobile controls. The broader Read/Console direction needs the owner's choice and a screen concept before a substantial interface redesign. This review is based on the screenshot and source inspection, not a live cross-provider verification.
