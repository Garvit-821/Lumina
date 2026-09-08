import * as vscode from 'vscode';

/**
 * Process-wide logger that writes to the "Lumina Agent" output channel; obtain it with getInstance().
 * Each line starts with a UTC HH:MM:SS timestamp and a level tag.
 */
export class LuminaLogger {
  private static instance: LuminaLogger;
  private channel: vscode.OutputChannel;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('Lumina Agent');
  }

  /** Returns the shared logger, creating it and its output channel on first use. */
  public static getInstance(): LuminaLogger {
    if (!LuminaLogger.instance) {
      LuminaLogger.instance = new LuminaLogger();
    }
    return LuminaLogger.instance;
  }

  /** Writes an INFO line. `context`, when given, is appended as JSON. */
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
