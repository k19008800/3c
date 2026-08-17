/**
 * 用户账号注销流转路由 — /api/v1/me/deletion/* + /api/v1/admin/deletion-requests/*（P2-4）
 *
 * 状态机（表 deletion_requests）：
 *   pending ──admin.approve──▶ approved（cool_down_until=+7d，users.status='deleting'）
 *      │                         ├──user.cancel（冷静期内）──▶ cancelled（恢复 users.status='active'）
 *      │                         └──admin.execute（冷静期后）──▶ deleted（执行数据清除）
 *      ├──admin.reject──▶ rejected（admin_note 必填）
 *      └──user.cancel──▶ cancelled
 *
 * 用户端（jwtAuth）：
 *   GET  /api/v1/me/deletion/checks   — 注销前置检查（余额/工单/归属客户/代理身份/进行中导出）
 *   POST /api/v1/me/deletion/request  — 提交注销申请（reason 必填；已有 pending/approved → 400）
 *   GET  /api/v1/me/deletion/status   — 当前申请状态
 *   POST /api/v1/me/deletion/cancel   — 撤回（pending 直接撤；approved 且冷静期内恢复；过冷静期 400）
 *
 * 管理端（adminAuth）：
 *   GET  /api/v1/admin/deletion-requests            — 申请列表（status 筛选 + 分页）
 *   POST /api/v1/admin/deletion-requests/:id/approve — 审核通过（pending→approved，+7 天冷静期）
 *   POST /api/v1/admin/deletion-requests/:id/reject  — 审核驳回（pending→rejected，原因必填）
 *   POST /api/v1/admin/deletion-requests/:id/execute — 执行删除（approved 且冷静期已过）
 *
 * 数据清除策略（execute）：
 *   - 删除 api_keys / user_sessions（登录与 API 调用立即失效）
 *   - customer_balances 清零 + balance_transactions 记「注销清零」adjustment
 *   - 删除 agents（级联 agent_customers）/ real_name_records / user_2fa / oauth_bindings /
 *     user_webhooks / user_group_memberships
 *   - users.status='deleted'（auth.ts 登录校验 status='active'，删除后无法登录）
 *   - consumption_records 保留（user_id NOT NULL 无法匿名化置 NULL，见任务总结取舍说明）
 *   - 全部包在单个事务内
 *
 * @module routes
 * @see docs/SPEC-§2-用户体系.md §2.11
 * @see docs/iteration-plan-v2.md P2-4
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, desc, eq, inArray, sql, count as drizzleCount } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { getBalance } from '../services/billing/balance';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors';

/** 审核通过后的冷静期（天） */
const COOL_DOWN_DAYS = 7;
/** 工单「进行中」状态集合（as const 保持字面量类型，供 inArray 匹配 pgEnum 列） */
const ACTIVE_TICKET_STATUSES = ['open', 'in_progress', 'waiting_customer'] as const;

// ── 认证 / 审计 helpers ─────────────────────────────────

/** JWT 用户鉴权（preHandler） */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

/** 管理端鉴权（preHandler，role ∈ {admin, super_admin}） */
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

