/**
 * Admin 竞品价格监控 — GET /api/v1/admin/competitive/monitor（A4）
 *
 * 数据源：supplier_models（+ suppliers）。同一平台模型在多个供应商/渠道有不同售价，
 * 「竞品对比」视角 = 按平台模型聚合，展示本平台最低价（our）与其余渠道价格（comp_a/b/c）。
 *
 * 出参对齐 web-console/src/pages/admin/AdminCompetitiveMonitorPage.tsx 的 CompRow：
 *   {
 *     id, model_name, our_price, comp_a_price, comp_b_price, comp_c_price,
 *     competitor_lowest, updated_at
 *   }
 * 外层包裹 { data: { list: CompRow[], demo: false } }。
 *
 * 认证：adminAuth。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { and, desc, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** model_type → capabilities 命中关键字（页面选项：text/vision/reasoning/embedding） */
const MODEL_TYPE_KEYWORD: Record<string, string> = {
  text: 'chat',
  vision: 'vision',
  reasoning: 'reasoning',
  embedding: 'embedding',
};

export async function adminCompetitiveRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/competitive/monitor?model_type= — 竞品价格对比（按平台模型聚合） */
  app.get('/api/v1/admin/competitive/monitor', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { model_type?: string };
    const modelType = (q.model_type ?? '').trim();

    const filters = [
      // R8：过滤测试/临时模型
      sql`${schema.supplierModels.modelName} NOT LIKE 'market-test-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'alias-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'compat-%'
          AND ${schema.supplierModels.modelName} NOT LIKE 'verify-%'`,
    ];

    if (modelType) {
      const kw = MODEL_TYPE_KEYWORD[modelType] ?? modelType;
      filters.push(sql`(
        coalesce(${schema.supplierModels.capabilities}, '[]')::text ILIKE ${`%${kw}%`}
        OR ${schema.supplierModels.modelName} ILIKE ${`%${modelType}%`}
        OR ${schema.supplierModels.platformModel} ILIKE ${`%${modelType}%`}
      )`);
    }

    // 按平台模型分组，收集每个供应商的 input 价格（字符串升序/数值），并取更新时间
    const rows = await db.select({
      id: sql<number>`min(${schema.supplierModels.id})`,
      modelName: schema.supplierModels.modelName,
      ourPrice: sql<number>`min(${schema.supplierModels.inputPrice}::numeric)`,
      supplierName: schema.suppliers.name,
      supplierInput: schema.supplierModels.inputPrice,
      updatedAt: sql<Date>`max(${schema.supplierModels.updatedAt})`,
    })
      .from(schema.supplierModels)
      .innerJoin(schema.suppliers, sql`${schema.suppliers.id} = ${schema.supplierModels.supplierId}`)
      .where(and(...filters))
      .groupBy(
        schema.supplierModels.modelName,
        schema.suppliers.name,
        schema.supplierModels.inputPrice,
      )
      .orderBy(desc(sql`max(${schema.supplierModels.updatedAt})`));

    // 折叠：按 modelName 聚合成单行，供应商价格去重后取前 3 个作为 comp_a/b/c
    const byModel = new Map<string, { id: number; modelName: string; our: number | null; others: number[]; updated: string }>();
    for (const r of rows) {
      let e = byModel.get(r.modelName);
      if (!e) {
        e = { id: Number(r.id), modelName: r.modelName, our: null, others: [], updated: '' };
        byModel.set(r.modelName, e);
      }
      if (Number.isFinite(num(r.ourPrice)) && (e.our === null || num(r.ourPrice) < e.our)) {
        e.our = num(r.ourPrice); // our = 本平台最低价（仅在有更低价格时更新，避免被后行覆盖）
      }
      const p = num(r.supplierInput);
      if (Number.isFinite(p) && p >= 0) {
        if (e.others.indexOf(p) === -1) e.others.push(p);
      }
      // 更新时间取最大
      if (r.updatedAt && new Date(r.updatedAt).getTime() > (e.updated ? new Date(e.updated).getTime() : 0)) {
        e.updated = new Date(r.updatedAt).toISOString();
      }
    }

    const list = [];
    for (const e of byModel.values()) {
      // 排除自身最低价，取其余渠道（竞品）价格，升序取前 3
      const competitorPrices = e.others
        .filter((p) => p !== e.our)
        .sort((a, b) => a - b);
      const compA = competitorPrices[0] ?? null;
      const compB = competitorPrices[1] ?? null;
      const compC = competitorPrices[2] ?? null;
      // competitor_lowest = 所有竞品价的最低（不含自身）
      const competitorLowest = competitorPrices.length > 0 ? competitorPrices[0] : null;
      list.push({
        id: e.id,
        model_name: e.modelName,
        our_price: e.our ?? 0,
        comp_a_price: compA,
        comp_b_price: compB,
        comp_c_price: compC,
        competitor_lowest: competitorLowest,
        updated_at: e.updated,
      });
    }

    list.sort((a, b) => String(a.model_name).localeCompare(String(b.model_name), 'zh-CN'));

    return reply.send({
      data: {
        list,
        demo: false,
        model_type: modelType || undefined,
      },
    });
  });
}