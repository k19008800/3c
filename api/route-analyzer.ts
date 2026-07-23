import fs from 'fs';
import path from 'path';

const API_DIR = path.join(__dirname, 'src');
const ROUTES_DIR = path.join(API_DIR, 'routes');
const OUTPUT_DIR = path.join(__dirname, '..', '3cloud', 'PERF-ANALYSIS');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'backend-modules.json');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface RouteInfo {
  method: string;
  url: string;
  auth: 'public' | 'user' | 'admin' | 'agent';
  line: number;
}

interface DatabaseAccess {
  tables: string[];
  operations: {
    reads: number;
    writes: number;
  };
}

interface RedisOperation {
  operation: string;
  key: string;
}

interface ModuleAnalysis {
  file: string;
  routes: RouteInfo[];
  database: DatabaseAccess;
  redis: RedisOperation[];
  performanceIssues: string[];
  stats: {
    lineCount: number;
    sizeBytes: number;
    routeCount: number;
  };
}

interface FullAnalysis {
  metadata: {
    analyzedAt: string;
    totalFiles: number;
    totalRoutes: number;
  };
  modules: ModuleAnalysis[];
}

// 主分析函数
async function analyzeAllRoutes(): Promise<FullAnalysis> {
  console.log('开始分析3cloud API路由...');
  console.log(`路由目录: ${ROUTES_DIR}`);
  
  const analysis: FullAnalysis = {
    metadata: {
      analyzedAt: new Date().toISOString(),
      totalFiles: 0,
      totalRoutes:与本初.并行; // 初始化
      totalRoutes: 0
    },
    modules: []
  };
  
  // 分析所有路由文件
  await analyzeRoutesDirectory(ROUTES_DIR, analysis);
  
  // 保存结果
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2));
  console.log(`\n分析完成！`);
  console.log(`共分析 ${analysis.metadata.totalFiles} 个文件`);
  console.log(`发现 ${analysis.metadata.totalRoutes} 个路由端点`);
  console.log(`结果已保存至: ${OUTPUT_FILE}`);
  
  return analysis;
}

// 递归分析路由目录
async function analyzeRoutesDirectory(dirPath: string, analysis: FullAnalysis): Promise<void> {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // 递归分析子目录
      await analyzeRoutesDirectory(fullPath, analysis);
    } else if (item.endsWith('.ts') || item.endsWith('.js')) {
      // 分析路由文件
      await analyzeRouteFile(fullPath, analysis);
    }
  }
}

// 分析单个路由文件
async function analyzeRouteFile(filePath: string, analysis: FullAnalysis): Promise<void> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(API_DIR, filePath);
    
    console.log(`分析: ${relativePath}`);
    
    // 提取路由信息
    const routes = extractRoutes(content);
    const dbAccess = extractDatabaseAccess(content);
    const redisOps = extractRedisOperations(content);
    const perfIssues = checkPerformanceIssues(content);
    
    if (routes.length > 0 || dbAccess.tables.length > 0) {
      const moduleInfo: ModuleAnalysis = {
        file: relativePath,
        routes,
        database: dbAccess,
        redis: redisOps,
        performanceIssues: perfIssues,
        stats: {
          lineCount: content.split('\n').length,
          sizeBytes: content.length,
          routeCount: routes.length
        }
      };
      
      analysis.modules.push(moduleInfo);
      analysis.metadata.totalFiles++;
      analysis.metadata.totalRoutes += routes.length;
    }
    
  } catch (error) {
    console.error(`分析文件 ${filePath} 时出错:`, error instanceof Error ? error.message : String(error));
  }
}

// 提取路由定义
function extractRoutes(content: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // 匹配路由定义模式
  const patterns = [
    // app.route({ method: 'GET', url: '/path', ... })
    /app\.route\s*\(\s*{[\s\S]*?method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)['"`][\s\S]*?url\s*:\s*['"`]([^'"`]+)['"`]/g,
    // app.get('/path', ...)
    /app\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // fastify.get('/path', ...)
    /fastify\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi
  ];
  
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      let method: string, url: string;
      
      if (match[0].includes('app.route')) {
        method = match[1].toUpperCase();
        url = match[2];
      } else {
        method = match[1].toUpperCase();
        url = match[2];
      }
      
      // 提取认证信息
      const authType = extractAuthType(content, match.index);
      
      routes.push({
        method,
        url,
        auth: authType,
        line: getLineNumber(content, match.index)
      });
    }
  }
  
  return routes;
}

