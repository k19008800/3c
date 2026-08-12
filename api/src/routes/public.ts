/**
 * 公开接口（无需认证）— Portal 门户数据源
 *
 * 端点覆盖：
 *   站点配置   — GET /api/v1/public/site-config
 *   模型目录   — GET /api/v1/public/models
 *   系统状态   — GET /api/v1/public/status
 *
 * 说明：
 *   · site-config 按白名单过滤 system_config 的 site_* keys（与 3cloud-portal-ref 一致）
 *   · models 与 /public/pricing 同源，均为「供应商模型 × 销售定价」join，
 *     只返回存在 active 销售定价（vendor_pricing）的模型
 *   · status 反映 3Cloud 基础设施健康度 + 供应商健康状态（不反映供应商侧故障）
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

/** 公开暴露的 site_* keys（见 3cloud-portal-ref §1.3，12 个） */
const SITE_CONFIG_WHITELIST = [
  'site_name',
  'site_logo_url',
  'site_favicon_url',
  'site_company_name',
  'site_icp',
  'site_icp_link',
  'site_police_icp',
  'site_contact_email',
  'site_contact_phone',
  'site_copyright',
  'site_wechat_qr_url',
  'site_footer_html',
];

const SUPPLIER_STATUS_MAP: Record<string, string> = {
  active: 'operational',
  maintenance: 'degraded',
  offline: 'degraded',
  deprecated: 'degraded',
};

export async function publicRoutes(app: FastifyInstance) {
  /** GET /api/v1/public/site-config — 站点品牌配置（白名单过滤） */
  app.get('/api/v1/public/site-config', async (_request, reply) => {
    const rows = await db.select({
      key: schema.systemConfig.key,
      value: schema.systemConfig.value,
    })
      .from(schema.systemConfig)
      .where(inArray(schema.systemConfig.key, SITE_CONFIG_WHITELIST));

    const config: Record<string, string> = {};
    for (const r of rows) config[r.key] = r.value;

    return reply.send(config);
  });

  /** GET /api/v1/public/models — 公开模型目录（有 active 销售定价的模型） */
  app.get('/api/v1/public/models', async (_request, reply) => {
    const models = await db.select({
      name: schema.supplierModels.modelName,
      display_name: schema.supplierModels.platformModel,
      category: sql<string>`null`,
      context_length: schema.supplierModels.maxTokens,
      vendor: schema.suppliers.name,
      cost_input_price: schema.supplierModels.inputPrice,
      cost_output_price: schema.supplierModels.outputPrice,
    })
      .from(schema.vendorPricing)
      .innerJoin(
        schema.supplierModels,
        eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id),
      )
      .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
      .where(eq(schema.vendorPricing.status, 'active' as any))
      .orderBy(schema.supplierModels.modelName);

    return reply.send({ list: models });
  });

  /** GET /api/v1/public/status — 系统状态概览（API 健康 + 供应商健康） */
  app.get('/api/v1/public/status', async (_request, reply) => {
    // 基础设施健康（db/redis/api），与 /health 同源判断
    let dbOk = false;
    let redisOk = false;
    try {
      await db.execute(sql`select 1`);
      dbOk = true;
    } catch { /* db down */ }

    if ((app as any).redis) {
      try {
        const pong = await (app as any).redis.ping();
        redisOk = pong === 'PONG';
      } catch { /* redis down */ }
    } else {
      // 未接入 Redis 时视为 up（避免误报降级）
      redisOk = true;
    }

    const infraStatus = dbOk && redisOk ? 'operational' : 'degraded';

    const [vendors, stats] = await Promise.all([
      db.select({
        name: schema.suppliers.name,
        status: schema.suppliers.status,
        healthStatus: schema.suppliers.healthStatus,
        healthLastCheck: schema.suppliers.healthLastCheck,
      })
        .from(schema.suppliers)
        .orderBy(schema.suppliers.name),
      db.select({
        users: sql<number>`coalesce((select count(*) from ${schema.users} where role = 'customer' and status = 'active'), 0)`,
        models: sql<number>`coalesce((select count(*) from ${schema.supplierModels}), 0)`,
        vendors: sql<number>`coalesce((select count(*) from ${schema.suppliers} where status = 'active'), 0)`,
      }).from(sql`(select 1) as t`),
    ]);

    return reply.send({
      code: 0,
      data: {
        status: infraStatus,
        updatedAt: new Date().toISOString(),
        services: [
          { name: 'API 网关', status: 'operational', description: '3Cloud API 网关运行正常' },
          { name: '数据库', status: dbOk ? 'operational' : 'major_outage', description: dbOk ? 'PostgreSQL 连接正常' : 'PostgreSQL 连接异常' },
          { name: 'Redis', status: redisOk ? 'operational' : 'major_outage', description: redisOk ? 'Redis 缓存正常' : 'Redis 缓存异常' },
          { name: '模型网关', status: 'operational', description: '模型网关运行正常' },
        ],
        announcements: await db.select({
          id: schema.announcements.id,
          title: schema.announcements.title,
          type: schema.announcements.type,
          content: schema.announcements.content,
          createdAt: schema.announcements.createdAt,
        })
          .from(schema.announcements)
          .where(and(
            eq(schema.announcements.status, 'published'),
            sql`coalesce(${schema.announcements.publishAt}, now()) <= now()`,
          ))
          .orderBy(desc(schema.announcements.createdAt))
          .limit(10),
        // 供应商健康（health_status 优先，无则按 status 映射）
        vendors: vendors.map((v) => ({
          name: v.name,
          status: v.healthStatus === 'healthy' || v.healthStatus === 'up'
            ? 'operational'
            : (v.healthStatus && v.healthStatus !== 'unknown' ? 'degraded' : (SUPPLIER_STATUS_MAP[v.status] ?? 'degraded')),
          healthScore: v.healthStatus === 'healthy' ? 100 : v.healthStatus === 'degraded' ? 50 : v.healthStatus === 'down' ? 0 : 50,
        })),
        stats: {
          totalUsers: Number(stats[0]?.users ?? 0),
          totalModels: Number(stats[0]?.models ?? 0),
          totalVendors: Number(stats[0]?.vendors ?? 0),
        },
      },
    });
  });
}
