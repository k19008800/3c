const fs = require('fs');
const path = require('path');

function walkDir(dir, files = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!entry.startsWith('.') && entry !== 'node_modules') {
        walkDir(full, files);
      }
    } else if (/\.(tsx|ts|jsx|js)$/.test(path.extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

function hasPUA(str) {
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp >= 0xE000 && cp <= 0xF8FF) return true;
  }
  return false;
}

function removePUA(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const cp = str.codePointAt(i);
    if (cp < 0xE000 || cp > 0xF8FF) {
      result += str[i];
    }
  }
  return result;
}

const srcDir = path.join(process.cwd(), 'src');
const files = walkDir(srcDir);
let fixed = 0;

console.log(`扫描 ${files.length} 个文件...`);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (hasPUA(content)) {
    const clean = removePUA(content);
    fs.writeFileSync(file, clean, 'utf8');
    console.log(`✅ ${path.relative(srcDir, file)}`);
    fixed++;
  }
}

console.log(`\n修复完成: ${fixed}/${files.length} 个文件`);
