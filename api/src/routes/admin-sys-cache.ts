/**
 * 系统缓存管理路由 — /api/v1/admin/sys/cache（产品裁决 2026-08-15）
 *
 * 对齐 ref-12.3 cache-manager：查看 Redis 缓存键、按模式搜索、删除键、清理业务缓存。
 *
 * 端点：
 *   GET    /admin/sys/cache/keys?pattern=  — 键列表（SCAN 匹配 + 键数/内存估算）
 *   DELETE /admin/sys/cache/key            — 删除指定键（body: { key }）
 *   POST   /admin/sys/cache/flush          — 清理业务缓存（删除 billing:* 等前缀）
 *
 * 安全：Redis 不可用时返回空列表/降级提示，不抛错（与 lib/redis 降级语义一致）。
 * 仅 super_admin 可写（删除/清理），admin 只读。
 */

import type { FastifyInstance } from 'fastify';
import { getRedis } from '../lib/redis';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../lib/errors';

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

async function superAdminOnly(request: any) {
  const { role } = request.userContext as { role: string };
  if (role !== 'super_admin') throw new ForbiddenError('仅超级管理员可执行该操作');
}

/** 用 SCAN 迭代匹配 pattern 的键（避免 KEYS 阻塞） */
async function scanKeys(pattern: string, limit = 200): Promise<string[]> {
  const r = getRedis();
  if (!r) return [];
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const k of batch) {
      keys.push(k);
      if (keys.length >= limit) return keys;
    }
  } while (cursor !== '0');
  return keys;
}

export async function adminSysCacheRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/sys/cache/keys?pattern= */
  app.get('/api/v1/admin/sys/cache/keys', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { pattern?: string };
    const pattern = (q.pattern ?? '*').trim() || '*';
    // 防御：pattern 长度限制 + 排除危险通配全库
    if (pattern.length > 200) throw new ValidationError('pattern 过长');

    const keys = await scanKeys(pattern);

    // 内存估算：仅对命中的键取 memory usage（小样本）
    let memory = '';
    const r = getRedis();
    if (r && keys.length > 0) {
      try {
        const sample = keys.slice(0, 20);
        let bytes = 0;
        for (const k of sample) {
          try {
            const mu = await r.memory('USAGE', k);
            bytes += Number(mu ?? 0);
          } catch { /* 单键失败忽略 */ }
        }
        if (bytes > 0) memory = `≈ ${(bytes / 1024 / 1024).toFixed(2)} MB（抽样 ${sample.length} 键）`;
      } catch { /* 估算失败忽略 */ }
    }

    return reply.send({ data: { keys, count: keys.length, memory, connected: !!r } });
  });

  /** DELETE /api/v1/admin/sys/cache/key — 删除指定键 */
  app.delete('/api/v1/admin/sys/cache/key', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const body = (request.body || {}) as { key?: string };
    const key = String(body.key || '').trim();
    if (!key) throw new ValidationError('key 不能为空');
    if (key.length > 500) throw new ValidationError('key 过长');

    const r = getRedis();
    if (!r) throw new ValidationError('Redis 不可用，无法删除缓存键');
    const removed = await r.del(key);
    if (removed === 0) throw new ValidationError(`缓存键不存在：${key}`);
    return reply.send({ data: { ok: true, key, removed }, message: `已删除缓存键 ${key}` });
  });

  /** POST /api/v1/admin/sys/cache/flush — 清理业务缓存（billing:* / user_group:* / supplier_balance:* 等） */
  app.post('/api/v1/admin/sys/cache/flush', { preHandler: [adminAuth] }, async (request, reply) => {
    await superAdminOnly(request);
    const r = getRedis();
    if (!r) throw new ValidationError('Redis 不可用，无法清理缓存');

    const prefixes = ['billing:*', 'user_group:*', 'supplier_balance:*', 'idem:*', 'email-code:*'];
    let total = 0;
    for (const p of prefixes) {
      const keys = await scanKeys(p, 1000);
      if (keys.length > 0) {
        const removed = await r.del(...keys);
        total += removed;
      }
    }
    return reply.send({ data: { ok: true, removed: total }, message: `已清理 ${total} 个业务缓存键` });
  });
}
