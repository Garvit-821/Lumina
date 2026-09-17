import * as vscode from 'vscode';
import { OllamaClient } from './client';
import { OllamaModelInfo, OllamaRunningProcess } from '../types';
import { LuminaLogger } from '../utils/logger';

/**
 * Tracks which Ollama models are installed and loaded and which one Lumina uses for requests.
 * Polls the server every 15 seconds and fires `onStatusChange` when anything changes.
 * The chosen model is persisted in the `lumina.selectedModel` setting.
 */
export class OllamaModelManager {
  private client: OllamaClient;
  private activeModel: string = '';
  private availableModels: OllamaModelInfo[] = [];
  private runningProcesses: OllamaRunningProcess[] = [];
  private isOnline: boolean = false;
  private healthTimer?: NodeJS.Timeout;
  /**
   * JSON fingerprint of the state last broadcast by refreshModels, used to skip duplicate events.
   * Cleared to force the next refresh to notify listeners.
   */
  private lastSignature = '';
  private onStatusChangeEmitter = new vscode.EventEmitter<{ isOnline: boolean; activeModel: string }>();

  /**
   * Fires with the online flag and active model when either, or the installed or running model lists,
   * change. Also fires when setActiveModel switches to a different model.
   */
  public readonly onStatusChange = this.onStatusChangeEmitter.event;

  /**
   * Loads the saved model choice and starts polling the server right away.
   * The poll timer keeps running until dispose() is called.
   */
  constructor(client: OllamaClient) {
    this.client = client;
    this.loadActiveModelFromConfig();
    this.startHealthCheck();
  }

  /** The shared HTTP client, for callers that send chat, completion or pull requests directly. */
  public getClient(): OllamaClient {
    return this.client;
  }

  /** The model used for chat and completions, or an empty string when none is configured or installed. */
  public getActiveModel(): string {
    return this.activeModel;
  }

  /** Installed models as of the last poll; empty while the server is offline. */
  public getAvailableModels(): OllamaModelInfo[] {
    return this.availableModels;
  }

  /** Models loaded in memory as of the last poll (from /api/ps); empty while offline. */
  public getRunningProcesses(): OllamaRunningProcess[] {
    return this.runningProcesses;
  }

  /** Whether the last health probe reached the server. May lag reality by up to one poll (15 s). */
  public getIsOnline(): boolean {
    return this.isOnline;
  }

  /** Re-reads `lumina.selectedModel`, e.g. after the user edits it in Settings. */
  public async reloadFromConfig(): Promise<void> {
    this.loadActiveModelFromConfig();
    this.lastSignature = '';
    await this.refreshModels();
  }

  /**
   * Switches the active model and saves it to the user-level (Global) `lumina.selectedModel` setting.
   * Does nothing if the name is unchanged, and does not check that the model is installed.
   */
  public async setActiveModel(modelName: string): Promise<void> {
    if (modelName === this.activeModel) return;
    this.activeModel = modelName;
    const config = vscode.workspace.getConfiguration('lumina');
    await config.update('selectedModel', modelName, vscode.ConfigurationTarget.Global);
    this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
    LuminaLogger.getInstance().log(`Active model changed to: ${modelName}`);
  }

  /**
   * Probes the server and reloads the installed and running model lists, clearing both when offline.
   * If no model is selected yet, the first installed model becomes active. Listeners are notified only
   * when the result differs from the last broadcast. Returns the lists just fetched.
   */
  public async refreshModels(): Promise<{ models: OllamaModelInfo[]; running: OllamaRunningProcess[] }> {
    const isHealthy = await this.client.isHealthy();
    this.isOnline = isHealthy;

    if (isHealthy) {
      this.availableModels = await this.client.listModels();
      this.runningProcesses = await this.client.listRunning();

      if (!this.activeModel && this.availableModels.length > 0) {
        this.activeModel = this.availableModels[0].name;
      }
    } else {
      this.availableModels = [];
      this.runningProcesses = [];
    }

    // Polling runs every 15s; only notify listeners when something actually changed.
    const signature = JSON.stringify([
      this.isOnline,
      this.activeModel,
      this.availableModels.map((m) => m.digest || m.name),
      this.runningProcesses.map((p) => p.name),
    ]);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
    }
    return { models: this.availableModels, running: this.runningProcesses };
  }

  private loadActiveModelFromConfig(): void {
    const config = vscode.workspace.getConfiguration('lumina');
    const configuredModel = config.get<string>('selectedModel');
    if (configuredModel && configuredModel.trim().length > 0) {
      this.activeModel = configuredModel.trim();
    }
  }

  private startHealthCheck(): void {
    this.refreshModels().catch(() => {});
    this.healthTimer = setInterval(() => {
      this.refreshModels().catch(() => {});
    }, 15000);
  }

  public dispose(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
    this.onStatusChangeEmitter.dispose();
  }
}
