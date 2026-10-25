'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingsSummary } = require('../electron/mobile-settings.cjs');
test('phone settings expose only configuration labels and shared instructions', () => {
  const value = settingsSummary({ keys: [{ id: 'sample', label: 'Sample key', key: 'SECRET', encrypted: 'PRIVATE' }], shared: {
    profiles: [{ id: 'api', name: 'API', protocol: 'responses', url: 'https://SECRET', keyId: 'PRIVATE' }],
    connections: [{ id: 'tool', name: 'Tool', enabled: true, envKeys: { TOKEN: 'SECRET' }, command: 'PRIVATE' }], instructions: 'Shared instructions',
  } });
  assert.deepEqual(value.keys, [{ id: 'sample', name: 'Sample key' }]);
  assert.deepEqual(value.apis, [{ id: 'api', name: 'API', protocol: 'responses' }]);
  assert.deepEqual(value.tools, [{ id: 'tool', name: 'Tool', enabled: true }]);
  assert.equal(value.instructions, 'Shared instructions');
  assert.doesNotMatch(JSON.stringify(value), /SECRET|PRIVATE/);
});
