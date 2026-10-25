'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
// Every installer built for this version, on whichever system ran the build.
const names = fs.readdirSync(path.join(root, 'release')).filter(name => name.startsWith(`Paddock-${version}-`) && /\.(exe|AppImage|deb|dmg)$/.test(name)).sort();
if (!names.length) throw new Error(`No installers found for ${version}.`);
const lines = names.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'release', name))).digest('hex')}  ${name}`);
fs.writeFileSync(path.join(root, 'release', 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`SHA-256 written for ${names.join(', ')}`);
