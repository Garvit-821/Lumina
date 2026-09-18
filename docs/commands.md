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
