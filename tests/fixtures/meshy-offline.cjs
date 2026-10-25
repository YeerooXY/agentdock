'use strict';
// Loaded only in the Meshy test subprocess. Never send a request to a real API.
const allowed = new URL(process.env.PADDOCK_TEST_API);
function check(input) {
  const url = typeof input === 'string' || input instanceof URL ? new URL(input) : input;
  const hostname = url.hostname || url.host;
  if (hostname !== allowed.hostname || String(url.port) !== allowed.port) throw new Error('External network request blocked by Meshy test');
}
for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  for (const method of ['request', 'get']) {
    const original = module[method];
    module[method] = function (input, ...args) { check(input); return original.call(this, input, ...args); };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) { check(input instanceof Request ? input.url : input); return originalFetch(input, ...args); };
