# Commands

Lumina contributes ten commands and one keyboard shortcut. Every command title starts with "Lumina:"
and also declares the category "Lumina", so the Command Palette shows the prefix twice, for example
"Lumina: Lumina: Open Prism Command Bar". Type "Lumina" in the palette to list them all.

## Lumina: Open Prism Command Bar

- Command ID: `lumina.prism`
- Shortcut: Cmd+Alt+K on macOS, Ctrl+Alt+K on Windows and Linux, while an editor has text focus.
- Preconditions: an open text editor, an active model, and Ollama reachable.

Opens a quick pick with **Custom Instruction...** and five presets, applied to the selection or to
the whole file when nothing is selected. The reply's first fenced code block (or the whole reply if
it has none) replaces the target, and the result opens in a diff view with **Accept All Changes**
and **Reject** in a notification. Cancel generation from the progress notification. The lightning
button in the Nexus header runs the same command. Without an editor it warns "Lumina Prism: Open a
file in the editor to use Prism."; without a model it shows "Lumina: No active Ollama model
selected. Please select a model in Nexus."

## Lumina: Run Hardware Calibration

- Command ID: `lumina.calibrate`
- Preconditions: none. Ollama does not need to be running.

Rescans CPU, memory and GPU, bypassing the cached result, picks a tier, and shows a notification with
the GPU and VRAM, total RAM and the recommended model. **Use <model>** makes that model active and
saves it to `lumina.selectedModel` without checking that it is installed, so pull it first or chat
will fail with a model-not-found error. **Rescan** on the Models tab runs the same scan. See
[Hardware tiers](models.md#hardware-tiers).

## Lumina: Benchmark Active Model (TPS)

- Command ID: `lumina.benchmark`
- Preconditions: an active model, and Ollama reachable.

Streams a fixed prompt to the active model and reports throughput in a notification of the form
"Lumina: <model> runs at <N> tokens/sec (first token in <M> ms)." The tokens-per-second figure is
also added to the status bar item. Without an active model it warns "Lumina: No active model
selected to benchmark."; on failure it shows "Lumina: Benchmark failed." followed by the reason.
See [Benchmarking a model](models.md#benchmarking-a-model).

## Lumina: Index Workspace for Local RAG

- Command ID: `lumina.indexWorkspace`
- Preconditions: an open folder or workspace; without one, the result is 0 chunks. An embedding model is optional.

Crawls all workspace folders, splits files into chunks, embeds them in batches of 16 if the embedding
model responds, and saves the index to `.lumina/vector_cache.json` in the first workspace folder.
Progress appears in a notification, and the result reads "Lumina: Indexed N code chunks in
workspace." Starting it again while a run is in progress returns the current chunk count instead.
**Index workspace** on the Context tab does the same. See [Workspace search and context](rag.md).

## Lumina: Toggle Aura Ghost Text Autocomplete

- Command ID: `lumina.toggleGhostText`
- Preconditions: none.

Turns ghost text on or off, writes the new value of `lumina.enableGhostText` to your user settings,
and shows "Lumina: The Aura (Ghost Text) is now ENABLED." or "... is now DISABLED.". A value of the
setting in workspace settings takes precedence over the one this command writes.

## Lumina: Start Autonomous Test & Fix Loop

- Command ID: `lumina.runAutonomousLoop`
- Preconditions: an open folder, an active model, and a command that exits non-zero when tests fail.

Asks for a command, prefilled with `npm test`; Escape or an empty value cancels. The loop runs the
command in the first workspace folder, asks the model for a corrected file when it fails, applies and
saves that file without asking, and repeats up to three times. Steps appear only on the Nexus
**Loop** tab, and a run started from this command leaves that tab's Stop button disabled. Read
[Autonomous test and fix loop](autonomous-loop.md) before using it.

## Lumina: Accept Diff Proposal

- Command ID: `lumina.acceptDiff`
- Argument: the ID of a registered proposal.

Applies the whole proposal and saves the file, like **Accept all** in the chat panel. The command
does nothing without an ID, so running it from the Command Palette has no effect, and nothing in
Lumina's own UI calls it. It only acts when invoked with an argument, for example through
`vscode.commands.executeCommand('lumina.acceptDiff', id)`. See
[Reviewing and applying](diff-review.md#reviewing-and-applying).
