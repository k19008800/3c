import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import net from 'node:net';
import { db } from '../db';

/**
 * 系统健康检查
 *
 * - GET /health          — 根路径（网关 / 运维探活）
 * - GET /api/v1/health   — web-console axios baseURL 为 /api/v1，需同一路由
 *
 * 返回 status（网关可用）+ db / redis（依赖组件可达性），供 Admin 数据驾驶舱健康卡片展示。
 */

/** 轻量 DB 探针：SELECT 1 判定 PostgreSQL 可达性 */
async function probeDb(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/** 轻量 Redis 探针：TCP 连接 + PING 判定可达性（不引入 redis 客户端依赖） */
function probeRedis(): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
    } catch {
      resolve(false);
      return;
    }
    const host = url.hostname || '127.0.0.1';
    const port = Number(url.port || 6379);

    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 800);
    socket.setTimeout(800, () => {
      clearTimeout(timer);
      finish(false);
    });
    socket.on('connect', () => socket.write('PING\r\n'));
    socket.on('data', (buf) => {
      if (buf.toString().startsWith('+PONG')) {
        clearTimeout(timer);
        finish(true);
      }
    });
    socket.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

const responseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    db: { type: 'string' },
    redis: { type: 'string' },
    timestamp: { type: 'string' },
    uptime: { type: 'number' },
  },
};

export async function healthRoutes(app: FastifyInstance) {
  const handler = async () => {
    const [dbUp, redisUp] = await Promise.all([probeDb(), probeRedis()]);
    return {
      status: 'ok',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  };

  app.get('/health', { schema: { response: { 200: responseSchema } } }, handler);
  app.get('/api/v1/health', { schema: { response: { 200: responseSchema } } }, handler);
}
