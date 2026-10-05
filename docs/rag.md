# Workspace search and context

Lumina adds workspace code to prompts in two ways: retrieval from an index of the workspace, and
context chips that attach whole files to chat. This page explains how the index is built and
searched, where it is stored, and how chips behave. The code is in `src/rag/`.

## What gets indexed

Indexing runs only when you ask for it, with **Index workspace** on the Context tab or the command
**Lumina: Index Workspace for Local RAG**. Files are not re-indexed when they change.

- Every folder of a multi-root workspace is crawled recursively.
- A file is included if its name passes the filters in [Files that are never indexed](#files-that-are-never-indexed) and its size is above 0 bytes and at most 250 KB (250 x 1024 bytes).
- Any extension that is not on the binary list qualifies, not only source code: Markdown, JSON, YAML and plain text files are indexed as well.
- The language tag comes from the file extension (for example `.ts` is `typescript` and `.py` is `python`); unknown extensions are tagged `plaintext`.
- Files that cannot be read are skipped without a message.

The Context tab shows the number of chunks and files in the current index. Each run rebuilds the
whole index and replaces the previous one.

## Files that are never indexed

Directories with these names are skipped at any depth: `node_modules`, `.git`, `.svn`, `.hg`, `dist`,
`build`, `out`, `coverage`, `.next`, `.nuxt`, `.lumina`, `.vscode`, `.idea`, `__pycache__`, `.venv`,
`venv`, `target`, `bin`, `obj`, `.turbo`, `.cache`.

Files are skipped when:

- the extension is one of `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.webp`, `.pdf`, `.zip`, `.tar`, `.gz`, `.7z`, `.rar`, `.exe`, `.dll`, `.so`, `.dylib`, `.wasm`, `.mp3`, `.mp4`, `.mov`, `.avi`, `.wav`, `.ttf`, `.woff`, `.woff2`, `.eot`, `.lock`, `.bin`, `.iso`, `.dmg`, `.vsix`, `.map`;
- the name is `package-lock.json`, `pnpm-lock.yaml` or `npm-shrinkwrap.json`, or ends in `.min.js` or `.min.css`;
- the name matches a secret-file pattern (see [Secrets](privacy.md#secrets)).

`.gitignore` is not read. Files that Git ignores are indexed unless one of the rules above excludes them.

## Chunking

`CodeChunker` (`src/rag/chunker.ts`) splits each file by lines:

- A file of 40 lines or fewer becomes one chunk that holds the file text unchanged.
- Longer files are cut into windows of 40 lines that overlap by 10, so a new chunk starts every 30 lines. The last window ends at the last line of the file.
- Each windowed chunk begins with a header line, `// File: <relative path> (Lines <start>-<end>)`, which is embedded together with the code.
- Chunk IDs have the form `<relative path>:<start>-<end>`, with 1-based line numbers.
- Each chunk stores a token estimate of one token per four characters; no limit uses it.

Lines are counted by splitting on `\n`, so a trailing newline adds an empty last line to the count.
