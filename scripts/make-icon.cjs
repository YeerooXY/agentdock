'use strict';
// Rasterize assets/icon.svg (the "Pd" tile) for Windows, the tray, the
// Android launcher and the 1024px macOS/Linux app icon. The ICO holds one PNG per size, rendered at that size.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const android = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
(async () => {
  const browser = await chromium.launch(), png = {};
  for (const size of new Set([...icoSizes, ...Object.values(android), 1024])) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    png[size] = await page.screenshot({ omitBackground: true }); await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(root, 'assets/icon.png'), png[256]);
  fs.writeFileSync(path.join(root, 'assets/icon-1024.png'), png[1024]);
  for (const [density, size] of Object.entries(android)) fs.writeFileSync(path.join(root, `mobile/android/app/src/main/res/mipmap-${density}/ic_launcher.png`), png[size]);
  const header = Buffer.alloc(6 + 16 * icoSizes.length); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  icoSizes.forEach((size, i) => {
    const at = 6 + 16 * i, data = png[size];
    header.writeUInt8(size % 256, at); header.writeUInt8(size % 256, at + 1); header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += data.length;
  });
  fs.writeFileSync(path.join(root, 'assets/icon.ico'), Buffer.concat([header, ...icoSizes.map(size => png[size])]));
  console.log('Wrote assets/icon.png, assets/icon-1024.png, assets/icon.ico and Android launcher icons.');
})().catch(error => { console.error(error); process.exit(1); });
