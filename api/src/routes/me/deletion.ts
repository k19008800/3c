// ============================================================
//  3cloud (3C) — 用户端账号注销
//  POST   /api/v1/me/deletion    — 提交注销申请
//  GET    /api/v1/me/deletion    — 查看注销状态
//  DELETE /api/v1/me/deletion    — 撤销注销（冻结期内）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  accountDeletionRequests,
  deletionChecklist,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";

const FREEZE_DAYS = 7;

export async function meDeletionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 提交注销申请 ──
  app.post("/api/v1/me/deletion", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const { reason } = request.body as { reason?: string };

    // 检查是否已有活跃的注销请求
    const existing = await db
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, userId),
          sql`${accountDeletionRequests.status} IN ('pending', 'cooling')`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({
        code: 409,
        error: "ACTIVE_DELETION_EXISTS",
        message: "您已提交过注销申请，请先撤销再进行新的申请",
      });
    }

    // 1. 执行注销条件检查
    const checks: { item: string; passed: boolean; detail: string }[] = [
      { item: "balance_cleared", passed: false, detail: "" },
      { item: "no_pending_withdraw", passed: false, detail: "" },
      { item: "no_unsettled_bills", passed: false, detail: "" },
      { item: "no_active_keys", passed: false, detail: "" },
      { item: "no_pending_invoices", passed: false, detail: "" },
      { item: "no_active_agent", passed: false, detail: "" },
    ];

    // 检查余额（必须为 0 或正余额？→ 欠费不允许注销）
    const balanceResult = await db.execute(
      sql`SELECT balance FROM users WHERE id = ${userId}`
    );
    const balance = parseFloat(balanceResult.rows[0]?.balance || "0");
    if (balance < 0) {
      checks[0].detail = `当前余额 ¥${balance.toFixed(4)}，欠费无法注销，请先充值还清`;
    } else {
      checks[0].passed = true;
      checks[0].detail = `余额 ¥${balance.toFixed(4)}，无欠费`;
    }

    // 检查进行中的提现（委托 agent/withdraw）
    const withdrawResult = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM withdraw_orders wo
          JOIN agents a ON wo.agent_id = a.id
          WHERE a.user_id = ${userId}
          AND wo.status NOT IN ('approved', 'paid', 'rejected')`
    );
    const withdrawCount = parseInt(withdrawResult.rows[0]?.cnt || "0");
    if (withdrawCount > 0) {
      checks[1].detail = `存在 ${withdrawCount} 笔进行中的提现申请，请等待处理完成`;
    } else {
      checks[1].passed = true;
    }

    // 检查未结算账单（用户是否有 pending 状态的充值订单）
    const pendingOrdersResult = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM recharge_orders
          WHERE user_id = ${userId} AND status = 'pending'`
    );
    const pendingOrders = parseInt(pendingOrdersResult.rows[0]?.cnt || "0");
    if (pendingOrders > 0) {
      checks[2].detail = `存在 ${pendingOrders} 笔未完成的充值订单`;
    } else {
      checks[2].passed = true;
    }

    // 检查活跃的 API Key
    const keysResult = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM api_keys
          WHERE user_id = ${userId} AND status = 'active'`
    );
    const activeKeys = parseInt(keysResult.rows[0]?.cnt || "0");
    if (activeKeys > 0) {
      checks[3].detail = `存在 ${activeKeys} 个活跃的 API Key，请先禁用`;
    } else {
      checks[3].passed = true;
    }

    // 检查进行中的发票
    const invoiceResult = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM invoice_requests
          WHERE user_id = ${userId} AND status IN ('pending', 'processing')`
    );
    const pendingInvoices = parseInt(invoiceResult.rows[0]?.cnt || "0");
    if (pendingInvoices > 0) {
      checks[4].detail = `存在 ${pendingInvoices} 个进行中的发票申请`;
    } else {
      checks[4].passed = true;
    }

    // 检查是否代理且有绑定客户
    const agentResult = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM agent_clients ac
          JOIN agents a ON ac.agent_id = a.id
          WHERE a.user_id = ${userId}`
    );
    const agentClients = parseInt(agentResult.rows[0]?.cnt || "0");
    if (agentClients > 0) {
      checks[5].detail = `您是代理，名下仍有 ${agentClients} 个客户，请先转移`;
    } else {
      checks[5].passed = true;
    }

    // 全部检查是否通过
    const allPassed = checks.every((c) => c.passed);

    // 写入检查记录
    const requestResult = await db
      .insert(accountDeletionRequests)
      .values({
        userId,
        reason: reason || null,
        status: allPassed ? "cooling" : "pending",
        coolingDeadline: allPassed
          ? sql`NOW() + INTERVAL '${sql.raw(String(FREEZE_DAYS))} days'`
          : null,
      })
      .returning();

    const requestId = requestResult[0].id;

    // 写入检查明细
    for (const check of checks) {
      await db.insert(deletionChecklist).values({
        requestId,
        checkItem: check.item,
        passed: check.passed ? "true" : "false",
        detail: check.detail,
      });
    }

    if (!allPassed) {
      // 不满足条件 → 返回检查结果
      return reply.status(400).send({
        code: 400,
        error: "DELETION_CHECKS_FAILED",
        message: "注销条件未满足",
        data: {
          checks: checks.map((c) => ({
            item: c.item,
            passed: c.passed,
            detail: c.detail,
          })),
        },
      });
    }

    // 通过 → 禁用用户所有 Key，设置用户状态
    await db.execute(
      sql`UPDATE api_keys SET status = 'disabled'
          WHERE user_id = ${userId} AND status = 'active'`
    );

    return reply.status(200).send({
      code: 0,
      message: "注销申请已提交，进入冷静期",
      data: {
        requestId,
        coolingDeadline: requestResult[0].coolingDeadline,
        freezeDays: FREEZE_DAYS,
      },
    });
  });

  // ── 查看注销状态 ──
  app.get("/api/v1/me/deletion", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    const reqs = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, userId))
      .orderBy(sql`${accountDeletionRequests.createdAt} DESC`)
      .limit(1);

    if (reqs.length === 0) {
      return reply.status(404).send({
        code: 404,
        error: "NO_DELETION_REQUEST",
        message: "未找到注销申请记录",
      });
    }

    // 获取检查清单
    const checks = await db
      .select({
        checkItem: deletionChecklist.checkItem,
        passed: deletionChecklist.passed,
        detail: deletionChecklist.detail,
      })
      .from(deletionChecklist)
      .where(eq(deletionChecklist.requestId, reqs[0].id));

    return reply.status(200).send({
      code: 0,
      data: {
        ...reqs[0],
        checks,
      },
    });
  });

  // ── 撤销注销（冻结期内）──
  app.delete("/api/v1/me/deletion", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    const active = await db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, userId),
          sql`${accountDeletionRequests.status} = 'cooling'`
        )
      )
      .limit(1);

    if (active.length === 0) {
      return reply.status(400).send({
        code: 400,
        error: "NO_ACTIVE_DELETION",
        message: "没有可撤销的注销申请",
      });
    }

    await db
      .update(accountDeletionRequests)
      .set({
        status: "cancelled",
        cancelledAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(accountDeletionRequests.id, active[0].id));

    reply.status(200).send({
      code: 0,
      message: "注销申请已撤销",
    });
  });
}
