export type ProfileTier = 'low' | 'balanced' | 'power';

export interface HardwareTelemetry {
  osPlatform: string;
  osRelease: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpuName: string;
  vramGB: number;
  isAppleSilicon: boolean;
  hasCuda: boolean;
}

export interface ModelRecommendation {
  recommendedModel: string;
  fallbackModel: string;
  embeddingModel: string;
  tier: ProfileTier;
  tierName: string;
  reason: string;
  contextWindow: number;
}

export interface BenchmarkResult {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalDurationSec: number;
  timeToFirstTokenMs: number;
  tokensPerSecond: number;
  memoryUsedMB?: number;
  timestamp: number;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaRunningProcess {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at?: string;
  size_vram?: number;
}

export interface ContextChip {
  id: string;
  label: string;
  filePath: string;
  relativePath: string;
  type: 'file' | 'folder' | 'selection' | 'symbol';
  active: boolean;
  lineCount?: number;
  content?: string;
}

export interface RAGChunk {
  id: string;
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  embedding?: number[];
  tokenCount?: number;
}

export interface VectorSearchResult {
  chunk: RAGChunk;
  similarity: number;
}

export interface DiffHunk {
  hunkIndex: number;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  originalLines: string[];
  modifiedLines: string[];
  accepted?: boolean;
}

export interface DiffSuggestion {
  id: string;
  filePath: string;
  originalCode: string;
  proposedCode: string;
  explanation: string;
  hunks: DiffHunk[];
  createdAt: number;
  status: 'pending' | 'applied' | 'rejected' | 'partial';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  diffSuggestion?: DiffSuggestion;
  contextChips?: ContextChip[];
  isStreaming?: boolean;
}

export interface AutonomousLoopStep {
  stepIndex: number;
  action: 'run_test' | 'diagnose' | 'propose_fix' | 'verify' | 'completed';
  description: string;
  command?: string;
  output?: string;
  diffSuggestion?: DiffSuggestion;
  status: 'pending' | 'running' | 'success' | 'failed';
}

// Webview <-> Extension Messaging
export type WebviewMessage =
  | { type: 'chat_send'; text: string; contextChipIds?: string[] }
  | { type: 'chat_clear' }
  | { type: 'request_calibration' }
  | { type: 'request_benchmark'; model?: string }
  | { type: 'request_models' }
  | { type: 'select_model'; model: string }
  | { type: 'pull_model'; model: string }
  | { type: 'toggle_context_chip'; chipId: string }
  | { type: 'add_file_as_chip'; filePath: string }
  | { type: 'remove_context_chip'; chipId: string }
  | { type: 'index_workspace' }
  | { type: 'accept_diff'; suggestionId: string; hunkIndex?: number }
  | { type: 'reject_diff'; suggestionId: string }
  | { type: 'open_diff_view'; suggestionId: string }
  | { type: 'start_autonomous_loop'; testCommand: string }
  | { type: 'stop_autonomous_loop' }
  | { type: 'open_settings' }
  | { type: 'apply_to_editor'; code: string; language?: string }
  | { type: 'open_prism' };

export type ExtensionMessage =
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'chat_stream_chunk'; messageId: string; chunk: string }
  | { type: 'chat_stream_end'; messageId: string; diffSuggestion?: DiffSuggestion }
  | { type: 'calibration_data'; telemetry: HardwareTelemetry; recommendation: ModelRecommendation }
  | { type: 'benchmark_progress'; status: string }
  | { type: 'benchmark_result'; result: BenchmarkResult }
  | { type: 'models_list'; models: OllamaModelInfo[]; activeModel: string; running: OllamaRunningProcess[] }
  | { type: 'pull_progress'; model: string; status: string; completed?: number; total?: number }
  | { type: 'context_chips_updated'; chips: ContextChip[] }
  | { type: 'rag_status'; indexing: boolean; indexedFiles: number; totalChunks: number }
  | { type: 'diff_updated'; suggestion: DiffSuggestion }
  | { type: 'autonomous_step'; step: AutonomousLoopStep }
  | { type: 'autonomous_finished'; success: boolean; summary: string }
  | { type: 'toast'; severity: 'info' | 'warning' | 'error'; text: string };
