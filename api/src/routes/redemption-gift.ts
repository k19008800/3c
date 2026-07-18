// ============================================================
//  3cloud (3C) — 兑换码转赠路由
//  POST /api/v1/redemption/codes/:id/gift  — 转赠兑换码
//  GET  /api/v1/redemption/gift-history    — 转赠记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import {
  users,
  redemptionBatches,
  redemptionCodes,
  redemptionGiftLogs,
} from "../db/schema.js";
import { authenticateJWT, guardNotImpersonating } from "../middleware/auth.js";
import { AppError } from "../services/auth-service/index.js";
import { logOperation } from "../services/operation-log.js";

// ── 工具：生成 16 位随机码（数字 + 大写字母）──

function generateRedemptionCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

export async function redemptionGiftRoutes(app: FastifyInstance) {
  // ════════════════════════════════════════════════
  //  POST /api/v1/redemption/codes/:id/gift — 转赠兑换码
  //  逻辑：原码作废（status = "revoked"），为目标用户创建等价新码
  // ════════════════════════════════════════════════
  app.post("/api/v1/redemption/codes/:id/gift", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const codeId = parseInt(id, 10);

        if (isNaN(codeId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const body = request.body as {
          targetEmail?: string;
          message?: string;
        };

        if (!body.targetEmail) {
          reply.status(400).send({ code: 400, data: null, message: "请提供 targetEmail" });
          return;
        }

        const targetEmail = String(body.targetEmail).trim().toLowerCase();
        const message = body.message ? String(body.message).trim() : null;

        const db = getDb();
        const userId = request.user!.userId;

        // ── 查询兑换码（含批次信息）──
        const [codeRecord] = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            status: redemptionCodes.status,
            usesLeft: redemptionCodes.usesLeft,
            batchId: redemptionCodes.batchId,
            batchCreatorId: redemptionBatches.creatorId,
            batchStatus: redemptionBatches.status,
            batchExpiresAt: redemptionBatches.expiresAt,
            batchMaxUses: redemptionBatches.maxUses,
          })
          .from(redemptionCodes)
          .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(eq(redemptionCodes.id, codeId))
          .limit(1);

        if (!codeRecord) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        // ── 验证状态：仅 unused 可转赠 ──
        if (codeRecord.status !== "unused") {
          reply.status(400).send({
            code: 400,
            data: null,
            message: "仅未使用的兑换码可转赠",
          });
          return;
        }

        // ── 验证权限：当前用户必须是批次创建者 ──
        if (codeRecord.batchCreatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "仅批次创建者可转赠该码" });
          return;
        }

        // ── 验证批次状态 ──
        if (codeRecord.batchStatus !== "active") {
          reply.status(400).send({ code: 400, data: null, message: "该兑换码所属批次已不可用" });
          return;
        }

        // ── 验证过期 ──
        if (codeRecord.batchExpiresAt && new Date() > new Date(codeRecord.batchExpiresAt)) {
          reply.status(400).send({ code: 400, data: null, message: "该兑换码已过期" });
          return;
        }

        // ── 查找目标用户 ──
        const [targetUser] = await db
          .select({ id: users.id, email: users.email, status: users.status })
          .from(users)
          .where(eq(users.email, targetEmail))
          .limit(1);

        if (!targetUser) {
          reply.status(404).send({ code: 404, data: null, message: "目标用户不存在" });
          return;
        }

        if (targetUser.status !== "active") {
          reply.status(400).send({ code: 400, data: null, message: "目标用户账号状态异常" });
          return;
        }

        // 不能转赠给自己
        if (targetUser.id === userId) {
          reply.status(400).send({ code: 400, data: null, message: "不能转赠给自己" });
          return;
        }

        // ── 事务执行转赠 ──
        const newCodeValue = generateRedemptionCode();

        // 去重生成
        let finalCode = newCodeValue;
        let attempts = 0;
        while (attempts < 20) {
          const [existing] = await db
            .select({ id: redemptionCodes.id })
            .from(redemptionCodes)
            .where(eq(redemptionCodes.code, finalCode))
            .limit(1);
          if (!existing) break;
          finalCode = generateRedemptionCode();
          attempts++;
        }

        let newCodeId = 0;

        await db.transaction(async (tx) => {
          // 1. 原码作废
          await tx
            .update(redemptionCodes)
            .set({ status: "revoked" })
            .where(eq(redemptionCodes.id, codeRecord.id));

          // 2. 创建新码
          const [newCode] = await tx
            .insert(redemptionCodes)
            .values({
              batchId: codeRecord.batchId,
              code: finalCode,
              amount: codeRecord.amount,
              usesLeft: codeRecord.usesLeft,
              status: "unused",
            })
            .returning({ id: redemptionCodes.id });

          newCodeId = newCode.id;

          // 3. 记录转赠日志
          await tx.insert(redemptionGiftLogs).values({
            originalCodeId: codeRecord.id,
            newCodeId: newCode.id,
            batchId: codeRecord.batchId,
            fromUserId: userId,
            toUserId: targetUser.id,
            message,
          });
        });

        // 4. 操作日志（异步，不阻塞）
        logOperation({
          userId,
          userRole: request.user!.role,
          category: "finance",
          action: "redemption_gift",
          targetType: "redemption_code",
          targetId: codeRecord.id,
          resourceName: codeRecord.code,
          summary: `转赠兑换码 ${codeRecord.code} 给用户 ${targetUser.email}（¥${codeRecord.amount}）`,
          ip: request.ip,
          userAgent: request.headers["user-agent"] as string | undefined,
        });

        reply.status(200).send({
          code: 0,
          data: {
            newCode: finalCode,
            newCodeId,
            amount: codeRecord.amount,
          },
          message: "转赠成功",
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

  // ════════════════════════════════════════════════
  //  GET /api/v1/redemption/gift-history — 转赠记录
  //  返回发出的 + 收到的转赠
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/gift-history", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;

        const query = request.query as {
          page?: string;
          pageSize?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        // ── 收到的转赠（toUserId = 当前用户）──
        const receivedRows = await db
          .select({
            id: redemptionGiftLogs.id,
            originalCodeId: redemptionGiftLogs.originalCodeId,
            newCodeId: redemptionGiftLogs.newCodeId,
            batchId: redemptionGiftLogs.batchId,
            fromUserId: redemptionGiftLogs.fromUserId,
            fromEmail: users.email,
            fromNickname: users.nickname,
            amount: redemptionCodes.amount,
            message: redemptionGiftLogs.message,
            createdAt: redemptionGiftLogs.createdAt,
          })
          .from(redemptionGiftLogs)
          .leftJoin(users, eq(redemptionGiftLogs.fromUserId, users.id))
          .leftJoin(redemptionCodes, eq(redemptionGiftLogs.newCodeId, redemptionCodes.id))
          .where(eq(redemptionGiftLogs.toUserId, userId))
          .orderBy(desc(redemptionGiftLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        // ── 发出的转赠（fromUserId = 当前用户）──
        const sentRows = await db
          .select({
            id: redemptionGiftLogs.id,
            originalCodeId: redemptionGiftLogs.originalCodeId,
            newCodeId: redemptionGiftLogs.newCodeId,
            batchId: redemptionGiftLogs.batchId,
            toUserId: redemptionGiftLogs.toUserId,
            toEmail: users.email,
            toNickname: users.nickname,
            amount: redemptionCodes.amount,
            message: redemptionGiftLogs.message,
            createdAt: redemptionGiftLogs.createdAt,
          })
          .from(redemptionGiftLogs)
          .leftJoin(users, eq(redemptionGiftLogs.toUserId, users.id))
          .leftJoin(redemptionCodes, eq(redemptionGiftLogs.originalCodeId, redemptionCodes.id))
          .where(eq(redemptionGiftLogs.fromUserId, userId))
          .orderBy(desc(redemptionGiftLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        // ── 总条数统计 ──
        const [sentTotal] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionGiftLogs)
          .where(eq(redemptionGiftLogs.fromUserId, userId));

        const [receivedTotal] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionGiftLogs)
          .where(eq(redemptionGiftLogs.toUserId, userId));

        reply.status(200).send({
          code: 0,
          data: {
            sent: sentRows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
            received: receivedRows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
            total: {
              sent: sentTotal?.total ?? 0,
              received: receivedTotal?.total ?? 0,
            },
          },
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
}
