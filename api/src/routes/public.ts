/**
 * 公开接口（无需认证）— Portal 门户数据源
 *
 * 端点覆盖：
 *   站点配置   — GET /api/v1/public/site-config
 *   模型目录   — GET /api/v1/public/models
 *   系统状态   — GET /api/v1/public/status
 *   i18n 词典  — GET /api/v1/public/i18n/entries（P2-3）
 *   博客列表   — GET /api/v1/public/blog（P2-3）
 *   博客详情   — GET /api/v1/public/blog/:slug（P2-3）
 *
 * 说明：
 *   · site-config 按白名单过滤 system_config 的 site_* keys（与 3cloud-portal-ref 一致）
 *   · models 与 /public/pricing 同源，均为「供应商模型 × 销售定价」join，
 *     只返回存在 active 销售定价（vendor_pricing）的模型
 *   · status 反映 3Cloud 基础设施健康度 + 供应商健康状态（不反映供应商侧故障）
 *   · i18n 词典只返回 status='active' 且 scope='portal' 的条目（key → value 映射）
 *   · blog 只返回 type='blog' 且 status='published' 的文章
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, desc, sql, inArray, count } from 'drizzle-orm';
import { isWindowParam, foldModelStats, activeModelCatalog, buildModelStat } from '../services/marketplace/health-queries';
import { HEALTH_ORDER } from '../lib/latency';
import { buildApiConfig, DEFAULT_API_DOMAIN } from '../services/config/api-domain';

/** 门户 i18n 默认语言（未传 lang 时） */
const DEFAULT_PORTAL_LANG = 'zh-CN';

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

  /**
   * GET /api/v1/public/api-config — 对外 API 接入地址（OpenAI/Anthropic 双 base_url）
   *
   * 数据源：system_config.api_domain（管理后台 → 系统设置 → API 服务 可改）。
   * 门户首页 / 控制台接入引导据此渲染，不再硬编码域名。
   */
  app.get('/api/v1/public/api-config', async (_request, reply) => {
    let apiDomain: string | null = null;
    try {
      const [row] = await db.select({ value: schema.systemConfig.value })
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.key, 'api_domain'))
        .limit(1);
      apiDomain = row?.value ?? null;
    } catch {
      /* 查询失败 → 默认域名 */
    }
    return reply.send({ data: buildApiConfig(apiDomain ?? DEFAULT_API_DOMAIN) });
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

  /**
   * GET /api/v1/public/models/health — 公开模型健康度（Portal /models 页面）
   *
   * 只暴露健康状态与价格，不暴露供应商名、错误率等内部信息。
   * 与 admin marketplace 同源（预聚合桶表）。
   */
  app.get('/api/v1/public/models/health', async (request, reply) => {
    const q = request.query as { window?: string };
    const window = q.window && isWindowParam(q.window) ? q.window : '24h';

    const [stats, catalog] = await Promise.all([
      foldModelStats(window),
      activeModelCatalog(),
    ]);

    const modelNames = new Set<string>([...stats.keys(), ...catalog.keys()]);
    const items = [];
    for (const model of modelNames) {
      const stat = buildModelStat(model, stats.get(model), catalog.get(model));
      items.push({
        model,
        success_rate: stat.successRate,
        p50_ms: stat.p50Ms,
        status: stat.status,
        min_price: stat.minPrice,
      });
    }
    items.sort((a, b) =>
      HEALTH_ORDER[a.status as keyof typeof HEALTH_ORDER] - HEALTH_ORDER[b.status as keyof typeof HEALTH_ORDER]
      || a.model.localeCompare(b.model, 'zh-CN'),
    );

    return reply.send({
      data: {
        window,
        generated_at: new Date().toISOString(),
        items,
      },
    });
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

  /**
   * GET /api/v1/public/i18n/entries — 门户 i18n 词典（P2-3）
   *
   * query: lang（缺省 zh-CN）。只返回 status='active' 且 scope='portal' 的条目，
   * 响应格式为 { key: value } 映射，Portal 服务端按 lang 拉取后渲染；
   * 未翻译的 key 由前端回退英文源语（EN_DEFAULTS）。
   *
   * @see docs/SPEC-§23-系统级能力增强.md §23.4
   */
  app.get('/api/v1/public/i18n/entries', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const lang = (q.lang || DEFAULT_PORTAL_LANG).trim();

    const rows = await db.select({
      key: schema.i18nEntries.key,
      value: schema.i18nEntries.value,
    })
      .from(schema.i18nEntries)
      .where(and(
        eq(schema.i18nEntries.lang, lang),
        eq(schema.i18nEntries.scope, 'portal'),
        eq(schema.i18nEntries.status, 'active'),
      ));

    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return reply.send({ data: map });
  });

  /**
   * GET /api/v1/public/blog — 博客文章列表（P2-3）
   *
   * 只返回 type='blog' 且 status='published' 的文章（site_content 表），
   * 分页返回 id/slug/title/updated_at；按更新时间倒序。
   */
  app.get('/api/v1/public/blog', async (request, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
    const offset = (page - 1) * pageSize;

    const where = and(
      eq(schema.siteContents.type, 'blog'),
      eq(schema.siteContents.status, 'published'),
    );

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: schema.siteContents.id,
        slug: schema.siteContents.slug,
        title: schema.siteContents.title,
        updatedAt: schema.siteContents.updatedAt,
      })
        .from(schema.siteContents)
        .where(where)
        .orderBy(desc(schema.siteContents.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(schema.siteContents).where(where),
    ]);

    return reply.send({
      data: {
        items: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          updated_at: r.updatedAt,
        })),
        total: Number(totalRows[0]?.total ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * GET /api/v1/public/blog/:slug — 博客文章详情（P2-3）
   *
   * 按 slug 精确匹配 type='blog' + status='published'；不存在返回 404。
   */
  app.get('/api/v1/public/blog/:slug', async (request, reply) => {
    const slug = String((request.params as Record<string, unknown>).slug || '').trim();
    if (!slug) {
      return reply.status(404).send({ code: 404, message: '文章不存在', requestId: request.id });
    }

    const [row] = await db.select()
      .from(schema.siteContents)
      .where(and(
        eq(schema.siteContents.slug, slug),
        eq(schema.siteContents.type, 'blog'),
        eq(schema.siteContents.status, 'published'),
      ))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: 404, message: '文章不存在', requestId: request.id });
    }

    return reply.send({
      data: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        content: row.content,
        updated_at: row.updatedAt,
      },
    });
  });
}
