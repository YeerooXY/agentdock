'use strict';
const { powershell, userShell } = require('./platform.cjs');

// Permission patterns must stay literal. Compound/quoted commands still run in
// Paddock's existing verification phase, outside the model's tool permissions.
function workerCheckCommand(command, { review = false, textOnly = false } = {}) {
  if (review || textOnly || typeof command !== 'string') return '';
  const value = command.trim();
  return value.length <= 4000 && /^[a-zA-Z0-9_./:@=+-]+(?: [a-zA-Z0-9_./:@=+-]+)*$/.test(value) ? value : '';
}

function checkLaunch(command, platform = process.platform) {
  const wrapper = `& {\n${command}\n}\n$paddockChecksOK = $?\nif ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if (-not $paddockChecksOK) { exit 1 }\nexit 0`;
  return platform === 'win32'
    ? { executable: powershell(), args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(wrapper, 'utf16le').toString('base64')] }
    : { executable: userShell(), args: ['-c', command] };
}

module.exports = { workerCheckCommand, checkLaunch };
