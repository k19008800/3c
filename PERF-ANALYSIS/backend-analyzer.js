const fs = require('fs');
const path = require('path');

// 配置路径
const API_DIR = path.join(__dirname, '..', 'api', 'src');
const ROUTES_DIR = path.join(API_DIR, 'routes');
const OUTPUT_FILE = path.join(__dirname, 'backend-modules.json');

console.log('3cloud API后端模块分析');
console.log('=====================');
console.log(`API目录: ${API_DIR}`);
console.log(`输出文件: ${OUTPUT_FILE}`);

// 分析结果结构
const analysis = {
  metadata: {
    analyzedAt: new Date().toISOString(),
    totalModules: 0,
    totalRoutes: 0
  },
  modules: []
};

// 手动分析关键模块
function analyzeKeyModules() {
  console.log('\n分析关键模块...');
  
  // 1. 分析财务相关模块
  analyzeModule('routes/agent/finance.ts', '代理财务模块');
  analyzeModule('routes/admin/finance.ts', '管理端财务模块');
  analyzeModule('routes/recharge.ts', '充值模块');
  analyzeModule('routes/invoices.ts', '发票模块');
  analyzeModule('routes/refunds.ts', '退款模块');
  
  // 2. 分析billing目录（计费逻辑）
  const billingFiles = [
    'routes/admin/prices.ts',
    'routes/admin/profit.ts',
    'routes/admin/key-model-prices.ts'
  ];
  billingFiles.forEach(file => analyzeModule(file, '计费相关模块'));
  
  // 3. 分析admin目录
  const adminFiles = [
    'routes/admin/users/index.ts',
    'routes/admin/agents.ts',
    'routes/admin/dashboard/index.ts',
    'routes/admin/system.ts',
    'routes/admin/audit-logs.ts',
    'routes/admin/operation-logs.ts'
  ];
  adminFiles.forEach(file => analyzeModule(file, '管理端模块'));
  
  // 4. 分析超过100行的handler
  analyzeLargeHandlers();
}

