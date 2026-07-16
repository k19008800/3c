/**
 * check-encoding.js — 检测 TSX/TS 文件中中文编码腐烂
 *
 * 扫描 src 目录下的 .tsx/.ts 文件，
 * 检测是否包含 PUA 字符或异常 Unicode 码点。
 * 在 Vite build 前运行，防止中文编码问题导致的 oxc 解析失败。
 *
 * 用法: node scripts/check-encoding.js
 * 返回: 0 = 无问题, 1 = 发现腐烂文件
 *
 * 注意：不依赖外部包（glob），使用原生 fs.readdirSync 递归
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  'web/src/pages',
  'web/src/components',
  'api/src',
];

// 非 BMP 字符范围（代理对、私有使用区、特殊保留区）
const SUSPICIOUS_PATTERNS = [
  /[\uD800-\uDFFF]/,          // Surrogate halves
  /[\uE000-\uF8FF]/,          // Private Use Area（PUA，BMP 范围）
  /[\u{F0000}-\u{FFFFD}]/u,   // Supplementary PUA-A（需 u 标志支持 \u{} 语法）
  /[\u{100000}-\u{10FFFD}]/u, // Supplementary PUA-B
  /\uFFFD/,                   // Replacement character
  /[\u200B-\u200F\uFEFF]/,    // Zero-width / BOM
];

// 忽略的目录名
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

// 允许的文件扩展名
const ALLOWED_EXT = new Set(['.ts', '.tsx']);

let surrogateWarning = false;
let bomWarning = false;
let puaError = false;
let replaceError = false;

/** 判断代理对字符是否属于合法 emoji 代理对 */
function isSurrogatePartOfEmoji(line, matchIndex) {
  var code = line.charCodeAt(matchIndex);
  if (code >= 0xD800 && code <= 0xDBFF && matchIndex + 1 < line.length) {
    var next = line.charCodeAt(matchIndex + 1);
    if (next >= 0xDC00 && next <= 0xDFFF) return true;
  }
  if (code >= 0xDC00 && code <= 0xDFFF && matchIndex > 0) {
    var prev = line.charCodeAt(matchIndex - 1);
    if (prev >= 0xD800 && prev <= 0xDBFF) return true;
  }
  return false;
}

/** 判断 BOM/U+FEFF 是否为字符串字面量中的合法 BOM（用于 CSV 头） */
function isBomInStringLiteral(line, matchIndex) {
  // Check if the BOM is inside a string literal: '' (empty quotes with BOM between)
  // or used in comment about BOM
  return (
    line.indexOf('BOM') >= 0 ||
    line.indexOf('bom') >= 0 ||
    (matchIndex > 0 && line[matchIndex - 1] === '\'' && matchIndex + 1 < line.length && line[matchIndex + 1] === '\'') ||
    (matchIndex > 0 && line[matchIndex - 1] === '"' && matchIndex + 1 < line.length && line[matchIndex + 1] === '"')
  );
}

/** 递归获取所有 .ts/.tsx 文件 */
function collectFiles(dirPath) {
  const results = [];
  var entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (var ei = 0; ei < entries.length; ei++) {
    var entry = entries[ei];
    var fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        results.push.apply(results, collectFiles(fullPath));
      }
    } else if (entry.isFile()) {
      var ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXT.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function checkFile(filePath) {
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    var lines = content.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      for (var p = 0; p < SUSPICIOUS_PATTERNS.length; p++) {
        var pattern = SUSPICIOUS_PATTERNS[p];
        var match = line.match(pattern);
        if (match) {
          var hex = match[0].charCodeAt(0).toString(16).toUpperCase();
          var isHard = false;
          var isWarn = false;

          // Classify findings
          if (pattern === SUSPICIOUS_PATTERNS[0]) {
            // Surrogate halves
            if (!isSurrogatePartOfEmoji(line, match.index)) {
              isHard = true;
            } else {
              isWarn = true;
              surrogateWarning = true;
            }
          } else if (p >= 1 && p <= 3) {
            // PUA (patterns 1, 2, 3)
            isHard = true;
            puaError = true;
          } else if (p === 4) {
            // Replacement char
            isHard = true;
            replaceError = true;
          } else if (p === 5) {
            // Zero-width / BOM
            if (isBomInStringLiteral(line, match.index)) {
              isWarn = true;
              bomWarning = true;
            } else {
              isHard = true;
            }
          }

          var tag = isHard ? '⚠️' : (isWarn ? 'ℹ️' : 'ℹ️');
          var label = isHard ? '可疑字符' : (match[0] === '\uFEFF' ? 'BOM(可能是 CSV 前缀)' : '代理对(可能是 emoji)');
          var loc = path.relative(ROOT, filePath) + ':' + (i + 1) + ':' + (match.index + 1);
          console.error('  ' + tag + '  ' + loc + ' ' + label + ' U+' + hex.padStart(4, '0') + '  "' + line.trim().slice(0, 80) + '"');
          break;
        }
      }
    }
  } catch (err) {
    console.error('  ❌  无法读取 ' + filePath + ': ' + err.message);
    puaError = true;
  }
}

console.log('🔍 编码检查: 扫描中文编码腐烂...\n');

var totalFiles = 0;
for (var di = 0; di < SCAN_DIRS.length; di++) {
  var fullDir = path.join(ROOT, SCAN_DIRS[di]);
  if (!fs.existsSync(fullDir)) continue;

  var files = collectFiles(fullDir);
  for (var fi = 0; fi < files.length; fi++) {
    checkFile(files[fi]);
    totalFiles++;
  }
}

console.log('\n📊 扫描完成: ' + totalFiles + ' 个文件');

if (puaError || replaceError) {
  console.error('\n❌ 发现编码腐烂（PUA/替换字符等），请修复后重新构建。\n');
  process.exit(1);
} else if (surrogateWarning || bomWarning) {
  if (surrogateWarning) console.log('\nℹ️ 找到部分代理对（可能是 emoji），非编译阻塞项。');
  if (bomWarning) console.log('\nℹ️ 找到 BOM 字符（可能是 CSV BOM 前缀），非编译阻塞项。');
  console.log('✅ 编码检查通过（无阻塞项）。\n');
  process.exit(0);
} else {
  console.log('\n✅ 所有文件编码正常。\n');
  process.exit(0);
}
