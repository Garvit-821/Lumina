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

## Diff pipeline

1. `DiffEngine.createSuggestion` takes a file path, the original text and the proposed full text, computes line hunks, and returns a `DiffSuggestion` with status `pending`.
2. `PatchManager` keeps suggestions in a static in-memory map. `acceptAll` replaces the whole document with the proposed text and saves it; `acceptHunk` applies one hunk and shifts the start lines of later hunks; `reject` only changes the status.
3. Before applying a pending suggestion, `PatchManager` compares the document with the snapshot the proposal was built from, and asks for confirmation if they differ.
4. `LuminaDiffProvider` serves the proposed text as a read-only virtual document under the `lumina-diff` scheme and opens it next to the real file with `vscode.diff`. It keeps its own map of suggestions, filled when a comparison view opens.

Chat, Prism and the autonomous loop all use this pipeline. Proposals do not survive a window
reload. See [Reviewing diffs](diff-review.md).

## Prism

`PrismCommandBar.open` (`src/prism/floatingCommandBar.ts`) shows a quick pick with a custom
instruction and five presets; a preset's description text becomes the instruction. It snapshots the
document text and the selection offsets before calling the model, so edits made during generation
show up later as a stale file. The prompt holds up to `min(3, lumina.maxRagChunks)` retrieved chunks,
the file name, the scope, the instruction and the selected code or whole file, and it is streamed from
`/api/generate` with `lumina.temperature`. `extractCodeReply` takes the first code block, or the whole
reply, which is spliced into the snapshot and registered as a suggestion before the comparison view
opens. Cancelling the progress notification aborts the request.

## Aura ghost text

`AuraInlineCompletionProvider` (`src/aura/inlineCompletion.ts`) answers VS Code's inline completion
requests for `file` and `untitled` documents. It returns nothing unless ghost text is enabled, the
last health check saw Ollama online, a model is active and the cursor is at the end of its line. It
waits `lumina.ghostTextDelay` ms, then sends up to 60 lines before the cursor as the prompt and up to
20 lines after it as `suffix`, with `temperature: 0.1`, `num_predict: 64` and stop sequences for three
newlines and a code fence. A model that rejects `suffix` is remembered for the session and gets a
plain continuation prompt instead. See [Ghost text and fill-in-the-middle](models.md#ghost-text-and-fill-in-the-middle).

## Nexus webview and message protocol

`NexusViewProvider` renders the **Nexus Hub** view. Its HTML is an inline template in
`nexusViewProvider.ts`; the script and stylesheet load from `dist/nexus/media/`, which the build
copies from `src/nexus/media/`. The Content Security Policy allows only the nonce-tagged script,
styles from the extension, and images from the extension, `data:` and `https:`. The view has four
tabs (Chat, Context, Models, Loop) and keeps only the last open tab in its webview state.

Messages are plain objects with a `type` field, typed as `WebviewMessage` and `ExtensionMessage` in
`src/types.ts`. 200 ms after the view resolves, the provider sends the chat history, model list,
context chips, index status and calibration data. After that, events from the model manager, context
engine, orchestrator and loop controller are forwarded as they happen. The markdown renderer in
`nexus.js` escapes all model output before applying a small set of formatting rules, so replies
cannot inject HTML into the panel.

## Message reference

| Direction | Types | Purpose |
|---|---|---|
| to extension | `chat_send`, `chat_stop`, `chat_clear` | Send a message, abort the reply, clear history |
| to extension | `request_calibration`, `request_benchmark` | Rescan hardware, benchmark a model |
| to extension | `request_models`, `select_model`, `pull_model` | Refresh, choose or download models |
| to extension | `toggle_context_chip`, `remove_context_chip`, `add_file_as_chip` | Manage context chips |
| to extension | `index_workspace` | Build the index |
| to extension | `accept_diff` (optional `hunkIndex`), `reject_diff`, `open_diff_view` | Act on a proposal |
| to extension | `start_autonomous_loop`, `stop_autonomous_loop` | Control the loop |
| to extension | `open_settings`, `open_prism`, `apply_to_editor` | Settings, Prism, insert code |
| to webview | `chat_message`, `chat_history`, `chat_stream_chunk`, `chat_stream_end` | Chat rendering |
| to webview | `models_list`, `pull_progress` | Models, online state, pull progress |
| to webview | `calibration_data`, `benchmark_progress`, `benchmark_result` | Hardware and benchmark |
| to webview | `context_chips_updated`, `rag_status` | Chips and index counts |
| to webview | `diff_updated`, `autonomous_step`, `autonomous_finished`, `toast` | Proposal state, loop, notices |

The current webview never sends `request_models`, `add_file_as_chip`, or `accept_diff` with a
`hunkIndex`, and it does not display the `running` list in `models_list`; the extension side handles
all of them. The optional `contextChipIds` field of `chat_send` is ignored by the extension.

## Calibration

- `CalibrationTelemetry.scanSystem` reads the OS, CPU model, core count and memory from Node's `os` module. On Apple Silicon it assumes 75% of RAM is usable as VRAM; Intel Macs run `system_profiler SPDisplaysDataType`; other systems run `nvidia-smi`, and Windows falls back to `wmic` for the GPU name. Each external command has a 3 second timeout. The result is cached until a forced rescan.
- `ModelRecommender.evaluate` maps a scan to the low, balanced or power tier and a recommended model.
- `ModelBenchmarker.runBenchmark` streams a fixed prompt and computes throughput with `tokensPerSecond` from `benchmarkMath.ts`. It throws instead of reporting a number when the model streams no text.
- `sameModel` treats `name` and `name:latest` as the same model when the startup path matches the recommendation against installed models.

Both `activate()` and `NexusViewProvider` call these. Tiers and thresholds are listed in
[Models and hardware](models.md).
