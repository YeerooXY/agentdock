// The checked-in snapshot makes standalone clones and Docker builds self-contained.
// Local development refreshes it from the canonical shared package automatically.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = process.env.PADDOCK_EFFECTS_SOURCE
  ? path.resolve(process.env.PADDOCK_EFFECTS_SOURCE)
  : path.resolve(root, '../FamilyHub/packages/paddock-effects');
const target = path.join(root, 'vendor/paddock-effects');
const files = ['effects.js', 'effects.css', 'index.mjs', 'manifest.json', 'package.json', 'README.md', 'build.cjs'];
const check = process.argv.includes('--check');
if (process.env.PADDOCK_EFFECTS_SOURCE && !fs.existsSync(source)) throw new Error('PADDOCK_EFFECTS_SOURCE does not exist');
if (fs.existsSync(source)) {
  require(path.join(source, 'build.cjs')).build(source, check);
  for (const name of files) {
    const input = fs.readFileSync(path.join(source, name));
    const output = path.join(target, name);
    if (fs.existsSync(output) && input.equals(fs.readFileSync(output))) continue;
    if (check) throw new Error(`Shared effects snapshot differs: ${name}`);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(output, input);
  }
}
for (const name of files) if (!fs.existsSync(path.join(target, name))) throw new Error(`Missing shared effects snapshot: ${name}`);
const manifest = fs.readFileSync(path.join(target, 'manifest.json'));
const mirror = path.join(root, 'themes/manifest.json');
if (!manifest.equals(fs.readFileSync(mirror))) {
  if (check) throw new Error('Theme manifest mirror differs from shared effects');
  fs.writeFileSync(mirror, manifest);
}
if (!check) {
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-theme-data.cjs')], { stdio: 'inherit' });
}
