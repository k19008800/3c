const { readFileSync, writeFileSync } = require('fs');
const { execSync } = require('child_process');

// 找到所有包含.catch(() => {})的文件
const filesOutput = execSync('grep -r "\\.catch(() => {})" 3cloud/api/src --include="*.ts" --include="*.js"', { encoding: 'utf-8' });
const files = [...new Set(filesOutput.split('\n').filter(line => line.includes('.catch')).map(line => line.split(':')[0]))];

console.log(`Found ${files.length} files with .catch(() => {}) patterns`);

let totalFixed = 0;

for (const file of files) {
  if (!file) continue;
  
  try {
    let content = readFileSync(file, 'utf-8');
    const originalContent = content;
    
    // 修复模式1: .catch(() => {})
    content = content.replace(/\.catch\(\(\) => \{\}\)/g, '.catch((err) => { console.error("[Redis Cache Error]", err); })');
    
    // 修复模式2: .catch(() => { 跨行的情况
    content = content.replace(/\.catch\(\(\) => \{/g, '.catch((err) => { console.error("[Async Error]", err);');
    
    if (content !== originalContent) {
      writeFileSync(file, content, 'utf-8');
      const fixes = (content.match(/console\.error/g) || []).length - (originalContent.match(/console\.error/g) || []).length;
      totalFixed += fixes;
      console.log(`Fixed ${fixes} patterns in ${file}`);
    }
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
}

console.log(`\nTotal fixed: ${totalFixed} .catch(() => {}) patterns`);