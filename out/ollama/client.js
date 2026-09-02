"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
const logger_1 = require("../utils/logger");
class OllamaClient {
    baseUrl;
    constructor(baseUrl = 'http://localhost:11434') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    setBaseUrl(url) {
        this.baseUrl = url.replace(/\/+$/, '');
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    async isHealthy() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                throw new Error(`Ollama returned status ${response.status}`);
            }
            const data = (await response.json());
            return data.models || [];
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().warn(`Failed to list Ollama models: ${err}`);
            return [];
        }
    }
    async listRunning() {
        try {
            const response = await fetch(`${this.baseUrl}/api/ps`, {
                method: 'GET',
                signal: AbortSignal.timeout(4000),
            });
            if (!response.ok) {
                return [];
            }
            const data = (await response.json());
            return data.models || [];
        }
        catch {
            return [];
        }
    }
    async generate(model, prompt, options) {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false,
                options,
            }),
            signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama generate failed (${response.status}): ${text}`);
        }
        const data = (await response.json());
        return data.response;
    }
    async *generateStream(model, prompt, options, abortSignal) {
        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: true,
                options,
            }),
            signal: abortSignal,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama stream error (${response.status}): ${text}`);
        }
        if (!response.body) {
            throw new Error('No response body from Ollama stream');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        yield parsed;
                    }
                    catch {
                        // Partial JSON chunk, skip
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async *chatStream(model, messages, options, abortSignal) {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                options,
            }),
            signal: abortSignal,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama chat stream error (${response.status}): ${text}`);
        }
        if (!response.body) {
            throw new Error('No response body from Ollama chat stream');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        yield parsed;
                    }
                    catch {
                        // Ignored
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async getEmbeddings(model, prompt) {
        try {
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt,
                }),
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                throw new Error(`Failed to generate embeddings: HTTP ${response.status}`);
            }
            const data = (await response.json());
            return data.embedding || [];
        }
        catch (err) {
            logger_1.LuminaLogger.getInstance().warn(`Ollama embeddings error: ${err}`);
            return [];
        }
    }
    async *pullModel(model, abortSignal) {
        const response = await fetch(`${this.baseUrl}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: model,
                stream: true,
            }),
            signal: abortSignal,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to pull model ${model}: ${text}`);
        }
        if (!response.body)
            return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        yield parsed;
                    }
                    catch {
                        // Ignored
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
}
exports.OllamaClient = OllamaClient;
//# sourceMappingURL=client.js.map