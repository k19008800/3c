// ============================================================
//  3cloud (3C) — 充值路由
//  POST   /api/v1/recharge                — 在线支付下单
//  POST   /api/v1/recharge/bank-transfer  — 对公转账提交
//  GET    /api/v1/recharge/orders         — 查询我的充值订单
//  POST   /api/v1/recharge/:id/cancel     — 取消未支付订单
//  POST   /api/v1/recharge/notify         — 支付回调（上游通知）
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import { AppError } from "../services/auth-service.js";
import {
  createRechargeOrder,
  submitBankTransfer,
  getUserRechargeOrders,
  handlePaymentNotify,
  cancelOrder,
  getSavedPayerInfo,
} from "../services/recharge-service.js";
import {
  rechargeSchema,
  bankTransferSchema,
} from "../schemas.js";
import type { RechargeInput, BankTransferInput } from "../schemas.js";

export async function rechargeRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  POST /api/v1/recharge — 在线支付下单
  // ──────────────────────────────────────────────

  app.post("/api/v1/recharge", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const parsed = rechargeSchema.parse(request.body);
        const result = await createRechargeOrder({
          userId: request.user!.userId,
          amount: parsed.amount,
          channel: parsed.channel,
        });

        reply.status(200).send({
          code: 0,
          data: result,
          message: "订单创建成功",
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
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/recharge/bank-transfer/saved-info — 获取上次成功对公转账的付款信息
  // ──────────────────────────────────────────────

  app.get("/api/v1/recharge/bank-transfer/saved-info", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const result = await getSavedPayerInfo(request.user!.userId);

        reply.status(200).send({
          code: 0,
          data: result ?? {},
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/recharge/bank-transfer — 对公转账提交
  // ──────────────────────────────────────────────

  app.post("/api/v1/recharge/bank-transfer", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const parsed = bankTransferSchema.parse(request.body);
        const result = await submitBankTransfer({
          userId: request.user!.userId,
          amount: parsed.amount,
          bankName: parsed.bankName,
          accountNumber: parsed.accountNumber,
          transferDate: parsed.transferDate,
          remark: parsed.remark,
        });

        reply.status(200).send({
          code: 0,
          data: result,
          message: "对公转账提交成功，等待后台审核",
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
    },
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/recharge/orders — 查询我的充值订单
  // ──────────────────────────────────────────────

  app.get("/api/v1/recharge/orders", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const query = request.query as {
          page?: string;
          pageSize?: string;
          status?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

        const result = await getUserRechargeOrders(
          request.user!.userId,
          page,
          pageSize,
          query.status,
        );

        reply.status(200).send({
          code: 0,
          data: result,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/recharge/:id/cancel — 取消订单
  // ──────────────────────────────────────────────

  app.post("/api/v1/recharge/:id/cancel", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await cancelOrder(request.user!.userId, parseInt(id, 10));

        reply.status(200).send({
          code: 0,
          data: null,
          message: "订单已取消",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/recharge/notify — 支付回调
  //  对外暴露，仅接受上游支付通道的回调
  //  安全：通过签名校验（当前 mock 阶段仅验证 orderNo 存在）
  // ──────────────────────────────────────────────

  app.post("/api/v1/recharge/notify", async (request, reply) => {
    try {
      const body = request.body as {
        orderNo: string;
        channelOrderNo: string;
        amount: string;
        sign?: string;
      };

      if (!body.orderNo || !body.channelOrderNo || !body.amount) {
        reply.status(400).send({ code: 400, message: "参数不完整" });
        return;
      }

      // TODO: 生产环境加入签名校验
      // const signValid = verifyPaySign(body.orderNo, body.amount, body.sign);
      // if (!signValid) { ... }

      await handlePaymentNotify(body.orderNo, body.channelOrderNo, body.amount);

      // 微信/支付宝约定的成功响应格式
      reply.type("text/plain").send("SUCCESS");
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.message);
        return;
      }
      throw err;
    }
  });
}
