# Architecture

This page explains how the extension is put together, for people changing the code. Lumina is one
bundled extension module (`dist/extension.js`, built from `src/extension.ts`) plus a webview script
and stylesheet. All model work is done by an Ollama server over HTTP; nothing runs in-process.

## Overview

| Area | Folder | Main pieces |
|---|---|---|
| Ollama access | `src/ollama/` | `OllamaClient`, `OllamaModelManager`, `readNdjson` |
| Chat | `src/orchestrator/` | `SovereignOrchestrator`, `PromptBuilder` |
| Autonomous loop | `src/orchestrator/` | `AutonomousLoopController`, `findCandidateFiles` |
| Workspace context | `src/rag/` | `ContextEngine`, `WorkspaceCrawler`, `CodeChunker`, `LocalVectorStore` |
| Diffs | `src/diff/` | `DiffEngine`, `PatchManager`, `LuminaDiffProvider`, `isLikelyFullFileReplacement` |
| Prism | `src/prism/` | `PrismCommandBar` |
| Ghost text | `src/aura/` | `AuraInlineCompletionProvider` |
| Nexus panel | `src/nexus/` | `NexusViewProvider`, `media/nexus.js`, `media/nexus.css` |
| Calibration | `src/calibration/` | `CalibrationTelemetry`, `ModelRecommender`, `ModelBenchmarker` |
| Shared | `src/utils/`, `src/types.ts` | `getLuminaConfig`, `LuminaLogger`, `LuminaStatusBar`, code block parsing, message types |

Services are plain classes, created once in `activate()` and passed to each other through their
constructors. Apart from settings and the vector cache, all state lives in memory. The autonomous
loop is described on its own page: [Autonomous test and fix loop](autonomous-loop.md).

## Activation

`package.json` declares `onStartupFinished`, so `activate()` runs after VS Code finishes starting:

1. Creates `OllamaClient` with the configured endpoint, and `OllamaModelManager`, which reads `lumina.selectedModel` and starts a health check that repeats every 15 seconds.
2. Creates `ContextEngine` (loads the vector cache and tracks the active editor), the orchestrator, the loop controller, the status bar item, Prism and the ghost text provider.
3. Subscribes to configuration changes of `lumina.ollamaEndpoint` and `lumina.selectedModel`.
4. Registers the text document content provider for the `lumina-diff` scheme.
5. Registers the inline completion provider for every document (`{ pattern: '**' }`).
6. Registers the `lumina.nexusView` webview view with `retainContextWhenHidden: true`.
7. Registers the ten commands.
8. Runs the startup calibration if `lumina.autoCalibrateOnStartup` is on.

`deactivate()` only writes a log line. Everything pushed to `context.subscriptions` (status bar,
model manager and its timer, ghost text provider, registrations) is disposed by VS Code.
