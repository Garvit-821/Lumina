# Development

This page is for working on Lumina itself: setting up the repository, building, debugging in an
Extension Development Host, running tests, packaging and CI. The tooling is plain npm scripts, with
esbuild for the bundle and the TypeScript compiler for type checks and test builds.

## Build and watch

| Script | What it does |
|---|---|
| `npm run build` | Runs `esbuild.js`: bundles `src/extension.ts` into `dist/extension.js` (CommonJS, Node platform, `vscode` external, source map, not minified) and copies `src/nexus/media/*` to `dist/nexus/media/` |
| `npm run dev`, `npm start`, `npm run build:watch` | The same with `--watch`, rebuilding the bundle on every change |
| `npm run typecheck` | `tsc --noEmit` with the strict settings in `tsconfig.json` |
| `npm run compile` | `tsc -p ./`, which writes one JavaScript file per module to `out/` for the tests |
| `npm run watch` | `tsc -watch -p ./` |

In watch mode the webview files are copied once, when the watcher starts. After editing `nexus.js`
or `nexus.css`, run `npm run build` or restart the watcher before reloading the window. The
repository tracks `dist/`, so a build changes tracked files.
