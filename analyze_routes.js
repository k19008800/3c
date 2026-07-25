const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'api/src/routes');
const outputFile = path.join(__dirname, 'PERF-ANALYSIS/backend-overview.md');

// 创建输出目录
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 收集所有路由信息
const routes = [];

// 分析一个路由文件
function analyzeRouteFile(filePath, routePrefix = '') {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 提取路由定义 (Fastify 风格)
    const routeRegex = /(?:\.(?:get|post|put|patch|delete|head|options))\s*\(\s*['"]([^'"]+)['"]/g;
    const methodRegex = /\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]/g;
    
    let match;
    const fileRoutes = [];
    
    // 重置正则索引
    routeRegex.lastIndex = 0;
    
    while ((match = routeRegex.exec(content)) !== null) {
      const routePath = match[1];
      // 查找方法
      const methodMatch = methodRegex.exec(content.slice(match.index - Uncaught Error: RangeError: Invalid array length
        at getRouteMethods (3cloud/analyze_routes.js:40:27)
        at analyzeRouteFile (3cloud/analyze_routes.js:18:5)
        at Object.<anonymous> (3cloud/analyze_routes.js:82:3)
        at Module._compile (node:internal/modules/cjs/loader:1256:14)
        at Module._extensions..js (node:internal/modules/cjs/loader:1310:10)
        at Module.load (node:internal/modules/cjs/loader:1119:32)
        at Module._load (node:internal/modules/cjs/loader:961:12)
        at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:86:12)
        at node:internal/main/run_main_module:23:47