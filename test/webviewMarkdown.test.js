// The webview script is a browser IIFE, so pull formatMarkdown/escapeHtml out of its source and test them directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/nexus/media/nexus.js'), 'utf8');
const body = src.slice(src.indexOf('  function formatMarkdown'), src.indexOf('  // --- TIMELINE'));
const formatMarkdown = new Function(`${body}; return formatMarkdown;`)();

test('model output cannot inject HTML', () => {
  const html = formatMarkdown('<img src=x onerror=alert(1)> **<b>bold</b>**');
  assert.ok(!html.includes('<img'), html);
  assert.ok(!html.includes('<b>'), html);
  assert.ok(html.includes('&lt;img'));
});

test('code blocks are escaped and get Copy/Insert actions', () => {
  const html = formatMarkdown('```html\n<script>alert(1)</script>\n```');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('btn-copy-code') && html.includes('btn-apply-editor'));
});

test('an unfinished code block renders as streaming without an Insert button', () => {
  const html = formatMarkdown('Here:\n```ts\nconst a =');
  assert.ok(html.includes('writing…'));
  assert.ok(!html.includes('btn-apply-editor'));
});
