// ============================================================
//  3cloud (3C) — Enhanced Query Timeout Protection Plugin
//  增强的查询超时保护，支持动态路由匹配和更好的错误处理
// ============================================================

import { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import type { getDb } from "../db/index.js";

declare module "fastify" {
  interface FastifyRequest {
    queryTimeout?: number; // 当前请求设置的超时时间（毫秒）
    originalQueryTimeout?: number; // 原始超时时间（用于重置）
  }
}

// 路由超时配置
const ROUTE_TIMEOUT_CONFIG = {
  // 默认超时：5秒
  default: 5000,
  
  // 需要更短超时的路径（敏感操作）
  shortTimeoutPaths: [
    { pattern: '/api/v1/auth/', timeout: 2000 as any }, // 2秒，登录认证
    { pattern: '/api/v1/users/', timeout: 3000 }, // 3秒，用户操作
    { pattern: '/api/v1/tokens/', timeout: 3000 }, // 3秒，令牌操作
  ],
  
  // 需要更长超时的路径（报表/统计）
  longTimeoutPaths: [
    { pattern: '/api/v1/admin/dashboard/', timeout: 10000 }, // 10秒
    { pattern: '/api/v1/admin/stats/', timeout: 15000 }, // 15秒
    { pattern: '/api/v1/admin/reports/', timeout: 30000 }, // 30秒
    { pattern: '/api/v1/analytics/', timeout: 20000 }, // 20秒
    { pattern: '/api/v1/dashboard/', timeout: 15000 }, // 15秒
  ],
};

export const queryTimeoutEnhancedPlugin: FastifyPluginAsync = async (fastify) => {
  const DEFAULT_TIMEOUT = ROUTE_TIMEOUT_CONFIG.default;

  fastify.log.info(`[QueryTimeout] Enhanced plugin loaded - Default timeout: ${DEFAULT_TIMEOUT}ms`);
  
  // 打印配置的路由超时设置
  if (ROUTE_TIMEOUT_CONFIG.longTimeoutPaths.length > 0) {
    fastify.log.info('[QueryTimeout] Long timeout routes configured:');
    ROUTE_TIMEOUT_CONFIG.longTimeoutPaths.forEach(config => {
      fastify.log.info(`  ${config.pattern}: ${config.timeout}ms`);
    });
  }

  // 在请求开始时设置超时
  fastify.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0];
    
    // 确定当前请求的超时时间
    let timeoutMs = DEFAULT_TIMEOUT;
    
    // 检查是否需要更短超时
    for (const config of ROUTE_TIMEOUT_CONFIG.shortTimeoutPaths) {
      if (path.startsWith(config.pattern)) {
        timeoutMs = config.timeout;
        break;
      }
    }
    
    // 检查是否需要更长超时
    if (timeoutMs === DEFAULT_TIMEOUT) {
      for (const config of ROUTE_TIMEOUT_CONFIG.longTimeoutPaths) {
        if (path.startsWith(config.pattern)) {
          timeoutMs = config.timeout;
          break;
        }
      }
    }
    
    // 存储到请求对象
    request.queryTimeout = timeoutMs;
    request.originalQueryTimeout = timeoutMs;
    
    // 设置超时
    try {
      await fastify.db.execute(sql`SET statement_timeout = ${timeoutMs}`);
      
      if (process.env.NODE_ENV === 'development' && timeoutMs !== DEFAULT_TIMEOUT) {
        request.log.debug(`[QueryTimeout] Set timeout ${timeoutMs}ms for ${request.method} ${path}`);
      }
    } catch (error) {
      // 设置超时失败不影响正常请求
      request.log.warn({ 
        err: error, 
        path, 
        timeout: timeoutMs 
      }, `[QueryTimeout] Failed to set statement_timeout`);
    }
  });

  // 请求结束后恢复默认设置
  fastify.addHook('onResponse', async (request) => {
    try {
      // 重置为默认超时
      await fastify.db.execute(sql`SET statement_timeout = ${DEFAULT_TIMEOUT}`);
    } catch (error) {
      // 忽略恢复失败
      if (process.env.NODE_ENV === 'development') {
        request.log.debug({ err: error }, `[QueryTimeout] Failed to reset statement_timeout`);
      }
    }
  });

  // 查询超时错误处理
  fastify.addHook('onError', async (request, reply, error) => {
    // 检查是否为查询超时错误
    const isQueryTimeout = error instanceof Error && (
      error.message.includes('statement timeout') ||
      error.message.includes('canceling statement due to statement timeout') ||
      error.message.includes('query_timeout') ||
      error.message.includes('canceling statement') ||
      error.message.includes('timeout expired')
    );
    
    if (isQueryTimeout) {
      const path = request.url.split('?')[0];
      const timeout = request.queryTimeout || DEFAULT_TIMEOUT;
      const requestId = (request as any).requestId || 'unknown';
      
      // 记录详细的超时信息
      request.log.warn({
        requestId,
        path,
        method: request.method,
        timeout,
        error: error.message,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      }, `[QueryTimeout] Query timeout interrupted after ${timeout}ms`);
      
      // 如果错误还没有被处理，返回友好的错误响应
      if (!reply.sent) {
        const errorMessage = `Query exceeded maximum execution time of ${timeout}ms`;
        return reply.status(504).send({
          ok: false,
          code: 'QUERY_TIMEOUT',
          message: errorMessage,
          requestId,
          timeout: timeout,
        });
      }
    }
  });

  // 添加健康检查端点
  fastify.get('/api/v1/internal/query-timeout-status', async (request, reply) => {
    try {
      // 检查当前连接的超时设置
      const result = await fastify.db.execute(sql`SHOW statement_timeout`);
      const currentTimeout = result.rows[0]?.statement_timeout || 'unknown';
      
      return reply.send({
        ok: true,
        data: {
          currentTimeout,
          defaultTimeout: `${DEFAULT_TIMEOUT}ms`,
          configuredRoutes: {
            shortTimeout: ROUTE_TIMEOUT_CONFIG.shortTimeoutPaths,
            longTimeout: ROUTE_TIMEOUT_CONFIG.longTimeoutPaths,
          }
        }
      });
    } catch (error) {
      request.log.error({ err: error }, '[QueryTimeout] Failed to check status');
      return reply.status(500).send({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Failed to check query timeout status',
      });
    }
  });
};

export default queryTimeoutEnhancedPlugin;