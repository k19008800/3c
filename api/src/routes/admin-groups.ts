/**
 * 管理端用户分组（Group）管理 API
 *
 * 端点覆盖：
 *   GET   /api/v1/admin/groups                 — 分组列表（含成员数统计）
 *   POST  /api/v1/admin/groups                 — 创建分组
 *   PUT   /api/v1/admin/groups/:id             — 更新分组（isDefault 置 true 时其他组复位）
 *   DELETE /api/v1/admin/groups/:id            — 删除分组（有成员 / 默认组拒绝）
 *   GET   /api/v1/admin/groups/:id/members     — 组成员列表（分页）
 *   PUT   /api/v1/admin/users/:userId/group    — 设置用户分组（upsert + 缓存清除）
 *
 * 全部 preHandler: [adminAuth]，鉴权逻辑与 admin-customers.ts 保持一致。
 *
 * @module routes/admin-groups
 * @see newapi-gap-analysis.md Batch 2 任务 2.3
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, ne, sql, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import { cacheDel } from '../lib/redis';
import { groupCacheKey } from '../services/groups';

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

interface PaginationQuery {
  page?: string;
  pageSize?: string;
}

function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10) || 20));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/** 解析路径参数为正整数 ID；非法 → 400 */
function parseId(raw: string, label: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw new ValidationError(`Invalid ${label} id`);
  return n;
}

