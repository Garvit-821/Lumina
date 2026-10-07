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

## Embeddings

Embeddings come from Ollama, using `lumina.embeddingModel` (default `nomic-embed-text`):

1. Before embedding, Lumina sends one probe request. If it returns no vector, the run continues without embeddings and logs a warning that suggests `ollama pull <model>`.
2. Otherwise chunks are sent in batches of 16 to `POST /api/embed`, with a timeout of 15 seconds plus 2 seconds per chunk in the batch.
3. If a batch fails or returns the wrong number of vectors, each chunk in it is retried alone: `/api/embed` first, then the older `/api/embeddings` endpoint, each with a 15 second timeout.
4. A chunk that still gets no vector is stored without one. Vector search skips it, so only keyword search can find it.

Progress messages read "Embedded X/Y chunks..." as batches finish. Vectors are only computed at index
time, so index again after pulling the embedding model or changing `lumina.embeddingModel`.

## Retrieval

Chat retrieves up to `lumina.maxRagChunks` chunks (default 5, range 0 to 20) per message, using the
message text as the query. Prism retrieves up to the smaller of that value and 3, using the
instruction as the query. Nothing is retrieved until an index exists.

- Vector search: the query is embedded with the same model, and every chunk that has a vector is scored by cosine similarity. The highest scores are returned; there is no minimum score.
- Keyword search: used when the query cannot be embedded or vector search finds no chunk with a vector. The query is lower-cased and split into terms of 3 or more characters, and a chunk scores the fraction of terms it contains.

Chat prompts list each match as `--- Code Context (<path>:<start>-<end>) [Match Score: N%] ---`
followed by the chunk text. Prism adds matches as `// Context (<path>):` blocks.

## On-disk cache

The index is saved as JSON to `.lumina/vector_cache.json` in the first workspace folder, as it was
when the extension activated. Each entry holds the absolute and relative path, line range, language,
chunk text and, if available, the embedding vector.

- The cache is loaded at activation, so the index survives restarts.
- Every index run overwrites the file. Lumina never deletes it; remove the `.lumina` folder to drop the index.
- On load, entries for files that match a secret-file pattern are dropped, which also cleans caches written by older versions.
- The `.lumina` folder is excluded from indexing, but Lumina does not add it to `.gitignore`. Add `.lumina/` yourself so the cache, which contains your code, is not committed.
- With no folder open there is no cache path, and nothing is saved.

## Context chips

Chips attach whole files to chat prompts. They appear above the chat input and in the **Context
files** list on the Context tab.

- The file in the active editor is added as a chip labelled `<name> (Active)`, and replaced by a new, included chip when you switch editors. Untitled documents are not added.
- Chips start included. Click one to exclude or include it. The X on the Context tab removes it until the next editor switch.
- For each included chip, the file is read from disk, so unsaved edits are not seen. Content beyond 24,000 characters is cut off, with a note giving the full length.
- Files that match a secret-file pattern are never read; the prompt only says the file was omitted.
- Chips are used by chat only. Prism works on the selection or file it was opened on, plus retrieval.

The extension can add other files as chips (`add_file_as_chip` in the message protocol), but the
current panel has no control for it, so in practice the list holds the active file.
