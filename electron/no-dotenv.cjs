'use strict';
// Managed MCP servers receive only the credentials explicitly bound by Dock.
// Do not read a .env file from a project or the current working directory.
module.exports = { config: () => ({ parsed: {} }) };
