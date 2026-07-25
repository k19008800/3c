const fs = require('fs');
const path = require('path');

// 分析所有路由文件
function analyzeRoutes() {
  const routesDir = path.join(__dirname, 'api/src/routes');
  const allRoutes = [];
  
  // 主要路由文件（顶层）
  const mainRouteFiles = [
    'api-keys.ts',
    'auth-security.ts',
    'health.ts',
    'invoices.ts',
    'logs.ts',
    'models.ts',
    'notifications.ts',
    'operation-logs.ts',
    'playground.ts',
    'preferences.ts',
    'proxy.ts',
    'quick-connect.ts',
    'rate-limit-ws.ts',
    'real-name-file.ts',
    'real-name-ocr.ts',
    'recharge.ts',
    'redemption-gift.ts',
    'redemption-user.ts',
    'refunds.ts',
    'stats-usage.ts',
    'stats.ts',
    'user-quota.ts',
    'user-transactions.ts',
    'vendor-self.ts'
  ];
  
  // 分析一个文件的路由
  function analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const routes = [];
      
      // 匹配路由定义 - Fastify 风格
      const routeRegex = /app\.(get|post|put|patch|delete|head|options)\(['"]([^'"]+)['"]/g;
      
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const path = match[2];
        routes.push({ method, path });
      }
      
      return routes;
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
      return [];
    }
  }
  
  // 分析目录中的路由
  function analyzeDirectory(dirPath, relativePath = '') {
    const routes = [];
    
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 递归分析子目录
          const subRoutes = analyzeDirectory(fullPath, path.join(relativePath, file));
          routes.push(...subRoutes);
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
          // 分析路由文件
          const fileRoutes = analyzeFile(fullPath);
          routes.push(...fileRoutes.map(route => ({
            ...route,
            file: path.join(relativePath, file)
          })));
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error.message);
    }
    
    return routes;
  }
  
  // 开始分析
  console.log('Starting route analysis...');
  
  // 1. 分析顶层路由文件
  for (const file of mainRouteFiles) {
    const filePath = path.join(routesDir, file);
    if (fs.existsSync(filePath)) {
      const routes = analyzeFile(filePath);
      allRoutes.push(...routes.map(route => ({ ...route, file })));
    }
  }
  
  // 2. 分析子目录
  const subDirs = ['admin', 'agent', 'auth', 'proxy', 'public', 'redemption', 'user', 'vendor-self'];
  
  for (const dir of subDirs) {
    const dirPath = path.join(routesDir, dir);
    if (fs.existsSync(dirPath)) {
      const dirRoutes = analyzeDirectory(dirPath, dir);
      allRoutes.push(...dirRoutes);
    }
  }
  
  return allRoutes;
}

