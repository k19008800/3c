const fs = require('fs');
const path = require('path');

// 要处理的组件列表（基于分析结果的高优先级组件）
const COMPONENTS_TO_PROCESS = [
  // P1 高优先级组件（高频渲染）
  'src/components/logs/LogStatsCards.tsx', // 已处理示例
  'src/pages/admin/system-health/HealthStatsCards.tsx',
  'src/pages/admin/dashboard/StatsCards.tsx',
  'src/pages/admin/trends/TrendsCards.tsx',
  'src/pages/admin/redemption/StatsCards.tsx',
  'src/pages/admin/rate-limits/LimitStatsCards.tsx',
  'src/pages/admin/stats/OverviewCards.tsx',
  'src/pages/admin/dashboard/KpiCards.tsx',
  'src/pages/admin/admin-logs/LogStatsCards.tsx',
  'src/pages/admin/vendor-self/OverviewCards.tsx',
  
  // P2 中优先级组件（中型页面）
  'src/pages/admin/Users.tsx',
  'src/pages/admin/VendorKeyGroups.tsx',
  'src/pages/Redemption.tsx'
];

function processComponent(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { success: false, reason: 'File not found' };
  }
  
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // 检查是否已经使用了 memo
    if (content.includes('React.memo(')) {
      console.log(`⏭️  Already memoized: ${filePath}`);
      return { success: false, reason: 'Already memoized' };
    }
    
    let modified = false;
    
    // 1. 确保 React 被导入
    if (!content.includes('import React') && !content.includes('import * as React')) {
      const lines = content.split('\n');
      let importInserted = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import')) {
          // 在最后一个 import 后插入 React import
          let j = i + 1;
          while (j < lines.length && lines[j].trim().startsWith('import')) {
            j++;
          }
          lines.splice(j, 0, "import React from 'react';");
          importInserted = true;
          break;
        }
      }
      
      if (!importInserted) {
        lines.unshift("import React from 'react';");
      }
      
      content = lines.join('\n');
      modified = true;
    }
    
    // 2. 处理默认导出的函数组件
    const defaultFunctionRegex = /export\s+default\s+function\s+(\w+)\s*\(([^)]*)\)/;
    const defaultFunctionMatch = content.match(defaultFunctionRegex);
    
    if (defaultFunctionMatch) {
      const [fullMatch, componentName, params] = defaultFunctionMatch;
      const replacement = `const ${componentName}Base = React.memo(function ${componentName}Base(${params})`;
      content = content.replace(fullMatch, replacement);
      
      // 移除旧的 export default，添加新的
      const exportDefaultRegex = /export\s+default\s+(\w+);/;
      if (content.match(exportDefaultRegex)) {
        content = content.replace(exportDefaultRegex, '');
      }
      
      // 在文件末尾添加新的导出
      if (!content.includes(`export default ${componentName}Base`)) {
        content += `\nexport default ${componentName}Base;\n`;
      }
      
      modified = true;
      console.log(`✓ Processed default function: ${componentName} in ${filePath}`);
    }
    
    // 3. 处理默认导出的箭头函数组件
    const defaultArrowRegex = /export\s+default\s+\(([^)]*)\)\s*=>/;
    const defaultArrowMatch = content.match(defaultArrowRegex);
    
    if (defaultArrowMatch) {
      const [fullMatch, params] = defaultArrowMatch;
      const replacement = `export default React.memo((${params}) =>`;
      content = content.replace(fullMatch, replacement);
      modified = true;
      console.log(`✓ Processed default arrow: ${filePath}`);
    }
    
    if (modified) {
      // 备份原文件
      const backupPath = fullPath + '.backup';
      fs.writeFileSync(backupPath, fs.readFileSync(fullPath, 'utf8'));
      
      // 写入新内容
      fs.writeFileSync(fullPath, content);
      console.log(`✅ Successfully added memo to: ${filePath}`);
      return { success: true, backupPath };
    } else {
      console.log(`⚠️  No changes made to: ${filePath} (pattern not matched)`);
      return { success: false, reason: 'Pattern not matched' };
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { success: false, reason: error.message };
  }
}

