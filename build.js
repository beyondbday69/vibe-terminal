import esbuild from 'esbuild';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const externals = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'node:*',
  'path',
  'fs',
  'os',
  'child_process',
  'node:fs/promises',
  'node:path',
  'node:child_process',
];

esbuild.build({
  entryPoints: ['src/index.jsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/vibe.js',
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  external: externals,
}).then(() => {
  console.log('Build completed successfully.');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
