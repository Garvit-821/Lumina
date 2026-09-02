import { OllamaModelInfo, OllamaRunningProcess } from '../types';
import { LuminaLogger } from '../utils/logger';

export interface OllamaGenerateOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  stop?: string[];
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }
      const data = (await response.json()) as { models?: OllamaModelInfo[] };
      return data.models || [];
    } catch (err) {
      LuminaLogger.getInstance().warn(`Failed to list Ollama models: ${err}`);
      return [];
    }
  }

  public async listRunning(): Promise<OllamaRunningProcess[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ps`, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as { models?: OllamaRunningProcess[] };
      return data.models || [];
    } catch {
      return [];
    }
  }

  public async generate(model: string, prompt: string, options?: OllamaGenerateOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama generate failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  public async *generateStream(
    model: string,
    prompt: string,
    options?: OllamaGenerateOptions,
    abortSignal?: AbortSignal
  ): AsyncGenerator<OllamaStreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama stream error (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaStreamChunk;
            yield parsed;
          } catch {
            // Partial JSON chunk, skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async *chatStream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: OllamaGenerateOptions,
    abortSignal?: AbortSignal
  ): AsyncGenerator<OllamaStreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama chat stream error (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama chat stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaStreamChunk;
            yield parsed;
          } catch {
            // Ignored
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async getEmbeddings(model: string, prompt: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate embeddings: HTTP ${response.status}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      return data.embedding || [];
    } catch (err) {
      LuminaLogger.getInstance().warn(`Ollama embeddings error: ${err}`);
      return [];
    }
  }

  public async *pullModel(
    model: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<OllamaPullProgress, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: model,
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to pull model ${model}: ${text}`);
    }

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaPullProgress;
            yield parsed;
          } catch {
            // Ignored
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
