/**
 * Reads a newline-delimited JSON stream (the format Ollama streams in) and yields one parsed object per line.
 * Lines split across network chunks are reassembled; blank or malformed lines are skipped.
 */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  /** Parses one line, returning undefined for blank or invalid JSON so the caller skips it. */
  const parse = (line: string): T | undefined => {
    const trimmed = line.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return undefined;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const parsed = parse(line);
        if (parsed !== undefined) yield parsed;
      }
    }

    buffer += decoder.decode();
    const last = parse(buffer);
    if (last !== undefined) yield last;
  } finally {
    reader.releaseLock();
  }
}

/** Throws a readable error for a non-OK Ollama response, including the server's error message when present. */
export async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  let detail = '';
  try {
    const text = await response.text();
    try {
      detail = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      detail = text;
    }
  } catch {
    // body unavailable
  }
  throw new Error(`${action} failed (HTTP ${response.status})${detail ? `: ${detail.trim()}` : ''}`);
}
