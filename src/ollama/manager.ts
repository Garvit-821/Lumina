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

  public getClient(): OllamaClient {
    return this.client;
  }

  public getActiveModel(): string {
    return this.activeModel;
  }

  public getAvailableModels(): OllamaModelInfo[] {
    return this.availableModels;
  }

  public getRunningProcesses(): OllamaRunningProcess[] {
    return this.runningProcesses;
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  /** Re-reads `lumina.selectedModel`, e.g. after the user edits it in Settings. */
  public async reloadFromConfig(): Promise<void> {
    this.loadActiveModelFromConfig();
    this.lastSignature = '';
    await this.refreshModels();
  }

  public async setActiveModel(modelName: string): Promise<void> {
    if (modelName === this.activeModel) return;
    this.activeModel = modelName;
    const config = vscode.workspace.getConfiguration('lumina');
    await config.update('selectedModel', modelName, vscode.ConfigurationTarget.Global);
    this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
    LuminaLogger.getInstance().log(`Active model changed to: ${modelName}`);
  }

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
