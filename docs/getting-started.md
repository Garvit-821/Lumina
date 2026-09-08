# Getting started

This guide takes you from a fresh machine to a working Lumina setup: Ollama running, a model pulled,
the extension installed, a first chat in the Nexus panel and a first edit with Prism. Each step
links to the page that covers it in more detail.

## Install and start Ollama

Install Ollama from [ollama.com](https://ollama.com/). The desktop app starts the server for you;
otherwise start it in a terminal and check that it answers on the default endpoint:

```bash
ollama serve
curl http://localhost:11434/api/tags
```

Lumina polls `GET /api/tags` every 15 seconds with a 3 second timeout. Until a check succeeds, the
status bar item on the right reads "Lumina: Offline". If Ollama listens on another address, set
[`lumina.ollamaEndpoint`](configuration.md#luminaollamaendpoint). In a remote window (SSH, WSL or a
dev container) the extension runs on the remote side by default, so `localhost` means that machine.
