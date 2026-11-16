# Paddock 0.6.0-preview.39

Windows x64 and Android ARM64, ARMv7 and x64.

- Phone model and effort changes apply to a console whose only blocker is a missing completion check. The agent ended its reply without recording the outcome, the console stayed in "needs you" and every change was rejected until Paddock restarted. Consoles that are working or showing a real prompt still reject the change. This needs both the Windows and the Android update.
- A model selected through the phone stays with the console when Paddock restarts or the console reopens.
- Claude Code consoles keep terminal scrollback. Claude Code 2.1 draws on the alternate screen by default, so the phone and the PC scrollbar showed one screen of the conversation. Paddock now starts Claude agent consoles with `CLAUDE_CODE_NO_FLICKER=0`. This applies to Claude consoles started after the update; Claude's fullscreen display is off in Paddock.
- Phone reading view: text that the agent wrapped itself joins with one space instead of a run of spaces, and the line after a horizontal rule starts on its own line.
- Phone terminal keys use an inverted-T arrow layout with modifier keys. The update panel replaces its action in place.
- The settings rejection text names the action: "Finish the current task before applying settings."

Verification: desktop unit tests and production build on the frozen source, Flutter analysis and the full Flutter test suite. APK version codes increase and use the same preview signing certificate as preview.38.

Not verified: the model change, Claude scrollback and reading view on a physical phone. Headless desktop checks did not run because the Docker engine was stopped. Long-chat lag on the phone and the missing sent-message display are open.

Windows remains unsigned. Close active work before installing. Android preview.38 users can update without uninstalling.

The release uses the preview.38 source plus these fixes. GitHub main and the release tag contain that source. Unrelated local changes and the current checkout are preserved.
