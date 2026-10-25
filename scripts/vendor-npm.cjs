'use strict';
// Rebuild the bundled npm from integrity-pinned official registry archives.
// Remove this repack once an upstream npm release includes both security fixes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tar = require('tar');
const root = path.resolve(__dirname, '..');
const sources = [
  ['npm', '12.2.1', 'sha512-bKCmFRVT/BB+YPEYbZwQ1XUI3N5t4xKSpU1MxOjo7z3iWzKBJ0ZXRC1xFdEN+TC7N5TdywaBzf2dMXGJq/e2PQ=='],
  ['undici', '6.29.1', 'sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA=='],
  ['ip-address', '10.7.4', 'sha512-DWBMKyeM25D70nrIiTkgQth59/G+naKOTep6huF9j+GmeK3DMD60Zvxg5d5qQnz+38AHgou6ean2LECX+lrKDg==']
];
async function main() {
  const parent = path.join(root, '.build');
  fs.mkdirSync(parent, { recursive: true });
  const work = fs.mkdtempSync(path.join(parent, 'npm-vendor-'));
  try {
    const packageDir = path.join(work, 'package');
    for (const [name, version, integrity] of sources) {
      const url = `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Download failed: ${name} ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
      if (actual !== integrity) throw new Error(`Integrity mismatch: ${name}`);
      const archive = path.join(work, name + '.tgz');
      fs.writeFileSync(archive, bytes);
      const destination = name === 'npm' ? packageDir : path.join(packageDir, 'node_modules', name);
      if (fs.existsSync(destination)) {
        const resolved = fs.realpathSync(destination);
        if (!resolved.startsWith(fs.realpathSync(work) + path.sep)) throw new Error('Unexpected archive destination');
        fs.rmSync(destination, { recursive: true });
      }
      fs.mkdirSync(destination, { recursive: true });
      await tar.x({ file: archive, cwd: destination, strip: 1, strict: true });
      const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'));
      if (manifest.name !== name || manifest.version !== version) throw new Error(`Unexpected package: ${name}`);
    }
    const manifestPath = path.join(packageDir, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '12.2.1-paddock.1';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(packageDir, 'PADDOCK-PATCHES.json'), JSON.stringify({
      description: 'Official npm 12.2.1 with patched bundled undici and ip-address; upstream licenses are retained.',
      sources: sources.map(([name, version, integrity]) => ({ name, version, integrity }))
    }, null, 2) + '\n');
    const vendor = path.join(root, 'vendor'); fs.mkdirSync(vendor, { recursive: true });
    const output = path.join(vendor, 'npm-12.2.1-paddock.1.tgz');
    // Explicit sorted entries and fixed metadata make the archive reproducible.
    const entries = [];
    function visit(relative) {
      entries.push(relative);
      const absolute = path.join(work, relative);
      if (fs.lstatSync(absolute).isDirectory()) {
        for (const name of fs.readdirSync(absolute).sort()) visit(relative + '/' + name);
      }
    }
    visit('package');
    await tar.c({ file: output, cwd: work, gzip: true, portable: true, mtime: new Date(0), noDirRecurse: true }, entries);
    console.log(`Prepared ${path.relative(root, output)} (${fs.statSync(output).size} bytes)`);
    console.log('sha512-' + crypto.createHash('sha512').update(fs.readFileSync(output)).digest('base64'));
  } finally {
    if (path.dirname(fs.realpathSync(work)) !== fs.realpathSync(parent)) throw new Error('Unexpected staging directory');
    fs.rmSync(work, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
