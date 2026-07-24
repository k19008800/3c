#!/usr/bin/env node
/**
 * 修复 PUA 字符导致的语法错误
 * 常见模式：
 * - "from 1000" → "* 1000"
 * - "Panel 300" → "300"
 * - 其他 PUA 字符替换
 */

const fs = require('fs');
const path = require('path');

const fixes = [
  // 乘法符号被替换为 "from"
  { pattern: /from (\d+)/g, replacement: '* $1' },
  // 数字被替换为 "Panel XXX"
  { pattern: /Panel (\d+)/g, replacement: '$1' },
  // 其他常见 PUA 替换模式
  { pattern: /to (\d+)/g, replacement: '- $1' },
];

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

let totalFixed = 0;

for (const file of errorFiles) {
  const filePath = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`跳过: ${file} (不存在)`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  let fileFixed = 0;

  for (const fix of fixes) {
    const matches = content.match(fix.pattern);
    if (matches) {
      content = content.replace(fix.pattern, fix.replacement);
      fileFixed += matches.length;
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ 修复 ${file}: ${fileFixed} 处`);
    totalFixed += fileFixed;
  } else {
    console.log(`⏭️ ${file}: 无需修复`);
  }
}

console.log(`\n总计修复: ${totalFixed} 处`);
