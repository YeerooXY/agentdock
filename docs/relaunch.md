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
- records a healthy new version in `last-good.txt` for the next relaunch.

Results: `.build\relaunch\<time>\status.json` and `supervisor.log`. To end supervision early, create a file named `stop` in that folder (or delete the scheduled task "Paddock relaunch <time>"). While supervision runs, quitting Paddock makes it start again within a minute.

The 2 November watchdog (`.build\restart-watchdog-20261102-152257`) stopped Paddock, then aborted because the old process was still visible for a moment, and never relaunched. Nothing after the stop step here can abort; every failure leads to another start.
