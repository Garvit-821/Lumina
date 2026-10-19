# Privacy and data handling

Lumina sends everything it needs for inference to the Ollama server at `lumina.ollamaEndpoint`, and
to nothing else. With the default endpoint, that server runs on your machine. This page lists what
each feature sends, what Lumina writes to disk, and how it treats files that may hold secrets.

## What stays on your machine

With the default endpoint, `http://localhost:11434`, prompts, code and embeddings never leave your
machine. Lumina has no other network client: no cloud API, no analytics, no crash reporting and no
update check of its own. In addition:

- Chat history and diff proposals exist only in memory and are gone after a window reload.
- Hardware scan results are kept in memory and written to the **Lumina Agent** output channel.
- The workspace index is stored inside your workspace (see [Data written to disk](#data-written-to-disk)).
- Log lines do not contain prompts or model replies.

If you point `lumina.ollamaEndpoint` at another host, everything in the next section goes to that host.

## What is sent to Ollama

| Feature | Sent to Ollama |
|---|---|
| Chat | Workspace name; full path, language and line count of the active file; the selected code; included chip files (up to 24,000 characters each); retrieved chunks; the last 8 earlier messages; your message |
| Prism | Your instruction; up to 3 retrieved chunks; the full file path; the selected code or the whole file |
| Ghost text | Up to 60 lines before and 20 lines after the cursor, in any file you type in |
| Autonomous loop | Your command, the last 2,000 characters of its output, and the full content of the chosen file |
| Indexing | The text of every indexed chunk, to compute embeddings |
| Retrieval | Your chat message or Prism instruction, to compute its embedding |
| Benchmark | A fixed test prompt |
| Model list and pull | Model names only |

The health check every 15 seconds and the model listing send no workspace data.

## Secrets

Lumina recognises likely secret files by name, using the patterns in `src/rag/filePolicy.ts`
(matched case-insensitively):

- `.env` and `.env.*`, such as `.env.local`;
- names ending in `.pem`, `.key`, `.p12`, `.pfx`, `.keystore`, `.jks`, `.crt`, `.cer` or `.der`;
- `id_rsa`, `id_dsa`, `id_ecdsa` and `id_ed25519`, with or without `.pub`;
- `.npmrc`, `.pypirc`, `.netrc` and `.htpasswd`;
- JSON files named `credentials`, `secret`, `secrets`, `service-account` or `service_account`, optionally with more dot-separated parts before `.json`;
- `secret` or `secrets` with the extension `.yaml`, `.yml` or `.toml`.

These files are never indexed, never read as context chips, and dropped from the cache when it loads.
The check uses file names only. It does not apply to code you select for chat, to Prism, to ghost
text or to the autonomous loop, and it does not find secrets inside ordinary files. Turn ghost text
off before editing a secret file if you do not want its contents sent to Ollama.
