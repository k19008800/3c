/**
 * 管理端系统设置 API — 对齐 AdminSettingsPage（站点/限流/安全/功能）
 *
 * 端点覆盖：
 *   GET /api/v1/admin/settings                     — 汇总返回全部 system_config 值
 *   PUT /api/v1/admin/settings/site                — 站点设置
 *   PUT /api/v1/admin/settings/rate-limit          — 限流（全局 + 企业/个人默认，额度页读取）
 *   PUT /api/v1/admin/settings/security            — 安全策略
 *   PUT /api/v1/admin/settings/features            — 功能开关
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../lib/errors';
import { sendMail, getSmtpConfig } from '../services/mailer';
import { invalidateThresholdCache } from '../services/billing/pre-consume';
import { invalidateCacheDiscountCache } from '../services/billing/cache-discount';

/* ───────── helpers ───────── */

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/** 全部设置键的默认值与类型。GET 时按类型解析返回。 */
const SETTING_DEFAULTS: Record<string, { value: string; type: 'string' | 'number' | 'bool' }> = {
  // site — 键名与 portal public.ts 白名单 site_* 对齐（后台维护 → 门户展示）
  site_name: { value: '3Cloud', type: 'string' },
  site_desc: { value: 'AI 模型聚合平台', type: 'string' },
  site_logo_url: { value: '', type: 'string' },
  site_favicon_url: { value: '', type: 'string' },
  site_company_name: { value: '3Cloud Technology', type: 'string' },
  site_icp: { value: '', type: 'string' },
  site_icp_link: { value: '', type: 'string' },
  site_police_icp: { value: '', type: 'string' },
  site_contact_email: { value: 'support@unmisa.com', type: 'string' },
  site_contact_phone: { value: '', type: 'string' },
  site_copyright: { value: '', type: 'string' },
  site_wechat_qr_url: { value: '', type: 'string' },
  site_footer_html: { value: '', type: 'string' },
  maintenance_mode: { value: 'false', type: 'bool' },
  // rate-limit
  rate_limit_enabled: { value: 'true', type: 'bool' },
  global_rpm: { value: '10000', type: 'number' },
  global_tpm: { value: '10000000', type: 'number' },
  enterprise_rpm: { value: '300', type: 'number' },
  enterprise_tpm: { value: '1000000', type: 'number' },
  personal_rpm: { value: '60', type: 'number' },
  personal_tpm: { value: '200000', type: 'number' },
  // security
  session_timeout: { value: '1440', type: 'number' },
  max_login_attempts: { value: '5', type: 'number' },
  mfa_required: { value: 'false', type: 'bool' },
  ip_whitelist_enabled: { value: 'false', type: 'bool' },
  ip_whitelist: { value: '', type: 'string' },
  // features
  registration_open: { value: 'true', type: 'bool' },
  recharge_enabled: { value: 'true', type: 'bool' },
  withdraw_enabled: { value: 'true', type: 'bool' },
  // api — 对外 API 网关域名（独立域名 api.<host>，OpenAI/Anthropic 双 base_url 派生）
  api_domain: { value: 'api.unmisa.com', type: 'string' },
  // billing — 计费（P0-1 阈值旁路：余额 > 此值 → 不预扣直接转发；≤ 此值 → Redis Lua 预扣）
  // 注意：键名含点号（billing.balance_threshold），与 pre-consume.ts 读取键一致
  'billing.balance_threshold': { value: '100', type: 'number' },
  // billing — 缓存命中折扣率（0-1）：上游返回缓存命中 token 时，命中部分按全价 × 此比例计费。
  // 默认 0.1（DeepSeek 官方口径）；模型级 vendor_pricing.cache_discount_rate 可逐模型覆盖。
  'billing.cache_hit_discount': { value: '0.1', type: 'number' },
  // smtp
  smtp_enabled: { value: 'false', type: 'bool' },
  smtp_host: { value: '', type: 'string' },
  smtp_port: { value: '465', type: 'number' },
  smtp_user: { value: '', type: 'string' },
  smtp_pass: { value: '', type: 'string' },
  smtp_from: { value: '', type: 'string' },
};

const KEYS = Object.keys(SETTING_DEFAULTS);

function parseValue(key: string, raw: string): string | number | boolean {
  const t = SETTING_DEFAULTS[key]?.type ?? 'string';
  if (t === 'bool') return raw === 'true' || raw === '1';
  if (t === 'number') {
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  }
  return raw;
}

/** 批量写入配置（upsert），operator 记录到 updated_by */
async function setConfigs(operatorId: number | null, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTING_DEFAULTS)) throw new ValidationError(`未知配置键: ${key}`);
    await db.insert(schema.systemConfig)
      .values({ key, value: String(value), updatedBy: operatorId })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: String(value), updatedBy: operatorId, updatedAt: new Date() },
      });
  }
}

