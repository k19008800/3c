// ============================================================

//  3cloud (3C) —兑换码系统：兑换逻辑

//  POST /api/v1/redemption/redeem

// ============================================================



import { FastifyInstance } from "fastify";

import { eq, and, sql } from "drizzle-orm";

import { getDb } from "../../db/index.js";

import { getRedis } from "../../redis.js";

import {

  users,

  redemptionBatches,

  redemptionCodes,

  redemptionLogs,

  balanceLogs,

} from "../../db/schema.js";

import { authenticateJWT, guardNotImpersonating } from "../../middleware/auth.js";

import { idempotentGuard } from "../../middleware/idempotent.js";

import { AppError } from "../../services/auth-service/index.js";

import { logOperation } from "../../services/operation-log.js";

import { notifyCodeRedeemed } from "../../services/redemption-notify.js";

import { redeemRateLimitKey } from "./types.js";



export function registerRedeemRoute(app: FastifyInstance): void {

  // ════════════════════════════════════════════════

  //  POST /api/v1/redemption/redeem �d用户兑换

  //  输入�r� 校验 �.余额到账 �s记录日志

  //  Redis 限流：5次/分钟/IP
  //  幂等保护：X-Idempotency-Key（自动生成或客户端指定）

  // ════════════════════════════════════════════════

  app.post("/api/v1/redemption/redeem", {

    preHandler: [idempotentGuard, authenticateJWT, guardNotImpersonating],

    handler: async (request, reply) => {

      try {

        const body = request.body as { code?: string };

        if (!body?.code) {

          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });

          return;

        }



        const inputCode = String(body.code).trim().toUpperCase();

        const ip = request.ip;



        // ── 代理商：预扣余额 ──
        const redis = getRedis();

        const rateKey = redeemRateLimitKey(ip);

        const current = await redis.incr(rateKey);

        if (current === 1) {

          await redis.expire(rateKey, 60);

        }

        if (current > 5) {

          reply.status(429).send({

            code: 429,

            data: null,

            message: "操作过于频繁，请稍后再试（每分钟限 5 次）",
          });

          return;

        }



        const db = getDb();

        const userId = request.user!.userId;



        // ── 代理商：预扣余额 ──
        const { checkRedeemFraud, recordBruteForce, recordUserFrequency } = await import("../../services/redemption-fraud.js");

        const fraudResult = await checkRedeemFraud({ ip, userId, code: inputCode, codeRecord: null });

        if (fraudResult.blocked) {

          reply.status(403).send({ code: 403, data: null, message: `操作被风控拦截：${fraudResult.reason || "IP已被限制"}` });

          return;

        }



        // ── 代理商：预扣余额 ──
        const [codeRecord] = await db

          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            status: redemptionCodes.status,
            usesLeft: redemptionCodes.usesLeft,
            batchId: redemptionCodes.batchId,
            batchStatus: redemptionBatches.status,
            batchExpiresAt: redemptionBatches.expiresAt,
            batchMaxUses: redemptionBatches.maxUses,
            batchUsedCount: redemptionBatches.usedCount,
          })

          .from(redemptionCodes)

          .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))

          .where(eq(redemptionCodes.code, inputCode))

          .limit(1);



        if (!codeRecord) {

          await recordBruteForce(ip, inputCode);

          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });

          return;

        }



        // ── 代理商：预扣余额 ──
        if (codeRecord.status !== "unused") {

          const statusMsg: Record<string, string> = {

            used: "该兑换码已被使用",

            expired: "该兑换码已过期",
            revoked: "该兑换码已被作废",

          };

          reply.status(400).send({

            code: 400,

            data: null,

            message: statusMsg[codeRecord.status] || "该兑换码无效",

          });

          return;

        }



        // ── 代理商：预扣余额 ──
        if (codeRecord.batchStatus !== "active") {

          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;

        }



        // ── 校验过期 ──

        if (codeRecord.batchExpiresAt && new Date() > new Date(codeRecord.batchExpiresAt)) {

          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;

        }



        // ── 校验批次额度（最多使用次数）──

        if (codeRecord.batchMaxUses && codeRecord.batchUsedCount >= codeRecord.batchMaxUses) {

          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;

        }



        // ── 代理商：预扣余额 ──
        const [existingLog] = await db

          .select({ id: redemptionLogs.id })

          .from(redemptionLogs)

          .where(

            and(

              eq(redemptionLogs.codeId, codeRecord.id),

              eq(redemptionLogs.userId, userId)

            )

          )

          .limit(1);



        if (existingLog) {

          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });

          return;

        }



        // ── 代理商：预扣余额 ──
        const { recordCodeLeak } = await import("../../services/redemption-fraud.js");

        await recordUserFrequency(userId);

        await recordCodeLeak(codeRecord.id, ip);



        // ── 执行兑换（事务）──

        const amount = codeRecord.amount;



        // 更新兑换码状态
        await db
          .update(redemptionCodes)

          .set({

            status: "used",

            usesLeft: codeRecord.usesLeft - 1,

            usedAt: new Date(),

          })

          .where(eq(redemptionCodes.id, codeRecord.id));



        // 增加批次已使用计数
        await db
          .update(redemptionBatches)

          .set({

            usedCount: sql`${redemptionBatches.usedCount} + 1`,

          })

          .where(eq(redemptionBatches.id, codeRecord.batchId));



        // 用户加余额
        await db
          .update(users)

          .set({

            balance: sql`${users.balance} + ${amount}`,

          })

          .where(eq(users.id, userId));



        // 记录余额日志

        const [userAfter] = await db

          .select({ balance: users.balance })

          .from(users)

          .where(eq(users.id, userId))

          .limit(1);



        await db.insert(balanceLogs).values({

          userId,

          amount,

          balanceAfter: userAfter?.balance ?? amount,

          type: "recharge", // 使用 recharge 类型（等价于充值）

          refType: "redemption_code",

          refId: codeRecord.id,

          description: `兑换码 ${codeRecord.code} 充值 ${amount} 元`,
        });



        // 记录兑换日志

        await db.insert(redemptionLogs).values({

          codeId: codeRecord.id,

          userId,

          amount,

          batchId: codeRecord.batchId,

          ip,

        });



        const responseBody = {

          code: 0,

          data: {

            amount,

            balanceAfter: userAfter?.balance ?? "0",

          },

          message: `兑换成功，已到账 ${amount} 元`,

        };



        // ── 缓存幂等结果 ──

        if ((request as any).cacheIdempotentResponse) {

          await (request as any).cacheIdempotentResponse(200, responseBody);

        }



        reply.status(200).send(responseBody);



        logOperation({

          userId,

          userRole: request.user!.role,

          category: "finance",

          action: "redemption_use",

          targetType: "redemption_code",

          targetId: codeRecord.id,

          resourceName: codeRecord.code,

          summary: `使用兑换码 ${codeRecord.code}，到账 ¥${amount}`,
          ip,

          userAgent: request.headers["user-agent"] as string | undefined,

        });



        // 发送通知
        notifyCodeRedeemed({
          batchId: codeRecord.batchId,
          codeId: codeRecord.id,
          code: codeRecord.code,
          redeemedBy: userId,
          amount: codeRecord.amount,
        }).catch((err) => {
          request.log.error({ err }, "[Notif] 兑换通知发送失败");
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

}

