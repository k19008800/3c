const fs = require('fs');
const path = require('path');

function findNPlus1Queries(dir) {
    const results = [];
    const fileExtensions = ['.ts', '.js'];
    
    function scanDirectory(currentPath) {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            
            if (item.isDirectory()) {
                // 跳过node_modules等目录
                if (!['node_modules', '.git', 'dist', 'build'].includes(item.name)) {
                    scanDirectory(fullPath);
                }
            } else if (fileExtensions.some(ext => item.name.endsWith(ext))) {
                analyzeFile(fullPath);
            }
        }
    }
    
    function analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // 检测常见的N+1查询模式
                if (line.includes('for') && line.includes('of') && lines[i+1] && 
                    (lines[i+1].includes('await') || lines[i+2]?.includes('await'))) {
                    // 检查是否在循环中查询数据库
                    const context = lines.slice(Math.max(0, i-2), Math.min(lines.length, i+5));
                    const hasDbQuery = context.some(l => 
                        l.includes('db.') || 
                        l.includes('.find') || 
                        l.includes('.query') || 
                        l.includes('SELECT') ||
                        l.includes('INSERT') ||
                        l.includes('UPDATE') ||
                        l.includes('DELETE')
                    );
                    
                    if (hasDbQuery) {
                        results.push({
                            file: filePath,
                            line: i + 1,
                            code: line.trim(),
                            context: context.join('\n')
                        });
                    }
                }
                
                // 检测forEach中的await
                if (line.includes('.forEach') && line.includes('async')) {
                    const context = lines.slice(Math.max(0, i-2), Math.min(lines.length, i+3));
                    results.push({
                        file: filePath,
                        line: i + 1,
                        code: line.trim(),
                        context: context.join('\n'),
                        type: 'forEach with async'
                    });
                }
            }
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }
    
    scanDirectory(dir);
    return results;
}

// 扫描api目录
console.log('Scanning for N+1 query patterns...');
const apiDir = path.join(__dirname, 'api');
const nplus1Results = findNPlus1Queries(apiDir);

console.log('\n=== N+1 QUERY PATTERNS FOUND ===');
nplus1Results.forEach((result, index) => {
    console.log(`\n${index + 1}. File: ${result.file}`);
    console.log(`   Line: ${result.line}`);
    console.log(`   Code: ${result.code}`);
    console.log(`   Type: ${result.type || 'for...of with await'}`);
});

// 保存结果
fs.writeFileSync('nplus1_report.json', JSON.stringify(nplus1Results, null, 2));
console.log(`\nFound ${nplus1Results.length} potential N+1 query patterns`);
console.log('Report saved to nplus1_report.json');