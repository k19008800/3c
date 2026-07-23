const fs = require('fs');
const path = require('path');

function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    // 提取 API 调用
    const apiCalls = [];
    const apiRegex = /(api\.|fetch\(|axios\.|useQuery|useMutation)/g;
    let match;
    
    // 提取 useEffect 依赖数组
    const useEffectDeps = [];
    const useEffectRegex = /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([\s\S]*?)\]\)/g;
    
    // 提取 useState/useReducer
    const stateHooks = [];
    const stateRegex = /(useState|useReducer)\(/g;
    
    // 提取组件导入
    const componentImports = [];
    const importRegex = /import\s+.*?\s+from\s+['"](\.\.?\/.*?)['"]/g;
    
    // 分析渲染问题
    const renderIssues = [];
    
    // 检查大列表渲染
    if (content.includes('.map(') && content.includes('key=')) {
        const mapCount = (content.match(/\.map\(/g) || []).length;
        if (mapCount > اض) {
            renderIssues.push(`大列表渲染 (${mapCount} 个 map 调用)`);
        }
    }
    
    // 检查是否有 React.memo 包装
    const hasMemo = content.includes('React.memo') || content.includes('memo(');
    
    // 检查是否有性能相关优化
    const hasUseMemo = content.includes('useMemo(');
    const hasUseCallback = content.includes('useCallback(');
    
    return {
        lineCount,
        apiCalls: Array.from(content.matchAll(apiRegex)).map(m => m[0]),
        useEffectDeps: Array.from(content.matchAll(useEffectRegex)).map(m => m[1]),
        stateHooks: Array.from(content.matchAll(stateRegex)).map(m => m[0]),
        componentImports: Array.from(content.matchAll(importRegex)).map(m => m[1]),
        renderIssues,
        hasMemo,
        hasUseMemo,
        hasUseCallback,
        isLargeComponent: lineCount > 500
    };
}

// 遍历目录
function analyzeDirectory(dirPath, basePath) {
    const results = [];
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            results.push(...analyzeDirectory(fullPath, basePath));
        } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
            try {
                const relativePath = path.relative(basePath, fullPath);
                const analysis = analyzeFile(fullPath);
                results.push({
                    file: relativePath,
                    ...analysis
                });
            } catch (error) {
                console.error(`Error analyzing ${fullPath}:`, error.message);
            }
        }
    }
    
    return results;
}

// 主分析
function main() {
    const webPath = path.join(__dirname, 'src');
    const pagesPath = path.join(webPath, 'pages');
    const componentsPath = path.join(webPath, 'components');
    
    console.log('开始分析 pages 目录...');
    const pagesAnalysis = analyzeDirectory(pagesPath, pagesPath);
    
    console.log('开始分析 components 目录...');
    const componentsAnalysis = analyzeDirectory(componentsPath, componentsPath);
    
    // 生成报告
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            totalPages: pagesAnalysis.length,
            totalComponents: componentsAnalysis.length,
            largeComponents: [...pagesAnalysis, ...componentsAnalysis].filter(c => c.isLargeComponent).length
        },
        pages: pagesAnalysis,
        components: componentsAnalysis,
        performanceIssues: {
            largeComponents: [...pagesAnalysis, ...componentsAnalysis]
                .filter(c => c.isLargeComponent)
                .map(c => ({ file: c.file, lineCount: c.lineCount })),
            missingMemo: componentsAnalysis.filter(c => !c.hasMemo && c.lineCount > 100),
            potentialRenderIssues: [...pagesAnalysis, ...componentsAnalysis]
                .filter(c => c.renderIssues.length > 0)
        }
    };
    
    // 写入报告
    const reportPath = path.join(__dirname, '..', 'PERF-ANALYSIS', 'frontend-modules.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`报告已保存到: ${reportPath}`);
}

if (require.main === module) {
    main();
}