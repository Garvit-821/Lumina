# Getting started

This guide takes you from a fresh machine to a working Lumina setup: Ollama running, a model pulled,
the extension installed, a first chat in the Nexus panel and a first edit with Prism. Each step
links to the page that covers it in more detail.

## Requirements

- VS Code 1.80.0 or later. This is the `engines.vscode` range (`^1.80.0`) in `package.json`.
- [Ollama](https://ollama.com/) installed and running on the machine where the extension runs, or reachable over HTTP from it.
- At least one chat-capable model pulled into Ollama. Calibration suggests one for your hardware; see [Models and hardware](models.md).
- Optionally, an embedding model for semantic workspace search. The default is `nomic-embed-text`.
- No GPU is required. Machines without one get a small model recommendation.
- Node.js and npm only if you build or package the extension from source. CI uses Node 22, and `npm test` needs Node 21 or later.

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

## Pull a model

```bash
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

`qwen2.5-coder:7b` is what calibration recommends for the balanced tier. Run **Lumina: Run Hardware
Calibration** to see the recommendation for your machine. `nomic-embed-text` is the default value of
`lumina.embeddingModel`. You can also pull from the **Models** tab of the Nexus panel: type a name
and press **Pull**. A model pulled there becomes the active chat model when the download finishes,
so pull embedding models with the `ollama` CLI instead.

## Install the extension

Build a `.vsix` package from the repository and install it:

```bash
npm install
npm run package
code --install-extension lumina-ai-agent-0.1.1.vsix
```

`npm run package` runs `vsce` through `npx`, which first runs the `vscode:prepublish` script
(`npm run build`). The file name follows the `name` and `version` fields of `package.json`. You can
also install the file with **Extensions: Install from VSIX...** in VS Code. To run the extension
from source without installing it, see [Run and debug](development.md#run-and-debug). Lumina
activates once VS Code has finished starting (`onStartupFinished`).

## Your first chat

1. Click the **Lumina Agent** icon in the Activity Bar to open the **Nexus Hub** view. The pill in its header reads "Ollama" when the server is reachable and "Offline" when it is not.
2. On the **Models** tab, pick an installed model from the dropdown. Lumina saves it as `lumina.selectedModel`. If you skip this, Lumina uses the first model Ollama lists.
3. Open a source file, switch to the **Chat** tab, type a question and press Enter. Shift+Enter adds a new line; Esc or the stop button cancels the reply.
4. The open file appears as a context chip above the input, and its content goes into the prompt while the chip is highlighted. Click the chip to exclude it.
5. If you select code before sending, the selection goes into the prompt, and a code block in the reply can be offered as a diff. See [Reviewing diffs](diff-review.md).

Each code block in a reply has **Copy** and **Insert** buttons. Insert replaces the selection in the
active editor, or inserts at the cursor, without saving. The trash icon clears the conversation.
History is kept in memory: it survives hiding the panel, but not a window reload.

## Editing code with Prism

1. Select the code you want to change. With no selection, Prism works on the whole file.
2. Press Cmd+Alt+K on macOS or Ctrl+Alt+K on Windows and Linux, or run **Lumina: Open Prism Command Bar**.
3. Pick a preset (Refactor & Clean Code, Generate Unit Tests, Fix Diagnostics & Potential Bugs, Add Strict Types & Documentation, Optimize Performance) or **Custom Instruction...** and type your own.
4. A progress notification is shown while the model generates. Cancel it there if needed.
5. A diff editor opens with your file on the left and the proposal on the right. Choose **Accept All Changes** or **Reject** in the notification that follows.

Accepting replaces the file content with the proposal and saves the file. If you dismiss the
notification instead, the proposal stays unapplied and there is no command to bring it back, so run
Prism again. Details are in [Reviewing diffs](diff-review.md).

## Next steps

- Index the workspace so chat and Prism can pull in related code: **Index workspace** on the Context tab, or **Lumina: Index Workspace for Local RAG**. See [Workspace search and context](rag.md).
- Type at the end of a line to get ghost text completions, and press Tab to accept one. See [Ghost text and fill-in-the-middle](models.md#ghost-text-and-fill-in-the-middle).
- Press **Benchmark speed** on the Models tab to measure tokens per second for the active model.
- Read the safety notes of the [autonomous test and fix loop](autonomous-loop.md) before trying it on a project with a failing test.
- Review [Configuration](configuration.md) and [Privacy and data handling](privacy.md).
