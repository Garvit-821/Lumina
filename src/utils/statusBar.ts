import * as vscode from 'vscode';
import { BenchmarkResult } from '../types';

export class LuminaStatusBar {
  private item: vscode.StatusBarItem;
  private currentModel: string = 'Offline';
  private isOnline: boolean = false;
  private lastTps: number | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'lumina.focusNexus';
    this.update();
    this.item.show();
  }

  public setStatus(isOnline: boolean, modelName: string, tps?: number): void {
    this.isOnline = isOnline;
    this.currentModel = modelName || 'No Model';
    if (typeof tps === 'number') {
      this.lastTps = tps;
    }
    this.update();
  }

  public setBenchmark(result: BenchmarkResult): void {
    this.lastTps = result.tokensPerSecond;
    this.update();
  }

  private update(): void {
    if (!this.isOnline) {
      this.item.text = '$(circle-slash) Lumina: Offline';
      this.item.tooltip = 'Lumina Agent: Ollama server not reachable at configured endpoint. Click to open Nexus Hub.';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    const tpsText = this.lastTps !== null ? ` (${this.lastTps.toFixed(1)} t/s)` : '';
    this.item.text = `$(sparkle) Lumina: ${this.currentModel}${tpsText}`;
    this.item.tooltip = `Lumina Active Model: ${this.currentModel}\nSpeed: ${this.lastTps ? this.lastTps.toFixed(1) + ' tokens/sec' : 'Calibrated'}\nClick to open Nexus Hub & Agent Controls.`;
    this.item.backgroundColor = undefined;
  }

  public dispose(): void {
    this.item.dispose();
  }
}
