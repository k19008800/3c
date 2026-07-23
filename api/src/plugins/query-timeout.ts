// ============================================================
//  3cloud (3C) — Fastify Plugin: 数据库查询超时保护
//  为每个请求设置 PostgreSQL statement_timeout
//  防止慢查询阻塞连接池，导致服务不可用
// ============================================================

import { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import type { getDb } from "../db/index.js";

declare module "fastify" {
  interface FastifyRequest {
    queryTimeout?: number; // 当前请求设置的超时时间（毫秒）
  }
  
  interface FastifyInstance {
    db: ReturnType<typeof getDb>;
    redis: ReturnType<typeof import("../redis.js").getRedis>;
  }
}

export const queryTimeoutPlugin: FastifyPluginAsync = async (fastify) => {
  // 默认查询超时时间（5秒）
  const DEFAULT_STATEMENT_TIMEOUT = 5000; // 5秒
  
  // 需要更长超时的路径模式
  const LONG_TIMEOUT_PATHS = [
    '/api/admin/stats',           // 管理员统计数据
    '/api/admin/metrics',         // 监控指标
    '/api/admin/reports',         // 报表生成
    '/api/reports',               // 报表相关
    '/api/analytics',             // 分析数据
    '/api/dashboard/summary',     // 仪表板汇总
  ];

  // 统计类接口的超时时间（30秒）
  const STATS_TIMEOUT = 30000;

  fastify.log.info(`[QueryTimeout] 插件加载 - 默认超时: ${DEFAULT_STATEMENT_TIMEOUT}ms, 统计接口超时: ${STATS_TIMEOUT}ms`);

  // 在请求开始时设置超时
  fastify.addHook('onRequest', async (request) => {
    // 确定当前请求的超时时间
    let timeoutMs = DEFAULT_STATEMENT_TIMEOUT;
    
    // 检查是否为统计类接口
    const path = request.url.split('?')[0];
    const isStatsPath = LONG_TIMEOUT_PATHS.some(pattern => 
      path.includes(pattern) || path.startsWith(pattern)
    );
    
    if (isStatsPath) {
      timeoutMs = STATS_TIMEOUT;
      request.log.info(`[QueryTimeout] 统计接口检测: ${path}, 设置超时: ${timeoutMs}ms`);
    }
    
    // 记录到请求对象中，便于调试
    request.queryTimeout = timeoutMs;
    
    try {
      // 为当前会话设置超时
      await fastify.db.execute(sql`SET statement_timeout = ${timeoutMs}`);
      
      // 记录调试信息（仅在开发环境）
      if (process.env.NODE_ENV === 'development') {
        request.log.debug(`[QueryTimeout] 为请求设置超时: ${timeoutMs}ms`);
      }
    } catch (error) {
      // 设置超时失败不影响正常请求，但记录警告
      request.log.warn({ error }, `[QueryTimeout] 设置 statement_timeout 失败`);
    }
  });

  // 请求结束后恢复默认设置（可选）
  fastify.addHook('onResponse', async (request) => {
    try {
      // 恢复默认超时设置
      await fastify.db.execute(sql`SET statement_timeout = ${DEFAULT_STATEMENT_TIMEOUT}`);
    } catch (error) {
      // 忽略恢复失败
    }
  });

  // 记录超时事件
  fastify.addHook('onError', async (request, reply, error) => {
    // 检查是否为查询超时错误
    if (error instanceof Error && (
      error.message.includes('statement timeout') ||
      error.message.includes('canceling statement') ||
      error.message.includes('query_timeout')
    )) {
      const path = request.url.split('?')[0];
      const timeout = request.queryTimeout || DEFAULT_STATEMENT_TIMEOUT;
      
      request.log.warn({
        path,
        method: request.method,
        timeout,
        error: error.message
      }, `[QueryTimeout] 查询超时被中断 (${timeout}ms)`);
      
      // 可以在这里添加监控指标上报
    }
  });
};

export default queryTimeoutPlugin;