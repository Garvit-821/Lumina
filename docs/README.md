# Lumina documentation

Lumina is a VS Code extension that runs chat, in-place code edits, inline completions, workspace
search and a test-and-fix loop against an Ollama server, by default the one on your own machine.
These pages describe what the extension does today, based on its source code. Start with the guides
if you are setting it up, and use the reference pages when you need exact settings, commands or limits.

## Guides

- [Getting started](getting-started.md): install Ollama and the extension, pull a model, and run your first chat and Prism edit.
- [Workspace search and context](rag.md): how indexing, chunking, embeddings and context chips feed workspace code into prompts.
- [Reviewing diffs](diff-review.md): where proposed edits come from and how to review, apply or reject them.
- [Autonomous test and fix loop](autonomous-loop.md): what the loop runs, what it changes on disk, and how to stop it.
- [Models and hardware](models.md): hardware tiers, recommended models, benchmarking, ghost text and the embedding model.

## Reference

- [Configuration](configuration.md): every `lumina.*` setting with its type, default, valid range and when a change applies.
- [Commands](commands.md): every contributed command, its preconditions, and the keyboard shortcuts.
- [Privacy and data handling](privacy.md): what is sent to Ollama, what is written to disk, and how secret files are handled.
- [Troubleshooting](troubleshooting.md): common problems, what causes them in the code, and how to fix them.
