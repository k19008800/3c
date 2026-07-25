const fs = require('fs');
const path = require('path');

function findRedisPatterns(dir) {
    const results = [];
    const fileExtensions = ['.ts', '.js'];
    
    function scanDirectory(currentPath) {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            
            if (item.isDirectory()) {
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
                
                // 检测Redis KEYS命令（阻塞操作）
                if (line.includes('KEYS') || line.includes('.keys(')) {
                    results.push({
                        file: filePath,
                        line: i + 1,
                        code: line.trim(),
                        issue: 'Potentially blocking Redis KEYS command',
                        severity: 'HIGH',
                        recommendation: 'Replace with SCAN command for production use'
                    });
                }
                
                // 检测Redis模式匹配问题
                if ((line.includes('redis.') || line.includes('Redis')) && 
                    line.includes('*') && !line.includes('SCAN')) {
                    results.push({
                        file: filePath,
                        line: i + 1,
                        code: line.trim(),
                        issue: 'Redis pattern matching without SCAN',
                        severity: 'MEDIUM',
                        recommendation: 'Use SCAN iterator for pattern matching'
                    });
                }
                
                // 检测大键操作
                if (line.includes('HGETALL') && lines[i-1] && lines[i-1].includes('large')) {
                    results.push({
                        file: filePath,
                        line: i + 1,
                        code: line.trim(),
                        issue: 'Potential large HASH retrieval',
                        severity: 'MEDIUM',
                        recommendation: 'Consider using HSCAN or splitting large hashes'
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

function findMemoryLeaks(dir) {
    const results = [];
    const fileExtensions = ['.ts', '.js'];
    
    function scanDirectory(currentPath) {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item.name);
            
            if (item.isDirectory()) {
                if (!['node_modules', '.git', 'dist', 'build'].includes(item.name)) {
                    scanDirectory(fullPath);
                }
            } else if (fileExtensions.some(ext => item.name.endsWith(ext))) {
                analyzeMemoryFile(fullPath);
            }
        }
    }
    
    function analyzeMemoryFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // 检测setTimeout/setInterval没有清理
                if (line.includes('setTimeout') || line.includes('setInterval')) {
                    const hasClear = content.includes('clearTimeout') || content.includes('clearInterval');
                    const hasVariable = line.match(/set(Timeout|Interval)\s*\(/);
                    
                    if (hasVariable && !hasClear) {
                        results.push({
                            file: filePath,
                            line: i + 1,
                            code: line.trim(),
                            issue: 'Timer without cleanup',
                            severity: 'MEDIUM',
                            recommendation: 'Store timer ID and clear in cleanup phase'
                        });
                    }
                }
                
                // 检测事件监听器没有清理
                if ((line.includes('.on(') || line.includes('.addEventListener(')) && 
                    !content.includes('.removeListener') && !content.includes('.removeEventListener')) {
                    results.push({
                        file: filePath,
                        line: i + 1,
                        code: line.trim(),
                        issue: 'Event listener without cleanup',
                        severity: 'MEDIUM',
                        recommendation: 'Add cleanup logic to remove listeners'
                    });
                }
                
                // 检测可能的内存泄漏模式
                if (line.includes('cache') && line.includes('=') && line.includes('{}')) {
                    const nextLines = lines.slice(i, Math.min(lines.length, i + 10));
                    const hasExpiry = nextLines.some(l => l.includes('expire') || l.includes('TTL'));
                    if (!hasExpiry) {
                        results.push({
                            file: filePath,
                            line: i + 1,
                            code: line.trim(),
                            issue: 'Cache without expiry',
                            severity: 'LOW',
                            recommendation: 'Add TTL or LRU eviction policy'
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error analyzing ${filePath}:`, error.message);
        }
    }
    
    scanDirectory(dir);
    return results;
}

console.log('Scanning for Redis issues...');
const apiDir = path.join(__dirname, 'api');
const redisResults = findRedisPatterns(apiDir);
const memoryResults = findMemoryLeaks(apiDir);

console.log('\n=== REDIS ISSUES FOUND ===');
redisResults.forEach((result, index) => {
    console.log(`\n${index + 1}. File: ${result.file}`);
    console.log(`   Line: ${result.line}`);
    console.log(`   Issue: ${result.issue}`);
    console.log(`   Severity: ${result.severity}`);
    console.log(`   Code: ${result.code}`);
});

console.log('\n=== MEMORY LEAK PATTERNS FOUND ===');
memoryResults.forEach((result, index) => {
    console.log(`\n${index + 1}. File: ${result.file}`);
    console.log(`   Line: ${result.line}`);
    console.log(`   Issue: ${result.issue}`);
    console.log(`   Severity: ${result.severity}`);
    console.log(`   Code: ${result.code}`);
});

// 保存结果
fs.writeFileSync('redis_report.json', JSON.stringify(redisResults, null, 2));
fs.writeFileSync('memory_report.json', JSON.stringify(memoryResults, null, 2));

console.log(`\nFound ${redisResults.length} Redis issues`);
console.log(`Found ${memoryResults.length} memory leak patterns`);