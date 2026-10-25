#!/bin/bash
# Run a command with an unlocked GNOME keyring and a virtual display, as on a
# Linux desktop session. Electron's safeStorage needs the keyring; Paddock
# refuses to store keys without one.
#   bash scripts/linux/with-keyring.sh npm run test:desktop
set -euo pipefail
# Test runs launched through Playwright use this keyring instead of plain text.
export PADDOCK_TEST_PASSWORD_STORE=gnome-libsecret
# A default "login" collection, so the keyring never asks to create one.
mkdir -p "$HOME/.local/share/keyrings"
[ -f "$HOME/.local/share/keyrings/default" ] || printf 'login' > "$HOME/.local/share/keyrings/default"
exec dbus-run-session -- bash -c '
  set -euo pipefail
  printf "paddock-test" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
  exec xvfb-run -a --server-args="-screen 0 1440x900x24" "$@"
' bash "$@"
