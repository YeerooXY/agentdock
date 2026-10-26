#!/bin/bash
# After a failed CI step, report the failing test lines as one annotation.
# Annotations are visible without signing in, unlike the raw job log.
#   bash scripts/ci-summary.sh test.log
log="${1:-test.log}"
[ -f "$log" ] || exit 0
lines=$( { grep -E -A6 '✖|Error|AssertionError|Timeout|FAIL|not ok' "$log" | head -80; echo '--- last lines ---'; tail -n 60 "$log"; } \
  | sed -e 's/%/%25/g' -e 's/\r//g' | awk '{ printf "%s%%0A", $0 }')
echo "::error title=Test failures::${lines}"
