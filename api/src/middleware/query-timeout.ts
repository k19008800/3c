// ============================================================
//  3cloud (3C) — 查询超时保护中间件
//  防止慢查询长时间占用数据库连接，避免连接池耗尽
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db/index.js";
import { config } from "../config.js";

// 默认查询超时时间（毫秒）
const DEFAULT_QUERY_TIMEOUT_MS = 5000; // 5秒

// 长查询白名单（特定路由可以设置更长的超时）
const LONG_QUERY_WHITELIST: Record<string, number> = {
  // 路由模式: 超时时间（毫秒）
  "/admin/dashboard/enterprise-overview": 10000, // 10秒
  "/admin/dashboard/trends":25200, // 7小时
  "/admin/dashboard/scheduling": 10000, // 10秒
  "/admin/dashboard/todo-queue": 10000, // 10秒
  "/admin/stats/*": 10000, // 10秒
  "/admin/dashboard/*": 10000, // 10秒
  "/services/dashboard/top-consumers": 10000, // 10秒
};

// 查询超时中间件
export async function queryTimeoutMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 获取当前路由的适当超时时间
  const timeoutMs = getQueryTimeoutForRoute(request.url);
  
  // 只在数据库连接池中设置statement_timeout
  // 注意：这会影响当前连接上的所有查询
  try {
    if (pool) {
      // 设置当前连接的statement_timeout
      await pool.query(`SET statement_timeout = ${timeoutMs}`);
      request.log.debug(`[QueryTimeout] Set statement_timeout=${timeoutMs}ms for ${request.method} ${request.url}`);
    }
  } catch (error) {
    request.log.warn({ err: error }, `[QueryTimeout] Failed to set statement_timeout`);
  }

  // 清理函数：在请求结束后重置超时设置
  const originalOnRequestAbort = reply.raw.on;
  reply.raw.on = function(event: string, listener: (...args: any[]) => void) {
    if (event === 'finish' || event === 'close') {
      return originalOnRequestAbort.call(this, event, async () => {
        try {
          await resetStatementTimeout();
        } catch (err) {
          request.log.debug({ err }, `[QueryTimeout] Failed to reset statement_timeout`);
        }
        listener();
      });
    }
    return originalOnRequestAbort.call(this, event, listener);
  };
}

// 重置statement_timeout到默认值
async function resetStatementTimeout() {
  if (pool) {
    // 重置为PostgreSQL默认（0表示无超时）
    await pool.query('RESET statement_timeout');
  }
}

// 根据路由获取查询超时时间
function getQueryTimeoutForRoute(url: string): number {
  const urlPath = new URL(url, 'http://localhost').pathname;
  
  // 检查白名单
  for (const [pattern, timeout] of Object.entries(LONG_QUERY_WHITELIST)) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (urlPath.startsWith(prefix)) {
        return timeout;
      }
    } else if (urlPath === pattern) {
      return timeout;
    }
  }
  
  // 返回默认超时
  return DEFAULT_QUERY_TIMEOUT_MS;
}

// 手动设置查询超时的工具函数
export async function withQueryTimeout<T>(
  timeoutMs: number,
  queryFn: () => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();
  try {
    // 设置当前连接的statement_timeout
    await client.query(`SET statement_timeout = ${timeoutMs}`);
    
    // 执行查询
    const result = await queryFn();
    
    // 重置statement_timeout
    await client.query('RESET statement_timeout');
    
    return result;
  } finally {
    client.release();
  }
}

// 注册中间件到Fastify应用
export function registerQueryTimeoutMiddleware(app: FastifyInstance) {
  // 在所有业务路由之前注册查询超时中间件
  app.addHook('onRequest', queryTimeoutMiddleware);
  
  app.log.info('[Middleware] Query timeout protection enabled');
  app.log.info(`[Middleware] Default query timeout: ${DEFAULT_QUERY_TIMEOUT_MS}ms`);
  
  // 记录长查询白名单
  if (Object.keys(LONG_QUERY_WHITELIST).length > 0) {
    app.log.info('[Middleware] Long query whitelist:');
    for (const [route, timeout] of Object.entries(LONG_QUERY_WHITELIST)) {
      app.log.info(`  ${route}: ${timeout}ms`);
    }
  }
}