#!/usr/bin/env node
/**
 * 统一行尾符为 CRLF (Windows)
 */
const fs = require('fs');
const path = require('path');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.cjs', '.mjs'];
const IGNORE = ['node_modules', 'dist', '.git'];

function shouldIgnore(filePath) {
  return IGNORE.some(dir => filePath.includes(path.sep + dir + path.sep));
}

function hasExtension(filePath) {
  return EXTENSIONS.some(ext => filePath.endsWith(ext));
}

function convertToCRLF(content) {
  // 先统一为 LF，再转为 CRLF
  return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

let converted = 0;
let skipped = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE.includes(entry.name)) {
        walk(fullPath);
      }
    } else if (entry.isFile() && hasExtension(fullPath)) {
      if (shouldIgnore(fullPath)) continue;
      
      const content = fs.readFileSync(fullPath, 'utf8');
      const converted_content = convertToCRLF(content);
      
      if (content !== converted_content) {
        fs.writeFileSync(fullPath, converted_content, 'utf8');
        converted++;
        console.log(`Converted: ${fullPath}`);
      } else {
        skipped++;
      }
    }
  }
}

const root = process.argv[2] || process.cwd();
walk(root);

console.log(`\nDone: ${converted} converted, ${skipped} already CRLF`);