function writeAudit(request: any, section: string, values: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action: `settings.${section}`,
    resource: 'system_config',
    resourceId: null,
    details: { section, keys: Object.keys(values) } as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── route plugin ───────── */

export async function adminSettingsRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/settings — 全部设置
   */
  app.get('/api/v1/admin/settings', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(inArray(schema.systemConfig.key, KEYS));
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const data: Record<string, string | number | boolean> = {};
    for (const key of KEYS) {
      const raw = map.get(key);
      const def = SETTING_DEFAULTS[key]!;
      data[key] = raw != null ? parseValue(key, raw) : parseValue(key, def.value);
    }
    return reply.send({ data });
  });

  /**
   * PUT /api/v1/admin/settings/site — 站点设置
   */
  app.put('/api/v1/admin/settings/site', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = [
      'site_name', 'site_desc', 'site_logo_url', 'site_favicon_url', 'site_company_name',
      'site_icp', 'site_icp_link', 'site_police_icp', 'site_contact_email', 'site_contact_phone',
      'site_copyright', 'site_wechat_qr_url', 'site_footer_html', 'maintenance_mode',
    ];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'site', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/rate-limit — 限流设置（全局 + 企业/个人默认）
   */
  app.put('/api/v1/admin/settings/rate-limit', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['rate_limit_enabled', 'global_rpm', 'global_tpm', 'enterprise_rpm', 'enterprise_tpm', 'personal_rpm', 'personal_tpm'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'rate-limit', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/security — 安全策略
   */
  app.put('/api/v1/admin/settings/security', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['session_timeout', 'max_login_attempts', 'mfa_required', 'ip_whitelist_enabled', 'ip_whitelist'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'security', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/features — 功能开关
   */
  app.put('/api/v1/admin/settings/features', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['registration_open', 'recharge_enabled', 'withdraw_enabled'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'features', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/api — 对外 API 域名（OpenAI/Anthropic 双 base_url 派生源）
   *
   * 值可为域名（api.unmisa.com）或完整 origin（http://localhost:3000）。
   * 门户/控制台通过 GET /api/v1/public/api-config 读取派生地址。
   */
  app.put('/api/v1/admin/settings/api', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['api_domain'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'api', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/billing — 计费设置（P0-1 阈值旁路 + 缓存命中折扣率）
   *
   * 写 system_config `billing.balance_threshold`（默认 ¥100）+ `billing.cache_hit_discount`
   * （默认 0.1）+ 写审计 + 失效 Redis 缓存（判定即时生效）。
   */
  app.put('/api/v1/admin/settings/billing', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['billing.balance_threshold', 'billing.cache_hit_discount'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    // 阈值必须为非负数字（元）
    if (values['billing.balance_threshold'] !== undefined) {
      const threshold = Number(values['billing.balance_threshold']);
      if (!(Number.isFinite(threshold) && threshold >= 0)) {
        throw new ValidationError('billing.balance_threshold 必须是非负数字（元）');
      }
    }
    // 缓存命中折扣率必须在 (0, 1] 区间（0 或 >1 无意义，置 1 = 命中按全价 = 关闭折扣）
    if (values['billing.cache_hit_discount'] !== undefined) {
      const rate = Number(values['billing.cache_hit_discount']);
      if (!(Number.isFinite(rate) && rate > 0 && rate <= 1)) {
        throw new ValidationError('billing.cache_hit_discount 必须是 (0, 1] 区间的数字（如 0.1 = 命中按 10% 计费）');
      }
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'billing', values);
    // 失效阈值 + 折扣率 Redis 缓存（60s）→ 网关旁路判定 / 缓存计费即时生效
    await invalidateThresholdCache();
    await invalidateCacheDiscountCache();
    return reply.send({ data: { ok: true } });
  });

  /**
   * PUT /api/v1/admin/settings/smtp — SMTP 邮箱设置（邮件模板页读取 smtp_enabled）
   */
  app.put('/api/v1/admin/settings/smtp', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const allowed = ['smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'];
    const values: Record<string, string> = {};
    for (const k of allowed) {
      if (b[k] !== undefined) values[k] = String(b[k]);
    }
    // 密码留空则不覆盖（保护已保存的密码）
    if (b.smtp_pass === undefined || String(b.smtp_pass) === '') {
      delete values['smtp_pass'];
    }
    await setConfigs(request.userContext?.userId ?? null, values);
    await writeAudit(request, 'smtp', values);
    return reply.send({ data: { ok: true } });
  });

  /**
   * POST /api/v1/admin/settings/smtp/test — 发送测试邮件验证 SMTP 配置
   */
  app.post('/api/v1/admin/settings/smtp/test', { preHandler: [adminAuth] }, async (request, reply) => {
    const b = (request.body || {}) as Record<string, unknown>;
    const to = String(b.to || '').trim();
    if (!to.includes('@')) throw new ValidationError('Invalid recipient email');

    const cfg = await getSmtpConfig();
    if (!cfg.enabled || !cfg.host) {
      return reply.send({ data: { ok: false }, message: 'SMTP 未启用或未配置，请先保存并启用' });
    }
    const r = await sendMail({
      to,
      subject: '3Cloud 邮件服务测试',
      html: '<p>这是一封来自 3Cloud 的测试邮件。</p><p>如果你收到这封邮件，说明 SMTP 配置正确 ✅</p>',
      templateName: 'smtp_test',
    });
    if (!r.ok) return reply.send({ data: { ok: false }, message: `发送失败：${r.error ?? '未知错误'}` });
    return reply.send({ data: { ok: true }, message: '测试邮件已发送，请查收' });
  });
}
