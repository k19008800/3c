/**
 * 模型编码管理 — 管理端路由（「模型编码化改造」阶段 B / B3）
 *
 * 端点：
 *   GET  /api/v1/admin/model-codes?model_name=&supplier_id=&page=&page_size=  — 编码列表（筛选/分页）
 *   PUT  /api/v1/admin/model-codes/:id/status                                — 启用/停用编码（不物理删除）
 *   POST /api/v1/admin/model-codes/:id/regenerate                            — 按当前模板重新生成编码
 *   GET  /api/v1/admin/model-code-rules                                      — 读取编码规则模板配置
 *   PUT  /api/v1/admin/model-code-rules                                      — 保存编码规则模板（空串=恢复默认）
 *   POST /api/v1/admin/model-code-rules/preview                              — 模板预览（真实映射渲染示例）
 *
 * 规则依据：
 *   - 编码规则后台可自定义，系统默认「厂商+模型」= {supplier_code}-{model_name}（PRD v1.2 M-C-01R / M-C-07）
 *   - 模板变更只对未生成编码的映射生效；存量编码不自动重写；重新生成需前端确认弹窗（旧编码调用将 404）
 *   - 鉴权/错误处理风格与 admin-model-sync.ts 一致（各域路由自行声明 adminAuth）
 *   - 接口契约见 docs/开发任务书-阶段B-后端模型编码规则接口.md §3（前端 T5 按此联调，命名不可漂移）
 *
 * @module routes/admin-model-codes
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, asc, inArray, ilike, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import {
  renderModelCode,
  validateModelCodeTemplate,
  generateModelCodeForSupplierModel,
  setModelCodeTemplate,
  invalidateModelCodeTemplateCache,
  MODEL_CODE_DEFAULT_TEMPLATE,
  MODEL_CODE_ALLOWED_VARS,
  MODEL_CODE_TEMPLATE_CONFIG_KEY,
} from '../services/upstream/model-code.js';

/** 模型状态白名单（与 modelStatusEnum 对齐） */
const MODEL_STATUSES = ['active', 'inactive', 'deprecated', 'beta'] as const;

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

/** 展示名 = 模型名（供应商名），与 /me/models 口径一致 */
function displayName(modelName: string, supplierName: string): string {
  return `${modelName}（${supplierName}）`;
}

/** 读取 system_config 中编码规则模板的原始配置值（未兜底；空串=使用默认模板） */
async function readConfiguredTemplate(): Promise<string> {
  const rows = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, MODEL_CODE_TEMPLATE_CONFIG_KEY))
    .limit(1);
  const v = rows[0]?.value;
  return typeof v === 'string' ? v : '';
}

