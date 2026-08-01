import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql, count } from "drizzle-orm";
import crypto from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { rechargeOrders } from "../db/schema/recharge-orders";
import { balanceLogs } from "../db/schema/balance-logs";

/**
 * 充值中心路由
 * 对齐 SPEC-充值中心.md §三
 * - 所有接口要求登录（JWT），req.user.sub = userId
 * - 余额单位：users.balance 存分（integer）；订单金额存元（numeric）
 */

const VALID_METHODS = ["alipay", "wechat", "bank_transfer"] as const;
const MIN_AMOUNT = 1; // ¥1
const MAX_AMOUNT = 50000; // ¥50000
const ORDER_TTL_MINUTES = 30;

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

function genOrderId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `recharge_${ymd}_${randomUUID().slice(0, 8)}`;
}

/** 将 numeric 字符串转为 number */
function toNum(v: any): number {
  if (v == null) return 0;
  return Number(v);
}

export function meRechargeRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // ===== 1. 查询余额 =====
  app.get(
    "/me/balance",
    { onRequest: [auth] },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const rows = await pool.query("SELECT balance FROM users WHERE id=$1", [userId]);
      const balanceCents = Number(rows.rows[0]?.balance ?? 0);
      return { code: 0, data: { balance: balanceCents / 100, unit: "CNY" }, message: "ok" };
    },
  );

  // ===== 2. 发起充值（创建订单）=====
  app.post(
    "/me/recharge",
    {
      onRequest: [auth],
      schema: {
        body: {
          type: "object",
          required: ["amount", "payment_method"],
          properties: {
            amount: { type: "number", minimum: MIN_AMOUNT, maximum: MAX_AMOUNT },
            payment_method: { type: "string", enum: VALID_METHODS },
            promotion_id: { type: "integer" },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { amount, payment_method, promotion_id } = req.body as {
        amount: number;
        payment_method: "alipay" | "wechat" | "bank_transfer";
        promotion_id?: number;
      };

      // 单日限额检查（对公不受限）
      if (payment_method !== "bank_transfer") {
        const day = await pool.query(
          `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM recharge_orders WHERE user_id=$1 AND status='success' AND created_at >= now() - interval '1 day'`,
          [userId],
        );
        if (toNum(day.rows[0].total) + amount > 100000) {
          return reply.code(400).send({ code: 400, error: "DAILY_LIMIT", message: "超出单日充值上限 ¥100,000" });
        }
      }

      const orderId = genOrderId();
      const expiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000);

      const inserted = await db
        .insert(rechargeOrders)
        .values({
          userId,
          orderId,
          amount: String(amount),
          payAmount: String(amount),
          actualAmount: String(amount),
          paymentMethod: payment_method,
          status: payment_method === "bank_transfer" ? "bank_pending" : "pending",
          promotionId: promotion_id ?? null,
          freeAmount: "0",
          expiresAt,
        })
        .returning();

      const order = inserted[0]!;
      const result: any = {
        order_id: order.orderId,
        status: order.status,
        amount: toNum(order.amount),
        pay_amount: toNum(order.payAmount),
        promotion: { free_amount: toNum(order.freeAmount) },
        expires_at: order.expiresAt?.toISOString() ?? null,
      };

      // 扫码支付：返回模拟二维码（生产环境对接真实支付网关）
      if (payment_method === "alipay" || payment_method === "wechat") {
        result.qr_code_url = `https://pay.unmisa.com/qr/${order.orderId}?method=${payment_method}&amount=${amount}`;
      } else {
        result.bank_info = {
          account_name: "深圳三云科技有限公司",
          account_number: "4000 0210 9000 1234 567",
          bank_name: "招商银行深圳分行",
          branch_name: "科技园支行",
        };
      }

      return reply.code(201).send({ code: 0, data: result, message: "ok" });
    },
  );

  // ===== 3. 充值记录列表 =====
  app.get(
    "/me/recharge-orders",
    { onRequest: [auth] },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const q = req.query as { page?: number; page_size?: number; status?: string };
      const page = Math.max(Number(q.page ?? 1), 1);
      const pageSize = Math.min(Number(q.page_size ?? 20), 100);
      const offset = (page - 1) * pageSize;

      // 查询前先自动过期处理
      await db
        .update(rechargeOrders)
        .set({ status: "expired" })
        .where(
          and(
            eq(rechargeOrders.userId, userId),
            eq(rechargeOrders.status, "pending"),
            sql`expires_at < now()`,
          ),
        );

      const conditions = [eq(rechargeOrders.userId, userId)];
      if (q.status) conditions.push(eq(rechargeOrders.status, q.status));

      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(rechargeOrders)
          .where(and(...conditions))
          .orderBy(desc(rechargeOrders.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(rechargeOrders)
          .where(and(...conditions)),
      ]);

      return {
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            order_id: r.orderId,
            amount: toNum(r.amount),
            payment_method: r.paymentMethod,
            status: r.status,
            paid_at: r.paidAt?.toISOString() ?? null,
            created_at: r.createdAt.toISOString(),
            can_retry: r.status === "pending" || r.status === "expired",
          })),
          pagination: { page, page_size: pageSize, total: Number(totalRows[0]?.total ?? 0) },
        },
        message: "ok",
      };
    },
  );

  // ===== 4. 订单详情 =====
  app.get(
    "/me/recharge-orders/:id",
    { onRequest: [auth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { id } = req.params as { id: string };
      const numericId = Number(id);
      if (!numericId) return reply.code(400).send({ code: 400, error: "BAD_REQUEST" });

      const rows = await db
        .select()
        .from(rechargeOrders)
        .where(and(eq(rechargeOrders.id, numericId), eq(rechargeOrders.userId, userId)))
        .limit(1);
      if (!rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "订单不存在" });

      const r = rows[0];
      return {
        code: 0,
        data: {
          id: r.id,
          order_id: r.orderId,
          amount: toNum(r.amount),
          pay_amount: toNum(r.payAmount),
          actual_amount: toNum(r.actualAmount),
          payment_method: r.paymentMethod,
          status: r.status,
          trade_no: r.tradeNo,
          free_amount: toNum(r.freeAmount),
          voucher_path: r.voucherPath,
          review_note: r.reviewNote,
          expires_at: r.expiresAt?.toISOString() ?? null,
          paid_at: r.paidAt?.toISOString() ?? null,
          created_at: r.createdAt.toISOString(),
        },
        message: "ok",
      };
    },
  );

  // ===== 5. 重新支付（过期订单）=====
  app.post(
    "/me/recharge-orders/:id/retry",
    { onRequest: [auth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { id } = req.params as { id: string };
      const numericId = Number(id);
      if (!numericId) return reply.code(400).send({ code: 400, error: "BAD_REQUEST" });

      const rows = await db
        .select()
        .from(rechargeOrders)
        .where(and(eq(rechargeOrders.id, numericId), eq(rechargeOrders.userId, userId)))
        .limit(1);
      if (!rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });

      const r = rows[0];
      if (r.status !== "pending" && r.status !== "expired") {
        return reply.code(400).send({ code: 400, error: "INVALID_STATUS", message: "当前状态不可重新支付" });
      }
      if (r.paymentMethod === "bank_transfer") {
        return reply.code(400).send({ code: 400, error: "INVALID_METHOD", message: "对公转账不支持重新支付" });
      }
      // 只允许 30 分钟内的过期订单重试
      if (r.status === "expired" && r.expiresAt && new Date().getTime() - new Date(r.expiresAt).getTime() > 30 * 60 * 1000) {
        return reply.code(400).send({ code: 400, error: "TOO_LATE", message: "订单过期超过30分钟，请重新发起充值" });
      }

      const newExpiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000);
      await db
        .update(rechargeOrders)
        .set({ status: "pending", expiresAt: newExpiresAt })
        .where(eq(rechargeOrders.id, numericId));

      return reply.code(201).send({
        code: 0,
        data: {
          order_id: r.orderId,
          status: "pending",
          qr_code_url: `https://pay.unmisa.com/qr/${r.orderId}?method=${r.paymentMethod}&amount=${toNum(r.amount)}`,
          expires_at: newExpiresAt.toISOString(),
        },
        message: "ok",
      });
    },
  );

  // ===== 6. 支付回调（外部通知）=====
  app.post("/me/recharge/callback", async (req, reply) => {
    const body = req.body as {
      order_id: string;
      trade_no?: string;
      pay_amount?: number;
      status?: string;
      signature?: string;
    };

    // 校验签名（生产环境用 HMAC + 密钥）
    const sig = crypto
      .createHmac("sha256", process.env.PAY_CALLBACK_SECRET ?? "dev-callback-secret")
      .update(`${body.order_id}:${body.trade_no ?? ""}:${body.pay_amount ?? 0}:${body.status ?? ""}`)
      .digest("hex");
    if (body.signature && body.signature !== sig) {
      return reply.code(401).send({ code: 401, error: "BAD_SIGNATURE" });
    }

    if (!body.order_id || body.status !== "success") {
      return reply.code(200).send({ code: 0, message: "ignored" });
    }

    // 幂等：只处理 pending 状态的订单
    const orderRows = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.orderId, body.order_id))
      .limit(1);
    const order = orderRows[0];
    if (!order || order.status !== "pending") {
      return reply.code(200).send({ code: 0, message: "ignored" });
    }

    // 事务：更新订单 → 增加余额 → 写 balance_logs
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const amount = toNum(order.amount);
      const free = toNum(order.freeAmount);
      const actual = amount + free;
      const cents = Math.round(actual * 100);

      // 更新订单
      await client.query(
        "UPDATE recharge_orders SET status='success', paid_at=now(), trade_no=$1, actual_amount=$2, updated_at=now() WHERE id=$3",
        [body.trade_no ?? null, actual.toFixed(2), order.id],
      );

      // 增加余额（分）
      await client.query("UPDATE users SET balance = balance + $1, updated_at=now() WHERE id=$2", [cents, order.userId]);

      // 写余额日志（元）
      const before = toNum((await client.query("SELECT balance FROM users WHERE id=$1", [order.userId])).rows[0]?.balance) / 100;
      await client.query(
        `INSERT INTO balance_logs (user_id, type, amount, balance_before, balance_after, order_id, recharge_order_id, description)
         VALUES ($1,'recharge',$2,$3,$4,$5,$6,$7)`,
        [order.userId, amount.toFixed(2), (before - amount).toFixed(2), before.toFixed(2), order.orderId, order.id, "充值到账"],
      );
      if (free > 0) {
        await client.query(
          `INSERT INTO balance_logs (user_id, type, amount, balance_before, balance_after, order_id, recharge_order_id, description)
           VALUES ($1,'promotion',$2,$3,$4,$5,$6,$7)`,
          [order.userId, free.toFixed(2), before.toFixed(2), (before + free).toFixed(2), order.orderId, order.id, "充值赠送"],
        );
      }

      await client.query("COMMIT");
      return reply.code(200).send({ code: 0, data: { success: true }, message: "ok" });
    } catch (e) {
      await client.query("ROLLBACK");
      req.log.error(e, "recharge callback error");
      return reply.code(500).send({ code: 500, error: "INTERNAL" });
    } finally {
      client.release();
    }
  });

  // ===== 7. 上传对公转账凭证 =====
  app.post(
    "/me/recharge-orders/bank-transfer",
    { onRequest: [auth] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { order_id, note } = req.body as { order_id?: string; note?: string };

      if (!order_id) return reply.code(400).send({ code: 400, error: "MISSING_ORDER" });

      const rows = await db
        .select()
        .from(rechargeOrders)
        .where(and(eq(rechargeOrders.orderId, order_id), eq(rechargeOrders.userId, userId)))
        .limit(1);
      if (!rows[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });

      const order = rows[0];
      if (order.paymentMethod !== "bank_transfer") {
        return reply.code(400).send({ code: 400, error: "NOT_BANK_TRANSFER" });
      }
      if (order.status === "under_review" || order.status === "success") {
        return reply.code(400).send({ code: 400, error: "ALREADY_REVIEWING" });
      }

      // 凭证文件处理（multipart 由 fastify-multipart 处理，此处简化：body 里的 voucher_path 或上传路径）
      // 实际环境：app.register(require("@fastify/multipart")) 后取 file
      let voucherPath: string | null = null;
      const contentType = req.headers["content-type"] ?? "";
      if (contentType.includes("multipart")) {
        // 简单实现：用 multipart 解析第一个文件
        const data = await (req as any).file?.();
        if (data) {
          const dir = join(process.cwd(), "uploads", "vouchers");
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          voucherPath = join(dir, `${order.orderId}.${(data.filename ?? "file").split(".").pop() ?? "jpg"}`);
          // 流式保存
          const { createWriteStream } = await import("node:fs");
          await new Promise<void>((resolve, reject) => {
            const ws = createWriteStream(voucherPath!);
            (data.file as NodeJS.ReadableStream).pipe(ws).on("finish", resolve).on("error", reject);
          });
        }
      }

      await db
        .update(rechargeOrders)
        .set({ status: "under_review", voucherPath: voucherPath ?? undefined, reviewNote: note ?? null, updatedAt: new Date() })
        .where(eq(rechargeOrders.id, order.id));

      return reply.code(201).send({ code: 0, data: { order_id: order.orderId, status: "under_review" }, message: "ok" });
    },
  );

  // ===== 8. 消费明细 =====
  app.get(
    "/me/transactions",
    { onRequest: [auth] },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const q = req.query as { page?: number; page_size?: number; type?: string; time_range?: string };
      const page = Math.max(Number(q.page ?? 1), 1);
      const pageSize = Math.min(Number(q.page_size ?? 20), 100);
      const offset = (page - 1) * pageSize;

      const where = ["user_id = $" + (1 + 0)];
      const params: any[] = [userId];
      if (q.type) {
        params.push(q.type);
        where.push("type = $" + params.length);
      }
      if (q.time_range === "7d") where.push("created_at >= now() - interval '7 days'");
      if (q.time_range === "30d") where.push("created_at >= now() - interval '30 days'");
      if (q.time_range === "90d") where.push("created_at >= now() - interval '90 days'");
      const whereSql = where.join(" AND ");

      const [rows, totalRows] = await Promise.all([
        pool.query(
          `SELECT id, type, amount::float AS amount, balance_before::float AS balance_before, balance_after::float AS balance_after,
                  description, order_id, created_at
           FROM balance_logs WHERE ${whereSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, offset],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM balance_logs WHERE ${whereSql}`,
          params,
        ),
      ]);

      return {
        code: 0,
        data: {
          list: rows.rows,
          pagination: { page, page_size: pageSize, total: Number(totalRows.rows[0]?.total ?? 0) },
        },
        message: "ok",
      };
    },
  );

  // ===== 9. 可用优惠列表 =====
  app.get(
    "/me/promotions",
    { onRequest: [auth] },
    async (req, reply) => {
      // 从 campaigns 表读取进行中的充值优惠活动
      let promotions: any[] = [];
      try {
        const rows = await pool.query(
          `SELECT id, title, description, rule, min_amount::float AS min_amount, benefit, end_time
           FROM campaigns
           WHERE type='recharge' AND status='active' AND start_time <= now() AND end_time >= now()
           ORDER BY end_time ASC`,
        );
        promotions = rows.rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          rule: r.rule,
          minAmount: r.min_amount,
          benefit: r.benefit,
          remainingDays: Math.max(0, Math.ceil((new Date(r.end_time).getTime() - Date.now()) / (24 * 3600 * 1000))),
        }));
      } catch {
        // campaigns 表可能不存在，返回空
      }
      return { code: 0, data: { list: promotions }, message: "ok" };
    },
  );
}
