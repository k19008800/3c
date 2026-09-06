/**
 * Admin 返利/兑换码域缺失端点补齐 — 推广返利（A3）+ 兑换码批次（A6）
 *
 * 端点清单（全部 adminAuth）：
 *   ── 推广返利 (A3, SPEC-§8/§19) ──
 *   GET  /api/v1/admin/affiliate/config         读取返利配置（system_config key=affiliate_config）
 *   PUT  /api/v1/admin/affiliate/config         保存返利配置（requireNotImpersonated + 写审计）
 *   GET  /api/v1/admin/affiliate/records        返利记录（agent_invitations 邀请 + agent_commissions 返佣）
 *   ── 兑换码批次 (A6, SPEC-§8) ──
 *   GET  /api/v1/admin/coupons                  批次列表（coupon_codes 模板表，关键字 search 过滤）
 *   POST /api/v1/admin/coupons/generate         创建批次并生成 total_count 个兑换码（写审计）
 *
 * 数据源：
 *   - 返利配置：system_config（JSON）——启用开关/类型(固定|比例)/返利值/上限/Cookie 有效期
 *   - 返利记录：agent_invitations.join(agents).join(users)（邀请人）——被邀请人姓名用子查询；
 *               返佣金额/状态通过 agent_commissions 按 agentId + customerUserId(=usedBy) 关联。
 *   - 兑换码：coupon_codes（批次模板）+ campaign_coupon_codes（单个码），与 admin-finance-missing
 *             redemption/batches 同源，但按 AdminCouponPage 契约（type/value/redeemed_count）出参。
 *
 * 审计约定：写操作写 audit_logs；只读 GET 不写。
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { eq, and, or, desc, ilike, inArray, sql } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError, ValidationError, AppError } from '../lib/errors.js';
import { requireNotImpersonated } from '../middleware/require-perm.js';

/* ───────── 常量 ───────── */

/** 返利配置在 system_config 中的键 */
const AFFILIATE_CONFIG_KEY = 'affiliate_config';

/** 返利配置默认值 */
const DEFAULT_AFFILIATE_CONFIG = {
  enabled: false,
  reward_type: 'fixed',
  reward_value: 10,
  reward_cap: 0,
  cookie_days: 30,
};

/** 兑换码简易类型 → coupon_type 存储值与展示文案 */
const COUPON_TYPE_LABEL: Record<string, string> = {
  flat: '直减',
  fixed_amount: '直减',
  threshold: '满减',
  percent: '折扣',
};

/* ───────── auth / audit ───────── */

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

/** 写入操作审计日志 */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/* ───────── 通用工具 ───────── */

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 分页参数解析（page ≥ 1，page_size 1~200） */
function pageParams(q: Record<string, string | undefined>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 读取 system_config 中某个 JSON 键；不存在/解析失败返回 fallback */
async function loadJson(key: string, fallback: unknown): Promise<any> {
  const rows = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key))
    .limit(1);
  if (!rows[0]?.value) return fallback;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return fallback;
  }
}

/** 写入 system_config JSON 键（幂等 upsert） */
async function saveJson(key: string, value: unknown, description: string, operatorId?: number | null) {
  const patch: { value: string; description: string; updatedAt: Date; updatedBy?: number } = {
    value: JSON.stringify(value),
    description,
    updatedAt: new Date(),
  };
  if (operatorId != null) patch.updatedBy = operatorId;
  await db.insert(schema.systemConfig)
    .values({ key, value: patch.value, description, updatedBy: operatorId ?? null })
    .onConflictDoUpdate({ target: schema.systemConfig.key, set: patch });
}

/** 兑换码：12 位大写字母数字（去除易混淆字符，与 admin-finance-missing 同风格） */
function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) code += chars.charAt((buf[i] ?? 0) % chars.length);
  return code;
}

/** 批次号：C + yyyyMMddHHmmss + 4 位随机 */
function genBatchCode(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `C${ts}${rand}`;
}

/** 兑换码批次行 → AdminCouponPage CouponItem 契约 */
function mapCoupon(r: any) {
  const rawType = String(r.couponType ?? 'flat');
  const type = rawType === 'fixed_amount' ? 'flat' : rawType;
  return {
    id: r.id,
    batch_code: r.batchCode,
    batch_name: r.batchName,
    type,
    type_label: COUPON_TYPE_LABEL[rawType] ?? rawType,
    value: toNum(r.faceValue),
    total_count: r.totalCount,
    redeemed_count: r.usedCount,
    expires_at: r.validTo ? r.validTo.toISOString() : null,
    status: r.status,
    status_label: r.status === 'active' ? '启用' : r.status === 'disabled' ? '停用' : r.status === 'expired' ? '已过期' : r.status,
    created_at: r.createdAt.toISOString(),
  };
}

