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

## Ollama layer

`OllamaClient` (`src/ollama/client.ts`) wraps the Ollama HTTP API with the global `fetch`:

| Method | Request | Timeout |
|---|---|---|
| `isHealthy` | `GET /api/tags` | 3 s |
| `listModels` | `GET /api/tags` | 5 s |
| `listRunning` | `GET /api/ps` | 4 s |
| `generate` | `POST /api/generate`, `stream: false`, optional `suffix` | caller's signal, else 60 s |
| `generateStream` | `POST /api/generate`, `stream: true` | caller's signal only |
| `chatStream` | `POST /api/chat`, `stream: true` | caller's signal only |
| `getEmbeddings` | `POST /api/embed`, then `POST /api/embeddings` | 15 s each |
| `getEmbeddingsBatch` | `POST /api/embed` with an array input | 15 s plus 2 s per input |
| `pullModel` | `POST /api/pull`, `stream: true` | none |

Streams are parsed by `readNdjson` (`ndjson.ts`), which reassembles lines split across network
chunks and skips malformed lines. `assertOk` turns a non-2xx response into an error such as
`Ollama chat failed (HTTP 404): ...` that carries Ollama's own message. `OllamaModelManager` keeps
the active model, refreshes the model and running lists every 15 seconds, and fires `onStatusChange`
only when the online state, active model, model list or running list changed.

## Chat orchestrator

`SovereignOrchestrator.handleUserMessage` runs one chat turn:

1. Appends the user message to the in-memory history.
2. If no model is active, replies with an explanatory message and stops. Otherwise it appends an empty assistant message that the webview shows as typing.
3. Records the active editor and the selection offsets as the possible diff target. Untitled documents are skipped.
4. Builds the system prompt with `PromptBuilder`: workspace name, active file path, language and line count, the selected code, the content of included context chips, and up to `lumina.maxRagChunks` retrieved chunks with match scores.
5. Sends the system prompt, the last 8 earlier non-empty messages and the new message to `/api/chat` with `lumina.temperature`, forwarding each streamed delta to the webview.
6. When the stream ends, `buildDiffSuggestion` may turn the reply's first code block into a proposal; see [When chat does not offer a diff](diff-review.md#when-chat-does-not-offer-a-diff).

Stopping aborts the request through an `AbortController` and appends "_Stopped._" to the partial
reply. Other errors are appended as "**Error:** ..." and logged. Clearing the chat aborts the current
request and empties the history. History is never written to disk.

## Context engine

`ContextEngine` (`src/rag/contextEngine.ts`) owns the vector store and the context chips.
`indexWorkspace` runs `WorkspaceCrawler.scanWorkspace`, `CodeChunker.chunkFile` for each file and
`getEmbeddingsBatch` in batches of 16, then replaces the store contents and saves them to disk.
`retrieveRelevantContext` embeds the query and ranks chunks by cosine similarity, or falls back to
keyword matching. `getActiveChipsContent` reads each included chip's file from disk, caps it at
24,000 characters and skips secret files. The filters live in `filePolicy.ts` and are shared by the
crawler, the chips and the cache loader. The `onChipsUpdated` and `onStatusUpdated` events feed the
webview. Details and limits are in [Workspace search and context](rag.md).
