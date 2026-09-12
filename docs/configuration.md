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
