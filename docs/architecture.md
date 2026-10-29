# Architecture

This page explains how the extension is put together, for people changing the code. Lumina is one
bundled extension module (`dist/extension.js`, built from `src/extension.ts`) plus a webview script
and stylesheet. All model work is done by an Ollama server over HTTP; nothing runs in-process.
