'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { build } = require('esbuild');
const { meshyZodPlugin } = require('./meshy-build.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.build', 'runtime');
const version = '24.22.1';
// Official Node.js v24.22.1 SHASUMS256.txt entries for each supported build.
const builds = {
  'win32-x64': { file: 'win-x64/node.exe', sha256: 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5' },
  'linux-x64': { file: `node-v${version}-linux-x64.tar.gz`, sha256: 'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c' },
  'linux-arm64': { file: `node-v${version}-linux-arm64.tar.gz`, sha256: '33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3' },
  'darwin-x64': { file: `node-v${version}-darwin-x64.tar.gz`, sha256: 'd132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035' },
  'darwin-arm64': { file: `node-v${version}-darwin-arm64.tar.gz`, sha256: '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7' }
};
const arch = process.env.PADDOCK_ARCH || process.arch;
const target = builds[`${process.platform}-${arch}`];
const checksum = target?.sha256;
// Keep the official CLI intact (including its own auth handling and sharp).
// Copy only its runtime dependency graph, never developer tools or user data.
function copyPackage(name, from, destination) {
  const { createRequire } = require('node:module');
  const resolver = createRequire(path.join(from, 'package.json'));
  const source = resolver.resolve.paths(name).map(base => path.join(base, name)).find(dir => fs.existsSync(path.join(dir, 'package.json')));
  if (!source) throw new Error(`Missing runtime dependency ${name}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const target = path.join(destination, name);
  if (fs.existsSync(path.join(target, 'package.json'))) {
    if (JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).version !== pkg.version) throw new Error(`Conflicting runtime version for ${name}`);
    return;
  }
  fs.cpSync(source, target, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).includes('node_modules') });
  for (const dependency of Object.keys(pkg.dependencies || {})) copyPackage(dependency, source, destination);
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) {
    const available = resolver.resolve.paths(dependency)?.some(base => fs.existsSync(path.join(base, dependency, 'package.json')));
    if (available) copyPackage(dependency, source, destination);
  }
}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
// CI runners occasionally abort the connection early; the checksum below still
// verifies whatever finally arrives.
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`Download attempt ${attempt} failed (${error.message}); retrying.`);
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
    }
  }
}
(async () => {
  if (!target) throw new Error(`No bundled Node.js build for ${process.platform}-${arch}.`);
  fs.mkdirSync(output, { recursive: true });
  // npm carries its runtime dependencies and license texts in its own package.
  // Keep it outside ASAR so selected CLI packages can use the bundled Node.
  const npmOutput = path.join(output, 'npm');
  if (fs.existsSync(npmOutput)) {
    if (path.dirname(fs.realpathSync(npmOutput)) !== fs.realpathSync(output)) throw new Error('Unexpected npm runtime location.');
    fs.rmSync(npmOutput, { recursive: true });
  }
  fs.cpSync(path.join(root, 'node_modules', 'npm'), npmOutput, { recursive: true });
  const cliModules = path.join(output, 'meshy-cli', 'node_modules');
  fs.mkdirSync(cliModules, { recursive: true });
  copyPackage('meshy-cli', root, cliModules);
  // Put the CLI at a stable entry point; dependencies stay beside it.
  const cliPackage = path.join(cliModules, 'meshy-cli');
  for (const file of fs.readdirSync(cliPackage)) fs.cpSync(path.join(cliPackage, file), path.join(output, 'meshy-cli', file), { recursive: true });
  const windows = process.platform === 'win32';
  const executable = path.join(output, windows ? 'node.exe' : path.join('bin', 'node'));
  const marker = path.join(output, 'node-source.sha256');
  const current = windows ? fs.existsSync(executable) && hash(fs.readFileSync(executable)) === checksum
    : fs.existsSync(executable) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === checksum;
  if (!current) {
    const archive = await download(`https://nodejs.org/dist/v${version}/${target.file}`);
    if (hash(archive) !== checksum) throw new Error('Node.js checksum did not match. No runtime was written.');
    if (windows) fs.writeFileSync(executable, archive);
    else {
      // Extract only bin/node from the verified official archive.
      const staging = path.join(output, '.node-download');
      fs.rmSync(staging, { recursive: true, force: true }); fs.mkdirSync(staging, { recursive: true });
      const archiveFile = path.join(staging, 'node.tar.gz'); fs.writeFileSync(archiveFile, archive);
      const entry = `${target.file.replace(/\.tar\.gz$/, '')}/bin/node`;
      await require('tar').x({ file: archiveFile, cwd: staging, filter: name => name === entry });
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.copyFileSync(path.join(staging, entry), executable); fs.chmodSync(executable, 0o755);
      fs.rmSync(staging, { recursive: true, force: true });
      fs.writeFileSync(marker, checksum + '\n');
    }
  }
  const license = path.join(output, 'NODE-LICENSE.txt');
  fs.copyFileSync(path.join(root, 'electron', 'draft-editor.cjs'), path.join(output, 'draft-editor.cjs'));
  fs.copyFileSync(path.join(root, 'electron', 'draft-policy.cjs'), path.join(output, 'draft-policy.cjs'));
  let previousVersion;
  try { previousVersion = JSON.parse(fs.readFileSync(path.join(output, 'runtime.json'), 'utf8')).node; } catch {}
  if (!fs.existsSync(license) || previousVersion !== version) fs.writeFileSync(license, await download(`https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`));
  const result = await build({
    absWorkingDir: root, entryPoints: { 'mirofish-mcp': 'electron/mirofish-mcp.cjs', 'agent-event': 'electron/agent-event.cjs', 'agent-tools': 'electron/agent-tools.cjs', 'meshy-mcp': 'node_modules/@meshy-ai/meshy-mcp-server/dist/index.js' },
    alias: { dotenv: path.join(root, 'electron', 'no-dotenv.cjs') },
    plugins: [meshyZodPlugin()],
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
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify({ node: version, platform: process.platform, arch, sha256: checksum }, null, 2) + '\n');
  console.log(`Prepared Node ${version}, agent helpers and Meshy MCP.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
