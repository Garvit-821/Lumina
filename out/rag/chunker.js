"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeChunker = void 0;
class CodeChunker {
    static CHUNK_SIZE_LINES = 40;
    static CHUNK_OVERLAP_LINES = 10;
    static chunkFile(filePath, relativePath, content, language) {
        const lines = content.split('\n');
        if (lines.length === 0)
            return [];
        // If file is small, return as single chunk
        if (lines.length <= this.CHUNK_SIZE_LINES) {
            return [
                {
                    id: `${relativePath}:1-${lines.length}`,
                    filePath,
                    relativePath,
                    startLine: 1,
                    endLine: lines.length,
                    content,
                    language,
                    tokenCount: Math.ceil(content.length / 4),
                },
            ];
        }
        const chunks = [];
        let startLine = 0;
        while (startLine < lines.length) {
            const endLine = Math.min(startLine + this.CHUNK_SIZE_LINES, lines.length);
            const chunkLines = lines.slice(startLine, endLine);
            const chunkText = chunkLines.join('\n');
            // Add context header with relative path and line numbers
            const annotatedContent = `// File: ${relativePath} (Lines ${startLine + 1}-${endLine})\n${chunkText}`;
            chunks.push({
                id: `${relativePath}:${startLine + 1}-${endLine}`,
                filePath,
                relativePath,
                startLine: startLine + 1,
                endLine,
                content: annotatedContent,
                language,
                tokenCount: Math.ceil(annotatedContent.length / 4),
            });
            if (endLine >= lines.length)
                break;
            startLine += this.CHUNK_SIZE_LINES - this.CHUNK_OVERLAP_LINES;
        }
        return chunks;
    }
}
exports.CodeChunker = CodeChunker;
//# sourceMappingURL=chunker.js.map