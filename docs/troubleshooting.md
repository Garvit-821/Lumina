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
