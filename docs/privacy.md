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