/** 可选正整数（null/空 → null）；非法 → 400 */
function parseOptionalPositiveInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${field} 必须为正整数`);
  return n;
}

/** 可选正数（null/空 → null）；非法 → 400 */
function parseOptionalPositiveNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`${field} 必须为正数`);
  return n;
}

/** modelWhitelist：必须是字符串数组，逐项 trim；空/缺省 → [] */
function parseModelWhitelist(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('modelWhitelist 必须是数组');
  return value.map((m, i) => {
    if (typeof m !== 'string' || !m.trim()) {
      throw new ValidationError(`modelWhitelist[${i}] 必须是非空字符串`);
    }
    return m.trim();
  });
}

/** 解析后的分组输入（仅含请求中出现的字段） */
interface GroupInput {
  name?: string;
  description?: string | null;
  pricingGroup?: string | null;
  rateLimitQps?: number | null;
  rateLimitTpm?: number | null;
  dailyQuota?: number | null;
  modelWhitelist?: string[];
  isDefault?: boolean;
}

/**
 * 校验并解析分组创建/更新 body。
 *
 * @param body - 请求体
 * @param partial - true = 更新（字段可缺省），false = 创建（name 必填）
 * @returns 规范化输入
 * @throws {ValidationError} 参数不合法（400）
 */
function parseGroupInput(body: Record<string, unknown>, partial: boolean): GroupInput {
  const out: GroupInput = {};

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim();
    if (!name) throw new ValidationError('分组名称不能为空');
    if (name.length > 50) throw new ValidationError('分组名称不能超过 50 个字符');
    out.name = name;
  }
  if (body.description !== undefined) {
    const d = body.description == null ? null : String(body.description);
    if (d != null && d.length > 255) throw new ValidationError('分组描述不能超过 255 个字符');
    out.description = d;
  }
  if (body.pricingGroup !== undefined) {
    const p = body.pricingGroup == null ? null : String(body.pricingGroup).trim();
    if (p != null && p.length > 50) throw new ValidationError('pricingGroup 不能超过 50 个字符');
    out.pricingGroup = p || null;
  }
  if (body.rateLimitQps !== undefined) out.rateLimitQps = parseOptionalPositiveInt(body.rateLimitQps, 'rateLimitQps');
  if (body.rateLimitTpm !== undefined) out.rateLimitTpm = parseOptionalPositiveInt(body.rateLimitTpm, 'rateLimitTpm');
  if (body.dailyQuota !== undefined) out.dailyQuota = parseOptionalPositiveNumber(body.dailyQuota, 'dailyQuota');
  if (body.modelWhitelist !== undefined) out.modelWhitelist = parseModelWhitelist(body.modelWhitelist);
  if (body.isDefault !== undefined) {
    if (typeof body.isDefault !== 'boolean') throw new ValidationError('isDefault 必须是布尔值');
    out.isDefault = body.isDefault;
  }
  return out;
}

/** 校验分组名称唯一；重复 → 400（excludeId 用于更新时排除自身） */
async function ensureNameUnique(name: string, excludeId?: number) {
  const [existing] = await db
    .select({ id: schema.userGroups.id })
    .from(schema.userGroups)
    .where(eq(schema.userGroups.name, name))
    .limit(1);
  if (existing && existing.id !== excludeId) {
    throw new ValidationError('分组名称已存在');
  }
}

/** 分组行查询字段（列表 / 详情复用） */
const groupFields = {
  id: schema.userGroups.id,
  name: schema.userGroups.name,
  description: schema.userGroups.description,
  pricingGroup: schema.userGroups.pricingGroup,
  rateLimitQps: schema.userGroups.rateLimitQps,
  rateLimitTpm: schema.userGroups.rateLimitTpm,
  dailyQuota: schema.userGroups.dailyQuota,
  modelWhitelist: schema.userGroups.modelWhitelist,
  isDefault: schema.userGroups.isDefault,
  status: schema.userGroups.status,
  createdAt: schema.userGroups.createdAt,
  updatedAt: schema.userGroups.updatedAt,
};

/** 归一化分组行 → 对外 DTO（numeric → number，白名单保证为数组） */
function groupDTO(r: Record<string, any>) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    pricingGroup: r.pricingGroup,
    rateLimitQps: r.rateLimitQps,
    rateLimitTpm: r.rateLimitTpm,
    dailyQuota: r.dailyQuota != null ? Number(r.dailyQuota) : null,
    modelWhitelist: Array.isArray(r.modelWhitelist) ? r.modelWhitelist : [],
    isDefault: r.isDefault,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/* ───────── route plugin ───────── */

export async function adminGroupRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/admin/groups — 分组列表
   * 含成员数统计（LEFT JOIN + 按主键 GROUP BY，PG 函数依赖保证列可安全选择）。
   */
  app.get('/api/v1/admin/groups', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db
      .select({
        ...groupFields,
        memberCount: sql<number>`count(${schema.userGroupMemberships.id})`,
      })
      .from(schema.userGroups)
      .leftJoin(schema.userGroupMemberships, eq(schema.userGroupMemberships.groupId, schema.userGroups.id))
      .groupBy(schema.userGroups.id)
      .orderBy(desc(schema.userGroups.createdAt));

    const list = rows.map((r) => ({
      ...groupDTO(r),
      memberCount: Number(r.memberCount ?? 0),
    }));

    return reply.send({
      data: list,
      pagination: { page: 1, pageSize: list.length, total: list.length, totalPages: 1 },
    });
  });

  /**
   * POST /api/v1/admin/groups — 创建分组
   * body: name(必填)/description/pricingGroup/rateLimitQps/rateLimitTpm/dailyQuota/modelWhitelist/isDefault
   */
  app.post('/api/v1/admin/groups', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const input = parseGroupInput(request.body ?? {}, false);
    await ensureNameUnique(input.name!);

    const [row] = await db
      .insert(schema.userGroups)
      .values({
        name: input.name!,
        description: input.description ?? null,
        pricingGroup: input.pricingGroup ?? null,
        rateLimitQps: input.rateLimitQps ?? null,
        rateLimitTpm: input.rateLimitTpm ?? null,
        dailyQuota: input.dailyQuota != null ? String(input.dailyQuota) : null,
        modelWhitelist: input.modelWhitelist ?? [],
        isDefault: input.isDefault ?? false,
      })
      .returning();

    if (!row) throw new Error('Failed to create group');
    return reply.code(201).send({ data: groupDTO(row), message: '分组创建成功' });
  });

  /**
   * PUT /api/v1/admin/groups/:id — 更新分组
   * 全部字段可改；isDefault 置 true 时先把其他组的 isDefault 置 false（事务内）。
   * 更新后清除该组所有成员的 user_group 缓存。
   */
  app.put('/api/v1/admin/groups/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id, 'group');
    const input = parseGroupInput(request.body ?? {}, true);

    const [existing] = await db
      .select({ id: schema.userGroups.id, name: schema.userGroups.name })
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Group', id);

    if (input.name !== undefined && input.name !== existing.name) {
      await ensureNameUnique(input.name, id);
    }

    const set: Record<string, unknown> = { updatedAt: sql`NOW()` };
    if (input.name !== undefined) set.name = input.name;
    if (input.description !== undefined) set.description = input.description;
    if (input.pricingGroup !== undefined) set.pricingGroup = input.pricingGroup;
    if (input.rateLimitQps !== undefined) set.rateLimitQps = input.rateLimitQps;
    if (input.rateLimitTpm !== undefined) set.rateLimitTpm = input.rateLimitTpm;
    if (input.dailyQuota !== undefined) {
      set.dailyQuota = input.dailyQuota != null ? String(input.dailyQuota) : null;
    }
    if (input.modelWhitelist !== undefined) set.modelWhitelist = input.modelWhitelist;
    if (input.isDefault !== undefined) set.isDefault = input.isDefault;

    // 多写操作（复位其他组 + 更新本组）放一个事务，保证默认组唯一
    await db.transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx
          .update(schema.userGroups)
          .set({ isDefault: false, updatedAt: sql`NOW()` })
          .where(and(ne(schema.userGroups.id, id), eq(schema.userGroups.isDefault, true)));
      }
      await tx.update(schema.userGroups).set(set).where(eq(schema.userGroups.id, id));
    });

    // 该组所有成员的分组缓存失效
    const members = await db
      .select({ userId: schema.userGroupMemberships.userId })
      .from(schema.userGroupMemberships)
      .where(eq(schema.userGroupMemberships.groupId, id));
    for (const m of members) await cacheDel(groupCacheKey(m.userId));

    const [updated] = await db
      .select(groupFields)
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, id))
      .limit(1);
    if (!updated) throw new Error('Failed to load updated group');

    return reply.send({ data: groupDTO(updated), message: '分组已更新' });
  });

  /**
   * DELETE /api/v1/admin/groups/:id — 删除分组
   * 默认组（isDefault=true）不可删；组下仍有成员 → 400。
   */
  app.delete('/api/v1/admin/groups/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id, 'group');

    const [group] = await db
      .select({ id: schema.userGroups.id, isDefault: schema.userGroups.isDefault })
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, id))
      .limit(1);
    if (!group) throw new NotFoundError('Group', id);
    if (group.isDefault) throw new ValidationError('默认分组不可删除');

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.userGroupMemberships)
      .where(eq(schema.userGroupMemberships.groupId, id));
    if (Number(countRow?.count ?? 0) > 0) {
      throw new ValidationError('分组下仍有成员，无法删除');
    }

    await db.delete(schema.userGroups).where(eq(schema.userGroups.id, id));
    return reply.send({ data: { ok: true }, message: '分组已删除' });
  });

  /**
   * GET /api/v1/admin/groups/:id/members — 组成员列表（分页）
   * query: page(默认1)/pageSize(默认20)，JOIN users 返回邮箱与姓名。
   */
  app.get('/api/v1/admin/groups/:id/members', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseId(request.params.id, 'group');
    const q = (request.query || {}) as PaginationQuery;
    const { page, pageSize, offset } = parsePagination(q);

    const [group] = await db
      .select({ id: schema.userGroups.id })
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, id))
      .limit(1);
    if (!group) throw new NotFoundError('Group', id);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: schema.userGroupMemberships.id,
          userId: schema.userGroupMemberships.userId,
          email: schema.users.email,
          name: schema.users.name,
          createdAt: schema.userGroupMemberships.createdAt,
        })
        .from(schema.userGroupMemberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.userGroupMemberships.userId))
        .where(eq(schema.userGroupMemberships.groupId, id))
        .orderBy(desc(schema.userGroupMemberships.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.userGroupMemberships)
        .where(eq(schema.userGroupMemberships.groupId, id)),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: r.email,
      name: r.name,
      joinedAt: r.createdAt,
    }));

    return reply.send({
      data: { list, total: Number(countResult[0]?.count ?? 0), page, pageSize },
    });
  });

  /**
   * PUT /api/v1/admin/users/:userId/group — 设置用户分组
   * body: { groupId }；memberships upsert（唯一约束 userId），并清除该用户分组缓存。
   */
  app.put('/api/v1/admin/users/:userId/group', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const userId = parseId(request.params.userId, 'user');
    const body = (request.body || {}) as { groupId?: unknown };
    const groupId = parseOptionalPositiveInt(body.groupId, 'groupId');
    if (groupId == null) throw new ValidationError('groupId 必填且必须为正整数');

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundError('User', userId);

    const [group] = await db
      .select({ id: schema.userGroups.id, status: schema.userGroups.status })
      .from(schema.userGroups)
      .where(eq(schema.userGroups.id, groupId))
      .limit(1);
    if (!group) throw new NotFoundError('Group', groupId);
    if (group.status !== 'active') throw new ValidationError('不能将用户分配到已停用分组');

    // 真 upsert：依赖 user_group_memberships.userId 唯一约束
    await db
      .insert(schema.userGroupMemberships)
      .values({ userId, groupId })
      .onConflictDoUpdate({ target: schema.userGroupMemberships.userId, set: { groupId } });

    await cacheDel(groupCacheKey(userId));

    return reply.send({ data: { userId, groupId }, message: '用户分组已更新' });
  });
}
