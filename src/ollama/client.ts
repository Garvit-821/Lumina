import { OllamaModelInfo, OllamaRunningProcess } from '../types';
import { LuminaLogger } from '../utils/logger';
import { readNdjson, assertOk } from './ndjson';

/**
 * Sampling options sent as Ollama's `options` object on generate and chat requests.
 * Fields left undefined are dropped from the JSON, so the model's own defaults apply.
 */
export interface OllamaGenerateOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
  stop?: string[];
}

/**
 * One NDJSON line from a streaming /api/generate or /api/chat response. Text arrives in pieces:
 * generate puts it in `response`, chat in `message.content`, and callers concatenate across chunks.
 * The last chunk has `done: true` and carries the timing and token statistics.
 */
export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  /** Whole-request time in nanoseconds, like the other durations here. Only set on the final chunk. */
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * One progress line from /api/pull. `status` names the phase (e.g. "pulling manifest", "success");
 * `total` and `completed` are byte counts for the layer named by `digest` and are absent between downloads.
 */
export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

/**
 * Thin HTTP client for a local Ollama server (default http://localhost:11434), built on global fetch.
 * Health, listing and embedding calls swallow failures and return false or empty results; generate,
 * chat and pull throw on a non-OK response so callers can show the server's error message.
 */
export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Points the client at another server, e.g. after `lumina.ollamaEndpoint` changes in Settings.
   * Trailing slashes are stripped. Requests already in flight keep the old URL.
   */
  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /** The current server root, without a trailing slash. */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Probes GET /api/tags with a 3 second timeout. True only for a 2xx response; network errors,
   * timeouts and error statuses all yield false rather than throwing.
   */
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

  /**
   * Lists the models installed on the server (GET /api/tags, 5 second timeout).
   * Never throws: on any failure it logs a warning and returns an empty array.
   */
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

  /**
   * Lists the models currently loaded in memory (GET /api/ps, 4 second timeout).
   * Returns an empty array on any failure without logging, so it is safe to call from polling.
   */
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

  /**
   * Non-streaming completion. Pass `suffix` for fill-in-the-middle: Ollama then applies the model's own FIM
   * template, which is correct for every FIM-capable model (Qwen, DeepSeek, CodeLlama, StarCoder…).
   */
  public async generate(
    model: string,
    prompt: string,
    options?: OllamaGenerateOptions,
    signal?: AbortSignal,
    suffix?: string
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        ...(suffix !== undefined ? { suffix } : {}),
        stream: false,
        options,
      }),
      signal: signal || AbortSignal.timeout(60000),
    });

    await assertOk(response, 'Ollama generate');

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

    await assertOk(response, 'Ollama generate');
    if (!response.body) {
      throw new Error('No response body from Ollama stream');
    }
    yield* readNdjson<OllamaStreamChunk>(response.body);
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

    await assertOk(response, 'Ollama chat');
    if (!response.body) {
      throw new Error('No response body from Ollama chat stream');
    }
    yield* readNdjson<OllamaStreamChunk>(response.body);
  }

  public async getEmbeddings(model: string, prompt: string): Promise<number[]> {
    // Try modern /api/embed first (Ollama v0.2+)
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: prompt,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = (await response.json()) as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings.length > 0) {
          return data.embeddings[0];
        }
      }
    } catch {
      // Fallback to legacy endpoint
    }

    // Fallback to /api/embeddings (Ollama v0.1.x)
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

      if (response.ok) {
        const data = (await response.json()) as { embedding?: number[] };
        return data.embedding || [];
      }
    } catch (err) {
      LuminaLogger.getInstance().warn(`Ollama embeddings error: ${err}`);
    }

    return [];
  }

  /**
   * Embeds many inputs in one request via /api/embed (Ollama 0.2+).
   * Falls back to one request per input on older servers. Failed inputs come back as empty arrays.
   */
  public async getEmbeddingsBatch(model: string, inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs }),
        signal: AbortSignal.timeout(15000 + inputs.length * 2000),
      });
      if (response.ok) {
        const data = (await response.json()) as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings.length === inputs.length) {
          return data.embeddings;
        }
      }
    } catch {
      // Fall through to per-input requests
    }

    const results: number[][] = [];
    for (const input of inputs) {
      results.push(await this.getEmbeddings(model, input));
    }
    return results;
  }

  public async *pullModel(
    model: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<OllamaPullProgress, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        name: model,
        stream: true,
      }),
      signal: abortSignal,
    });

    await assertOk(response, `Pulling ${model}`);
    if (!response.body) return;
    yield* readNdjson<OllamaPullProgress>(response.body);
  }
}
