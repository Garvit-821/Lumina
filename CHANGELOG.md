# Changelog

All notable changes to Lumina are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Stop button and <kbd>Esc</kbd> shortcut to cancel a reply while it is streaming.
- The conversation is restored when the Nexus view is moved or re-created.
- Workspace indexing embeds chunks in batches through Ollama's `/api/embed` endpoint,
  with a per-chunk fallback for older Ollama versions.
- Unit tests on Node's built-in test runner and a GitHub Actions workflow that runs
  the checks on every push and pull request.
- A `docs/` folder with guides for configuration, commands, indexing, diff review and
  troubleshooting.

### Changed

- Prism opens with <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd>,
  so it no longer shadows VS Code's own <kbd>Cmd</kbd>+<kbd>K</kbd> chords.
- Diff hunks are computed with a longest-common-subsequence diff, which gives minimal
  hunks instead of the previous look-ahead heuristic.
- Ghost text uses Ollama's native fill-in-the-middle support and falls back to a plain
  continuation prompt for models without it.
- Changes to `lumina.ollamaEndpoint` and `lumina.selectedModel` apply immediately, without
  reloading the window.
- The Nexus sidebar was redesigned around VS Code theme variables, with a status pill,
  icon tabs and a streaming indicator.

### Fixed

- Chat no longer offers to replace a whole file with a short example snippet.
- Prism and chat edits are applied to the text that was selected when the request started,
  even if the cursor moved while the model was generating.
- The current user message is no longer sent to the model twice.
- Text that already streamed is kept when a reply fails or is stopped.
- Applying a suggestion to a file that changed in the meantime now asks for confirmation.
- Benchmarks report measured numbers only and fail loudly when the model cannot be reached.
- The recommended model is selected at startup only if it is actually installed.
- Stopping the autonomous loop aborts the running request and kills the test process.
- The indexed file count is correct after loading the index from disk.
