import * as vscode from 'vscode';
import { OllamaClient } from './client';
import { OllamaModelInfo, OllamaRunningProcess } from '../types';
import { LuminaLogger } from '../utils/logger';

export class OllamaModelManager {
  private client: OllamaClient;
  private activeModel: string = '';
  private availableModels: OllamaModelInfo[] = [];
  private runningProcesses: OllamaRunningProcess[] = [];
  private isOnline: boolean = false;
  private healthTimer?: NodeJS.Timeout;
  private onStatusChangeEmitter = new vscode.EventEmitter<{ isOnline: boolean; activeModel: string }>();

  public readonly onStatusChange = this.onStatusChangeEmitter.event;

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

  public async setActiveModel(modelName: string): Promise<void> {
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

    this.onStatusChangeEmitter.fire({ isOnline: this.isOnline, activeModel: this.activeModel });
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
    this.refreshModels();
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
