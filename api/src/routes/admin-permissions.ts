/**
 * 管理端权限/策略路由 — /api/v1/admin/{users,roles,apikey-policy,notification-policies}
 *
 * 补齐「完全缺失」权限类页面（产品裁决 2026-08-15）：
 *   GET    /admin/users                          — 用户列表（角色）
 *   GET    /admin/users/:id/roles                — 用户已分配角色
 *   GET    /admin/users/:id/permissions/detail   — 用户权限详情（effective + 权限树）
 *   POST   /admin/users/:id/roles/assign         — 分配角色
 *   POST   /admin/users/:id/roles/remove         — 移除角色
 *   GET    /admin/roles                          — 角色列表
 *   GET    /admin/apikey-policy                  — API Key 安全策略（system_config apikey_policy）
 *   PUT    /admin/apikey-policy                  — 保存策略
 *   GET    /admin/notification-policies          — 通知策略（system_config notification_policy）
 *   PUT    /admin/notification-policies          — 保存策略
 *
 * 角色模型：users.role 为单一主角色；权限树按主角色映射（本期不建独立 roles 表，
 * 与现有 JWT role 模型一致——扩展多角色需后续迭代）。
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, sql, and, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';

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

/* ───────── 角色与权限树（静态映射，本期不建表） ───────── */

const ROLES = [
  { id: 1, name: 'super_admin', label: '超级管理员', permissions: 99, is_system: true },
  { id: 2, name: 'admin', label: '管理员', permissions: 40, is_system: true },
  { id: 3, name: 'agent', label: '代理商', permissions: 8, is_system: true },
  { id: 4, name: 'sales', label: '业务员', permissions: 6, is_system: true },
  { id: 5, name: 'finance', label: '财务审核员', permissions: 5, is_system: false },
];

const ROLE_BY_NAME: Record<string, number> = Object.fromEntries(ROLES.map((r) => [r.name, r.id]));

const PERM_GROUPS: { group: string; permissions: { key: string; label: string }[] }[] = [
  { group: '客户管理', permissions: [
    { key: 'customer.view', label: '查看客户' },
    { key: 'customer.edit', label: '编辑客户' },
    { key: 'customer.credit', label: '额度管理' },
    { key: 'customer.verify', label: '实名审核' },
  ]},
  { group: '财务', permissions: [
    { key: 'finance.refund', label: '退款审核' },
    { key: 'finance.topup', label: '人工上账' },
    { key: 'finance.invoice', label: '发票管理' },
    { key: 'finance.reconciliation', label: '对账报表' },
  ]},
  { group: '供应商', permissions: [
    { key: 'supplier.view', label: '查看供应商' },
    { key: 'supplier.edit', label: '编辑供应商' },
    { key: 'supplier.pricing', label: '定价管理' },
  ]},
  { group: '系统', permissions: [
    { key: 'sys.config', label: '系统配置' },
    { key: 'sys.users', label: '用户权限' },
    { key: 'sys.cache', label: '缓存管理' },
    { key: 'sys.audit', label: '审计日志' },
  ]},
];

/** 角色 → 权限 key 集合（与前端 MOCK_PERMS_TREE 口径一致的简化映射） */
const ROLE_PERMS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['customer.view', 'customer.edit', 'customer.credit', 'customer.verify', 'finance.refund', 'finance.topup', 'finance.invoice', 'finance.reconciliation', 'supplier.view', 'supplier.edit', 'supplier.pricing', 'sys.config', 'sys.users', 'sys.audit'],
  finance: ['finance.refund', 'finance.topup', 'finance.invoice', 'finance.reconciliation', 'customer.view'],
  agent: ['customer.view', 'customer.credit'],
  sales: ['customer.view', 'customer.edit'],
};

function effectivePerms(roleName: string): string[] {
  if (ROLE_PERMS[roleName]?.includes('*')) return PERM_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
  return ROLE_PERMS[roleName] ?? [];
}

function permTree(roleName: string) {
  const eff = effectivePerms(roleName);
  return PERM_GROUPS.map((g) => ({
    group: g.group,
    permissions: g.permissions.map((p) => ({ ...p, granted: eff.includes('*') || eff.includes(p.key) })),
  }));
}

/* ───────── 系统配置读写（通用） ───────── */

async function readCfg(key: string): Promise<string | null> {
  const [row] = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig).where(sql`${schema.systemConfig.key} = ${key}`);
  return row?.value ?? null;
}

async function writeCfg(key: string, value: string, operatorId: number | null, description?: string) {
  await db.insert(schema.systemConfig)
    .values({ key, value, description: description ?? null, updatedBy: operatorId })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value, updatedBy: operatorId, updatedAt: new Date() },
    });
}

