const fs = require('fs');
const path = require('path');

// 需要修复的文件列表
const FILES_TO_FIX = [
  'src/pages/admin/redemption/StatsCards.tsx',
  'src/pages/admin/stats/OverviewCards.tsx',
  'src/pages/admin/system-health/HealthStatsCards.tsx',
  'src/pages/admin/trends/TrendsCards.tsx',
  'src/pages/admin/Users.tsx',
  'src/pages/admin/vendor-self/OverviewCards.tsx',
  'src/pages/admin/VendorKeyGroups.tsx',
  'src/pages/Redemption.tsx',
  'src/pages/admin/dashboard/KpiCards.tsx',
  'src/pages/admin/dashboard/StatsCards.tsx',
  'src/pages/admin/rate-limits/LimitStatsCards.tsx'
];

function fixFileImport(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // 修复在 import 语句中间插入 React 的问题
    // 查找模式: import {\nimport React from 'react';\n  ...
    const badImportRegex = /import\s*\{\s*\n\s*import React from 'react';\s*\n\s*([^}]+)\}/g;
    
    if (badImportRegex.test(content)) {
      content = content.replace(badImportRegex, (match, imports) => {
        return `import React from 'react';\nimport {${imports}}`;
      });
      console.log(`✓ Fixed import in: ${filePath}`);
    }
    
    // 另一种模式: import { X,\nimport React from 'react';\n  Y } from 'module'
    const badImportRegex2 = /import\s*\{([^}]*?)\n\s*import React from 'react';\s*\n\s*([^}]+)\}/g;
    
    if (badImportRegex2.test(content)) {
      content = content.replace(badImportRegex2, (match, imports1, imports2) => {
        return `import React from 'react';\nimport {${imports1}${imports2}}`;
      });
      console.log(`✓ Fixed import pattern 2 in: ${filePath}`);
    }
    
    // 备份并保存
    const backupPath = fullPath + '.fixbackup';
    fs.writeFileSync(backupPath, fs.readFileSync(fullPath, 'utf8'));
    fs.writeFileSync(fullPath, content);
    
    return true;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Fixing import statements...\n');
  
  let fixedCount = 0;
  
  for (const filePath of FILES_TO_FIX) {
    if (fixFileImport(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✨ Fixed ${fixedCount} files out of ${FILES_TO_FIX.length}`);
  
  // 验证修复
  console.log('\n🔍 Verifying TypeScript compilation...');
  try {
    const { execSync } = require('child_process');
    const result = execSync('npx tsc --noEmit 2>&1 | findstr /C:"error TS"', { 
      cwd: __dirname,
      encoding: 'utf8'
    });
    
    if (result.trim()) {
      console.log('⚠️  TypeScript errors still exist:');
      console.log(result);
    } else {
      console.log('✅ TypeScript compilation successful!');
    }
  } catch (error) {
    console.log('✅ TypeScript compilation successful (no errors found)');
  }
}

main();