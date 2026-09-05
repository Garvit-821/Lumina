/** Final-chunk timing fields Ollama reports (durations are in nanoseconds). */
export interface OllamaTimings {
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
}

/**
 * Generation throughput in tokens/sec, rounded to one decimal.
 * Prefers Ollama's own counters (exact, excludes model load and prompt processing);
 * falls back to an estimate from wall-clock time and streamed characters.
 */
export function tokensPerSecond(timings: OllamaTimings, fallback: { chars: number; generationMs: number }): number {
  if (timings.eval_count && timings.eval_duration && timings.eval_duration > 0) {
    return round1(timings.eval_count / (timings.eval_duration / 1e9));
  }
  if (fallback.generationMs <= 0 || fallback.chars <= 0) return 0;
  return round1(Math.ceil(fallback.chars / 4) / (fallback.generationMs / 1000));
}

/** Ollama model names: "llama3" and "llama3:latest" are the same model. */
export function sameModel(a: string, b: string): boolean {
  const norm = (n: string) => (n.includes(':') ? n : `${n}:latest`).toLowerCase();
  return norm(a) === norm(b);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
