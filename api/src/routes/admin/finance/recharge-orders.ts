// ============================================================
//  3cloud (3C) — 充值订单路由（板块5）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { confirmBankTransfer, parseBankTransferRemark } from "../../../services/recharge-service.js";
import { generateVoucherNo } from "../../../services/voucher-service.js";
import { firstConfirmRechargeSchema, secondConfirmRechargeSchema } from "../../../schemas.js";
import { getDb } from "../../../db/index.js";
import {
  rechargeOrders,
  users,
  balanceLogs,
  auditLogs,
} from "../../../db/schema.js";

export async function adminFinanceRechargeRoutes(app: FastifyInstance) {
  // 全局 JWT 认证
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/recharge-orders — 充值订单列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/recharge-orders", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      channel?: string;
      userId?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    if (query.status) {
      conditions.push(eq(rechargeOrders.status, query.status as any));
    }
    if (query.channel) {
      conditions.push(eq(rechargeOrders.channel, query.channel as any));
    }
    if (query.userId) {
      conditions.push(eq(rechargeOrders.userId, parseInt(query.userId, 10)));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rechargeOrders)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        channelOrderNo: rechargeOrders.channelOrderNo,
        voucherImage: rechargeOrders.voucherImage,
        voucherNo: rechargeOrders.voucherNo,
        confirmedBy: rechargeOrders.confirmedBy,
        firstConfirmedBy: rechargeOrders.firstConfirmedBy,
        firstConfirmedAt: rechargeOrders.firstConfirmedAt,
        secondConfirmedBy: rechargeOrders.secondConfirmedBy,
        secondConfirmedAt: rechargeOrders.secondConfirmedAt,
        remark: rechargeOrders.remark,
        // 独立银行信息字段
        payerAccountName: rechargeOrders.payerAccountName,
        payerAccountNo: rechargeOrders.payerAccountNo,
        transferRemark: rechargeOrders.transferRemark,
        paidAt: rechargeOrders.paidAt,
        confirmedAt: rechargeOrders.confirmedAt,
        expiresAt: rechargeOrders.expiresAt,
        createdAt: rechargeOrders.createdAt,
        // 用户信息
        userEmail: users.email,
        userNickname: users.nickname,
      })
      .from(rechargeOrders)
      .innerJoin(users, eq(rechargeOrders.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(rechargeOrders.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 为旧记录补偿解析 bankName/accountNumber/transferDate
    const list = rows.map((r) => {
      let bankName = r.payerAccountName ?? null;
      let accountNumber = r.payerAccountNo ?? null;
      let transferDate: string | null = null;
      let parsedRemark: string | null = r.remark;

      // 旧记录：从 remark 中解析
      if (!bankName || !accountNumber) {
        const parsed = parseBankTransferRemark(r.remark);
        if (!bankName) bankName = parsed.bankName;
        if (!accountNumber) accountNumber = parsed.accountNumber;
        transferDate = parsed.transferDate;
        parsedRemark = parsed.userRemark ?? r.remark;
      } else {
        // 新记录：transferRemark 就是用户备注，remark 是拼接的完整字符串
        const parsed = parseBankTransferRemark(r.remark);
        transferDate = parsed.transferDate;
      }

      return {
        id: r.id,
        userId: r.userId,
        orderNo: r.orderNo,
        amount: r.amount,
        channel: r.channel,
        status: r.status,
        channelOrderNo: r.channelOrderNo,
        voucherImage: r.voucherImage,
        voucherNo: r.voucherNo,
        confirmedBy: r.confirmedBy,
        firstConfirmedBy: r.firstConfirmedBy,
        firstConfirmedAt: r.firstConfirmedAt?.toISOString() ?? null,
        secondConfirmedBy: r.secondConfirmedBy,
        secondConfirmedAt: r.secondConfirmedAt?.toISOString() ?? null,
        remark: r.remark,
        bankName,
        accountNumber,
        transferDate,
        paidAt: r.paidAt?.toISOString() ?? null,
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        userEmail: r.userEmail,
        userNickname: r.userNickname,
      };
    });

    reply.status(200).send({
      code: 0,
      data: {
        list,
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/recharge-orders/:id — 订单详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/recharge-orders/:id", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    const [row] = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        channelOrderNo: rechargeOrders.channelOrderNo,
        voucherImage: rechargeOrders.voucherImage,
        voucherNo: rechargeOrders.voucherNo,
        confirmedBy: rechargeOrders.confirmedBy,
        firstConfirmedBy: rechargeOrders.firstConfirmedBy,
        firstConfirmedAt: rechargeOrders.firstConfirmedAt,
        secondConfirmedBy: rechargeOrders.secondConfirmedBy,
        secondConfirmedAt: rechargeOrders.secondConfirmedAt,
        remark: rechargeOrders.remark,
        payerAccountName: rechargeOrders.payerAccountName,
        payerAccountNo: rechargeOrders.payerAccountNo,
        transferRemark: rechargeOrders.transferRemark,
        paidAt: rechargeOrders.paidAt,
        confirmedAt: rechargeOrders.confirmedAt,
        expiresAt: rechargeOrders.expiresAt,
        createdAt: rechargeOrders.createdAt,
        userEmail: users.email,
        userNickname: users.nickname,
        userBalance: users.balance,
      })
      .from(rechargeOrders)
      .innerJoin(users, eq(rechargeOrders.userId, users.id))
      .where(eq(rechargeOrders.id, orderId))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
      return;
    }

    // 解析 bankName/accountNumber/transferDate（兼容新旧记录）
    const parsed = parseBankTransferRemark(row.remark);

    reply.status(200).send({
      code: 0,
      data: {
        id: row.id,
        userId: row.userId,
        orderNo: row.orderNo,
        amount: row.amount,
        channel: row.channel,
        status: row.status,
        channelOrderNo: row.channelOrderNo,
        voucherImage: row.voucherImage,
        voucherNo: row.voucherNo,
        confirmedBy: row.confirmedBy,
        firstConfirmedBy: row.firstConfirmedBy,
        firstConfirmedAt: row.firstConfirmedAt?.toISOString() ?? null,
        secondConfirmedBy: row.secondConfirmedBy,
        secondConfirmedAt: row.secondConfirmedAt?.toISOString() ?? null,
        remark: row.remark,
        bankName: row.payerAccountName ?? parsed.bankName,
        accountNumber: row.payerAccountNo ?? parsed.accountNumber,
        transferDate: parsed.transferDate,
        paidAt: row.paidAt?.toISOString() ?? null,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        userEmail: row.userEmail,
        userNickname: row.userNickname,
        userBalance: row.userBalance,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/confirm — 确认对公转账（兼容旧版单次确认）
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const orderId = parseInt(id, 10);
      const adminUserId = request.user!.userId;

      if (isNaN(orderId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
        return;
      }

      await confirmBankTransfer(orderId, adminUserId);

      reply.status(200).send({
        code: 0,
        data: null,
        message: "对公转账已确认到账",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/cancel — 取消订单
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/cancel", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    const [order] = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.id, orderId))
      .limit(1);

    if (!order) {
      reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
      return;
    }

    if (order.status !== "pending") {
      reply.status(400).send({ code: 400, data: null, message: `订单状态为 ${order.status}，无法取消` });
      return;
    }

    // ⚠️ PERF: 确保响应在事务外发送，避免 Race Condition
    //     如果事务提交失败，用户不应收到成功响应
    await db.transaction(async (tx) => {
      await tx
        .update(rechargeOrders)
        .set({ status: "cancelled" })
        .where(eq(rechargeOrders.id, orderId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "user_update",
        targetType: "order",
        targetId: orderId,
        before: { status: order.status },
        after: { status: "cancelled" },
        ip: request.ip,
        description: `管理员取消充值订单 #${orderId} (${order.orderNo})`,
      });
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "订单已取消",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/batch-confirm — 批量初审/复审
  //  Body: { ids: number[], action: "confirm" | "reject", rejectReason?: string, isSecond?: boolean }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/batch-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      ids: number[];
      action: "confirm" | "reject";
      rejectReason?: string;
      isSecond?: boolean;
    };
    const operatorId = request.user!.userId;

    if (!body.ids?.length) {
      reply.status(400).send({ code: 400, data: null, message: "请选择要审核的订单" });
      return;
    }
    if (!body.action || !["confirm", "reject"].includes(body.action)) {
      reply.status(400).send({ code: 400, data: null, message: "action 必须为 confirm 或 reject" });
      return;
    }

    const results = { confirmed: 0, rejected: 0, errors: [] as { id: number; message: string }[] };

    // ── 【优化】先批量查询所有订单（消除 N+1）──
    const orders = await db
      .select()
      .from(rechargeOrders)
      .where(sql`${rechargeOrders.id} = ANY(ARRAY[${sql.join(body.ids.map(id => sql`${id}::int`), sql`, `)}])`);

    // 构建 id -> order 映射
    const orderMap = new Map<number, typeof orders[0]>();
    for (const order of orders) {
      orderMap.set(order.id, order);
    }

    const isSecondReview = body.isSecond === true;
    const ip = request.ip;

    // ── 在内存中验证和分组 ──
    const validOrders: typeof orders = [];
    const invalidOrders: { id: number; message: string }[] = [];

    for (const orderId of body.ids) {
      const order = orderMap.get(orderId);
      if (!order) {
        invalidOrders.push({ id: orderId, message: "订单不存在" });
        continue;
      }
      if (order.channel !== "bank_transfer") {
        invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 非对公转账` });
        continue;
      }

      if (isSecondReview) {
        // 复审验证
        if (!order.firstConfirmedBy) {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 尚未初审` });
          continue;
        }
        if (order.secondConfirmedBy || order.status !== "pending") {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 状态无法复审` });
          continue;
        }
      } else {
        // 初审验证
        if (order.firstConfirmedBy) {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 已初审` });
          continue;
        }
        if (order.status !== "pending") {
          invalidOrders.push({ id: orderId, message: `订单 ${order.orderNo} 状态无法初审` });
          continue;
        }
      }

      validOrders.push(order);
    }

    results.errors = invalidOrders;

    // ── 批量处理有效订单 ──
    if (validOrders.length > 0) {
      if (isSecondReview) {
        if (body.action === "confirm") {
          // ── 复审确认：需要逐个处理（因为涉及余额更新和佣金计算）──
          for (const order of validOrders) {
            try {
              const voucherNo = await generateVoucherNo('C');
              await db.transaction(async (tx) => {
                await tx
                  .update(rechargeOrders)
                  .set({
                    status: "confirmed",
                    secondConfirmedBy: operatorId,
                    secondConfirmedAt: new Date(),
                    confirmedBy: operatorId,
                    confirmedAt: new Date(),
                    voucherNo,
                  })
                  .where(eq(rechargeOrders.id, order.id));

                await tx
                  .update(users)
                  .set({ balance: sql`${users.balance} + ${order.amount}` })
                  .where(eq(users.id, order.userId));

                await tx.insert(balanceLogs).values({
                  userId: order.userId,
                  amount: order.amount,
                  balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
                  type: "recharge",
                  refType: "recharge",
                  refId: order.id,
                  description: `对公转账批量到账 / ${order.orderNo} / 凭证 ${voucherNo}`,
                });

                const { processRenewalCommission } = await import("../../../services/billing/index.js");
                await processRenewalCommission(tx, order.userId, order.id, order.amount, order.orderNo);

                await tx.insert(auditLogs).values({
                  operatorId,
                  action: "recharge_second_confirm",
                  targetType: "recharge_orders",
                  targetId: order.id,
                  before: { status: "pending", first_confirmed: true },
                  after: { status: "confirmed", voucherNo },
                  ip,
                  description: `批量复审确认 #${order.id} (${order.orderNo})`,
                });
              });
              results.confirmed++;
            } catch (err: any) {
              results.errors.push({ id: order.id, message: err.message || "处理失败" });
            }
          }
        } else {
          // ── 复审拒绝：可批量处理 ──
          await db.transaction(async (tx) => {
            for (const order of validOrders) {
              await tx
                .update(rechargeOrders)
                .set({
                  status: "cancelled",
                  secondConfirmedBy: operatorId,
                  secondConfirmedAt: new Date(),
                  remark: body.rejectReason || "批量复审拒绝",
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "order_cancel",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending", first_confirmed: true },
                after: { status: "cancelled" },
                ip,
                description: `批量复审拒绝 #${order.id}: ${body.rejectReason ?? "无原因"}`,
              });
            }
          });
          results.rejected = validOrders.length;
        }
      } else {
        // ── 初审：可批量处理（不涉及余额变更）──
        await db.transaction(async (tx) => {
          for (const order of validOrders) {
            if (body.action === "confirm") {
              await tx
                .update(rechargeOrders)
                .set({
                  firstConfirmedBy: operatorId,
                  firstConfirmedAt: new Date(),
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "recharge_first_confirm",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending" },
                after: { first_confirmed: true },
                ip,
                description: `批量初审确认 #${order.id} (${order.orderNo})`,
              });
            } else {
              await tx
                .update(rechargeOrders)
                .set({
                  status: "cancelled",
                  remark: body.rejectReason || "批量初审拒绝",
                })
                .where(eq(rechargeOrders.id, order.id));

              await tx.insert(auditLogs).values({
                operatorId,
                action: "order_cancel",
                targetType: "recharge_orders",
                targetId: order.id,
                before: { status: "pending" },
                after: { status: "cancelled" },
                ip,
                description: `批量初审拒绝 #${order.id}: ${body.rejectReason ?? "无原因"}`,
              });
            }
          }
        });
        if (body.action === "confirm") results.confirmed = validOrders.length;
        else results.rejected = validOrders.length;
      }
    }

    reply.status(200).send({
      code: 0,
      data: results,
      message: `批量操作完成：通过 ${results.confirmed} 笔，拒绝 ${results.rejected} 笔${results.errors.length ? `，${results.errors.length} 笔失败` : ""}`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/first-confirm — 充值初审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/first-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;
    const ip = request.ip;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    try {
      const parsed = firstConfirmRechargeSchema.parse(request.body);

      const [order] = await db
        .select()
        .from(rechargeOrders)
        .where(eq(rechargeOrders.id, orderId))
        .limit(1);

      if (!order) {
        reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
        return;
      }

      if (order.channel !== "bank_transfer") {
        reply.status(400).send({ code: 400, data: null, message: "仅支持对公转账订单" });
        return;
      }

      if (order.status !== "pending") {
        reply.status(400).send({ code: 400, data: null, message: `订单状态为 ${order.status}，无法审核` });
        return;
      }

      await db.transaction(async (tx) => {
        if (parsed.action === "confirm") {
          await tx
            .update(rechargeOrders)
            .set({
              firstConfirmedBy: operatorId,
              firstConfirmedAt: new Date(),
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "recharge_first_confirm",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending" },
            after: { first_confirmed: true },
            ip,
            description: `初审确认对公转账 #${orderId} (${order.orderNo})`,
          });
        } else {
          // 拒绝
          await tx
            .update(rechargeOrders)
            .set({
              status: "cancelled",
              remark: parsed.rejectReason || "初审拒绝",
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "order_cancel",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending" },
            after: { status: "cancelled", reason: parsed.rejectReason },
            ip,
            description: `初审拒绝对公转账 #${orderId}: ${parsed.rejectReason ?? "无原因"}`,
          });
        }
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: parsed.action === "confirm" ? "初审通过，等待复审确认" : "初审已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/second-confirm — 充值复审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/second-confirm", {
    preHandler: [requirePerm(Perm.FINANCE_RECHARGE)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const orderId = parseInt(id, 10);
    const operatorId = request.user!.userId;
    const ip = request.ip;

    if (isNaN(orderId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的订单 ID" });
      return;
    }

    try {
      const parsed = secondConfirmRechargeSchema.parse(request.body);

      const [order] = await db
        .select()
        .from(rechargeOrders)
        .where(eq(rechargeOrders.id, orderId))
        .limit(1);

      if (!order) {
        reply.status(404).send({ code: 404, data: null, message: "订单不存在" });
        return;
      }

      if (order.channel !== "bank_transfer") {
        reply.status(400).send({ code: 400, data: null, message: "仅支持对公转账订单" });
        return;
      }

      if (!order.firstConfirmedBy) {
        reply.status(400).send({ code: 400, data: null, message: "请先通过初审" });
        return;
      }

      if (order.status !== "pending" || order.secondConfirmedBy) {
        reply.status(400).send({ code: 400, data: null, message: `订单状态无法复审` });
        return;
      }

      const amount = order.amount;

      await db.transaction(async (tx) => {
        if (parsed.action === "confirm") {
          // 生成充值凭证号
          const voucherNo = await generateVoucherNo('C');

          await tx
            .update(rechargeOrders)
            .set({
              status: "confirmed",
              secondConfirmedBy: operatorId,
              secondConfirmedAt: new Date(),
              confirmedBy: operatorId,           // 兼容旧字段
              confirmedAt: new Date(),
              voucherNo,
              bankTxId: parsed.bankTxId ?? null,
            })
            .where(eq(rechargeOrders.id, orderId));

          // 增加用户余额
          await tx
            .update(users)
            .set({
              balance: sql`${users.balance} + ${amount}`,
            })
            .where(eq(users.id, order.userId));

          // 记录余额变动
          const bankInfo = order.payerAccountName
            ? `${order.payerAccountName}/${order.payerAccountNo ?? ""}`
            : order.remark ?? "";
          await tx.insert(balanceLogs).values({
            userId: order.userId,
            amount: amount,
            balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
            type: "recharge",
            refType: "recharge",
            refId: order.id,
            description: `对公转账到账 / ${bankInfo} / ${order.orderNo} / 凭证 ${voucherNo}`,
          });

          // 处理续费佣金
          const { processRenewalCommission } = await import("../../../services/billing/index.js");
          await processRenewalCommission(tx, order.userId, order.id, amount, order.orderNo);

          await tx.insert(auditLogs).values({
            operatorId,
            action: "recharge_second_confirm",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending", first_confirmed: true },
            after: { status: "confirmed", voucherNo },
            ip,
            description: `复审确认对公转账 #${orderId} (${order.orderNo})，金额 ${amount}`,
          });
        } else {
          // 复审拒绝
          await tx
            .update(rechargeOrders)
            .set({
              status: "cancelled",
              secondConfirmedBy: operatorId,
              secondConfirmedAt: new Date(),
              remark: parsed.rejectReason || "复审拒绝",
            })
            .where(eq(rechargeOrders.id, orderId));

          await tx.insert(auditLogs).values({
            operatorId,
            action: "order_cancel",
            targetType: "recharge_orders",
            targetId: orderId,
            before: { status: "pending", first_confirmed: true },
            after: { status: "cancelled", reason: parsed.rejectReason },
            ip,
            description: `复审拒绝对公转账 #${orderId}: ${parsed.rejectReason ?? "无原因"}`,
          });
        }
      });

      reply.status(200).send({
        code: 0,
        data: null,
        message: parsed.action === "confirm" ? "复审确认，充值已到账" : "复审已拒绝",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      throw err;
    }
  });
}
