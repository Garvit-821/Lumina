# Contributing to Lumina

Thanks for taking the time to help. This page covers how to get a working checkout,
what a good change looks like and how to send it.

## Getting set up

You need Node.js 22 or newer, VS Code 1.80 or newer and, to try the extension end to end,
a local [Ollama](https://ollama.com) server.

```bash
npm ci
npm run build
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with Lumina loaded.
`npm run dev` rebuilds the bundle on every save.
