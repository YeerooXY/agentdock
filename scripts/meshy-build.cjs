'use strict';
const path = require('node:path');

// Meshy 0.6.4 uses Zod 3's single-argument record(). Keep that call compatible
// while using the patched Zod 4 validator. Other packages use Zod unchanged.
function meshyZodPlugin() {
  const schemas = path.dirname(require.resolve('@meshy-ai/meshy-mcp-server'));
  return {
    name: 'meshy-zod-record',
    setup(build) {
      build.onResolve({ filter: /^zod$/ }, args => {
        if (args.importer.startsWith(schemas + path.sep)) {
          return { path: path.resolve(__dirname, '../electron/meshy-zod.cjs') };
        }
      });
    }
  };
}
module.exports = { meshyZodPlugin };
