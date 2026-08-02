#!/usr/bin/env node
/**
 * KB Manager — 知识库管理工具
 * 
 * 用法：
 *   node kb/scripts/kb-manager.js stats          # 知识库统计
 *   node kb/scripts/kb-manager.js search <query>  # 搜索知识库
 *   node kb/scripts/kb-manager.js update          # 更新索引
 *   node kb/scripts/kb-manager.js chunk <file>    # 查看文件分块
 */

const fs = require('fs');
const path = require('path');

const KB_ROOT = path.resolve(__dirname, '..');
const MEMORY_ROOT = path.resolve(KB_ROOT, '..', 'memory');

function getAllMdFiles(dir, maxDepth = 3, depth = 0) {
  if (depth > maxDepth) return [];
  const result = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...getAllMdFiles(fullPath, maxDepth, depth + 1));
      } else if (entry.name.endsWith('.md')) {
        result.push(fullPath);
      }
    }
  } catch {}
  return result;
}

function getFileInfo(filePath) {
  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const sizeKB = (stat.size / 1024).toFixed(1);
  const heading1 = lines.find(l => l.startsWith('# ')) || '(no title)';
  return {
    path: filePath,
    sizeKB: parseFloat(sizeKB),
    lines: lines.length,
    title: heading1.replace(/^#\s*/, ''),
    chars: content.length,
    lastModified: stat.mtime
  };
}

function cmdStats() {
  const kbFiles = getAllMdFiles(KB_ROOT, 3);
  const memoryFiles = fs.existsSync(MEMORY_ROOT) ? getAllMdFiles(MEMORY_ROOT, 2) : [];

  const kbInfos = kbFiles.map(getFileInfo);
  const memoryInfos = memoryFiles.map(getFileInfo);

  const totalSize = [...kbInfos, ...memoryInfos].reduce((s, f) => s + f.sizeKB, 0);
  const totalLines = [...kbInfos, ...memoryInfos].reduce((s, f) => s + f.lines, 0);

  console.log('═══════════════════════════════════════');
  console.log('  知识库统计');
  console.log('═══════════════════════════════════════');
  console.log(`\n📁 kb/ — ${kbInfos.length} 个文件`);
  console.log(`${'─'.repeat(50)}`);
  kbInfos.sort((a, b) => b.sizeKB - a.sizeKB);
  for (const f of kbInfos) {
    const rel = path.relative(KB_ROOT, f.path);
    console.log(`  ${rel.padEnd(35)} ${String(f.sizeKB).padStart(6)} KB  ${f.lines} 行`);
  }

  console.log(`\n📁 memory/ — ${memoryInfos.length} 个文件`);
  console.log(`${'─'.repeat(50)}`);
  const totalMemoryKB = memoryInfos.reduce((s, f) => s + f.sizeKB, 0);
  console.log(`  总计: ${memoryInfos.length} 个文件, ${totalMemoryKB.toFixed(0)} KB, ${memoryInfos.reduce((s,f) => s + f.lines, 0)} 行`);

  console.log(`\n📊 总计`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  文件数: ${kbInfos.length + memoryInfos.length}`);
  console.log(`  总大小: ${totalSize.toFixed(1)} KB`);
  console.log(`  总行数: ${totalLines}`);
  console.log();
}

function cmdUpdate() {
  // Re-read all kb files and ensure they're well-formed
  const kbFiles = getAllMdFiles(KB_ROOT, 3);
  let updated = 0;
  for (const file of kbFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    let changed = false;
    
    // Check if file starts with proper heading
    if (!content.startsWith('#')) {
      const rel = path.relative(KB_ROOT, file);
      const title = path.basename(file, '.md').replace(/^(\d+-)?/, '');
      const header = `# ${title}\n\n`;
      fs.writeFileSync(file, header + content);
      changed = true;
    }

    // Normalize line endings
    const normalized = content.replace(/\r\n/g, '\n');
    const back = content.replace(/\r\n/g, '\n');
    if (back !== normalized) {
      fs.writeFileSync(file, normalized);
    }

    if (changed) updated++;
  }
  console.log(`✅ 已检查 ${kbFiles.length} 个文件，更新 ${updated} 个`);
}

function cmdChunk(filePath) {
  const fullPath = path.resolve(KB_ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 文件不存在: ${fullPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  // Simple chunking: split by headings, max 100 lines per chunk
  const chunks = [];
  let currentChunk = [];
  let currentHeading = '(前言)';

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('### ')) {
      if (currentChunk.length > 0) {
        chunks.push({ heading: currentHeading, content: currentChunk.join('\n'), lines: currentChunk.length });
      }
      currentHeading = line.replace(/^#+\s*/, '');
      currentChunk = [line];
    } else {
      currentChunk.push(line);
      if (currentChunk.length >= 100 && (line.trim() === '' || line.startsWith('---'))) {
        chunks.push({ heading: currentHeading, content: currentChunk.join('\n'), lines: currentChunk.length });
        currentChunk = [];
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push({ heading: currentHeading, content: currentChunk.join('\n'), lines: currentChunk.length });
  }

  console.log(`\n📄 ${path.basename(filePath)} — ${chunks.length} 个分块`);
  console.log(`${'─'.repeat(50)}`);
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  块 ${i + 1}: 「${chunks[i].heading}」 (${chunks[i].lines} 行)`);
  }
  console.log();
}

const cmd = process.argv[2];
switch (cmd) {
  case 'stats':
    cmdStats();
    break;
  case 'update':
    cmdUpdate();
    break;
  case 'chunk':
    if (!process.argv[3]) { console.error('用法: node kb-manager.js chunk <相对路径>'); process.exit(1); }
    cmdChunk(process.argv[3]);
    break;
  default:
    console.log(`
用法:
  node kb-manager.js stats          — 知识库统计
  node kb-manager.js update         — 检查并修复知识库文件
  node kb-manager.js chunk <file>   — 查看文件分块
`);
    break;
}