// 分析服务层
function analyzeServices() {
  const servicesDir = path.join(__dirname, 'api/src/services');
  const services = [];
  
  try {
    const files = fs.readdirSync(servicesDir);
    
    for (const file of files) {
      const fullPath = path.join(servicesDir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
        // 获取文件基本信息
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;
        
        services.push({
          name: file.replace('.ts', '').replace('.js', ''),
          file: file,
          lines: lines,
          size: stat.size
        });
      }
    }
    
    // 分析服务目录
    const serviceDirs = fs.readdirSync(servicesDir).filter(item => {
      const itemPath = path.join(servicesDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    for (const dir of serviceDirs) {
      const dirPath = path.join(servicesDir, dir);
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const fullPath = path.join(dirPath, file);
          const stat = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n').length;
          
          services.push({
            name: `${dir}/${file.replace('.ts', '').replace('.js', '')}`,
            file: path.join(dir, file),
            lines: lines,
            size: stat.size
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Error analyzing services:', error.message);
  }
  
  return services;
}

// 分析中间件
function analyzeMiddlewares() {
  const middlewareDir = path.join(__dirname, 'api/src/middleware');
  const middlewares = [];
  
  try {
    const files = fs.readdirSync(middlewareDir);
    
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const fullPath = path.join(middlewareDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;
        
        // 简单分析中间件功能
        let description = '';
        if (file.includes('auth')) description = '身份验证中间件';
        else if (file.includes('rate-limit')) description = '速率限制中间件';
        else if (file.includes('log')) description = '日志中间件';
        else if (file.includes('response')) description = '响应格式化中间件';
        else if (file.includes('idempotent')) description = '幂等性中间件';
        else if (file.includes('adminKeyAuth')) description = '管理员密钥验证中间件';
        else if (file.includes('disk-monitor')) description = '磁盘监控中间件';
        
        middlewares.push({
          name: file.replace('.ts', '').replace('.js', ''),
          file: file,
          lines: lines,
          description: description
        });
      }
    }
  } catch (error) {
    console.error('Error analyzing middlewares:', error.message);
  }
  
  return middlewares;
}

// 生成报告
function generateReport(routes, services, middlewares) {
  const report = [];
  
  report.push('# 3cloud 后端全量梳理报告');
  report.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
  report.push('');
  
  // 1. 路由清单
  report.push('## 1. 路由清单');
  report.push('');
  report.push('| 方法 | 路径 | 文件 |');
  report.push('|------|------|------|');
  
  // 按路径排序
  routes.sort((a, b) => a.path.localeCompare(b.path));
  
  for (const route of routes) {
    report.push(`| ${route.method} | ${route.path} | ${route.file} |`);
  }
  report.push('');
  report.push(`**总计: ${routes.length} 个路由**`);
  report.push('');
  
  // 2. 服务层清单
  report.push('## 2. 服务层清单');
  report.push('');
  report.push('| 服务名称 | 文件 | 代码行数 | 大小(KB) |');
  report.push('|----------|------|----------|----------|');
  
  // 按行数排序
  services.sort((a, b) => b.lines - a.lines);
  
  for (const service of services) {
    report.push(`| ${service.name} | ${service.file} | ${service.lines} | ${Math.round(service.size / 1024 * 10) / 10} |`);
  }
  report.push('');
  
  // 识别大文件
  const largeFiles = services.filter(s => s.lines > 500);
  if (largeFiles.length > 0) {
    report.push('### 大文件警告（>500行）');
    report.push('');
    for (const file of largeFiles) {
      report.push(`- **${file.name}** (${file.lines} 行) - ${file.file}`);
    }
    report.push('');
  }
  
  // 3. 中间件清单
  report.push('## 3. 中间件清单');
  report.push('');
  report.push('| 中间件名称 | 文件 | 代码行数 | 描述 |');
  report.push('|------------|------|----------|------|');
  
  for (const mw of middlewares) {
    report.push(`| ${mw.name} | ${mw.file} | ${mw.lines} | ${mw.description} |`);
  }
  report.push('');
  
  // 4. 热点分析
  report.push('## 4. 热点分析');
  report.push('');
  
  // 高频路由模式分析
  const routePatterns = {};
  routes.forEach(route => {
    const pattern = route.path.split('/').slice(0, 4).join('/'); // 取前4段作为模式
    routePatterns[pattern] = (routePatterns[pattern] || 0) + 1;
  });
  
  report.push('### 高频路由模式');
  report.push('');
  const sortedPatterns = Object.entries(routePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  for (const [pattern, count] of sortedPatterns) {
    report.push(`- **${pattern}** - ${count} 个相关路由`);
  }
  report.push('');
  
  // 识别复杂服务
  report.push('### 复杂服务（>200行）');
  report.push('');
  const complexServices = services.filter(s => s.lines > 200);
  for (const service of complexServices) {
    report.push(`- **${service.name}** (${service.lines} 行)`);
  }
  report.push('');
  
  return report.join('\n');
}

// 主函数
function main() {
  console.log('Analyzing 3cloud backend...');
  
  const routes = analyzeRoutes();
  console.log(`Found ${routes.length} routes`);
  
  const services = analyzeServices();
  console.log(`Found ${services.length} services`);
  
  const middlewares = analyzeMiddlewares();
  console.log(`Found ${middlewares.length} middlewares`);
  
  const report = generateReport(routes, services, middlewares);
  
  // 保存报告
  const outputDir = path.join(__dirname, 'PERF-ANALYSIS');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, 'backend-overview.md');
  fs.writeFileSync(outputFile, report);
  console.log(`Report saved to: ${outputFile}`);
}

// 运行
if (require.main === module) {
  main();
}

module.exports = { analyzeRoutes, analyzeServices, analyzeMiddlewares };