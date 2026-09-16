# Configuration

Lumina reads eight settings under the `lumina.*` namespace. Set them in the Settings editor (run
**Lumina: Open Settings**) or in `settings.json`. Types and defaults come from `package.json`; the
ranges come from `src/utils/config.ts`, which clamps some values before use.

## lumina.ollamaEndpoint

- Type: string
- Default: `http://localhost:11434`
- Valid values: any base URL. An empty value falls back to the default, and trailing slashes are removed.
- Read by: `OllamaClient`, for every request.

The base URL of the Ollama server. The health check, model listing, chat, generation, embeddings
and model pulls all go to this address (see [Network access](privacy.md#network-access)). Changing it
repoints the client immediately and re-lists models. Lumina does not restrict it to `localhost`: a
remote host receives your prompts and code, unencrypted unless the URL uses `https`.

## lumina.selectedModel

- Type: string
- Default: `""` (empty)
- Valid values: the name of a model installed in Ollama, such as `qwen2.5-coder:7b`. Whitespace is trimmed; the name is not validated.
- Read by: `OllamaModelManager`, which supplies the active model to chat, Prism, ghost text, the autonomous loop and the benchmark.

When empty, Lumina uses the first model returned by `GET /api/tags`, without saving it. With
`lumina.autoCalibrateOnStartup` on, the startup scan may select the recommended model instead, if it
is installed. Lumina writes this setting to your user settings when you pick a model on the Models
tab, when a pull from that tab finishes, when you click **Use <model>** after calibration, and on the
startup auto-selection. A name that is not installed makes requests fail with HTTP 404 from Ollama.

## lumina.embeddingModel

- Type: string
- Default: `nomic-embed-text`
- Valid values: an Ollama embedding model name. An empty value falls back to `nomic-embed-text`.
- Read by: `ContextEngine`, each time the workspace is indexed and each time chat or Prism retrieves context.

If the model returns no vector when indexing starts, chunks are stored without embeddings and
retrieval uses keyword search. Re-index after changing this setting. Vectors from different models
are not comparable, and a query vector of a different length scores 0 against every stored chunk,
which returns arbitrary chunks rather than falling back to keyword search. See [Embeddings](rag.md#embeddings).

## lumina.enableGhostText

- Type: boolean
- Default: `true`
- Read by: `AuraInlineCompletionProvider`, at startup and whenever the setting changes.

Turns inline ghost text completions on or off. **Lumina: Toggle Aura Ghost Text Autocomplete** flips
the value and writes it to your user settings. A value in workspace settings takes precedence over
the user value, so the toggle can appear to have no effect there. Completions also need VS Code's own
inline suggestions to be enabled (`editor.inlineSuggest.enabled`).

## lumina.ghostTextDelay

- Type: number (milliseconds)
- Default: `350`
- Valid range: 0 to 5000, clamped in code. `package.json` declares no bounds.
- Read by: `AuraInlineCompletionProvider`, on every completion request.

How long Lumina waits after a completion request before calling Ollama. If you keep typing during
that time, VS Code cancels the request and no call is made. Lower values show suggestions sooner but
send more requests. See [Ghost text and fill-in-the-middle](models.md#ghost-text-and-fill-in-the-middle).

## lumina.temperature

- Type: number
- Default: `0.2`
- Valid range: 0 to 1, declared in `package.json` and clamped in code.
- Read by: chat (`SovereignOrchestrator`) and Prism (`PrismCommandBar`), on every request.

Passed to Ollama as the `temperature` sampling option. Other features use a fixed value and ignore
this setting: ghost text, the autonomous loop and the benchmark all send `0.1`.

## lumina.autoCalibrateOnStartup

- Type: boolean
- Default: `true`
- Read by: `activate()` in `src/extension.ts`, once per activation.

When on, Lumina scans the hardware at startup and logs the tier and the recommended model to the
**Lumina Agent** output channel. If no model is active when the scan finishes, it lists installed
models and selects the recommended one if it is installed; otherwise it logs that the model is not
installed. It never downloads a model. The Nexus panel runs its own (cached) scan when it opens,
whatever this setting says.
