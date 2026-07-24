#!/usr/bin/env node
/**
 * 修复 TypeScript 编译错误
 * 针对报错的文件进行括号匹配检查和修复
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const errorFiles = [
  'src/pages/admin/dashboard/StatsCards.tsx',
  'src/pages/admin/rate-limits/LimitStatsCards.tsx',
  'src/pages/admin/redemption/StatsCards.tsx',
  'src/pages/admin/system-health/HealthStatsCards.tsx',
  'src/pages/admin/trends/TrendsCards.tsx',
  'src/pages/admin/Users.tsx',
  'src/pages/admin/users/utils.ts',
  'src/pages/admin/vendor-self/OverviewCards.tsx',
];

function checkBrackets(content) {
  const open = (content.match(/\(/g) || []).length;
  const close = (content.match(/\)/g) || []).length;
  const openB = (content.match(/\{/g) || []).length;
  const closeB = (content.match(/\}/g) || []).length;
  const openS = (content.match(/\[/g) || []).length;
  const closeS = (content.match(/\]/g) || []).length;

  return {
    paren: open - close,
    brace: openB - closeB,
    bracket: openS - closeS,
  };
}

function fixFile(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️ ${filePath} - 文件不存在`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const diff = checkBrackets(content);

  console.log(`\n📄 ${filePath}`);
  console.log(`   括号差异: ( ) ${diff.paren}, { } ${diff.brace}, [ ] ${diff.bracket}`);

  // 修复缺少的右括号
  let fixed = false;
  let newContent = content;

  // 移除文件末尾的多余空白
  newContent = newContent.trimEnd();

  // 如果缺少右括号
  if (diff.paren > 0) {
    console.log(`   ⚠️ 缺少 ${diff.paren} 个右括号 )`);
    // 不自动添加，需要手动检查
  }

  if (diff.brace > 0) {
    console.log(`   ⚠️ 缺少 ${diff.brace} 个右大括号 }`);
  }

  if (diff.bracket > 0) {
    console.log(`   ⚠️ 缺少 ${diff.bracket} 个右方括号 ]`);
  }

  // 检查是否有 PUA 字符
  const puaRegex = /[\uE000-\uF8FF]/g;
  const puaMatches = newContent.match(puaRegex);
  if (puaMatches) {
    console.log(`   🔴 发现 ${puaMatches.length} 个 PUA 字符`);
    // 移除 PUA 字符
    newContent = newContent.replace(puaRegex, '');
    fixed = true;
  }

  // 检查常见错误模式
  const errorPatterns = [
    { pattern: /from\s+(\d+)/g, desc: 'from N → * N', fix: '* $1' },
    { pattern: /Panel\s+(\d+)/g, desc: 'Panel N → N', fix: '$1' },
    { pattern: /to\s+(\d+)/g, desc: 'to N → - N', fix: '- $1' },
  ];

  for (const ep of errorPatterns) {
    const matches = newContent.match(ep.pattern);
    if (matches) {
      console.log(`   🔧 发现模式 "${ep.desc}": ${matches.length} 处`);
      // 不自动修复，需要确认
    }
  }

  if (fixed) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`   ✅ 已修复`);
  } else if (diff.paren === 0 && diff.brace === 0 && diff.bracket === 0) {
    console.log(`   ✅ 括号匹配正常`);
  } else {
    console.log(`   ❌ 需要手动修复`);
  }

  return fixed;
}

console.log('=== TypeScript 编译错误修复 ===\n');

let totalFixed = 0;
for (const file of errorFiles) {
  if (fixFile(file)) {
    totalFixed++;
  }
}

console.log(`\n=== 总结 ===`);
console.log(`修复文件: ${totalFixed}/${errorFiles.length}`);
