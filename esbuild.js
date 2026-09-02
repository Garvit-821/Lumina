const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

async function main() {
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
