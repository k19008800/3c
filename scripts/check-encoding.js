/**
 * check-encoding.js — 检测 TSX/TS 文件中中文编码腐烂
 *
 * 扫描 web/src/pages/** 下的 .tsx/.ts 文件，
 * 检测是否包含 PUA 字符或异常 Unicode 码点。
 * 在 Vite build 前运行，防止中文编码问题导致的 oxc 解析失败。
 *
 * 用法: node scripts/check-encoding.js
 * 返回: 0 = 无问题, 1 = 发现腐烂文件
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  'web/src/pages',
  'web/src/components',
  'api/src',
];

// 非 BMP 字符范围（代理对、私有使用区、特殊保留区）
const SUSPICIOUS_PATTERNS = [
  /[\uD800-\uDFFF]/,        // Surrogate halves（正常代理对在 JS/TS 里不应单独出现）
  /[\uE000-\uF8FF]/,        // Private Use Area（PUA）
  /[\uF0000-\uFFFFD]/,      // Supplementary PUA-A
  /[\u100000-\u10FFFD]/,    // Supplementary PUA-B
  /\uFFFD/,                 // Replacement character
  /[\u200B-\u200F\uFEFF]/,  // Zero-width / BOM
];

let hasError = false;

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SUSPICIOUS_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          const hex = match[0].charCodeAt(0).toString(16).toUpperCase();
          console.error(
            `  ⚠️  ${path.relative(ROOT, filePath)}:${i + 1}:${match.index + 1} ` +
            `可疑字符 U+${hex.padStart(4, '0')}  "${line.trim().slice(0, 80)}"`
          );
          hasError = true;
          break;
        }
      }
    }
  } catch (err) {
    console.error(`  ❌  无法读取 ${filePath}: ${err.message}`);
    hasError = true;
  }
}

console.log('🔍 编码检查: 扫描中文编码腐烂...\n');

let totalFiles = 0;
for (const dir of SCAN_DIRS) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) continue;

  const files = glob.sync('**/*.{ts,tsx}', {
    cwd: fullDir,
    nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  for (const file of files) {
    checkFile(path.join(fullDir, file));
    totalFiles++;
  }
}

console.log(`\n📊 扫描完成: ${totalFiles} 个文件`);

if (hasError) {
  console.error('\n❌ 发现编码腐烂，请修复后重新构建。\n');
  process.exit(1);
} else {
  console.log('✅ 所有文件编码正常。\n');
  process.exit(0);
}
