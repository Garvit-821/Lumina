import { HardwareTelemetry, ModelRecommendation } from '../types';

/** Maps scanned hardware to one of three model profiles: low, balanced or power. */
export class ModelRecommender {
  /**
   * Picks a profile from RAM and usable GPU memory. On Apple Silicon 75% of RAM counts as GPU memory;
   * elsewhere the larger of dedicated VRAM and 40% of RAM is used. Power needs about 16 GB of that or 32 GB
   * of RAM; balanced needs 12 GB of RAM or 6 GB of it. Pure function: the recommended models are only names
   * and may not be installed.
   */
  public static evaluate(telemetry: HardwareTelemetry): ModelRecommendation {
    const { totalRamGB, vramGB, isAppleSilicon, hasCuda } = telemetry;
    const effectiveVram = isAppleSilicon ? totalRamGB * 0.75 : Math.max(vramGB, totalRamGB * 0.4);

    // Power Profile: >= 24GB Unified RAM or >= 12GB Dedicated VRAM or >= 32GB RAM
    if (effectiveVram >= 16 || totalRamGB >= 32 || (isAppleSilicon && totalRamGB >= 24)) {
      return {
        tier: 'power',
        tierName: 'Power Profile (High-Throughput / Deep Reasoning)',
        recommendedModel: 'deepseek-coder-v2:latest',
        fallbackModel: 'qwen2.5-coder:14b',
        embeddingModel: 'nomic-embed-text:latest',
        contextWindow: 16384,
        reason: `Detected robust hardware (${totalRamGB}GB RAM, ~${Math.round(effectiveVram)}GB VRAM). Optimal for 14B-32B MoE code models with extensive context.`,
      };
    }

    // Balanced Profile: 8GB - 24GB RAM or 6GB - 12GB VRAM
    if (totalRamGB >= 12 || effectiveVram >= 6 || (isAppleSilicon && totalRamGB >= 8)) {
      return {
        tier: 'balanced',
        tierName: 'Balanced Profile (Speed & Precision)',
        recommendedModel: 'qwen2.5-coder:7b',
        fallbackModel: 'llama3.1:8b',
        embeddingModel: 'nomic-embed-text:latest',
        contextWindow: 8192,
        reason: `Detected balanced system capacity (${totalRamGB}GB RAM). Ideal for 7B-8B coding models with sub-second response times.`,
      };
    }

    // Low Profile: < 12GB RAM, integrated graphics
    return {
      tier: 'low',
      tierName: 'Low Profile (Ultra-Lightweight & Efficient)',
      recommendedModel: 'qwen2.5-coder:1.5b',
      fallbackModel: 'phi3:mini',
      embeddingModel: 'all-minilm:latest',
      contextWindow: 4096,
      reason: `Detected entry/budget capacity (${totalRamGB}GB RAM). Tuned for lightweight 1.5B-3.8B models to maintain zero system stutter.`,
    };
  }
}
