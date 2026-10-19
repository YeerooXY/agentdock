'use strict';
module.exports = {
  appId: 'com.yeeroo.agentdock',
  productName: 'Agent Dock',
  copyright: 'Copyright © 2026 YeerooXY',
  directories: { output: 'release', buildResources: 'assets' },
  files: [
    'dist/**/*', 'electron/**/*.cjs', 'guides/*.md', 'assets/icon.*', 'assets/third-party-notices.txt', 'package.json',
    '!node_modules/node-pty/{src,deps,third_party,scripts,typings}/**/*',
    '!node_modules/node-pty/prebuilds/{darwin-*,win32-arm64}/**/*',
    '!node_modules/node-pty/**/*.pdb'
  ],
  asar: true,
  asarUnpack: ['node_modules/node-pty/**/*'],
  extraResources: [{ from: '.build/runtime', to: 'runtime' }, { from: 'electron/mobile-network.ps1', to: 'mobile-network.ps1' }],
  // node-pty ships N-API binaries. The packaged smoke test loads the x64 binary
  // and exercises real ConPTY sessions against the bundled Electron version.
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/icon.ico', artifactName: 'Agent-Dock-${version}-Setup-${arch}.${ext}', requestedExecutionLevel: 'asInvoker' },
  nsis: {
    include: 'assets/installer.nsh',
    oneClick: false, perMachine: false, allowElevation: false,
    allowToChangeInstallationDirectory: true, packElevateHelper: false,
    createDesktopShortcut: true, createStartMenuShortcut: true,
    shortcutName: 'Agent Dock', uninstallDisplayName: 'Agent Dock',
    deleteAppDataOnUninstall: false
  },
  publish: null
};
