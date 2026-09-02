import * as vscode from 'vscode';

export class LuminaLogger {
  private static instance: LuminaLogger;
  private channel: vscode.OutputChannel;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('Lumina Agent');
  }

  public static getInstance(): LuminaLogger {
    if (!LuminaLogger.instance) {
      LuminaLogger.instance = new LuminaLogger();
    }
    return LuminaLogger.instance;
  }

  public log(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const formatted = `[${timestamp}] [INFO] ${message} ${context ? JSON.stringify(context) : ''}`;
    this.channel.appendLine(formatted);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const formatted = `[${timestamp}] [WARN] ${message} ${context ? JSON.stringify(context) : ''}`;
    this.channel.appendLine(formatted);
  }

  public error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : String(error || '');
    const formatted = `[${timestamp}] [ERROR] ${message} ${errStr}`;
    this.channel.appendLine(formatted);
  }

  public show(): void {
    this.channel.show();
  }
}