/** 管理端操作审计写库 */
function writeAudit(request: any, action: string, resourceId: string | number, details: Record<string, unknown>) {
  const ctx = request.userContext ?? {};
  return db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource: 'deletion_request',
    resourceId: String(resourceId),
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

/** 解析分页参数 */
function parsePagination(q: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || q.page_size || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 申请记录 DTO */
function toDTO(row: any, user?: any) {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    reason: row.reason,
    status: row.status,
    adminId: row.adminId,
    adminNote: row.adminNote,
    coolDownUntil: row.coolDownUntil,
    deletedAt: row.deletedAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deletionRoutes(app: FastifyInstance) {
  // ═══ 用户端 ═══

  /**
   * GET /api/v1/me/deletion/checks — 注销前置检查
   *
   * 逐项返回 blocked 布尔 + 提示文案（对齐 SPEC-§2.11 边界条件）：
   *   balance>0 / 进行中工单 / 归属客户数 / 代理商身份 / 进行中数据导出。
   * 仅作提示与前端引导，不在此处强制阻断提交（阻断语义由前端按 allClear 控制）。
   */
  app.get('/api/v1/me/deletion/checks', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const balance = await getBalance(uid);
    const balanceValue = Number(balance.availableBalance || 0);

    const [ticketRow] = await db
      .select({ v: drizzleCount() })
      .from(schema.tickets)
      .where(and(
        eq(schema.tickets.userId, uid),
        inArray(schema.tickets.status, ACTIVE_TICKET_STATUSES),
      ));
    const activeTickets = Number(ticketRow?.v ?? 0);

    const [agentRow] = await db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(eq(schema.agents.userId, uid))
      .limit(1);
    const isAgent = !!agentRow;
    let ownedCustomers = 0;
    if (agentRow) {
      const [ownedRow] = await db
        .select({ v: drizzleCount() })
        .from(schema.agentCustomers)
        .where(and(eq(schema.agentCustomers.agentId, agentRow.id), eq(schema.agentCustomers.status, 'active')));
      ownedCustomers = Number(ownedRow?.v ?? 0);
    }

    const [exportRow] = await db
      .select({ v: drizzleCount() })
      .from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.userId, uid), inArray(schema.dataRequests.status, ['pending', 'approved'])));
    const pendingExports = Number(exportRow?.v ?? 0);

    const checks = {
      balance: {
        blocked: balanceValue > 0,
        value: balanceValue,
        message: balanceValue > 0 ? '注销后余额将清零，建议先消费或联系客服退款' : '余额为 0，可直接注销',
      },
      tickets: {
        blocked: activeTickets > 0,
        value: activeTickets,
        message: activeTickets > 0 ? `您有 ${activeTickets} 个工单处理中，建议处理完成后再注销` : '无进行中的工单',
      },
      ownedCustomers: {
        blocked: ownedCustomers > 0,
        value: ownedCustomers,
        message: ownedCustomers > 0 ? '名下有归属客户，需先转移或解绑后再注销' : '无归属客户',
      },
      agent: {
        blocked: isAgent,
        value: isAgent,
        message: isAgent ? '您当前为代理商，注销将失去代理身份，请谨慎操作' : '非代理商',
      },
      pendingExport: {
        blocked: pendingExports > 0,
        value: pendingExports,
        message: pendingExports > 0 ? `您有 ${pendingExports} 个进行中的数据导出申请，请先处理完成` : '无进行中的数据导出申请',
      },
    };
    const allClear = Object.values(checks).every((c) => !c.blocked);

    return reply.send({ data: { checks, allClear } });
  });

  /**
   * POST /api/v1/me/deletion/request — 提交注销申请
   *
   * @param reason - 注销原因（必填，≤200 字符）
   * @throws {ValidationError} 400 reason 缺失
   * @throws {AppError} 400 EXISTS 已有 pending/approved 申请
   * @throws {AppError} 400 USER_DELETED 账号已注销
   */
  app.post('/api/v1/me/deletion/request', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const reason = String((request.body as Record<string, unknown> | undefined)?.reason ?? '').trim();
    if (!reason) throw new ValidationError('注销原因（reason）必填');
    if (reason.length > 200) throw new ValidationError('注销原因过长（最多 200 字符）');

    const [user] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, uid)).limit(1);
    if (!user) throw new UnauthorizedError('User not found');
    if (user.status === 'deleted') throw new AppError('账号已注销，无法重复申请', 400, 'USER_DELETED');

    // 同一用户同时仅允许一个未完结申请（pending/approved）
    const [existing] = await db
      .select({ id: schema.deletionRequests.id, status: schema.deletionRequests.status })
      .from(schema.deletionRequests)
      .where(and(eq(schema.deletionRequests.userId, uid), inArray(schema.deletionRequests.status, ['pending', 'approved'])))
      .limit(1);
    if (existing) {
      throw new AppError(`已有${existing.status === 'approved' ? '审核通过' : '待审核'}的注销申请，请先处理`, 400, 'EXISTS', { requestId: existing.id });
    }

    const [created] = await db
      .insert(schema.deletionRequests)
      .values({ userId: uid, reason, status: 'pending' })
      .returning();
    if (!created) throw new AppError('注销申请创建失败', 500, 'DELETION_REQUEST_CREATE_FAILED');

    return reply.status(201).send({ data: toDTO(created), message: '注销申请已提交，等待管理员审核' });
  });

  /**
   * GET /api/v1/me/deletion/status — 当前注销申请状态（无申请时 data=null）
   */
  app.get('/api/v1/me/deletion/status', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const [row] = await db
      .select()
      .from(schema.deletionRequests)
      .where(eq(schema.deletionRequests.userId, uid))
      .orderBy(desc(schema.deletionRequests.createdAt))
      .limit(1);
    return reply.send({ data: row ? toDTO(row) : null });
  });

  /**
   * POST /api/v1/me/deletion/cancel — 撤回注销申请
   *
   * - pending：直接撤回 → cancelled
   * - approved 且 now < cool_down_until：撤回 → cancelled + 恢复 users.status='active'
   * - approved 且已过冷静期：400 COOL_DOWN_EXPIRED（不可撤回）
   * - rejected / cancelled / deleted：400 INVALID_STATE
   */
  app.post('/api/v1/me/deletion/cancel', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const [row] = await db
      .select()
      .from(schema.deletionRequests)
      .where(eq(schema.deletionRequests.userId, uid))
      .orderBy(desc(schema.deletionRequests.createdAt))
      .limit(1);
    if (!row) throw new AppError('没有可撤回的注销申请', 400, 'NO_REQUEST');

    if (row.status === 'pending') {
      const [updated] = await db
        .update(schema.deletionRequests)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(schema.deletionRequests.id, row.id))
        .returning();
      return reply.send({ data: toDTO(updated), message: '注销申请已撤回' });
    }

    if (row.status === 'approved') {
      // 冷静期截止判断在 SQL 侧做（timestamp 无时区语义）
      const [stillInCoolDown] = await db
        .select({ id: schema.deletionRequests.id })
        .from(schema.deletionRequests)
        .where(and(
          eq(schema.deletionRequests.id, row.id),
          sql`${schema.deletionRequests.coolDownUntil} > NOW()`,
        ))
        .limit(1);
      if (!stillInCoolDown) {
        throw new AppError('已过 7 天冷静期，注销申请不可撤回', 400, 'COOL_DOWN_EXPIRED');
      }
      const [updated] = await db.transaction(async (tx) => {
        await tx.update(schema.users)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(schema.users.id, uid));
        return tx.update(schema.deletionRequests)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(schema.deletionRequests.id, row.id))
          .returning();
      });
      return reply.send({ data: toDTO(updated!), message: '注销申请已撤回，账号已恢复' });
    }

    throw new AppError(`当前状态（${row.status}）不允许撤回`, 400, 'INVALID_STATE');
  });

  // ═══ 管理端 ═══

  /**
   * GET /api/v1/admin/deletion-requests — 注销申请列表（status 筛选 + 分页）
   */
  app.get('/api/v1/admin/deletion-requests', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(q);
    const conditions: any[] = [];
    if (q.status) conditions.push(eq(schema.deletionRequests.status, String(q.status)));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select({
        id: schema.deletionRequests.id,
        userId: schema.deletionRequests.userId,
        userEmail: schema.users.email,
        userName: schema.users.name,
        reason: schema.deletionRequests.reason,
        status: schema.deletionRequests.status,
        adminId: schema.deletionRequests.adminId,
        adminNote: schema.deletionRequests.adminNote,
        coolDownUntil: schema.deletionRequests.coolDownUntil,
        deletedAt: schema.deletionRequests.deletedAt,
        reviewedAt: schema.deletionRequests.reviewedAt,
        createdAt: schema.deletionRequests.createdAt,
        updatedAt: schema.deletionRequests.updatedAt,
      })
        .from(schema.deletionRequests)
        .leftJoin(schema.users, eq(schema.deletionRequests.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.deletionRequests.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ v: drizzleCount() }).from(schema.deletionRequests).where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => toDTO(r, { email: r.userEmail, name: r.userName })),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /**
   * POST /api/v1/admin/deletion-requests/:id/approve — 审核通过（pending→approved）
   *
   * 设置 cool_down_until = NOW()+7 天，users.status='deleting'（登录被拒，冷静期内可撤回）。
   *
   * @param note - 审核备注（可选）
   * @throws {AppError} 400 INVALID_STATE 非 pending
   */
  app.post('/api/v1/admin/deletion-requests/:id/approve', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');
    const note = String((request.body as Record<string, unknown> | undefined)?.note ?? '').trim() || null;

    const [row] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许审核通过，仅 pending 可 approve`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db.transaction(async (tx) => {
      // 审核通过 → 账号标记 deleting（auth.ts 登录校验 status='active'，即刻禁止新登录）
      await tx.update(schema.users)
        .set({ status: 'deleting', updatedAt: new Date() })
        .where(eq(schema.users.id, row.userId));
      return tx.update(schema.deletionRequests)
        .set({
          status: 'approved',
          adminId,
          adminNote: note ?? row.adminNote,
          coolDownUntil: sql`NOW() + (${COOL_DOWN_DAYS} || ' days')::interval`,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.deletionRequests.id, id))
        .returning();
    });
    await writeAudit(request, 'deletion.approve', id, { userId: row.userId, coolDownDays: COOL_DOWN_DAYS });
    return reply.send({ data: toDTO(updated!), message: `注销申请已通过，进入 ${COOL_DOWN_DAYS} 天冷静期` });
  });

  /**
   * POST /api/v1/admin/deletion-requests/:id/reject — 审核驳回（pending→rejected）
   *
   * @param note - 驳回原因（必填）
   * @throws {ValidationError} 400 note 缺失
   * @throws {AppError} 400 INVALID_STATE 非 pending
   */
  app.post('/api/v1/admin/deletion-requests/:id/reject', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');
    const note = String((request.body as Record<string, unknown> | undefined)?.note ?? '').trim();
    if (!note) throw new ValidationError('驳回原因（note）必填');

    const [row] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许驳回，仅 pending 可 reject`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db
      .update(schema.deletionRequests)
      .set({ status: 'rejected', adminId, adminNote: note, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.deletionRequests.id, id))
      .returning();
    await writeAudit(request, 'deletion.reject', id, { userId: row.userId, note });
    return reply.send({ data: toDTO(updated), message: '注销申请已驳回' });
  });

  /**
   * POST /api/v1/admin/deletion-requests/:id/execute — 执行删除（approved 且冷静期已过）
   *
   * 数据清除策略见文件头注释；全部操作在单个事务内，任一步失败整体回滚。
   *
   * @throws {AppError} 400 INVALID_STATE 非 approved / 400 COOL_DOWN_NOT_REACHED 冷静期未结束
   */
  app.post('/api/v1/admin/deletion-requests/:id/execute', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = parseInt(String(request.params.id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid id');

    const [row] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);
    if (row.status !== 'approved') {
      throw new AppError(`当前状态（${row.status}）不允许执行删除，仅 approved 可 execute`, 400, 'INVALID_STATE');
    }
    // 冷静期判定在 SQL 侧做（timestamp 无时区语义）
    const [cooledDown] = await db
      .select({ id: schema.deletionRequests.id })
      .from(schema.deletionRequests)
      .where(and(
        eq(schema.deletionRequests.id, id),
        sql`${schema.deletionRequests.coolDownUntil} <= NOW()`,
      ))
      .limit(1);
    if (!cooledDown) {
      throw new AppError('7 天冷静期尚未结束，暂不能执行删除', 400, 'COOL_DOWN_NOT_REACHED');
    }

    const uid = row.userId;
    await db.transaction(async (tx) => {
      // 1. API Key 全部删除（立即失效）
      await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, uid));
      // 2. 会话删除（refresh token 失效）
      await tx.delete(schema.userSessions).where(eq(schema.userSessions.userId, uid));
      // 3. 余额清零 + 记账（注明注销清零）
      const balance = await getBalance(uid);
      const total = Number(balance.totalBalance || 0);
      if (total !== 0) {
        await tx.update(schema.customerBalances)
          .set({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', version: sql`version + 1`, updatedAt: new Date() })
          .where(eq(schema.customerBalances.userId, uid));
        await tx.insert(schema.balanceTransactions).values({
          userId: uid,
          type: 'adjustment',
          amount: `-${total}`,
          balanceAfter: '0',
          referenceType: 'account_deletion',
          referenceId: String(row.id),
          description: `账号注销余额清零（deletion_request #${row.id}）`,
        });
      }
      // 4. 代理商身份（级联删除 agent_customers 归属记录）
      await tx.delete(schema.agents).where(eq(schema.agents.userId, uid));
      // 5. 实名信息物理删除（SPEC §2.11：实名信息 7 天后物理删除）
      await tx.delete(schema.realNameRecords).where(eq(schema.realNameRecords.userId, uid));
      // 6. 其他用户绑定/偏好数据
      await tx.delete(schema.user2fa).where(eq(schema.user2fa.userId, uid));
      await tx.delete(schema.userOauthBindings).where(eq(schema.userOauthBindings.userId, uid));
      await tx.delete(schema.userWebhooks).where(eq(schema.userWebhooks.userId, uid));
      await tx.delete(schema.userGroupMemberships).where(eq(schema.userGroupMemberships.userId, uid));
      // 7. 账号标记 deleted（登录校验 status='active' → 永久拒绝）
      await tx.update(schema.users)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(schema.users.id, uid));
      // 8. 注销申请收尾
      await tx.update(schema.deletionRequests)
        .set({ status: 'deleted', deletedAt: sql`NOW()`, updatedAt: new Date() })
        .where(eq(schema.deletionRequests.id, id));
    });

    await writeAudit(request, 'deletion.execute', id, {
      userId: uid,
      cleared: ['api_keys', 'user_sessions', 'customer_balances', 'agents', 'real_name_records', 'user_2fa', 'oauth_bindings', 'user_webhooks', 'user_group_memberships'],
      retained: ['consumption_records', 'balance_transactions', 'users'],
    });
    return reply.send({ message: '账号删除已执行', data: { id, userId: uid, status: 'deleted' } });
  });
}