export async function adminModelCodesRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/model-codes — 编码列表
   * 筛选：model_name（模糊）、supplier_id（精确）；分页 page/page_size（≤200）
   */
  app.get('/api/v1/admin/model-codes', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { model_name?: string; supplier_id?: string; page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);

    const conditions: any[] = [];
    if (q.model_name) conditions.push(ilike(schema.supplierModels.modelName, `%${q.model_name}%`));
    if (q.supplier_id) {
      const sid = parseInt(q.supplier_id, 10);
      if (isNaN(sid)) throw new ValidationError('Invalid supplier_id');
      conditions.push(eq(schema.supplierModels.supplierId, sid));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: schema.supplierModels.id,
        modelCode: schema.supplierModels.modelCode,
        modelName: schema.supplierModels.modelName,
        platformModel: schema.supplierModels.platformModel,
        status: schema.supplierModels.status,
        inputPrice: schema.supplierModels.inputPrice,
        outputPrice: schema.supplierModels.outputPrice,
        supplierId: schema.suppliers.id,
        supplierCode: schema.suppliers.code,
        supplierName: schema.suppliers.name,
      })
      .from(schema.supplierModels)
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(whereClause)
      .orderBy(asc(schema.supplierModels.modelName), asc(schema.supplierModels.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.supplierModels)
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(whereClause);
    const total = Number(countRows[0]?.count ?? 0);

    // 补充 vendor_pricing：定价分组（非 default 组名列表，无则 'default'）+ 默认组售价
    const ids = rows.map((r) => r.id);
    const pricingByModel = new Map<number, { groups: string[]; input: string | null; output: string | null; cacheRead: string | null; cacheWrite: string | null }>();
    if (ids.length > 0) {
      const vpRows = await db
        .select({
          supplierModelId: schema.vendorPricing.supplierModelId,
          pricingGroup: schema.vendorPricing.pricingGroup,
          inputPrice: schema.vendorPricing.inputPrice,
          outputPrice: schema.vendorPricing.outputPrice,
          cacheReadInputPrice: schema.vendorPricing.cacheReadInputPrice,
          cacheWriteInputPrice: schema.vendorPricing.cacheWriteInputPrice,
        })
        .from(schema.vendorPricing)
        .where(inArray(schema.vendorPricing.supplierModelId, ids));
      for (const v of vpRows) {
        let e = pricingByModel.get(v.supplierModelId);
        if (!e) {
          e = { groups: [], input: null, output: null, cacheRead: null, cacheWrite: null };
          pricingByModel.set(v.supplierModelId, e);
        }
        if (!e.groups.includes(v.pricingGroup)) e.groups.push(v.pricingGroup);
        if (v.pricingGroup === 'default') {
          e.input = v.inputPrice;
          e.output = v.outputPrice;
          e.cacheRead = v.cacheReadInputPrice != null ? String(v.cacheReadInputPrice) : null;
          e.cacheWrite = v.cacheWriteInputPrice != null ? String(v.cacheWriteInputPrice) : null;
        }
      }
    }

    const list = rows.map((r) => {
      const pricing = pricingByModel.get(r.id);
      const nonDefaultGroups = (pricing?.groups ?? []).filter((g) => g !== 'default');
      return {
        id: r.id,
        supplier_model_id: r.id,
        model_code: r.modelCode,
        model_name: r.modelName,
        display_name: displayName(r.modelName, r.supplierName),
        supplier_code: r.supplierCode,
        supplier_name: r.supplierName,
        status: r.status,
        platform_model: r.platformModel,
        pricing_group: nonDefaultGroups.length > 0 ? nonDefaultGroups.join(',') : 'default',
        prices: {
          input: pricing?.input ?? r.inputPrice,
          output: pricing?.output ?? r.outputPrice,
          cache_read_input: pricing?.cacheRead ?? null,
          cache_write_input: pricing?.cacheWrite ?? null,
        },
      };
    });

    return reply.send({ data: { list, pagination: { page, pageSize, total } } });
  });

  /**
   * PUT /api/v1/admin/model-codes/:id/status — 启用/停用编码
   * :id = supplier_models.id；仅改 status（不物理删除，防复用）；停用后路由层拦截调用（400）
   */
  app.put('/api/v1/admin/model-codes/:id/status', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');
    const body = (request.body ?? {}) as { status?: string };
    if (!body.status || !(MODEL_STATUSES as readonly string[]).includes(body.status)) {
      throw new ValidationError(`Invalid status (allowed: ${MODEL_STATUSES.join('/')})`);
    }

    const [row] = await db
      .select({ id: schema.supplierModels.id })
      .from(schema.supplierModels)
      .where(eq(schema.supplierModels.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('ModelCode', id);

    await db
      .update(schema.supplierModels)
      .set({ status: body.status as any, updatedAt: new Date() })
      .where(eq(schema.supplierModels.id, id));

    return reply.send({ data: { id, status: body.status } });
  });

  /**
   * POST /api/v1/admin/model-codes/:id/regenerate — 按当前模板重新生成编码
   * :id = supplier_models.id；旧编码弃用（唯一索引防复用）；返回新旧编码供前端确认弹窗
   */
  app.post('/api/v1/admin/model-codes/:id/regenerate', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = intParam(request.params as Record<string, unknown>, 'id');

    const [row] = await db
      .select({ id: schema.supplierModels.id, modelCode: schema.supplierModels.modelCode })
      .from(schema.supplierModels)
      .where(eq(schema.supplierModels.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('ModelCode', id);

    const oldCode = row.modelCode ?? null;
    const newCode = await generateModelCodeForSupplierModel(id); // 内部校验 active + 模板渲染 + 冲突兜底

    return reply.send({ data: { old_code: oldCode, new_code: newCode } });
  });

  /**
   * GET /api/v1/admin/model-code-rules — 读取编码规则模板配置
   * template 为 system_config 原始配置值（空串 = 使用默认模板）；default_template 为系统默认「厂商+模型」
   */
  app.get('/api/v1/admin/model-code-rules', { preHandler: [adminAuth] }, async (_request, reply) => {
    const template = await readConfiguredTemplate();
    return reply.send({
      data: {
        template,
        default_template: MODEL_CODE_DEFAULT_TEMPLATE,
        allowed_vars: [...MODEL_CODE_ALLOWED_VARS],
      },
    });
  });

  /**
   * PUT /api/v1/admin/model-code-rules — 保存编码规则模板
   * body { template }：非空 → 校验（未知变量/@/非法字面量 400）并落库；空串 → 恢复默认（存空串，读取侧回退默认模板）
   */
  app.put('/api/v1/admin/model-code-rules', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as { template?: string };
    const template = String(body.template ?? '').trim();

    if (template.length === 0) {
      // 恢复默认：存空串（读取侧回退 MODEL_CODE_DEFAULT_TEMPLATE）
      await db
        .insert(schema.systemConfig)
        .values({ key: MODEL_CODE_TEMPLATE_CONFIG_KEY, value: '' })
        .onConflictDoUpdate({
          target: [schema.systemConfig.key],
          set: { value: '' },
        });
      await invalidateModelCodeTemplateCache();
    } else {
      // 非空：校验（ValidationError 400 不落库）+ upsert + 失效缓存
      await setModelCodeTemplate(template);
    }

    return reply.send({
      data: {
        template,
        default_template: MODEL_CODE_DEFAULT_TEMPLATE,
        allowed_vars: [...MODEL_CODE_ALLOWED_VARS],
      },
    });
  });

  /**
   * POST /api/v1/admin/model-code-rules/preview — 模板预览
   * body { template }（空 → 用默认模板）；取真实映射渲染示例（优先 active）；
   * 无数据时返回占位示例并标注 placeholder=true（示意）。
   */
  app.post('/api/v1/admin/model-code-rules/preview', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as { template?: string };
    let template = String(body.template ?? '').trim();
    if (template.length === 0) template = MODEL_CODE_DEFAULT_TEMPLATE;
    validateModelCodeTemplate(template); // 未知变量 / @ / 空 → 400

    const varsRows = await db
      .select({
        supplierCode: schema.suppliers.code,
        supplierName: schema.suppliers.name,
        modelName: schema.supplierModels.modelName,
        platformModel: schema.supplierModels.platformModel,
        status: schema.supplierModels.status,
      })
      .from(schema.supplierModels)
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(eq(schema.supplierModels.status, 'active'))
      .limit(3);

    const source = varsRows.length > 0 ? varsRows : null;
    const preview = source
      ? source.map((r) => ({
          supplier_code: r.supplierCode,
          model_name: r.modelName,
          rendered_code: renderModelCode(template, {
            supplierCode: r.supplierCode,
            supplierName: r.supplierName,
            modelName: r.modelName,
            platformModel: r.platformModel,
          }),
          placeholder: false,
        }))
      : [
          {
            supplier_code: 'vendor_a',
            model_name: 'example-model',
            rendered_code: renderModelCode(template, {
              supplierCode: 'vendor_a',
              supplierName: '示例供应商',
              modelName: 'example-model',
              platformModel: 'example-model',
            }),
            placeholder: true, // 无真实数据，以下为示意
          },
        ];

    return reply.send({ data: { preview } });
  });
}
