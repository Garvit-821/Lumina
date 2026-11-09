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

## Run and debug

`.vscode/launch.json` defines **Run Lumina Extension (F5)**, an `extensionHost` configuration that
loads the repository with `--extensionDevelopmentPath` and maps breakpoints to `dist/**/*.js`. Its
`preLaunchTask` is `npm: build`, the default build task in `.vscode/tasks.json`, so pressing F5
builds once and opens an Extension Development Host window.

- Keep `npm run dev` running and use **Developer: Reload Window** in the host window to load extension changes.
- Extension logs appear in the **Lumina Agent** output channel of the host window.
- Use **Developer: Open Webview Developer Tools** in the host window to debug `nexus.js`.

## Project layout

- `src/extension.ts`: activation, service wiring and command registration.
- `src/types.ts`: shared data types and the webview message protocol.
- `src/ollama/`: HTTP client, NDJSON stream reader and model manager.
- `src/orchestrator/`: chat orchestrator, prompt builder, autonomous loop and failure-output parser.
- `src/rag/`: crawler, file policy, chunker, vector store, cosine similarity and context engine.
- `src/diff/`: diff engine, patch manager, diff content provider and full-file proposal policy.
- `src/prism/` and `src/aura/`: Prism command bar and ghost text provider.
- `src/nexus/`: webview provider (which holds the HTML template) and `media/` with `nexus.js` and `nexus.css`.
- `src/calibration/`: hardware scan, recommender, benchmark and its math.
- `src/utils/`: settings access, logger, status bar and code block extraction.
- `test/`: unit tests. `resources/`: icons and the preview image.
- `scripts/generate-icon.js`: writes the 128 by 128 `resources/lumina-icon.png` when run with `node`.
- Build output: `dist/` (bundle and webview media) and `out/` (per-module output for tests, ignored by Git).

See [Architecture](architecture.md) for how the pieces fit together.

## Tests

```bash
npm test
```

`npm test` runs `npm run compile`, then `node --test "test/**/*.test.js"`. The tests use the built-in
`node:test` runner with `node:assert/strict` and load the compiled modules from `out/`, so compile
first if you run `node --test` yourself. They cover the modules that do not need the VS Code API:

| Files | Cover |
|---|---|
| `diffEngine*.test.js` | Hunk computation, insertions and deletions, repeated lines, round trips |
| `proposalPolicy*.test.js` | When a chat code block counts as a full-file replacement |
| `chunker*.test.js`, `filePolicy*.test.js`, `similarity*.test.js` | Chunking, index filters and secret files, cosine similarity |
| `ndjson*.test.js`, `codeBlocks*.test.js`, `traceParser*.test.js` | Stream parsing and errors, fenced block extraction, paths in failure output |
| `benchmarkMath*.test.js`, `recommender*.test.js` | Tokens per second, model name matching, tier selection |
| `webviewMarkdown*.test.js` | Escaping and rendering in `nexus.js`, whose functions are extracted from the source |

There are no integration tests that start VS Code or talk to Ollama.

## Packaging

```bash
npm run package
```

This runs `npx @vscode/vsce package --no-git-tag-version --allow-star-activation`. `vsce` first runs
the `vscode:prepublish` script (`npm run build`), then writes `lumina-ai-agent-<version>.vsix`
(currently `lumina-ai-agent-0.1.1.vsix`) to the repository root. `.vscodeignore` keeps `src/`,
`test/`, `scripts/`, `out/`, `node_modules/`, `.vscode/`, `.github/`, `.devlog/`, source maps, `.vsix`
files, `tsconfig.json` and `esbuild.js` out of the package. Anything it does not list, such as `docs/`,
is included. Install the result with `code --install-extension lumina-ai-agent-0.1.1.vsix`.