export async function adminAffiliateCouponsRoutes(app: FastifyInstance) {
  /* ═══════════ A3. 推广返利 ═══════════ */

  /** GET /api/v1/admin/affiliate/config — 读取返利配置（无则返回默认值） */
  app.get('/api/v1/admin/affiliate/config', { preHandler: [adminAuth] }, async (_request, reply) => {
    const cfg = await loadJson(AFFILIATE_CONFIG_KEY, DEFAULT_AFFILIATE_CONFIG);
    // 与默认值合并，确保新增字段缺省时页面可用
    const merged = { ...DEFAULT_AFFILIATE_CONFIG, ...(cfg ?? {}) };
    return reply.send({ data: {
      enabled: Boolean(merged.enabled),
      reward_type: merged.reward_type,
      reward_value: toNum(merged.reward_value),
      reward_cap: toNum(merged.reward_cap),
      cookie_days: toNum(merged.cookie_days),
    } });
  });

  /** PUT /api/v1/admin/affiliate/config — 保存返利配置（requireNotImpersonated + 写审计） */
  app.put('/api/v1/admin/affiliate/config', { preHandler: [requireNotImpersonated(), adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as {
      enabled?: boolean; reward_type?: string; reward_value?: number; reward_cap?: number; cookie_days?: number;
    };
    const enabled = Boolean(body.enabled);
    const rewardType = String(body.reward_type ?? 'fixed');
    if (rewardType !== 'fixed' && rewardType !== 'percentage') {
      throw new ValidationError('reward_type 必须为 fixed（固定额度）或 percentage（消费比例）');
    }
    const rewardValue = body.reward_value === undefined ? DEFAULT_AFFILIATE_CONFIG.reward_value : Number(body.reward_value);
    const rewardCap = body.reward_cap === undefined ? DEFAULT_AFFILIATE_CONFIG.reward_cap : Number(body.reward_cap);
    const cookieDays = body.cookie_days === undefined ? DEFAULT_AFFILIATE_CONFIG.cookie_days : Number(body.cookie_days);
    if (!Number.isFinite(rewardValue) || rewardValue < 0) throw new ValidationError('reward_value 必须是非负数字');
    if (!Number.isFinite(rewardCap) || rewardCap < 0) throw new ValidationError('reward_cap 必须是非负数字（0=不限）');
    if (!Number.isFinite(cookieDays) || cookieDays < 0 || !Number.isInteger(cookieDays)) {
      throw new ValidationError('cookie_days 必须是非负整数（天）');
    }

    const cfg = { enabled, reward_type: rewardType, reward_value: rewardValue, reward_cap: rewardCap, cookie_days: cookieDays };
    const operatorId = (request as any).userContext?.userId ?? null;
    await saveJson(AFFILIATE_CONFIG_KEY, cfg, '推广返利配置（AdminAffiliatePage）', operatorId);
    await writeAudit(request, 'affiliate.config.update', 'system_config', AFFILIATE_CONFIG_KEY, cfg);

    return reply.send({ data: cfg, message: '推荐返利配置已保存' });
  });

  /** GET /api/v1/admin/affiliate/records?page=&page_size= — 返利记录（邀请 + 返佣） */
  app.get('/api/v1/admin/affiliate/records', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page?: string; page_size?: string };
    const { pageSize, offset } = pageParams(q);

    // 已使用（有被邀请人）的邀请：邀请人 = agent 归属 user；被邀请人姓名用子查询；
    // 返佣金额/状态通过 agent_commissions 按 agentId(=agents.id) + customerUserId(=usedBy) 关联
    // （agent_commissions.agentId 与 agent_invitations.agentId 同源，均指向 agents.id）。
    const rows = await db.select({
      id: schema.agentInvitations.id,
      agentId: schema.agentInvitations.agentId,
      inviterUserId: schema.agents.userId,
      inviterName: schema.users.name,
      inviteeId: schema.agentInvitations.usedBy,
      usedAt: schema.agentInvitations.usedAt,
      createdAt: schema.agentInvitations.createdAt,
      rewardAmount: sql<number>`coalesce(max(${schema.agentCommissions.amount}), 0)`,
      rewardStatus: sql<string>`coalesce(max(${schema.agentCommissions.status}), 'pending')`,
    })
      .from(schema.agentInvitations)
      .innerJoin(schema.agents, eq(schema.agents.id, schema.agentInvitations.agentId))
      .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
      .leftJoin(schema.agentCommissions, and(
        eq(schema.agentCommissions.agentId, schema.agentInvitations.agentId),
        eq(schema.agentCommissions.customerUserId, schema.agentInvitations.usedBy!),
      ))
      .where(sql`${schema.agentInvitations.usedBy} IS NOT NULL`)
      .groupBy(
        schema.agentInvitations.id,
        schema.agents.userId,
        schema.users.name,
        schema.agentInvitations.usedBy,
        schema.agentInvitations.usedAt,
        schema.agentInvitations.createdAt,
      )
      .orderBy(desc(schema.agentInvitations.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 被邀请人姓名批量补齐（避免对每个邀请人发子查询；上面 inviteeName 仅为占位）
    const inviteeIds = [...new Set(rows.map((r) => Number(r.inviteeId)).filter((x) => x > 0))];
    const inviteeRows = inviteeIds.length > 0
      ? await db.select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, inviteeIds))
      : [];
    const inviteeNameMap = new Map<number, string>(inviteeRows.map((u) => [u.id, u.name]));

    const list = rows.map((r) => {
      const inviteeId = Number(r.inviteeId);
      return {
        id: r.id,
        inviter_id: Number(r.inviterUserId),
        inviter_name: r.inviterName,
        invitee_id: inviteeId,
        invitee_name: inviteeNameMap.get(inviteeId) ?? '',
        reward_amount: Math.round((toNum(r.rewardAmount) ?? 0) * 100), // 前端 (v/100).toFixed(2) → 元×100
        status: r.rewardStatus === 'settled' ? 'credited' : 'pending',
        created_at: (r.usedAt ?? r.createdAt).toISOString(),
      };
    });

    return reply.send({ data: { list } });
  });

  /* ═══════════ A6. 兑换码批次 ═══════════ */

  /** GET /api/v1/admin/coupons?page=&page_size=&search= — 兑换码批次列表 */
  app.get('/api/v1/admin/coupons', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { page?: string; page_size?: string; search?: string };
    const { page, pageSize, offset } = pageParams(q);
    const search = (q.search ?? '').trim();

    const filters = search ? or(
      ilike(schema.couponCodes.batchName, `%${search}%`),
      ilike(schema.couponCodes.batchCode, `%${search}%`),
    ) : undefined;

    const [cntRows, rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(schema.couponCodes).where(filters),
      db.select().from(schema.couponCodes)
        .where(filters)
        .orderBy(desc(schema.couponCodes.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    return reply.send({
      data: {
        list: rows.map(mapCoupon),
        pagination: { page, page_size: pageSize, total: cntRows[0]?.total ?? 0 },
      },
    });
  });

  /** POST /api/v1/admin/coupons/generate — 创建兑换码批次并生成 total_count 个兑换码 */
  app.post('/api/v1/admin/coupons/generate', { preHandler: [requireNotImpersonated(), adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as {
      batch_name?: string; type?: string; value?: number; total_count?: number; expires_at?: string;
    };
    const name = String(body.batch_name ?? '').trim();
    if (!name) throw new ValidationError('批次名称必填');
    const type = String(body.type ?? 'flat');
    if (type !== 'flat' && type !== 'threshold' && type !== 'percent') {
      throw new ValidationError('type 必须为 flat（直减）/ threshold（满减）/ percent（折扣）');
    }
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) throw new ValidationError('单码面额需大于 0');
    const totalCount = parseInt(String(body.total_count ?? ''), 10);
    if (!Number.isInteger(totalCount) || totalCount <= 0 || totalCount > 10000) {
      throw new ValidationError('生成数量需在 1~10000 之间');
    }
    const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) throw new ValidationError('过期时间格式错误');
    const operatorId = (request as any).userContext?.userId ?? null;

    // 事务：写批次模板（coupon_codes）+ 批量生成单个码（campaign_coupon_codes），失败整体回滚
    const batch = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.couponCodes)
        .values({
          batchCode: genBatchCode(),
          batchName: name,
          couponType: type,
          faceValue: value.toFixed(2),
          totalCount,
          usedCount: 0,
          status: 'active',
          validTo: expiresAt,
          createdBy: operatorId,
        })
        .returning();
      if (!row) throw new AppError('批次创建失败', 500, 'BATCH_CREATE_FAILED');

      const codes: { campaignId: number; code: string }[] = [];
      const seen = new Set<string>();
      while (codes.length < totalCount) {
        const code = genCode();
        if (seen.has(code)) continue;
        seen.add(code);
        codes.push({ campaignId: row.id, code });
      }
      await tx.insert(schema.campaignCouponCodes).values(codes);
      return row;
    });

    await writeAudit(request, 'coupon.batch.create', 'coupon_codes', String(batch.id), { name, type, value, totalCount });
    return reply.status(201).send({
      data: { batch: mapCoupon(batch), message: `批次已创建，已生成 ${totalCount} 个兑换码` },
    });
  });
}