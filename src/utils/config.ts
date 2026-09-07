import * as vscode from 'vscode';

/** Typed access to the `lumina.*` settings, read fresh on every call so changes apply without a reload. */
export function getLuminaConfig() {
  const c = vscode.workspace.getConfiguration('lumina');
  /** Keeps a setting within [min, max] so hand-edited out-of-range values cannot reach callers. */
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    endpoint: c.get<string>('ollamaEndpoint') || 'http://localhost:11434',
    embeddingModel: c.get<string>('embeddingModel') || 'nomic-embed-text',
    temperature: clamp(c.get<number>('temperature', 0.2), 0, 1),
    maxRagChunks: clamp(Math.round(c.get<number>('maxRagChunks', 5)), 0, 20),
    ghostTextEnabled: c.get<boolean>('enableGhostText', true),
    ghostTextDelay: clamp(c.get<number>('ghostTextDelay', 350), 0, 5000),
  };
}
