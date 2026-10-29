'use strict';
module.exports = {
  appId: 'com.yeeroo.agentdock',
  productName: 'Paddock',
  copyright: 'Copyright © 2026 YeerooXY',
  directories: { output: 'release', buildResources: 'assets' },
  files: [
    'dist/**/*', 'electron/**/*.cjs', 'guides/*.md', 'skills/**/*', 'assets/icon.*', 'assets/third-party-notices.txt', 'package.json',
    '!node_modules/node-pty/{src,deps,third_party,scripts,typings}/**/*',
    // Ship only this system's node-pty binaries; each installer is built on its own OS.
    ...['darwin', 'linux', 'win32'].filter(os => os !== process.platform).map(os => `!node_modules/node-pty/prebuilds/${os}-*/**/*`),
    '!node_modules/node-pty/prebuilds/win32-arm64/**/*',
    '!node_modules/node-pty/**/*.pdb'
  ],
  asar: true,
  asarUnpack: ['node_modules/node-pty/**/*'],
  extraResources: [{ from: '.build/runtime', to: 'runtime' }, ...(process.platform === 'win32' ? [{ from: 'electron/mobile-network.ps1', to: 'mobile-network.ps1' }] : [])],
  // node-pty ships N-API binaries. The packaged smoke test loads the x64 binary
  // and exercises real ConPTY sessions against the bundled Electron version.
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/icon.ico', artifactName: 'Paddock-${version}-Setup-${arch}.${ext}', requestedExecutionLevel: 'asInvoker' },
  nsis: {
    include: 'assets/installer.nsh',
    oneClick: false, perMachine: false, allowElevation: false,
    allowToChangeInstallationDirectory: true, packElevateHelper: false,
    createDesktopShortcut: true, createStartMenuShortcut: true,
    shortcutName: 'Paddock', uninstallDisplayName: 'Paddock',
    deleteAppDataOnUninstall: false
  },
  linux: {
    target: ['AppImage', 'deb'], icon: 'assets/icon-1024.png', category: 'Development',
    // Fixed x64 name: AppImage and deb would otherwise say x86_64 and amd64.
    artifactName: 'Paddock-${version}-Linux-x64.${ext}', synopsis: 'Agent consoles, projects and usage in one window',
    maintainer: 'YeerooXY <YeerooXY@users.noreply.github.com>'
  },
  // Unsigned for now: Gatekeeper asks users to confirm the first launch.
  mac: {
    target: ['dmg'], // one architecture per run; see dist:mac
    icon: 'assets/icon-1024.png', category: 'public.app-category.developer-tools',
    artifactName: 'Paddock-${version}-Mac-${arch}.${ext}', identity: null, hardenedRuntime: false
  },
  publish: null
};
