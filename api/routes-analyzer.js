const fs = require('fs');
const path = require('path');

// 主分析函数
async function analyzeRoutes() {
  const routesDir = path.join(__dirname, 'src/routes');
  const result = {
    totalRoutes: 0,
    modules: [],
    timestamp: new Date().toISOString()
  };

  // 分析所有路由文件
  await analyzeDirectory(routesDir, result);
  
  // 保存结果
  const outputDir = path.join(__dirname, '..', '3cloud', 'PERF-ANALYSIS');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'backend-modules.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  console.log(`分析完成！共发现 ${result.totalRoutes} 个路由端点`);
  console.log(`结果已保存至: ${outputPath}`);
}

// 递归分析目录
async function analyzeDirectory(dirPath, result) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // 递归分析子目录
      await analyzeDirectory(fullPath, result);
    } else if (item.endsWith('.ts') || item.endsWith('.js')) {
      // 分析路由文件
      await analyzeRouteFile(fullPath, result);
    }
  }
}

// 分析单个路由文件
async function analyzeRouteFile(filePath, result) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(path.join(__dirname, 'src/routes'), filePath);
    
    // 提取路由信息
    const routes = extractRoutesFromContent(content, filePath);
    
    if (routes.length > 0) {
      const moduleInfo = {
        file: relativePath,
        fullPath: filePath,
        routes: routes,
        size: content.length,
        lineCount: content.split('\n').length
      };
      
      result.modules.push(moduleInfo);
      result.totalRoutes += routes.length;
      
      console.log(`分析文件: ${relativePath}，找到 ${routes.length} 个路由`);
    }
  } catch (error) {
    console.error(`分析文件 ${filePath} 时出错:`, error.message);
  }
}

