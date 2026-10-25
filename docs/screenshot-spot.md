# Latest screenshot spot

The titlebar shows your newest screenshot while a console is open. Click it to paste the image's file path into the selected console, or drag it onto any console. Agent CLIs such as Claude Code and Codex read images from a pasted path. Nothing is sent until you press Enter.

- **Sources:** `Pictures\Screenshots` and `OneDrive\Pictures\Screenshots` (Print Screen and Snipping Tool), plus the clipboard (Win+Shift+S). The folders are watched; the clipboard is checked when Paddock regains focus.
- **Clipboard images** are saved to Paddock's `screenshots` folder only when you use them. Paddock keeps the latest 20 of its own saved files and never deletes files from your Pictures folders.
- **WSL Claude consoles** receive a `/mnt/<drive>/...` path. Paths with spaces are quoted.
- **SSH consoles** are refused with an explanation: the file is on the PC, not the Linux machine.
- **Plain PowerShell/CMD consoles** are refused: a shell runs the path as a command ("not recognized").
- **Ctrl+V** in a local agent console pastes a clipboard image as its saved file path; text pastes as before. Shell consoles keep their normal Ctrl+V.

## Verification, 22 October 2026

- `npm run build`: passed.
- `npm test`: 189 tests, 188 passed, 1 skipped (includes 7 `tests/screenshots.test.cjs` cases), 23 October 2026.
- `npm run test:desktop`: all checks passed.
- `node scripts/screenshot-spot-check.cjs` in isolated Electron: spot hidden without a screenshot, appears for a new file, click and drag both paste the quoted path into a real PowerShell console, no page errors. Screenshots at 1240 px and 760 px in `artifacts/screenshot-spot/`.

Not yet checked: real Win+Shift+S clipboard capture, OneDrive-redirected folders, and image recognition inside each agent CLI (Claude, Codex, Kiro, Cursor and others) on a real account.
