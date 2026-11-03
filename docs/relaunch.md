# Relaunching the development copy

`npm run relaunch` (or `powershell -ExecutionPolicy Bypass -File scripts\relaunch.ps1`) restarts Paddock from this folder with the latest code and keeps it running.

1. Builds the renderer and syntax-checks the main files. If that fails, Paddock is left running and nothing else happens.
2. Prepares a fallback copy: a detached worktree of a known-good commit in `.build\rollback-<commit>`, sharing `node_modules`. The default is the last version that came up healthy (`.build\relaunch\last-good.txt`); `-Fallback <commit>` picks another, `-Fallback none` skips it.
3. Starts `scripts\paddock-supervisor.ps1` as a Windows scheduled task, outside Paddock's process tree, so it survives Paddock closing.

The supervisor then:

- stops every Paddock main process of either copy, waits up to a minute for Windows to release them and continues regardless;
- starts the new code and waits until the process stays up and owns the phone listener (only checked when the Tailscale address exists on this PC);
- after two failed starts, switches to the fallback copy;
- for `-Hours` (default 16), checks every minute and starts Paddock again if it is not running; three stops of the new code within 30 minutes switch to the fallback;
- after five failed starts in a row, tries every ten minutes instead of every minute;
- copies Paddock's own startup errors (from `logs\main.log`) into its log after a failed start;
- records a healthy new version in `last-good.txt` for the next relaunch.

Results: `.build\relaunch\<time>\status.json` and `supervisor.log`. To end supervision early, create a file named `stop` in that folder (or delete the scheduled task "Paddock relaunch <time>"). While supervision runs, quitting Paddock makes it start again within a minute.

The 2 November watchdog (`.build\restart-watchdog-20261102-152257`) stopped Paddock, then aborted because the old process was still visible for a moment, and never relaunched. Nothing after the stop step here can abort; every failure leads to another start.

3 November 2026 incident: the first real run also closed a task by rewriting its file in the Paddock data folder. PowerShell 5.1 wrote it with a byte order mark, Paddock refused to start on the unreadable file ("Cannot read ab6d0998….json"), and the fallback copy shares the same data folder, so all 92 starts over 13 hours failed. Since then the supervisor never edits Paddock data, Paddock reads files with a byte order mark, and one damaged task record is set aside as `.corrupt` instead of stopping startup. The rehearsal used stand-in apps that read no data, which is why it passed; a rehearsal for a real relaunch should start the new code against a copy of the data folder.
