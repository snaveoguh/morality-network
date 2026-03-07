import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  target: 'chrome120',
  treeShaking: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
};

async function run() {
  // Ensure dist exists
  mkdirSync('dist', { recursive: true });

  const builds = [
    // Content script — IIFE (Chrome requirement for content scripts)
    build({
      ...commonOptions,
      entryPoints: ['src/content/index.ts'],
      outfile: 'dist/content.js',
      format: 'iife',
      loader: { '.css': 'text' },
    }),
    // EIP-1193 Provider — IIFE, runs in MAIN world (page context)
    build({
      ...commonOptions,
      entryPoints: ['src/content/provider.ts'],
      outfile: 'dist/provider.js',
      format: 'iife',
    }),
    // Service worker — ESM
    build({
      ...commonOptions,
      entryPoints: ['src/background/index.ts'],
      outfile: 'dist/background.js',
      format: 'esm',
    }),
    // Popup — ESM
    build({
      ...commonOptions,
      entryPoints: ['src/popup/index.ts'],
      outfile: 'dist/popup.js',
      format: 'esm',
    }),
  ];

  await Promise.all(builds);

  // Copy static files to dist
  copyFileSync('manifest.json', 'dist/manifest.json');
  copyFileSync('src/popup/index.html', 'dist/popup.html');
  copyFileSync('src/popup/styles.css', 'dist/popup.css');
  if (existsSync('icons')) {
    cpSync('icons', 'dist/icons', { recursive: true });
  }

  console.log('Build complete → dist/');
}

run().catch((e) => { console.error(e); process.exit(1); });
