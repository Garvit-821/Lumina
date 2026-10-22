/**
 * Hardware class picked by ModelRecommender from RAM and usable GPU memory. It decides which chat model,
 * embedding model and context window Lumina suggests.
 */
export type ProfileTier = 'low' | 'balanced' | 'power';

/**
 * Snapshot of the local machine from CalibrationTelemetry.scanSystem(). The first scan is cached and
 * reused until a forced rescan. RAM sizes are in GB (1024^3 bytes), rounded to one decimal.
 */
export interface HardwareTelemetry {
  osPlatform: string;
  osRelease: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  gpuName: string;
  /** GPU memory in GB; 0 when none was detected. On Apple Silicon it is an estimate: 75% of unified RAM. */
  vramGB: number;
  isAppleSilicon: boolean;
  hasCuda: boolean;
}

/**
 * Output of ModelRecommender.evaluate(): the Ollama model tags suggested for a ProfileTier and why.
 * Shown in the Nexus Models tab and offered by the calibrate command. The models may not be installed yet.
 */
export interface ModelRecommendation {
  recommendedModel: string;
  fallbackModel: string;
  embeddingModel: string;
  tier: ProfileTier;
  /** Display label such as 'Balanced Profile (Speed & Precision)'; the Nexus tier pill shows only its first word. */
  tierName: string;
  reason: string;
  /** Suggested context size in tokens: 4096, 8192 or 16384 depending on the tier. */
  contextWindow: number;
}

/**
 * Speed of one model as measured by ModelBenchmarker.runBenchmark() on a fixed code-generation prompt
 * (at most 256 output tokens). Token counts and speed come from Ollama's own timings when it reports
 * them, otherwise from an estimate of one token per 4 characters.
 */
export interface BenchmarkResult {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalDurationSec: number;
  /** Milliseconds from sending the request to the first streamed token, including the time to load the model. */
  timeToFirstTokenMs: number;
  tokensPerSecond: number;
  memoryUsedMB?: number;
  timestamp: number;
}

/** One installed model as listed by Ollama's GET /api/tags. Field names keep Ollama's snake_case. */
export interface OllamaModelInfo {
  name: string;
  /** Size on disk in bytes. */
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

/**
 * A model currently loaded into memory, as listed by Ollama's GET /api/ps. size and size_vram are in
 * bytes; expires_at is the ISO time at which Ollama unloads the model if it stays idle.
 */
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

/**
 * A file the user can include in or exclude from chat prompts, shown as a chip in the Nexus. The context
 * engine keeps one chip for the active editor (id 'active:<path>') plus any added files (id 'file:<path>').
 * Only 'file' chips are produced today, and file contents are read from disk when a prompt is built.
 */
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

/**
 * A slice of a workspace file stored in the local index. Files longer than 40 lines are cut into 40-line
 * windows that overlap by 10 lines, each prefixed with a "// File: path (Lines a-b)" header; shorter files
 * are a single chunk. startLine and endLine are 1-based and inclusive.
 */
export interface RAGChunk {
  id: string;
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  /** Vector from the configured embedding model; missing when that model is not installed (keyword search only). */
  embedding?: number[];
  tokenCount?: number;
}

/**
 * One hit from the vector store. similarity is the cosine similarity for semantic search, or the fraction
 * of query terms found (0 to 1) for the keyword fallback. Results are sorted highest first.
 */
export interface VectorSearchResult {
  chunk: RAGChunk;
  similarity: number;
}

/**
 * One contiguous changed region of a DiffSuggestion. Line numbers are 1-based. An insert-only hunk has
 * oldLineCount 0 and oldStartLine pointing at the line it is inserted before.
 */
export interface DiffHunk {
  /** 1-based position within the suggestion; this is the value accept_diff's hunkIndex refers to. */
  hunkIndex: number;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  originalLines: string[];
  modifiedLines: string[];
  accepted?: boolean;
}

/**
 * A proposed edit to one file, built from a chat reply or the test-and-fix loop and held by PatchManager
 * until it is accepted or rejected. proposedCode is the complete new file text. originalCode is the file
 * as it was when proposed: if the file has changed since, accepting asks before overwriting the newer edits.
 */
export interface DiffSuggestion {
  id: string;
  filePath: string;
  originalCode: string;
  proposedCode: string;
  explanation: string;
  hunks: DiffHunk[];
  createdAt: number;
  /** 'partial' means some hunks were accepted one at a time, but not all of them. */
  status: 'pending' | 'applied' | 'rejected' | 'partial';
}

/** One chat turn. The orchestrator keeps the history in memory; the webview renders each message by id. */
export interface ChatMessage {
  /** 'msg_user_<ms>' or 'msg_asst_<ms>'. Also used as the message's DOM element id in the webview. */
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  diffSuggestion?: DiffSuggestion;
  contextChips?: ContextChip[];
  /** True while an assistant reply is still arriving; content stays empty until the stream ends. */
  isStreaming?: boolean;
}

/** Progress event from the test-and-fix loop (AutonomousLoopController), forwarded to the Nexus Loop tab. */
export interface AutonomousLoopStep {
  /**
   * Iteration number (1-based), shared by every step of that iteration. The webview keys timeline rows
   * by it, so a later step of the same iteration replaces the earlier row.
   */
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
  // Sent when the user submits the chat box or a quick prompt. contextChipIds is never sent; the active chips are used.
  | { type: 'chat_send'; text: string; contextChipIds?: string[] }
  // Clear button: aborts any reply in progress and wipes the extension-side history.
  | { type: 'chat_clear' }
  | { type: 'chat_stop' }
  | { type: 'request_calibration' }
  | { type: 'request_benchmark'; model?: string }
  // Asks the manager to re-poll Ollama. Not sent by the current webview; models_list follows only if something changed.
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
  | { type: 'chat_history'; messages: ChatMessage[] }
  | { type: 'chat_stream_chunk'; messageId: string; chunk: string }
  | { type: 'chat_stream_end'; messageId: string; diffSuggestion?: DiffSuggestion }
  | { type: 'calibration_data'; telemetry: HardwareTelemetry; recommendation: ModelRecommendation }
  | { type: 'benchmark_progress'; status: string }
  | { type: 'benchmark_result'; result: BenchmarkResult }
  | { type: 'models_list'; models: OllamaModelInfo[]; activeModel: string; running: OllamaRunningProcess[]; isOnline?: boolean }
  | { type: 'pull_progress'; model: string; status: string; completed?: number; total?: number }
  | { type: 'context_chips_updated'; chips: ContextChip[] }
  | { type: 'rag_status'; indexing: boolean; indexedFiles: number; totalChunks: number }
  | { type: 'diff_updated'; suggestion: DiffSuggestion }
  | { type: 'autonomous_step'; step: AutonomousLoopStep }
  | { type: 'autonomous_finished'; success: boolean; summary: string }
  | { type: 'toast'; severity: 'info' | 'warning' | 'error'; text: string };
