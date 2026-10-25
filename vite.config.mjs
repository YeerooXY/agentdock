import { defineConfig } from 'vite';
// The terminal library is its own chunk; scripts/bundle-budget.cjs keeps
// the application chunk from growing unnoticed.
export default defineConfig({ base: './', build: { outDir: 'dist', target: 'chrome130', rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'xterm', test: /node_modules[\\/]@xterm[\\/]/ }] } } } } });
