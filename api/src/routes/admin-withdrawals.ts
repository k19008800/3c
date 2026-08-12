/**
 * 代理商提现管理 API — /api/v1/admin/agent-withdrawals
 *
 * 契约对齐（web-console AdminWithdrawalsPage）：
 *   GET  /admin/agent-withdrawals?status=&page_size=   — 提现申请列表
 *   GET  /admin/agent-withdrawals/:id                  — 提现详情
 *   POST /admin/agent-withdrawals/:id/review {action,note}  — 审核（approve→processing / reject→rejected+解冻）
 *   POST /admin/agent-withdrawals/:id/transfer {result,transfer_no} — 打款确认（success→completed / fail→rejected+解冻）
 *
 * 状态流：pending → processing → completed / rejected（rejected 时解冻可提现余额）
 * 金额单位：元（DB numeric 18,4）
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError, AppError } from '../lib/errors';

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

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 提现状态 → 中文文案 */
const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  processing: '处理中',
  completed: '已到账',
  rejected: '已驳回',
};

/** 解冻代理可提现余额（驳回时） */
async function unfreezeAgentBalance(agentId: number, amount: string): Promise<void> {
  const a = Number(amount ?? 0);
  if (a <= 0) return;
  await db.execute(sql`
    UPDATE agents
    SET available_balance = available_balance + ${a.toFixed(4)}::numeric,
        updated_at = NOW()
    WHERE id = ${agentId}
  `);
}

/** 解析 account_info（JSON 或纯文本兜底） */
function parseAccountInfo(info: string | null): { bank_name?: string; account_number?: string; account_holder?: string; raw?: string } {
  if (!info) return {};
  try {
    return JSON.parse(info);
  } catch {
    return { raw: info };
  }
}

