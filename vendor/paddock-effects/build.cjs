// Refresh browser palette data from the shared manifest; no runtime dependencies.
const fs = require('node:fs');
const path = require('node:path');
function build(directory = __dirname, check = false) {
  const data = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  for (const name of ['effects.js', 'effects.css']) {
    const file = path.join(directory, name);
    const original = fs.readFileSync(file, 'utf8');
    let updated = original;
    if (name.endsWith('.js')) {
      updated = original.replace(/^const themeData = .*;$/m, `const themeData = ${JSON.stringify(data.themes)};`);
    } else {
      for (const theme of data.themes) {
        if (theme.id === 'gamer') continue;
        const accent = data.desktopOverrides.accent[theme.id] || theme;
        const frame = data.desktopOverrides.frame[theme.id] || theme;
        const rule = new RegExp(`(body\\[data-theme="${theme.id}"\\] \\{)([^}]+)(\\})`);
        if (!rule.test(updated)) throw new Error(`Add a surface rule for shared theme ${theme.id}`);
        updated = updated.replace(rule, (_, start, body, end) => start + body
          .replace(/--accent-blue:[^;]+/, `--accent-blue:${accent.a}`)
          .replace(/--accent-pink:[^;]+/, `--accent-pink:${accent.b}`)
          .replace(/--frame-a:[^;]+/, `--frame-a:${frame.a}`)
          .replace(/--frame-b:[^;]+/, `--frame-b:${frame.b}`) + end);
      }
    }
    if (updated === original) continue;
    if (check) throw new Error(`Shared ${name} needs regeneration: node build.cjs`);
    fs.writeFileSync(file, updated);
  }
}
if (require.main === module) build(__dirname, process.argv.includes('--check'));
module.exports = { build };