export async function adminPermissionRoutes(app: FastifyInstance) {
  /* ───────── 用户列表 / 角色 ───────── */

  /** GET /api/v1/admin/users — 用户列表（含角色） */
  app.get('/api/v1/admin/users', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = request.query as { page?: string; page_size?: string; keyword?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 500);

    const conditions: any[] = [];
    if (q.keyword) conditions.push(sql`(${schema.users.email} ILIKE ${'%' + q.keyword + '%'} OR ${schema.users.name} ILIKE ${'%' + q.keyword + '%'})`);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, status: schema.users.status, createdAt: schema.users.createdAt })
        .from(schema.users)
        .where(whereClause)
        .orderBy(desc(schema.users.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => ({ id: r.id, email: r.email, username: r.name, role: r.role, status: r.status, created_at: r.createdAt })),
        pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) },
      },
    });
  });

  /** GET /api/v1/admin/users/:id/roles — 用户已分配角色（单主角色模型 → 至多 1 个） */
  app.get('/api/v1/admin/users/:id/roles', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid user id');
    const [u] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) throw new NotFoundError('User', String(id));
    const role = ROLES.find((r) => r.name === u.role);
    return reply.send({ data: { list: role ? [role] : [] } });
  });

  /** GET /api/v1/admin/users/:id/permissions/detail — 用户权限详情 */
  app.get('/api/v1/admin/users/:id/permissions/detail', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid user id');
    const [u] = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) throw new NotFoundError('User', String(id));

    const role = ROLES.find((r) => r.name === u.role);
    const roles = role ? [role] : [];
    return reply.send({
      data: {
        user: { id: u.id, email: u.email, username: u.name, role: u.role },
        roles,
        effective: effectivePerms(u.role),
        tree: permTree(u.role),
      },
    });
  });

  /** POST /api/v1/admin/users/:id/roles/assign — 分配角色（覆盖主角色） */
  app.post('/api/v1/admin/users/:id/roles/assign', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid user id');
    const body = (request.body || {}) as { role_id?: number };
    const role = ROLES.find((r) => r.id === Number(body.role_id));
    if (!role) throw new ValidationError('角色不存在');

    const actor = (request as any).userContext as { role: string; userId?: number };
    if (role.name === 'super_admin' && actor.role !== 'super_admin') throw new ForbiddenError('仅超级管理员可分配超级管理员角色');

    const [u] = await db.update(schema.users)
      .set({ role: role.name as any, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id, role: schema.users.role });
    if (!u) throw new NotFoundError('User', String(id));

    await db.insert(schema.auditLogs).values({
      userId: actor.userId ?? null,
      action: 'permission.role_assign',
      resource: 'user',
      resourceId: String(id),
      details: { role: role.name } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return reply.send({ data: { ok: true, user_id: id, role: role.name }, message: `已分配角色 ${role.label}` });
  });

  /** POST /api/v1/admin/users/:id/roles/remove — 移除角色（重置为 customer） */
  app.post('/api/v1/admin/users/:id/roles/remove', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid user id');
    const [u] = await db.update(schema.users)
      .set({ role: 'customer' as any, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id, role: schema.users.role });
    if (!u) throw new NotFoundError('User', String(id));
    return reply.send({ data: { ok: true, user_id: id, role: u.role }, message: '已移除角色' });
  });

  /** GET /api/v1/admin/roles — 角色列表 */
  app.get('/api/v1/admin/roles', { preHandler: [adminAuth] }, async (_request, reply) => {
    return reply.send({ data: { list: ROLES } });
  });

  /* ───────── API Key 安全策略 ───────── */

  const APIKEY_POLICY_DEFAULTS = {
    min_length: 32,
    max_age_days: 365,
    require_rotation: false,
    rotation_warning_days: 30,
    max_keys_per_user: 5,
    ip_restriction_enabled: false,
    expiry_enabled: true,
    default_expiry_days: 365,
  };

  /** GET /api/v1/admin/apikey-policy */
  app.get('/api/v1/admin/apikey-policy', { preHandler: [adminAuth] }, async (_request, reply) => {
    const raw = await readCfg('apikey_policy');
    let policy = { ...APIKEY_POLICY_DEFAULTS };
    if (raw) {
      try { policy = { ...policy, ...JSON.parse(raw) }; } catch { /* 损坏回退默认 */ }
    }
    return reply.send({ data: policy });
  });

  /** PUT /api/v1/admin/apikey-policy */
  app.put('/api/v1/admin/apikey-policy', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const merged = { ...APIKEY_POLICY_DEFAULTS, ...body } as Record<string, unknown>;
    const num = (k: string, min: number, max: number, def: number) => {
      const v = Number(merged[k]);
      return Number.isFinite(v) && v >= min && v <= max ? v : def;
    };
    const policy = {
      min_length: num('min_length', 8, 128, 32),
      max_age_days: num('max_age_days', 0, 3650, 365),
      require_rotation: !!merged.require_rotation,
      rotation_warning_days: num('rotation_warning_days', 1, 365, 30),
      max_keys_per_user: num('max_keys_per_user', 1, 100, 5),
      ip_restriction_enabled: !!merged.ip_restriction_enabled,
      expiry_enabled: !!merged.expiry_enabled,
      default_expiry_days: num('default_expiry_days', 1, 3650, 365),
    };
    await writeCfg('apikey_policy', JSON.stringify(policy), (request as any).userContext?.userId ?? null, 'API Key 安全策略');
    return reply.send({ data: policy, message: 'API Key 安全策略已更新' });
  });

  /* ───────── 通知策略（列表型 CRUD，对齐 AdminNotificationPolicyPage 契约） ───────── */

  const NOTIFY_CHANNEL_LABEL: Record<string, string> = { email: '邮件', sms: '短信', in_app: '站内信', webhook: 'Webhook', wechat: '微信' };
  const NOTIFY_EVENT_LABEL: Record<string, string> = {
    'user.register': '用户注册', 'user.login': '用户登录', 'recharge.success': '充值成功',
    'balance.low': '余额不足', 'withdraw.request': '提现申请', 'withdraw.success': '提现成功',
    'invoice.ready': '发票开具', 'ticket.reply': '工单回复', 'api.limit': 'API限流通知',
    'system.announcement': '系统公告',
  };

  interface NotifPolicyRow {
    id: number;
    channel: string;
    event_type: string;
    template_id: number | null;
    enabled: boolean;
    throttle_seconds: number;
  }

  async function readNotifyPolicies(): Promise<NotifPolicyRow[]> {
    const raw = await readCfg('notification_policies_list');
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function writeNotifyPolicies(rows: NotifPolicyRow[], operatorId: number | null) {
    await writeCfg('notification_policies_list', JSON.stringify(rows), operatorId, '通知策略列表');
  }

  /** GET /api/v1/admin/notification-policies — 策略列表 */
  app.get('/api/v1/admin/notification-policies', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await readNotifyPolicies();
    return reply.send({
      data: {
        list: rows.map((r) => ({
          id: r.id,
          channel: r.channel,
          channel_label: NOTIFY_CHANNEL_LABEL[r.channel] ?? r.channel,
          event_type: r.event_type,
          event_label: NOTIFY_EVENT_LABEL[r.event_type] ?? r.event_type,
          template_id: r.template_id,
          enabled: r.enabled,
          throttle_seconds: r.throttle_seconds,
        })),
      },
    });
  });

  /** POST /api/v1/admin/notification-policies — 新建策略 */
  app.post('/api/v1/admin/notification-policies', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const channel = String(body.channel || '');
    const eventType = String(body.event_type || '');
    const templateId = body.template_id != null && body.template_id !== '' ? Number(body.template_id) : null;
    const throttle = Number(body.throttle_seconds ?? 0);

    if (!['email', 'sms', 'in_app', 'webhook', 'wechat'].includes(channel)) throw new ValidationError('channel 不合法');
    if (!eventType) throw new ValidationError('event_type 不能为空');

    const rows = await readNotifyPolicies();
    if (rows.some((r) => r.channel === channel && r.event_type === eventType)) {
      throw new ValidationError('相同渠道+事件已存在策略');
    }
    const id = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
    const row: NotifPolicyRow = { id, channel, event_type: eventType, template_id: templateId, enabled: true, throttle_seconds: throttle };
    rows.push(row);
    await writeNotifyPolicies(rows, (request as any).userContext?.userId ?? null);
    return reply.status(201).send({ data: { id }, message: '通知策略已创建' });
  });

  /** PUT /api/v1/admin/notification-policies/:id — 更新（enabled 或 template_id/throttle_seconds） */
  app.put('/api/v1/admin/notification-policies/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid policy id');
    const body = (request.body || {}) as Record<string, unknown>;
    const rows = await readNotifyPolicies();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundError('NotificationPolicy', String(id));

    if (typeof body.enabled === 'boolean') rows[idx]!.enabled = body.enabled;
    if (body.template_id !== undefined) rows[idx]!.template_id = body.template_id != null && body.template_id !== '' ? Number(body.template_id) : null;
    if (body.throttle_seconds !== undefined) rows[idx]!.throttle_seconds = Number(body.throttle_seconds ?? 0);
    await writeNotifyPolicies(rows, (request as any).userContext?.userId ?? null);
    return reply.send({ data: { ok: true }, message: '通知策略已更新' });
  });

  /** POST /api/v1/admin/notification-policies/:id/delete — 删除策略 */
  app.post('/api/v1/admin/notification-policies/:id/delete', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseInt((request.params as { id: string }).id, 10);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid policy id');
    const rows = await readNotifyPolicies();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) throw new NotFoundError('NotificationPolicy', String(id));
    await writeNotifyPolicies(next, (request as any).userContext?.userId ?? null);
    return reply.send({ data: { ok: true }, message: '通知策略已删除' });
  });
}
