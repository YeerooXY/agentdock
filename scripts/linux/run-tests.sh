#!/bin/bash
# Run inside the Linux test image or a CI runner with the same packages.
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run build
npm run prepare:runtime
npm test
bash scripts/linux/with-keyring.sh npm run test:desktop
