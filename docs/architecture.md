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
