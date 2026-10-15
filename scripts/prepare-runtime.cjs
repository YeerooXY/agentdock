'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.build', 'runtime');
const version = '24.19.0';
// Official Node.js v24.19.0 SHASUMS256.txt, win-x64/node.exe.
const checksum = '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
(async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build this Windows x64 installer on Windows x64.');
  fs.mkdirSync(output, { recursive: true });
  const executable = path.join(output, 'node.exe');
  if (!fs.existsSync(executable) || hash(fs.readFileSync(executable)) !== checksum) {
    const binary = await download(`https://nodejs.org/dist/v${version}/win-x64/node.exe`);
    if (hash(binary) !== checksum) throw new Error('Node.js checksum did not match. No runtime was written.');
    fs.writeFileSync(executable, binary);
  }
  const license = path.join(output, 'NODE-LICENSE.txt');
  if (!fs.existsSync(license)) fs.writeFileSync(license, await download(`https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`));
  const result = await build({
    absWorkingDir: root, entryPoints: { 'agent-event': 'electron/agent-event.cjs', 'agent-tools': 'electron/agent-tools.cjs', 'meshy-mcp': 'node_modules/@meshy-ai/meshy-mcp-server/dist/index.js' },
    alias: { dotenv: path.join(root, 'electron', 'no-dotenv.cjs') },
    outdir: output, outExtension: { '.js': '.cjs' }, bundle: true,
    platform: 'node', target: 'node24', format: 'cjs', legalComments: 'eof', metafile: true
  });
  // Include the licenses of every dependency embedded in the standalone helpers.
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes('node_modules/')) continue;
    let directory = path.dirname(path.resolve(root, input));
    while (directory.startsWith(root + path.sep)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (pkg.name && pkg.version) { packages.set(directory, pkg); break; }
      }
      directory = path.dirname(directory);
    }
  }
  const notices = [];
  for (const [directory, pkg] of packages) {
    const licenses = fs.readdirSync(directory).filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
    if (!licenses.length) {
      const readme = fs.readdirSync(directory).find(file => /^readme(\.|$)/i.test(file));
      if (readme && /Permission is hereby granted[\s\S]+THE SOFTWARE IS PROVIDED/i.test(fs.readFileSync(path.join(directory, readme), 'utf8'))) licenses.push(readme);
    }
    if (!licenses.length) throw new Error(`Missing license text for bundled dependency ${pkg.name}`);
    notices.push(`${pkg.name} ${pkg.version}\n${'='.repeat(60)}\n${licenses.map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n')}`);
  }
  fs.writeFileSync(path.join(output, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'));
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify({ node: version, arch: 'x64', sha256: checksum }, null, 2) + '\n');
  console.log(`Prepared Node ${version}, agent helpers and Meshy MCP.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
