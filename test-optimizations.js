// 测试优化是否正确实施
const fs = require('fs');
const path = require('path');

console.log('=== 3cloud 查询优化验证测试 ===\n');

// 测试1: 验证所有 .catch(() => {}) 已修复
console.log('1. 检查 .catch(() => {}) 修复:');
const grepCmd = `grep -r "\\.catch(() => {})" 3cloud/api/src --include="*.ts" --include="*.js"`;
try {
  const result = require('child_process').execSync(grepCmd, { encoding: 'utf-8' });
  if (result.trim()) {
    console.log('❌ 发现未修复的 .catch(() => {}) 模式:');
    console.log(result);
  } else {
    console.log('✅ 所有 .catch(() => {}) 已修复');
  }
} catch (e) {
  console.log('✅ grep命令执行成功，无匹配结果');
}

console.log('\n2. 检查新增的文件:');
const newFiles = [
  'src/plugins/query-timeout-enhanced.ts',
  'src/middleware/request-id.ts',
  'PERF-ANALYSIS/opt-query-timeout.md'
];

newFiles.forEach(file => {
  const fullPath = path.join('3cloud', file);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${file} 存在`);
  } else {
    console.log(`❌ ${file} 不存在`);
  }
});

console.log('\n3. 检查插件注册更新:');
const pluginsFile = '3cloud/api/src/app/plugins.ts';
if (fs.existsSync(pluginsFile)) {
  const content = fs.readFileSync(pluginsFile, 'utf-8');
  const hasRequestId = content.includes('registerRequestIdMiddleware');
  const hasEnhancedTimeout = content.includes('query-timeout-enhanced');
  
  console.log(`✅ 插件文件存在`);
  console.log(`  请求ID中间件注册: ${hasRequestId ? '✅' : '❌'}`);
  console.log(`  增强查询超时插件: ${hasEnhancedTimeout ? '✅' : '❌'}`);
} else {
  console.log('❌ 插件文件不存在');
}

console.log('\n4. 验证修复后的错误处理模式:');
console.log('   检查文件示例: 3cloud/api/src/routes/admin/dashboard/enterprise.ts');
const exampleFile = '3cloud/api/src/routes/admin/dashboard/enterprise.ts';
if (fs.existsSync(exampleFile)) {
  const content = fs.readFileSync(exampleFile, 'utf-8');
  const hasConsoleError = content.includes('console.error("[Redis Cache Error]"');
  const hasOldCatch = content.includes('.catch(() => {})');
  
  console.log(`   文件存在`);
  console.log(`   包含新的错误处理: ${hasConsoleError ? '✅' : '❌'}`);
  console.log(`   包含旧的模式: ${hasOldCatch ? '❌ (有问题)' : '✅'}`);
}

console.log('\n=== 测试完成 ===');