function createMemoIndex(processedComponents) {
  const indexPath = path.join(__dirname, 'src', 'components', 'memo-index.ts');
  const successful = processedComponents.filter(c => c.success);
  
  const imports = [];
  const exports = [];
  
  successful.forEach(result => {
    const filePath = result.filePath;
    const relativePath = path.relative(path.dirname(indexPath), filePath).replace(/\\/g, '/');
    const fileName = path.basename(filePath, '.tsx');
    
    // 简单命名：使用文件名作为组件名
    const componentName = fileName.replace(/(^\w|-\w)/g, match => match.replace('-', '').toUpperCase());
    exports.push(`export { default as ${componentName}Memo } from '${relativePath.replace('.tsx', '')}';`);
  });
  
  const indexContent = `// Auto-generated memo component index
// Generated: ${new Date().toISOString()}
// Total memoized components: ${successful.length}

${exports.join('\n')}

// Helper types
export interface MemoComponentProps {
  children?: React.ReactNode;
  [key: string]: any;
}

// Re-export React.memo for convenience
export { memo } from 'react';`;

  fs.writeFileSync(indexPath, indexContent);
  console.log(`\n📁 Created memo index at: ${indexPath}`);
  
  return indexPath;
}

function main() {
  console.log('🚀 Starting batch React.memo optimization...\n');
  console.log(`Processing ${COMPONENTS_TO_PROCESS.length} components\n`);
  
  const results = [];
  
  for (const componentPath of COMPONENTS_TO_PROCESS) {
    const result = processComponent(componentPath);
    result.filePath = componentPath;
    results.push(result);
    
    // 添加一点延迟避免太快
    if (Math.random() > 0.5) {
      // 简单延迟
      const start = Date.now();
      while (Date.now() - start < 50) {}
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const skipCount = results.filter(r => !r.success).length;
  
  // 创建 memo 索引
  const indexPath = createMemoIndex(results);
  
  // 生成报告
  generateReport(results, indexPath, successCount, skipCount);
  
  console.log('\n✨ Batch optimization complete!');
  console.log(`✅ Successfully memoized: ${successCount} components`);
  console.log(`⏭️  Skipped/Failed: ${skipCount} components`);
  console.log(`📊 Report saved to: 3cloud/PERF-ANALYSIS/fix-memo-optimization.md`);
}

function generateReport(results, indexPath, successCount, skipCount) {
  const reportDir = path.join(__dirname, '3cloud', 'PERF-ANALYSIS');
  const reportPath = path.join(reportDir, 'fix-memo-optimization.md');
  
  // 确保目录存在
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  const reportContent = `# React.memo 优化报告

## 概述
- **优化时间**: ${new Date().toISOString()}
- **处理组件总数**: ${results.length}
- **成功添加 memo**: ${successCount}
- **跳过/失败**: ${skipCount}
- **memo 索引文件**: \`${path.relative(__dirname, indexPath)}\`

## 优化策略
1. **优先级排序**: 按照组件渲染频率和大小排序
2. **纯展示组件**: 优先为无状态、无副作用组件添加 memo
3. **渐进式优化**: 先处理高频渲染组件，验证后再扩展

## 成功优化的组件 (${successCount} 个)

| 序号 | 组件路径 | 状态 |
|------|----------|------|
${successful.map((r, i) => `| ${i + 1} | \`${r.filePath}\` | ✅ 成功 |`).join('\n')}

## 跳过/失败的组件 (${skipCount} 个)

${failed.length > 0 ? failed.map((r, i) => `${i + 1}. \`${r.filePath}\` - ${r.reason || '未知原因'}`).join('\n') : '无'}

## 验证方法

### 1. React DevTools Profiler
\`\`\`bash
# 启动开发服务器
npm run dev

# 打开浏览器开发者工具 -> React DevTools -> Profiler
# 记录页面交互，验证重渲染减少
\`\`\`

### 2. 性能基准测试
\`\`\`javascript
// 示例：使用 React.memo 前后的性能对比
console.time('render');
// 渲染组件...
console.timeEnd('render');
\`\`\`

### 3. Memo 组件导入示例
\`\`\`typescript
// 导入 memo 化的组件
import { LogStatsCardsMemo } from '@/components/memo-index';

// 使用方式不变
function ParentComponent() {
  return <LogStatsCardsMemo summary={summary} loading={loading} />;
}
\`\`\`

## 后续建议

1. **测试验证**: 运行现有测试确保功能正常
2. **性能监控**: 使用 React Profiler 验证优化效果
3. **逐步扩展**: 继续为剩余的组件添加 memo
4. **Props 优化**: 配合 useMemo/useCallback 稳定 props 引用

## 备份文件
所有原始文件已备份为 \`.backup\` 扩展名，如有需要可恢复。

---

*报告生成时间: ${new Date().toISOString()}*`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`📊 Report generated at: ${reportPath}`);
}

// 执行主函数
main();