// 提取认证类型
function extractAuthType(content: string, startIndex: number): 'public' | 'user' | 'admin' | 'agent' {
  const searchWindow = content.substring(
    Math.max(0, startIndex - 300),
    Math.min(content.length, startIndex + 300)
  );
  
  if (/requiresAgent\s*:\s*true/.test(searchWindow)) return 'agent';
  if (/requiresAdmin\s*:\s*true/.test(searchWindow)) return 'admin';
  if (/requiresAuth\s*:\s*true/.test(searchWindow)) return 'user';
  if (/authRequired\s*:\s*true/.test(searchWindow)) return 'user';
  if (/preHandler\s*:\s*\[[^\]]*authenticate[^\]]*\]/.test(searchWindow)) return 'user';
  
  return 'public';
}

// 提取数据库访问
function extractDatabaseAccess(content: string): DatabaseAccess {
  const tables = new Set<string>();
  const operations = {
    reads: 0,
    writes: 0
  };
  
  // 查找Drizzle ORM查询
  const drizzlePatterns = [
    /db\.query\.(\w+)\.(findMany|findFirst|findUnique)/g,
    /db\.query\.(\w+)\.(create|update|delete|upsert)/g,
    /db\.query\.(\w+)\.(count)/g
  ];
  
  // 查找原始SQL
  const sqlPatterns = [
    /SELECT.*FROM\s+(\w+)/gi,
    /INSERT\s+INTO\s+(\w+)/gi,
    /UPDATE\s+(\w+)/gi,
    /DELETE\s+FROM\s+(\w+)/gi
  ];
  
  for (const pattern of drizzlePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const tableName = match[1];
      const operation = match[2];
      
      if (tableName) {
        tables.add(tableName);
        
        if (operation.includes('find') || operation === 'count') {
          operations.reads++;
        } else {
          operations.writes++;
        }
      }
    }
  }
  
  for (const pattern of sqlPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const tableName = match[1];
      if (tableName) {
        tables.add(tableName);
        
        const sql = match[0].toLowerCase();
        if (sql.includes('select')) {
          operations.reads++;
        } else {
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
function extractRedisOperations(content: string): RedisOperation[] {
  const operations: RedisOperation[] = [];
  
  const patterns = [
    /redis\.(get|set|del|hget|hset|incr|decr|expire|ttl)\s*\([^)]*['"`]([^'"`]+)['"`]/g,
    /await\s+redis\.(get|set|del|hget|hset)/g
  ];
  
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const op = match[1];
      const key = match[2] || 'pattern_not_extracted';
      
      operations.push({
        operation: op,
        key
      });
    }
  }
  
  return operations;
}

// 检查性能问题
function checkPerformanceIssues(content: string): string[] {
  const issues: string[] = [];
  
  // 检查大查询
  if (content.includes('.findMany()') && !content.includes('LIMIT') && !content.includes('take(')) {
    issues.push('unlimited_findmany_query');
  }
  
  // 检查N+1模式
  if (content.includes('.then') && content.includes('.map') && 
      (content.includes('.findFirst') || content.includes('.findUnique'))) {
    issues.push('potential_nplus1_query');
  }
  
  // 检查无索引排序
  if (content.includes('ORDER BY') && !content.includes('INDEX') && 
      !content.includes('index') && content.includes('createdAt')) {
    issues.push('order_by_without_index');
  }
  
  // 检查高LIMIT值
  const limitMatch = /LIMIT\s+(\d+)/i.exec(content);
  if (limitMatch && parseInt(limitMatch[1]) > 1000) {
    issues.push('large_limit_value');
  }
  
  return issues;
}

// 获取行号
function getLineNumber(content: string, index: number): number {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

// 执行分析
analyzeAllRoutes().catch(console.error);