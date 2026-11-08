'use strict';
// Internal marker lets the IPC transport distinguish a command with no value
// from a command whose actual result is undefined. It is never exposed to clients.
const NO_VALUE = Symbol('paddock.command.no-value');
module.exports = { NO_VALUE };
