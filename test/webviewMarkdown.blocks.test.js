// Same approach as webviewMarkdown.test.js: lift formatMarkdown out of the webview IIFE and call it directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/nexus/media/nexus.js'), 'utf8');
const body = src.slice(src.indexOf('  function formatMarkdown'), src.indexOf('  // --- TIMELINE'));
const formatMarkdown = new Function(`${body}; return formatMarkdown;`)();

test('empty input renders nothing', () => {
  assert.equal(formatMarkdown(''), '');
});

test('consecutive lines become one paragraph with line breaks', () => {
  assert.equal(formatMarkdown('first\nsecond'), '<p>first<br/>second</p>');
});

test('a blank line separates paragraphs', () => {
  assert.equal(formatMarkdown('first\n\nsecond'), '<p>first</p><p>second</p>');
});

test('numbered lists accept both 1. and 1) markers', () => {
  assert.equal(formatMarkdown('1. one\n2) two'), '<ol><li>one</li><li>two</li></ol>');
});

test('star bullets work like dash bullets', () => {
  assert.equal(formatMarkdown('* one\n* two'), '<ul><li>one</li><li>two</li></ul>');
});
