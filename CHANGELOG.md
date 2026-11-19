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
