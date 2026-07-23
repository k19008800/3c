const fs = require('fs');
const path = require('path');

function analyzeComponents() {
  const srcDir = path.join(__dirname, 'src');
  const componentsDir = path.join(srcDir, 'components');
  const pagesDir = path.join(srcDir, 'pages');
  
  const allComponents = [];
  
  function scanDirectory(dir, relativePath = '') {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relativeFilePath = path.join(relativePath, file);
      
      if (fs.statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath, relativeFilePath);
      } else if (file.endsWith('.tsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        // 检查是否是函数组件
        const isFunctionComponent = content.match(/export\s+(default\s+)?function\s+\w+\s*\(/);
        const isArrowComponent = content.match(/export\s+(default\s+)?const\s+\w+\s*=\s*\([^)]*\)\s*=>/);
        const isMemoComponent = content.includes('React.memo');
        
        if (isFunctionComponent || isArrowComponent) {
          // 估算组件大小（行数）
          const componentSize = lines.length;
          
          // 检查是否是纯展示组件
          const isPure = checkIfPureComponent(content);
          
          // 检查渲染频率启发式
          const renderFrequency = estimateRenderFrequency(content, file);
          
          allComponents.push({
            path: relativeFilePath,
            fullPath: fullPath,
            size: componentSize,
            isMemo: isMemoComponent,
            isPure: isPure,
            renderFrequency: renderFrequency,
            priority: calculatePriority(renderFrequency, componentSize)
          });
        }
      }
    }
  }
  
  function checkIfPureComponent(content) {
    // 纯展示组件启发式检查
    const hasUseState = content.includes('useState(');
    const hasUseEffect = content.includes('useEffect(');
    const hasUseContext = content.includes('useContext(');
    const hasUseReducer = content.includes('useReducer(');
    const hasUseQuery = content.includes('useQuery(');
    const hasUseMutation = content.includes('useMutation(');
    
    // 如果有这些 hooks，可能不是纯展示组件
    return !(hasUseState || hasUseEffect || hasUseContext || hasUseReducer || hasUseQuery || hasUseMutation);
  }
  
  function estimateRenderFrequency(content, filename) {
    // 启发式估算渲染频率
    const name = filename.toLowerCase();
    
    if (name.includes('item') || name.includes('row') || name.includes('card') || 
        name.includes('cell') || name.includes('entry')) {
      return 'high'; // 列表项、表格行等高频率
    } else if (name.includes('button') || name.includes('input') || 
               name.includes('field') || name.includes('form')) {
      return 'medium'; // 表单字段中等频率
    } else if (name.includes('page') || name.includes('layout') || 
               name.includes('container') || name.includes('wrapper')) {
      return 'low'; // 页面容器低频率
    }
    
    return 'medium'; // 默认中等频率
  }
  
  function calculatePriority(frequency, size) {
    const freqScore = { high: 3, medium: 2, low: 1 };
    const sizeScore = size < 50 ? 1 : size < 100 ? 2 : 3;
    
    // 高渲染频率 + 大尺寸 = 高优先级
    if (frequency === 'high') return 'P1';
    if (frequency === 'medium' && size > 30) return 'P2';
    return 'P3';
  }
  
  // 扫描目录
  scanDirectory(componentsDir, 'components');
  scanDirectory(pagesDir, 'pages');
  
  // 过滤出未使用 memo 的组件
  const unmemoizedComponents = allComponents
    .filter(comp => !comp.isMemo)
    .sort((a, b) => {
      // 按优先级和大小排序
      const priorityOrder = { 'P1': 1, 'P2': 2, 'P3': 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || b.size - a.size;
    });
  
  console.log(`Total components found: ${allComponents.length}`);
  console.log(`Unmemoized components: ${unmemoizedComponents.length}`);
  console.log(`Already memoized: ${allComponents.length - unmemoizedComponents.length}`);
  
  // 输出 Top 50 高优先级组件
  const topComponents = unmemoizedComponents.slice(0, 50);
  
  console.log('\n=== Top 50 Components to Memoize ===');
  topComponents.forEach((comp, index) => {
    console.log(`${index + 1}. ${comp.path} (${comp.size} lines, ${comp.renderFrequency} freq, ${comp.priority})`);
  });
  
  return {
    total: allComponents.length,
    unmemoized: unmemoizedComponents.length,
    memoized: allComponents.length - unmemoizedComponents.length,
    topComponents: topComponents
  };
}

// 运行分析
const results = analyzeComponents();

// 将结果保存到文件
const outputPath = path.join(__dirname, 'src', 'components', 'memo-analysis.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.log(`\nAnalysis saved to: ${outputPath}`);