export async function adminWithdrawalRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/agent-withdrawals — 提现申请列表 */
  app.get('/api/v1/admin/agent-withdrawals', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { status?: string; page?: string; page_size?: string };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 200);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    const VALID_STATUSES = ['pending', 'processing', 'completed', 'rejected'] as const;
    if (q.status && (VALID_STATUSES as readonly string[]).includes(q.status)) {
      conditions.push(eq(schema.agentWithdrawals.status, q.status as (typeof VALID_STATUSES)[number]));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: schema.agentWithdrawals.id,
          agentId: schema.agentWithdrawals.agentId,
          amount: schema.agentWithdrawals.amount,
          method: schema.agentWithdrawals.method,
          accountInfo: schema.agentWithdrawals.accountInfo,
          status: schema.agentWithdrawals.status,
          remark: schema.agentWithdrawals.remark,
          createdAt: schema.agentWithdrawals.createdAt,
          updatedAt: schema.agentWithdrawals.updatedAt,
          agentName: schema.users.name,
          agentEmail: schema.users.email,
        })
        .from(schema.agentWithdrawals)
        .innerJoin(schema.agents, eq(schema.agents.id, schema.agentWithdrawals.agentId))
        .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
        .where(whereClause)
        .orderBy(desc(schema.agentWithdrawals.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.agentWithdrawals)
        .where(whereClause),
    ]);

    const list = rows.map((r) => {
      const acc = parseAccountInfo(r.accountInfo);
      return {
        id: r.id,
        withdraw_no: `W${r.id}`,
        agent_id: r.agentId,
        agent_name: r.agentName,
        agent_email: r.agentEmail,
        amount: toNum(r.amount),
        method: r.method,
        bank: acc.bank_name ?? null,
        account: acc.account_number ?? null,
        account_name: acc.account_holder ?? null,
        status: r.status,
        status_label: STATUS_LABEL[r.status] ?? r.status,
        review_note: r.remark,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      };
    });

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /** GET /api/v1/admin/agent-withdrawals/:id — 提现详情 */
  app.get('/api/v1/admin/agent-withdrawals/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wdId = parseInt(id, 10);
    if (!Number.isInteger(wdId) || wdId <= 0) throw new ValidationError('Invalid withdrawal id');

    const rows = await db
      .select({
        id: schema.agentWithdrawals.id,
        agentId: schema.agentWithdrawals.agentId,
        amount: schema.agentWithdrawals.amount,
        method: schema.agentWithdrawals.method,
        accountInfo: schema.agentWithdrawals.accountInfo,
        status: schema.agentWithdrawals.status,
        processedBy: schema.agentWithdrawals.processedBy,
        processedAt: schema.agentWithdrawals.processedAt,
        remark: schema.agentWithdrawals.remark,
        createdAt: schema.agentWithdrawals.createdAt,
        updatedAt: schema.agentWithdrawals.updatedAt,
        agentName: schema.users.name,
        agentEmail: schema.users.email,
      })
      .from(schema.agentWithdrawals)
      .innerJoin(schema.agents, eq(schema.agents.id, schema.agentWithdrawals.agentId))
      .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
      .where(eq(schema.agentWithdrawals.id, wdId))
      .limit(1);
    const r = rows[0];
    if (!r) throw new NotFoundError('提现申请不存在');

    const acc = parseAccountInfo(r.accountInfo);
    return reply.send({
      data: {
        id: r.id,
        withdraw_no: `W${r.id}`,
        agent_id: r.agentId,
        agent_name: r.agentName,
        agent_email: r.agentEmail,
        amount: toNum(r.amount),
        method: r.method,
        bank: acc.bank_name ?? null,
        account: acc.account_number ?? null,
        account_name: acc.account_holder ?? null,
        status: r.status,
        status_label: STATUS_LABEL[r.status] ?? r.status,
        review_note: r.remark,
        processed_by: r.processedBy,
        processed_at: r.processedAt ? r.processedAt.toISOString() : null,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      },
    });
  });

  /** POST /api/v1/admin/agent-withdrawals/:id/review — 审核（approve→processing / reject→rejected+解冻） */
  app.post('/api/v1/admin/agent-withdrawals/:id/review', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wdId = parseInt(id, 10);
    if (!Number.isInteger(wdId) || wdId <= 0) throw new ValidationError('Invalid withdrawal id');
    const body = (request.body || {}) as { action?: string; note?: string };
    if (body.action !== 'approve' && body.action !== 'reject') {
      throw new ValidationError('action 仅支持 approve / reject');
    }
    if (body.action === 'reject' && !body.note) {
      throw new ValidationError('驳回必须填写原因');
    }
    const operatorId = (request as any).userContext?.userId ?? 0;

    // 事务：仅 pending 可审核；reject 时解冻余额
    const updated = await db.transaction(async (tx) => {
      const [wd] = await tx
        .update(schema.agentWithdrawals)
        .set({
          status: body.action === 'approve' ? 'processing' : 'rejected',
          remark: body.note ?? null,
          processedBy: operatorId,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.agentWithdrawals.id, wdId), eq(schema.agentWithdrawals.status, 'pending')))
        .returning();
      if (!wd) return null;

      if (body.action === 'reject') {
        const a = Number(wd.amount ?? 0);
        if (a > 0) {
          await tx.execute(sql`
            UPDATE agents
            SET available_balance = available_balance + ${a.toFixed(4)}::numeric,
                updated_at = NOW()
            WHERE id = ${wd.agentId}
          `);
        }
      }
      return wd;
    });

    if (!updated) throw new AppError('该申请已处理或不存在', 409, 'CONFLICT');
    return reply.send({ data: { id: wdId, status: updated.status }, message: body.action === 'approve' ? '已通过，待打款' : '已驳回，余额已解冻' });
  });

  /** POST /api/v1/admin/agent-withdrawals/:id/transfer — 打款确认（success→completed / fail→rejected+解冻） */
  app.post('/api/v1/admin/agent-withdrawals/:id/transfer', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wdId = parseInt(id, 10);
    if (!Number.isInteger(wdId) || wdId <= 0) throw new ValidationError('Invalid withdrawal id');
    const body = (request.body || {}) as { result?: string; transfer_no?: string; note?: string };
    if (body.result !== 'success' && body.result !== 'fail') {
      throw new ValidationError('result 仅支持 success / fail');
    }
    const operatorId = (request as any).userContext?.userId ?? 0;

    // 事务：仅 processing 可确认打款；fail 时解冻余额
    const updated = await db.transaction(async (tx) => {
      const [wd] = await tx
        .update(schema.agentWithdrawals)
        .set({
          status: body.result === 'success' ? 'completed' : 'rejected',
          remark: body.note ?? (body.result === 'success' ? `打款成功${body.transfer_no ? ` ${body.transfer_no}` : ''}` : '打款失败'),
          processedBy: operatorId,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.agentWithdrawals.id, wdId), eq(schema.agentWithdrawals.status, 'processing')))
        .returning();
      if (!wd) return null;

      if (body.result === 'fail') {
        const a = Number(wd.amount ?? 0);
        if (a > 0) {
          await tx.execute(sql`
            UPDATE agents
            SET available_balance = available_balance + ${a.toFixed(4)}::numeric,
                updated_at = NOW()
            WHERE id = ${wd.agentId}
          `);
        }
      }
      return wd;
    });

    if (!updated) throw new AppError('该申请状态不可打款确认', 409, 'CONFLICT');
    return reply.send({ data: { id: wdId, status: updated.status }, message: body.result === 'success' ? '已确认到账' : '已标记打款失败，余额已解冻' });
  });
}
