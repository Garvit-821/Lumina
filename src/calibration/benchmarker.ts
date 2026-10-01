import { BenchmarkResult } from '../types';
import { OllamaClient } from '../ollama/client';
import { LuminaLogger } from '../utils/logger';
import { OllamaTimings, tokensPerSecond } from './benchmarkMath';

/** Fixed prompt so results are comparable across models and runs. Generation is capped at 256 tokens. */
const TEST_PROMPT = 'Write a TypeScript function to recursively calculate Fibonacci numbers with memoization. Output only code.';

/** Measures how fast a local model generates text, for the status bar and the Nexus calibration view. */
export class ModelBenchmarker {
  /** Measures real throughput. Throws if the model can't be reached; never returns made-up numbers. */
  public static async runBenchmark(
    ollamaClient: OllamaClient,
    modelName: string,
    onProgress?: (status: string) => void
  ): Promise<BenchmarkResult> {
    onProgress?.(`Loading ${modelName}…`);
    LuminaLogger.getInstance().log(`Starting benchmark for ${modelName}`);

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let chars = 0;
    let timings: OllamaTimings = {};

    const stream = ollamaClient.generateStream(modelName, TEST_PROMPT, { temperature: 0.1, num_predict: 256 });
    for await (const chunk of stream) {
      if (chunk.response) {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now();
          onProgress?.('Measuring generation speed…');
        }
        chars += chunk.response.length;
      }
      if (chunk.done) timings = chunk;
    }

    if (firstTokenTime === null) {
      throw new Error(`${modelName} produced no output.`);
    }

    const endTime = Date.now();
    const result: BenchmarkResult = {
      model: modelName,
      promptTokens: timings.prompt_eval_count ?? Math.ceil(TEST_PROMPT.length / 4),
      completionTokens: timings.eval_count ?? Math.ceil(chars / 4),
      totalDurationSec: Math.round((endTime - startTime) / 10) / 100,
      timeToFirstTokenMs: firstTokenTime - startTime,
      tokensPerSecond: tokensPerSecond(timings, { chars, generationMs: endTime - firstTokenTime }),
      timestamp: Date.now(),
    };

    LuminaLogger.getInstance().log(`Benchmark completed for ${modelName}`, result as unknown as Record<string, unknown>);
    return result;
  }
}
