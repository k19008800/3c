/**
 * 模型广场自动同步 — 管理端路由
 *
 * 端点：
 *   POST /api/v1/admin/suppliers/:id/sync-models — 同步单个供应商模型（admin）
 *   POST /api/v1/admin/suppliers/sync-all        — 批量同步全部 active 供应商（admin，加分项）
 *
 * 鉴权 / 错误处理风格与 suppliers.ts 保持一致（各域路由自行声明 adminAuth）。
 * 业务逻辑在 services/model-sync.ts，本文件只做薄路由：校验 → 调用 → 状态码映射。
 *
 * 错误映射：
 *   - 供应商不存在 → 404（路由先查一次）
 *   - 同步业务错误 → 400（供应商未配置 active key）/ 502（上游不可用）
 *
 * @module routes/admin-model-sync
 * @see kb/3cloud/newapi-gap-analysis.md Batch 4 任务 4.2
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import {
  syncSupplierModels,
  syncAllSuppliers,
} from '../services/model-sync';

/** JWT 解析：成功则写入 request.userContext */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 管理端鉴权：JWT + admin/super_admin 角色 */
async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/** 路径参数解析：非法 → 400 */
function intParam(params: Record<string, unknown>, key: string): number {
  const v = parseInt(String(params[key]), 10);
  if (isNaN(v)) throw new ValidationError(`Invalid ${key}`);
  return v;
}

/**
 * 同步业务错误 → HTTP 状态映射：
 * - 供应商未配置 active key → 400（业务配置错误，改配置即可）
 * - 上游错误（非 2xx / 网络 / 超时 / 响应解析失败）→ 502（上游不可用）
 */
function syncErrorStatus(error: string): number {
  return error === 'no active key' ? 400 : 502;
}

export async function adminModelSyncRoutes(app: FastifyInstance) {
  /** POST /api/v1/admin/suppliers/:id/sync-models — 从上游拉取模型并自动填充 supplier_models */
  app.post('/api/v1/admin/suppliers/:id/sync-models', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');

    // 供应商不存在 → 404（与 suppliers.ts 的 404 语义一致；同步失败是另一回事）
    const [supplier] = await db.select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, id))
      .limit(1);
    if (!supplier) throw new NotFoundError('Supplier', id);

    const result = await syncSupplierModels(id);
    if (result.error) {
      const status = syncErrorStatus(result.error);
      return reply.status(status).send({
        code: status,
        message: result.error,
        requestId: request.id,
      });
    }
    return reply.send({ data: result });
  });

  /** POST /api/v1/admin/suppliers/sync-all — 批量同步全部 active 供应商（返回汇总） */
  app.post('/api/v1/admin/suppliers/sync-all', { preHandler: [adminAuth] }, async (_request, reply) => {
    const result = await syncAllSuppliers();
    return reply.send({ data: result });
  });
}
