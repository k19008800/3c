// @ts-nocheck
// ============================================================
//  3cloud (3C) — 限流保护插件
//  使用 @fastify/rate-limit 防止 API 滥用
// ============================================================

import type { FastifyPluginAsync } from 'fastify';

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  // 导入限流插件
  const rateLimit = await import('@fastify/rate-limit');
  
  // 注册限流插件
  await fastify.register(rateLimit.default, {
    global: true,
    max: 100, // 每分钟最多 100 次请求
    timeWindow: '1 minute',
    cache: 10000, // 存储 10000 个键值
    enableDraftSpec: true, // 启用新规范
    
    // 自定义键生成器：按 IP + 用户 ID 限流
    keyGenerator: (request) => {
      const ip = request.ip || 'unknown';
      const userId = request.user?.id || 'anonymous';
      return `${ip}:${userId}`;
    },
    
    // 跳过健康检查和就绪检查
    skipOnError: false, // 错误时不跳过限流
    skip: (request) => {
      // 跳过健康检查路由
      if (request.url === '/health' || request.url === '/ready') {
        return true;
      }
      
      // 跳过内部 IP（如果配置了内部访问）
      const internalIps = ['127.0.0.1', '::1', 'localhost'];
      const clientIp = request.ip || '';
      if (internalIps.includes(clientIp)) {
        return true;
      }
      
      // 管理接口跳过限流（如果有管理员权限）
      const adminKey = request.headers['x-admin-key'];
      if (adminKey && process.env.ADMIN_API_KEY === adminKey) {
        return true;
      }
      
      return false;
    },
    
    // 自定义错误消息
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `请求过于频繁，请 ${context.after} 后再试`,
        rateLimit: {
          max: context.max,
          remaining: 0,
          reset: context.reset
        }
      };
    }
  });
  
  fastify.log.info('✅ 全局限流保护已启用 (100 请求/分钟)');
};

export default rateLimitPlugin;