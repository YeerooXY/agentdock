# Windows taskbar icon

Verified on Windows, 18 October 2026.

The source launch assigned `electron.exe`'s path as its application identity. The desktop and Start menu shortcuts had no identity. The running window already contained the Paddock artwork, but Windows could group it under Electron.

Source launches now use `com.yeeroo.agentdock`, matching installed builds. Existing shortcuts for that checkout are upgraded automatically. The shortcut command creates matching shortcuts through Electron's Shell API. Other installations and custom launch arguments are preserved. Source windows use the multi-size ICO; installed builds retain their executable icon and existing window image.

The currently running Paddock window and both local shortcuts were updated without restarting Paddock, Explorer, or any console. Its small and large native window icons were extracted and visually checked: both contain the blue-pink Paddock mark. The taskbar itself was covered by another fullscreen application, so its final visible appearance still needs a user check. The extracted icon is evidence of the window resource, not a screenshot of the taskbar.

Checks:

- `npm run build`: passed; existing bundle-size warning remains.
- `npm test`: 132 passed, one platform skip.
- `npm run test:desktop`: passed, including a new Windows property-store check on a real window, real shortcut creation and migration, preservation of another installation's shortcut, and no rewrite when already correct.
- Existing desktop checks also passed for live terminals, tray hiding, restoration, tools, Results, layout and setup.
- No website layout, mobile UI, credentials, network access rules, or paid integrations changed. Browser/device profile checks do not apply to this native Windows identity fix.

The first test run also exposed a Git cleanup race: when one metadata command failed outside a repository, the other could still hold the folder. Both commands now settle before returning; the full unit suite passed afterward.

Evidence is stored in `artifacts/taskbar-fix/`: `build.txt`, `unit.txt`, `desktop.txt`, `before-repair.json`, `after-repair.json`, and the two `live-window-icon-*.png` files. The native identity check is part of the desktop test command.

References: [Microsoft's application identity guidance](https://learn.microsoft.com/en-us/windows/win32/shell/appids), [taskbar icon resources](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-relaunchiconresource), and [Electron's shortcut API](https://www.electronjs.org/docs/latest/api/shell#shellwriteshortcutlinkshortcutpath-operation-options-windows).
