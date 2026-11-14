/**
 * Build script for the extension. Bundles src/extension.ts with esbuild into dist/extension.js and copies
 * the Nexus webview files (src/nexus/media) to dist/nexus/media, where the webview loads them from.
 * Pass --watch to keep rebuilding the bundle on every change.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

/**
 * Creates the esbuild context, copies the media files, then either watches or does a single build.
 * Errors propagate to the catch at the bottom of the file, which exits with status 1.
 */
async function main() {
  // CommonJS for Node, as VS Code expects; 'vscode' stays external because the editor provides it at runtime.
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: false,
    sourcemap: true,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  // Ensure media directory exists in dist
  const srcMedia = path.join(__dirname, 'src', 'nexus', 'media');
  const distMedia = path.join(__dirname, 'dist', 'nexus', 'media');
  
  /**
   * Copies every file in src/nexus/media to dist/nexus/media, creating the folder first. Not recursive: a
   * subfolder there would make copyFileSync throw. Does nothing if the source folder is missing.
   */
  function copyMediaFiles() {
    if (fs.existsSync(srcMedia)) {
      fs.mkdirSync(distMedia, { recursive: true });
      const files = fs.readdirSync(srcMedia);
      for (const file of files) {
        fs.copyFileSync(path.join(srcMedia, file), path.join(distMedia, file));
      }
      console.log('Copied Nexus webview media assets to dist.');
    }
  }

  copyMediaFiles();

  if (isWatch) {
    await extensionCtx.watch();
    console.log('Watching for extension changes...');
  } else {
    await extensionCtx.rebuild();
    await extensionCtx.dispose();
    console.log('Build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
