# Contributing to Lumina

Thanks for taking the time to help. This page covers how to get a working checkout,
what a good change looks like and how to send it.

## Getting set up

You need Node.js 22 or newer, VS Code 1.80 or newer and, to try the extension end to end,
a local [Ollama](https://ollama.com) server.

```bash
npm ci
npm run build
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with Lumina loaded.
`npm run dev` rebuilds the bundle on every save.

## Where things live

Source is under `src/`, grouped by feature: `ollama/` (HTTP client and model manager),
`rag/` (workspace index), `orchestrator/` (chat and the autonomous loop), `diff/`
(suggestions and patching), `nexus/` (sidebar webview), `prism/`, `aura/` and
`calibration/`. Tests are in `test/`, one `*.test.js` file per module.
[docs/architecture.md](docs/architecture.md) explains how the pieces fit together.

## Making a change

- Keep a pull request to one topic. Small pull requests get reviewed faster.
- Logic that does not need the VS Code API belongs in a plain module (see
  `src/rag/filePolicy.ts` or `src/diff/proposalPolicy.ts`) so it can be unit tested.
- Read settings through `getLuminaConfig()` in `src/utils/config.ts` rather than calling
  `workspace.getConfiguration` directly, so changes apply without a reload.
- Nothing may leave the machine: the only network destination is the configured Ollama
  endpoint.