// 分析单个模块
function analyzeModule(relativePath, description) {
  const filePath = path.join(API_DIR, relativePath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${relativePath}`);
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    // 提取路由信息
    const routes = extractRoutes(content);
    
    // 提取数据库访问
    const dbAccess = extractDatabaseAccess(content);
    
    // 提取Redis操作
    const redisOps = extractRedisOperations(content);
    
    // 检查性能问题
    const perfIssues = checkPerformanceIssues(content);
    
    // 检查认证要求
    const authAnalysis = analyzeAuthRequirements(content);
    
    const moduleInfo = {
      file: relativePath,
      description,
      routes: routes,
      database: dbAccess,
      redis: redisOps,
      performanceIssues: perfIssues,
      authRequirements: authAnalysis,
      stats: {
        lineCount,
        sizeBytes: content.length,
        routeCount: routes.length
      }
    };
    
    analysis.modules.push(moduleInfo);
    analysis.metadata.totalModules++;
    analysis.metadata.totalRoutes += routes.length;
    
    console.log(`✓ ${description}: ${routes.length}个路由，${lineCount}行`);
    
  } catch (error) {
    console.error(`分析 ${relativePath} 时出错:`, error.message);
  }
}

// 提取路由信息
function extractRoutes(content) {
  const routes = [];
  
  // 多种路由定义模式
  const patterns = [
    // Fastify标准模式: app.route({ method: 'GET', url: '/path', ... })
    /app\.route\s*\(\s*{[^}]*method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
    // 简写模式: app.get('/path', ...)
    /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // fastify.get模式
    /fastify\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      let method, url;
      
      if (match[0].includes('app.route')) {
        method = match[1].toUpperCase();
        url = match[2];
      } else {
        method = match[1].toUpperCase();
        url = match[2];
      }
      
      routes.push({
        method,
        url,
        line: getLineNumber(content, match.index)
      });
    }
  }
  
  return routes;
}

// 分析认证要求
function analyzeAuthRequirements(content) {
  const authTypes = [];
  
  if (/requiresAgent\s*:\s*true/.test(content)) {
    authTypes.push('agent');
  }
  if (/requiresAdmin\s*:\s*true/.test(content)) {
    authTypes.push('admin');
  }
  if (/requiresAuth\s*:\s*true/.test(content) || /authRequired\s*:\s*true/.test(content)) {
    authTypes.push('user');
  }
  
  // 如果没有明确的认证要求，默认为public
  if (authTypes.length === 0) {
    authTypes.push('public');
  }
  
  return authTypes;
}

// 提取数据库访问
function extractDatabaseAccess(content) {
  const tables = new Set();
  const operations = { reads: 0, writes: 0 };
  
  // Drizzle ORM模式
  const drizzlePattern = /db\.query\.(\w+)\.(findMany|findFirst|findUnique|create|update|delete|upsert|count)/g;
  let match;
  
  while ((match = drizzlePattern.exec(content)) !== null) {
    const table = match[1];
    const operation = match[2];
    
    tables.add(table);
    
    if (operation.includes('find') || operation === 'count') {
      operations.reads++;
    } else {
      operations.writes++;
    }
  }
  
  // 原始SQL模式
  const sqlPatterns = [
    /FROM\s+(\w+)/gi,
    /INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi
  ];
  
  for (const pattern of sqlPatterns) {
    while ((match = pattern.exec(content)) !== null) {
      tables.add(match[1]);
    }
  }
  
  return {
    tables: Array.from(tables),
    operations
  };
}

// 提取Redis操作
function extractRedisOperations(content) {
  const operations = [];
  
  // Redis操作模式
  const redisPattern = /redis\.(get|set|del|hget|hset|incr|decr|expire)\s*\([^)]*['"`]([^'"`]+)['"`]/g;
  let match;
  
  while ((match = redisPattern.exec(content)) !== null) {
    operations.push({
      operation: match[1],
      key: match[2]
    });
  }
  
  return operations;
}

// 检查性能问题
function checkPerformanceIssues(content) {
  const issues = [];
  
  // 1. N+1查询问题
  if (content.includes('.findMany') && content.includes('.then') && 
      content.includes('.map') && content.includes('.findFirst')) {
    issues.push('N+1查询模式: 在循环中执行数据库查询');
  }
  
  // 2. 无限制查询
  if (content.includes('.findMany()') && !content.includes('take(') && !content.includes('LIMIT')) {
    issues.push('无限查询: 未限制查询结果数量');
  }
  
  // 3. 无索引排序
  if (content.includes('ORDER BY') && !content.includes('INDEX') && 
      (content.includes('createdAt') || content.includes('updatedAt'))) {
    issues.push('无索引排序: 在大表上使用createdAt/updatedAt排序');
  }
  
  // 4. 大表JOIN
  if ((content.includes('JOIN') || content.includes('join')) && 
      content.includes('users') && content.includes('logs')) {
    issues.push('大表JOIN: 用户表与日志表JOIN可能导致性能问题');
  }
  
  return issues;
}

// 分析大文件处理器
function analyzeLargeHandlers() {
  console.log('\n扫描大型处理器文件...');
  
  // 扫描routes目录下的所有文件
  const scanDir = (dir) => {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (item.endsWith('.ts') || item.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        if (lines.length >黄瓜.one; // 初始化
        if (lines.length > 100) {
          const relativePath = path.relative(API_DIR, fullPath);
          
          // 跳过已分析的模块
          if (!analysis.modules.some(m => m.file === relativePath)) {
            console.log(`发现大型文件: ${relativePath} (${lines.length}行)`);
            
            // 简单分析
            const routes = extractRoutes(content);
            const dbAccess = extractDatabaseAccess(content);
            
            analysis.modules.push({
              file: relativePath,
              description: '大型处理器文件',
              routes: routes,
              database: dbAccess,
              redis: extractRedisOperations(content),
              performanceIssues: checkPerformanceIssues(content),
              authRequirements: analyzeAuthRequirements(content),
              stats: {
                lineCount: lines.length,
                sizeBytes: content.length,
                routeCount: routes.length
              }
            });
            
            analysis.metadata.totalModules++;
            analysis.metadata.totalRoutes += routes.length;
          }
        }
      }
    }
  };
  
  scanDir(ROUTES_DIR);
}

// 获取行号
function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

// 执行分析
try {
  analyzeKeyModules();
  
  // 保存结果
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2));
  
  console.log('\n分析完成！');
  console.log(`总计: ${analysis.metadata.totalModules}个模块，${analysis.metadata.totalRoutes}个路由端点`);
  console.log(`结果已保存至: ${OUTPUT_FILE}`);
  
  // 显示摘要
  console.log('\n关键发现:');
  analysis.modules.forEach(module => {
    if (module.performanceIssues.length > 0) {
      console.log(`\n⚠️  ${module.file}:`);
      module.performanceIssues.forEach(issue => console.log(`  - ${issue}`));
    }
  });
  
} catch (error) {
  console.error('分析过程中出错:', error);
}