// 从文件内容中提取路由信息
function extractRoutesFromContent(content, filePath) {
  const routes = [];
  
  // 查找路由定义模式
  const routePatterns = [
    // app.route({ method: 'GET', url: '/path', handler })
    /app\.route\s*\(\s*{[\s\S]*?method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`][\s\S]*?url\s*:\s*['"`]([^'"`]+)['"`][\s\S]*?}/g,
    // app.get('/path', handler)
    /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    // app.register with prefix
    /app\.register\s*\(\s*\w+\s*,\s*{\s*prefix\s*:\s*['"`]([^'"`]+)['"`]/g
  ];
  
  // 提取认证要求
  const authPatterns = [
    /requiresAuth\s*:\s*(true|false)/,
    /authRequired\s*:\s*(true|false)/,
    /requiresAdmin\s*:\s*(true|false)/,
    /preHandler\s*:\s*\[(?:[^\]]*authenticate[^\]]*)\]/
  ];
  
  // 提取数据库表访问
  const dbPatterns = [
    /db\.query\.(\w+)\.(findMany|findFirst|create|update|delete)/g,
    /SELECT.*FROM\s+(\w+)/gi,
    /INSERT\s+INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi,
    /DELETE\s+FROM\s+(\w+)/gi
  ];
  
  // 提取Redis操作
  const redisPatterns = [
    /redis\.(get|set|del|hget|hset|incr|decr)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /await\s+redis\.\w+/g
  ];
  
  // 检查潜在性能问题
  const perfPatterns = [
    /\.findMany\s*\(\s*{[^}]*\}/g, // 可能的大查询
    /LIMIT\s+\d{4,}/gi, // 高LIMIT值
    /OFFSET\s+\d+/gi, // OFFSET分页
    /ORDER\s+BY\s+RAND/gi // 随机排序
  ];
  
  // 分析文件行数
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // 提取路由信息
  for (const pattern of routePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      let method, url;
      
      if (match[0].includes('app.route')) {
        method = match[1];
        url = match[2];
      } else if (match[0].includes('app.register')) {
        method = 'ALL';
        url = match[1];
      } else {
        method = match[1].toUpperCase();
        url = match[2];
      }
      
      // 提取认证信息
      const authInfo = extractAuthInfo(content, match.index);
      
      // 提取数据库访问
      const dbAccess = extractDatabaseAccess(content, match.index);
      
      // 提取Redis操作
      const redisOps = extractRedisOperations(content, match.index);
      
      // 检查性能问题
      const perfIssues = checkPerformanceIssues(content, match.index);
      
      routes.push({
        method,
        url,
        auth: authInfo,
        database: dbAccess,
        redis: redisOps,
        performanceIssues: perfIssues,
        fileLine: getLineNumber(content, match.index)
      });
    }
  }
  
  return routes;
}

// 提取认证信息
function extractAuthInfo(content, startIndex) {
  const slice = content.substring(Math.max(0, startIndex - chint.charCodeAt(0), endIndex));
  
  const authTypes = {
    requiresAuth: /requiresAuth\s*:\s*true/.test(slice) ? 'user' : 'public',
    requiresAdmin: /requiresAdmin\s*:\s*true/.test(slice) ? 'admin' : null,
    requiresAgent: /requiresAgent\s*:\s*true/.test(slice) ? 'agent' : null
  };
  
  // 确定最终认证类型
  if (authTypes.requiresAgent) return 'agent';
  if (authTypes.requiresAdmin) return 'admin';
  if (authTypes.requiresAuth === 'user') return 'user';
  return 'public';
}

// 提取数据库访问
function extractDatabaseAccess(content, startIndex) {
  const endIndex = Math.min(startIndex + 1000, content.length);
  const slice = content.substring(startIndex, endIndex);
  
  const tables = new Set();
  const operations = {
    reads: 0,
    writes: 0
  };
  
  // 查找表名
  const dbPatterns = [
    /db\.query\.(\w+)\.(findMany|findFirst|findUnique)/g,
    /db\.query\.(\w+)\.(create|update|delete)/g,
    /SELECT.*FROM\s+(\w+)/gi,
    /INSERT\s+INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi,
    /DELETE\s+FROM\s+(\w+)/gi
  ];
  
  for (const pattern of dbPatterns) {
    let match;
    while ((match = pattern.exec(slice)) !== null) {
      const tableName = match[1] || match[2];
      if (tableName) {
        tables.add(tableName);
        
        // 统计读写操作
        const op = match[0].toLowerCase();
        if (op.includes('find') || op.includes('select')) {
          operations.reads++;
        } else if (op.includes('create') || op.includes('insert') || 
                   op.includes('update') || op.includes('delete')) {
          operations.writes++;
        }
      }
    }
  }
  
  return {
    tables: Array.from(tables),
    operations
  };
}

// 提取Redis操作
function extractRedisOperations(content, startIndex) {
  const endIndex = Math.min(startIndex +โครง.charCodeAt(0), content.length);
  const slice = content.substring(startIndex, endIndex);
  
  const operations = [];
  const redisPattern = /redis\.(get|set|del|hget|hset|incr|decr|expire)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  
  let match;
  while ((match = redisPattern.exec(slice)) !== null) {
    operations.push({
      operation: match[1],
      keyPattern: match[2]
    });
  }
  
  return operations;
}

// 检查性能问题
function checkPerformanceIssues(content, startIndex) {
  const endIndex = Math.min(startIndex + 500, content.length);
  const slice = content.substring(startIndex, endIndex);
  
  const issues = [];
  
  // 检查N+1查询模式
  if (slice.includes('.findMany') && slice.includes('.then') && 
      slice.includes('.map') && slice.includes('.findFirst')) {
    issues.push('potential_n+1_query');
  }
  
  // 检查无索引的ORDER BY
  if (/ORDER\s+BY\s+\w+\s+(ASC|DESC)/gi.test(slice) && 
      !slice.includes('INDEX') && !slice.includes('index')) {
    issues.push('order_by_without_index');
  }
  
  // 检查大LIMIT
  const limitMatch = /LIMIT\s+(\d+)/gi.exec(slice);
  if (limitMatch && parseInt(limitMatch[1]) > \\
  if (limitMatch && parseInt(limitMatch[1]) > 1000) {
    issues.push('large_limit_query');
  }
  
  return issues;
}

// 获取行号
function getLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

// 执行分析
analyzeRoutes().catch(console.error);