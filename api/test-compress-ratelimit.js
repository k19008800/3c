// 快速验证压缩和限流配置
const { buildApp } = require('./dist/app/index.js');

async function test() {
  console.log('🚀 开始验证压缩和限流配置...\n');
  
  try {
    // 构建应用
    const app = await buildApp();
    
    console.log('✅ 应用构建成功');
    console.log('📋 插件配置检查:');
    
    // 检查插件是否注册
    const plugins = app.plugin;
    console.log('  - 应用插件系统已初始化');
    
    // 检查路由配置
    const routes = app.routes;
    console.log(`  - 路由数量: ${routes.length}`);
    
    // 检查是否有压缩相关配置
    console.log('  - 检查压缩配置...');
    const compressConfig = app.hasPlugin('@fastify/compress');
    console.log(`   压缩插件: ${compressConfig ? '✅ 已注册' : '❌ 未找到'}`);
    
    // 检查是否有限流配置
    console.log('  - 检查限流配置...');
    const rateLimitConfig = app.hasPlugin('@fastify/rate-limit');
    console.log(`   限流插件: ${rateLimitConfig ? '✅ 已注册' : '❌ 未找到'}`);
    
    // 检查特定路由的限流配置
    console.log('\n🔍 检查敏感接口限流配置:');
    
    // 登录接口
    const loginRoute = routes.find(r => r.url === '/api/v1/auth/login' && r.method === 'POST');
    console.log(`  登录接口: ${loginRoute ? '✅ 存在' : '❌ 未找到'}`);
    if (loginRoute?.config?.rateLimit) {
      console.log(`    限流配置: ${loginRoute.config.rateLimit.max} 次/${loginRoute.config.rateLimit.timeWindow}`);
    }
    
    // 批量操作接口
    const batchRoutes = routes.filter(r => 
      r.url.includes('/batch-') && 
      r.method === 'POST'
    );
    console.log(`  批量操作接口: ${batchRoutes.length} 个`);
    
    batchRoutes.forEach(route => {
      if (route.config?.rateLimit) {
        console.log(`    ${route.url}: ${route.config.rateLimit.max} 次/${route.config.rateLimit.timeWindow}`);
      }
    });
    
    console.log('\n🎉 配置验证完成');
    console.log('\n📝 建议的测试步骤:');
    console.log('1. 启动应用: npm run dev');
    console.log('2. 测试压缩: curl -v -H "Accept-Encoding: gzip" http://localhost:3000/api/v1/models');
    console.log('3. 测试限流: 快速发送6个登录请求测试5次/分钟的限制');
    console.log('4. 验证响应头包含 Content-Encoding: gzip');
    console.log('5. 验证超限请求返回429状态码');
    
    await app.close();
    console.log('\n✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();