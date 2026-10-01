# Security Policy

Lumina runs models locally and is designed so that your code never leaves your machine.
Reports that show a way around that are especially welcome.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting instead:
on the repository page go to **Security > Report a vulnerability**. Include the affected
version, what an attacker could do, and steps to reproduce.

## In scope

- Workspace content or secrets being sent anywhere other than the configured Ollama endpoint.
- Secret files (`.env`, private keys, credential files) ending up in the index or in a prompt.
- Model output that can run script or inject markup in the Nexus webview.
- Edits applied outside the workspace, or without the user accepting them.
