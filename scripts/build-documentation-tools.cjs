'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'skills/project-documentation/scripts/documentation.cjs');
async function build({ check = false } = {}) {
  const result = await esbuild.build({ entryPoints: [path.join(root, 'scripts/documentation.cjs')], bundle: true, platform: 'node', format: 'cjs', target: 'node20', write: false, minify: true, legalComments: 'eof' });
  const bytes = result.outputFiles[0].contents;
  const licenses = ['common', 'lr', 'javascript'].map(name => `@lezer/${name}\n\n` + fs.readFileSync(path.join(root, 'node_modules/@lezer', name, 'LICENSE'), 'utf8')).join('\n\n');
  const licenseFile = path.join(path.dirname(target), 'THIRD-PARTY-LICENSES.txt');
  if (check) {
    if (!fs.existsSync(target) || !Buffer.from(bytes).equals(fs.readFileSync(target))) throw Error('Documentation helper is outdated. Run node scripts/build-documentation-tools.cjs.');
    if (!fs.existsSync(licenseFile) || fs.readFileSync(licenseFile, 'utf8') !== licenses) throw Error('Documentation helper licenses are outdated.');
  } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); fs.writeFileSync(licenseFile, licenses); }
  return { bytes: bytes.length, check };
}
if (require.main === module) build({ check: process.argv.includes('--check') }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build };
