# Troubleshooting

Each section starts from a symptom you can see, explains what in Lumina causes it, and gives a fix.
Most problems also leave a line in the **Lumina Agent** output channel, so look at
[Where to find logs](#where-to-find-logs) first when the cause is not obvious.

## Lumina shows Offline

**Symptom:** the status bar item reads "Lumina: Offline" on a warning background, the Nexus header
pill says "Offline", and no ghost text appears.

**Cause:** the last health check, `GET <endpoint>/api/tags` with a 3 second timeout, failed. Checks
run every 15 seconds, so the display can lag by that long.

**Fix:**

- Start Ollama (`ollama serve` or the desktop app) and confirm it answers: `curl http://localhost:11434/api/tags`.
- Make sure `lumina.ollamaEndpoint` matches the address and port Ollama listens on. Changing the setting triggers a new check at once.
- In a remote window (SSH, WSL, container), Lumina runs on the remote side by default. Run Ollama there, or point the endpoint at a host it can reach.
- Use a current VS Code: Lumina relies on the `fetch` API built into the extension host.

Chat does not check the online state. It sends the request anyway and shows the network error in the
reply, for example "**Error:** fetch failed".

## Model not found or no model selected

**Symptom:** a chat reply ends with "**Error:** Ollama chat failed (HTTP 404): ..." and Ollama's
model-not-found message, Prism shows a similar error, or chat answers "No Active Model Selected".

**Cause:** `lumina.selectedModel` names a model that is not installed, or no model is active at all.
Lumina does not validate the name: **Use <model>** after calibration, a typo in settings, or a model
removed with `ollama rm` all leave a name that Ollama rejects.

**Fix:** run `ollama list` to see what is installed, then pick a model in the Models tab dropdown, or
pull the missing one with `ollama pull <name>`. With no models installed, the dropdown reads "No local
models — pull one below".

## No ghost text appears

**Symptom:** typing in an editor never shows gray inline suggestions.

**Cause:** Lumina only asks for a completion when all of these hold:

- `lumina.enableGhostText` is on, and so is VS Code's `editor.inlineSuggest.enabled`;
- the last health check saw Ollama online, and a model is active;
- the document is a file on disk or an untitled file, not an output panel or a virtual document;
- the cursor is at the end of its line, with some non-blank text in the 60 lines before it;
- you paused typing for `lumina.ghostTextDelay` ms (default 350), and the model returned some text.

**Fix:** check the conditions above, then look in the output channel for "Ghost text skipped:" and
the error from Ollama. If the toggle command seems to do nothing, look for a `lumina.enableGhostText`
value in workspace settings, which overrides the user setting the command writes. A large model may
answer too slowly to be useful; see [Ghost text and fill-in-the-middle](models.md#ghost-text-and-fill-in-the-middle).

## Search is keyword-only

**Symptom:** after indexing, the output channel shows `Embedding model "nomic-embed-text" is not
available in Ollama; using keyword search only.`, and answers pick up unrelated workspace code or none.

**Cause:** the probe request to the embedding model returned no vector, usually because the model is
not pulled, so the chunks were stored without embeddings. Retrieval then matches the words of 3 or
more characters in your message against the chunk text.

**Fix:** pull the model with `ollama pull nomic-embed-text` (or the model set in
`lumina.embeddingModel`), then run **Index workspace** again. Pull it in a terminal rather than on the
Models tab, because a model pulled there becomes the active chat model. Re-index after any change to
`lumina.embeddingModel` too.

## Chat does not offer a diff

**Symptom:** a reply contains code, but no proposal box with **Accept all**, **Review diff** and
**Reject** appears under it.

**Cause:** chat only creates a proposal when it can place the code safely: an editor showing a file
that is not untitled was active when you sent the message, the reply's first code block has at least
10 characters, and either you had code selected or the block looks like a complete version of the file.

**Fix:** select the code to replace before sending, or ask for the complete file. Prism always
produces a diff for targeted edits, and **Insert** on the code block puts it at the cursor without a
diff. The exact rules are in [When chat does not offer a diff](diff-review.md#when-chat-does-not-offer-a-diff).

## File changed since the proposal

**Symptom:** a modal warning says "<file> has changed since Lumina proposed this edit. Applying it
will overwrite your newer changes."

**Cause:** the document, including unsaved edits, no longer matches the text the proposal was built
from. Accepting writes the complete proposed file, so the newer edits would be lost.

**Fix:** choose **Apply anyway** only if you want to discard the newer edits. Otherwise cancel, which
leaves the file and the proposal untouched, and ask Prism or chat again so the proposal is based on the
current text. During an autonomous loop run, do not edit the file being fixed.

## Benchmark fails

**Symptom:** "Lumina: Benchmark failed." followed by a reason, "Benchmark error: ..." on the Models
tab, or a warning that no model is selected.

**Cause:** one of the following:

- no model is active ("Lumina: No active model selected to benchmark." or "No model available to benchmark.");
- Ollama is offline or the endpoint is wrong, which gives a network error such as `fetch failed`;
- the model is not installed (`Ollama generate failed (HTTP 404): ...`) or cannot generate text, such as an embedding model that became active after a pull on the Models tab;
- the model streamed no text ("<model> produced no output.").

**Fix:** start Ollama, select an installed chat model on the Models tab and run the benchmark again.
The first run includes loading the model, which can take a while for large models; the benchmark
has no timeout.

## Autonomous loop stops early

**Symptom:** the Loop tab shows a failed step or a warning toast before three iterations have run.

**Cause and fix**, by message:

- "No workspace open.": open a folder. The loop runs in the first workspace folder.
- "Could not synthesize automated fix. Stopping loop." with "Agent was unable to produce an automatic patch.": no model is active; no file named in the output exists in the workspace and no file is open; the model request failed ("Diagnosis error:" in the output channel); or the reply was shorter than 20 characters. Select a model, open the file you expect to be fixed, or use a command whose output names the failing file.
- "Loop stopped.": Stop was pressed.
- "Reached maximum iterations (3) without all tests passing.": the normal end after three failed iterations. The last patch was applied but not tested.

If nothing happens at all, a run may already be in progress; a new start is ignored until it ends.
See [Stopping a run](autonomous-loop.md#stopping-a-run).

## The Prism shortcut does nothing

**Symptom:** pressing the shortcut does not open the Prism quick pick.

**Cause:** the shortcut is Cmd+Alt+K on macOS and Ctrl+Alt+K on Windows and Linux, not Cmd+K or
Ctrl+K, and it only fires while a text editor has focus (`editorTextFocus`). It does nothing from the
Nexus panel, the terminal or the Explorer. Another extension, or a keyboard layout where Ctrl+Alt
acts as AltGr, can also claim the combination.

**Fix:** click into the editor and try again, or run **Lumina: Open Prism Command Bar** from the
Command Palette or the lightning button in the Nexus header. To use another key, open **Preferences:
Open Keyboard Shortcuts** and search for `lumina.prism`. If Prism opens but warns "Open a file in the
editor to use Prism.", open a file in an editor first.

## Where to find logs

Open **View > Output** and choose **Lumina Agent** in the dropdown. Each line has a UTC time, a level
and a message, with optional JSON context:

```text
[HH:MM:SS] [WARN] Ghost text skipped: <error>
```

Useful lines to look for: "Startup telemetry calibrated", "Recommended model ... is not installed",
"Embedding model ... is not available", "Failed to list Ollama models", "Orchestrator error:",
"Prism generation error:", "Diagnosis error:" and "Failed to persist vector cache". The panel never
opens by itself. For problems inside the Nexus panel, run **Developer: Open Webview Developer Tools**
to see its console.
