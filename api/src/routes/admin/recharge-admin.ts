// ============================================================
//  3cloud (3C) — 充值审核路由（管理员）
//  GET    /api/v1/admin/recharge-orders                     — 充值订单列表
//  GET    /api/v1/admin/recharge-orders/:id                  — 订单详情
//  POST   /api/v1/admin/recharge-orders/:id/confirm          — 确认对公转账（单次确认兼容）
//  POST   /api/v1/admin/recharge-orders/:id/cancel           — 取消订单
//  POST   /api/v1/admin/recharge-orders/:id/first-confirm    — 充值初审
//  POST   /api/v1/admin/recharge-orders/:id/second-confirm   — 充值复审
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { rechargeOrders, users, balanceLogs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";
import { confirmBankTransfer } from "../../services/recharge-service.js";
import { generateVoucherNo } from "../../services/voucher-service.js";
import {
  firstConfirmRechargeSchema,
  secondConfirmRechargeSchema,
} from "../../schemas.js";

export async function adminRechargeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/recharge-orders — 充值订单列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/recharge-orders", async (request, reply) => {
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

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
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
          paidAt: r.paidAt?.toISOString() ?? null,
          confirmedAt: r.confirmedAt?.toISOString() ?? null,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          userEmail: r.userEmail,
          userNickname: r.userNickname,
        })),
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

  app.get("/api/v1/admin/recharge-orders/:id", async (request, reply) => {
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

    reply.status(200).send({
      code: 0,
      data: {
        ...row,
        firstConfirmedAt: row.firstConfirmedAt?.toISOString() ?? null,
        secondConfirmedAt: row.secondConfirmedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/recharge-orders/:id/confirm — 确认对公转账（兼容旧版单次确认）
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/confirm", async (request, reply) => {
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

  app.post("/api/v1/admin/recharge-orders/:id/cancel", async (request, reply) => {
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
  //  POST /api/v1/admin/recharge-orders/:id/first-confirm — 充值初审
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/recharge-orders/:id/first-confirm", async (request, reply) => {
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

  app.post("/api/v1/admin/recharge-orders/:id/second-confirm", async (request, reply) => {
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
          await tx.insert(balanceLogs).values({
            userId: order.userId,
            amount: amount,
            balanceAfter: sql`(SELECT balance FROM ${users} WHERE id = ${order.userId})`,
            type: "recharge",
            refType: "recharge",
            refId: order.id,
            description: `对公转账到账 / ${order.orderNo} / 凭证 ${voucherNo}`,
          });

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
