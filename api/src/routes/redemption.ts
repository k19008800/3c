// ============================================================
//  3cloud (3C) — 兑换码系统路由
//  POST   /api/redemption/codes/batch    — 生成兑换码批次
//  GET    /api/redemption/codes           — 查询兑换码列表
//  GET    /api/redemption/codes/:id       — 查看单个兑换码
//  POST   /api/redemption/redeem          — 用户兑换
//  GET    /api/redemption/logs            — 用户兑换记录
//  DELETE /api/redemption/codes/:id       — 作废/删除兑换码
//  GET    /api/redemption/stats           — 兑换统计
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, lt, gte, lte, count, ilike } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import {
  users,
  agents,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  balanceLogs,
} from "../db/schema.js";
import { authenticateJWT, requireRole, requirePerm, Perm, guardNotImpersonating, guardNotImpersonatingWrite } from "../middleware/auth.js";
import { idempotentGuard } from "../middleware/idempotent.js";
import { AppError } from "../services/auth-service.js";
import { logOperation } from "../services/operation-log.js";
import { notifyCodeRedeemed, notifyCodeRevoked } from "../services/redemption-notify.js";

// ── 工具：生成 16 位随机码（数字 + 大写字母）──

function generateRedemptionCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 排除易混淆 I/O/0/1
  const bytes = randomBytes(16);
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

function generateCodes(count: number): Set<string> {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateRedemptionCode());
  }
  return codes;
}

// ── 工具：解析用户角色（是否为代理商或管理员）──

function isAdminRole(role: string): boolean {
  return ["super_admin", "admin", "finance_ops", "ops"].includes(role);
}

// ── 限流 Key ──

function redeemRateLimitKey(ip: string): string {
  return `rate:redeem:ip:${ip}`;
}

export async function redemptionRoutes(app: FastifyInstance) {
  // ════════════════════════════════════════════════
  //  POST /api/redemption/codes/batch — 生成兑换码批次
  //  管理员/代理商可用。代理商生成从代理余额预扣总额。
  // ════════════════════════════════════════════════
  app.post("/api/v1/redemption/codes/batch", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const body = request.body as {
          name?: string;
          amount?: string | number;
          count?: number;
          expiresAt?: string;
          maxUses?: number;
          note?: string;
        };

        if (!body.name || !body.amount || !body.count) {
          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });
          return;
        }

        const name = String(body.name).trim();
        const amount = String(body.amount);
        const totalCount = parseInt(String(body.count), 10);
        const maxUses = body.maxUses ? parseInt(String(body.maxUses), 10) : 1;
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        const note = body.note || null;

        if (totalCount <= 0 || totalCount > 100000) {
          reply.status(400).send({ code: 400, data: null, message: "count 必须在 1~100000 之间" });
          return;
        }

        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          reply.status(400).send({ code: 400, data: null, message: "amount 必须为正数" });
          return;
        }

        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        const isAdmin = isAdminRole(userRole);
        const isAgent = userRole === "agent";

        if (!isAdmin && !isAgent) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员和代理商可生成兑换码" });
          return;
        }

        // ── 代理商：预扣余额 ──
        if (isAgent) {
          const totalAmount = (parseFloat(amount) * totalCount).toFixed(6);

          // 查代理信息
          const [agent] = await db
            .select({
              id: agents.id,
              status: agents.status,
              settledCommission: agents.settledCommission,
              pendingWithdraw: agents.pendingWithdraw,
              frozenAmount: agents.frozenAmount,
              redemptionLocked: agents.redemptionLocked,
            })
            .from(agents)
            .where(eq(agents.userId, userId))
            .limit(1);

          if (!agent) {
            reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });
            return;
          }

          if (!agent.status) {
            reply.status(403).send({ code: 403, data: null, message: "代理商账号已禁用" });
            return;
          }

          // 可用余额 = settledCommission - pendingWithdraw - frozenAmount - redemptionLocked
          const available = parseFloat(agent.settledCommission as string ?? "0")
            - parseFloat(agent.pendingWithdraw as string ?? "0")
            - parseFloat(agent.frozenAmount as string ?? "0")
            - parseFloat(agent.redemptionLocked as string ?? "0");

          if (available < parseFloat(totalAmount)) {
            reply.status(400).send({
              code: 400,
              data: null,
              message: `代理商余额不足。需 ${totalAmount}，可用 ${available.toFixed(6)}`,
            });
            return;
          }
        }

        // ── 创建批次 ──
        const [batch] = await db
          .insert(redemptionBatches)
          .values({
            creatorId: userId,
            name,
            amount,
            totalCount,
            maxUses,
            expiresAt,
            status: "active",
            note,
          })
          .returning();

        // ── 生成兑换码 ──
        const uniqueCodes = generateCodes(totalCount);
        const codeValues = Array.from(uniqueCodes).map((code) => ({
          batchId: batch.id,
          code,
          amount,
          usesLeft: maxUses,
          status: "unused" as const,
        }));

        // 批量插入
        const CHUNK_SIZE = 500;
        for (let i = 0; i < codeValues.length; i += CHUNK_SIZE) {
          const chunk = codeValues.slice(i, i + CHUNK_SIZE);
          await db.insert(redemptionCodes).values(chunk);
        }

        // ── 代理商：锁定兑换资金 ──
        if (isAgent) {
          const totalAmount = (parseFloat(amount) * totalCount).toFixed(6);

          // 将资金从 settledCommission 锁定到 redemptionLocked
          await db
            .update(agents)
            .set({
              settledCommission: sql`GREATEST(0, ${agents.settledCommission} - ${totalAmount})`,
              redemptionLocked: sql`${agents.redemptionLocked} + ${totalAmount}`,
            })
            .where(eq(agents.userId, userId));

          // 记录余额日志（代理商余额在 agents.settledCommission，非 users.balance）
          const [updated] = await db
            .select({ settledCommission: agents.settledCommission })
            .from(agents)
            .where(eq(agents.userId, userId))
            .limit(1);

          await db.insert(balanceLogs).values({
            userId,
            amount: `-${totalAmount}`,
            balanceAfter: updated?.settledCommission ?? "0",
            type: "redemption_prepay",
            refType: "redemption_batch",
            refId: batch.id,
            description: `生成兑换码批次 #${batch.id}，锁定 ${totalAmount} 元（redemptionLocked 托管）`,
          });
        }

        reply.status(200).send({
          code: 0,
          data: {
            batchId: batch.id,
            name: batch.name,
            totalCount,
            createdAt: batch.createdAt.toISOString(),
          },
          message: "兑换码批次创建成功",
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
  //  GET /api/redemption/codes — 查询兑换码列表
  //  管理员看全量，代理商看自己创建的
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/codes", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        const query = request.query as {
          page?: string;
          pageSize?: string;
          batchId?: string;
          status?: string;
          code?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [];

        // 管理员看全量，代理商只看自己创建的
        if (!isAdmin) {
          // 通过 batch 关联查询
          const userBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));
          conditions.push(eq(redemptionCodes.batchId, sql`ANY(${userBatches})`));
        }

        if (query.batchId) {
          conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));
        }
        if (query.status) {
          conditions.push(eq(redemptionCodes.status, query.status as any));
        }
        if (query.code) {
          conditions.push(eq(redemptionCodes.code, query.code.toUpperCase()));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionCodes)
          .where(whereClause);

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            usesLeft: redemptionCodes.usesLeft,
            status: redemptionCodes.status,
            usedAt: redemptionCodes.usedAt,
            createdAt: redemptionCodes.createdAt,
            batchId: redemptionCodes.batchId,
            batchName: redemptionBatches.name,
            creatorId: redemptionBatches.creatorId,
          })
          .from(redemptionCodes)
          .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(whereClause)
          .orderBy(desc(redemptionCodes.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              usedAt: r.usedAt?.toISOString() ?? null,
              createdAt: r.createdAt.toISOString(),
            })),
            total,
            page,
            pageSize,
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

  // ════════════════════════════════════════════════
  //  GET /api/redemption/codes/:id — 查看单个兑换码
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/codes/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const codeId = parseInt(id, 10);

        if (isNaN(codeId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const [code] = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            amount: redemptionCodes.amount,
            usesLeft: redemptionCodes.usesLeft,
            status: redemptionCodes.status,
            usedAt: redemptionCodes.usedAt,
            createdAt: redemptionCodes.createdAt,
            batchId: redemptionCodes.batchId,
            batchName: redemptionBatches.name,
            batchStatus: redemptionBatches.status,
            creatorId: redemptionBatches.creatorId,
          })
          .from(redemptionCodes)
          .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(eq(redemptionCodes.id, codeId))
          .limit(1);

        if (!code) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        reply.status(200).send({
          code: 0,
          data: {
            ...code,
            usedAt: code.usedAt?.toISOString() ?? null,
            createdAt: code.createdAt.toISOString(),
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

  // ════════════════════════════════════════════════
  //  POST /api/redemption/redeem — 用户兑换
  //  输入码 → 校验 → 余额到账 → 记录日志
  //  Redis 限流：5次/分钟/IP
  //  幂等保护：X-Idempotency-Key（自动生成或客户端指定）
  // ════════════════════════════════════════════════
  app.post("/api/v1/redemption/redeem", {
    preHandler: [idempotentGuard, authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const body = request.body as { code?: string };
        if (!body?.code) {
          reply.status(400).send({ code: 400, data: null, message: "请提供兑换码" });
          return;
        }

        const inputCode = String(body.code).trim().toUpperCase();
        const ip = request.ip;

        // ── Redis 限流（5次/分钟/IP）──
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

        // ── 风控检查 ──
        const { checkRedeemFraud, recordBruteForce, recordUserFrequency } = await import("../services/redemption-fraud.js");
        const fraudResult = await checkRedeemFraud({ ip, userId, code: inputCode, codeRecord: null });
        if (fraudResult.blocked) {
          reply.status(403).send({ code: 403, data: null, message: `操作被风控拦截：${fraudResult.reason || "IP已被限制"}` });
          return;
        }

        // ── 查询兑换码 ──
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
          reply.status(400).send({ code: 400, data: null, message: "兑换码不存在" });
          return;
        }

        // ── 校验状态 ──
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

        // ── 校验批次状态 ──
        if (codeRecord.batchStatus !== "active") {
          reply.status(400).send({ code: 400, data: null, message: "该兑换码所属批次已不可用" });
          return;
        }

        // ── 校验过期 ──
        if (codeRecord.batchExpiresAt && new Date() > new Date(codeRecord.batchExpiresAt)) {
          reply.status(400).send({ code: 400, data: null, message: "该兑换码已过期" });
          return;
        }

        // ── 校验批次额度（最多使用次数）──
        if (codeRecord.batchMaxUses && codeRecord.batchUsedCount >= codeRecord.batchMaxUses) {
          reply.status(400).send({ code: 400, data: null, message: "该批次兑换码已用完" });
          return;
        }

        // ── 校验同一用户同一兑换码不可重复兑换 ──
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
          reply.status(400).send({ code: 400, data: null, message: "您已兑换过此码，不可重复兑换" });
          return;
        }

        // ── 记录兑换频率 & 码使用 IP ──
        const { recordCodeLeak } = await import("../services/redemption-fraud.js");
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

        // 通知批次创建者（不通知自己）
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

  // ════════════════════════════════════════════════
  //  GET /api/redemption/logs — 用户兑换记录
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/logs", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
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

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionLogs)
          .where(eq(redemptionLogs.userId, userId));

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionLogs.id,
            amount: redemptionLogs.amount,
            createdAt: redemptionLogs.createdAt,
            codeId: redemptionLogs.codeId,
            code: redemptionCodes.code,
            batchId: redemptionLogs.batchId,
            batchName: redemptionBatches.name,
          })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(eq(redemptionLogs.userId, userId))
          .orderBy(desc(redemptionLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
            total,
            page,
            pageSize,
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

  // ════════════════════════════════════════════════
  //  DELETE /api/redemption/codes/:id — 作废兑换码
  //  管理员或创建者可操作
  // ════════════════════════════════════════════════
  app.delete("/api/v1/redemption/codes/:id", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const codeId = parseInt(id, 10);

        if (isNaN(codeId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        // 查询兑换码及其批次
        const [codeRecord] = await db
          .select({
            id: redemptionCodes.id,
            code: redemptionCodes.code,
            status: redemptionCodes.status,
            batchId: redemptionCodes.batchId,
            creatorId: redemptionBatches.creatorId,
            amount: redemptionCodes.amount,
            usesLeft: redemptionCodes.usesLeft,
          })
          .from(redemptionCodes)
          .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
          .where(eq(redemptionCodes.id, codeId))
          .limit(1);

        if (!codeRecord) {
          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
          return;
        }

        // 权限检查：管理员或创建者
        if (!isAdmin && codeRecord.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "无操作权限" });
          return;
        }

        if (codeRecord.status !== "unused") {
          reply.status(400).send({ code: 400, data: null, message: "只能作废未使用的兑换码" });
          return;
        }

        // 作废兑换码 — 代理商创建的需退还 locked 金额
        await db.transaction(async (tx) => {
          await tx
            .update(redemptionCodes)
            .set({ status: "revoked" })
            .where(eq(redemptionCodes.id, codeId));

          // 代理商创建的：退还 redemptionLocked -> settledCommission
          const [creator] = await tx
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, codeRecord.creatorId))
            .limit(1);

          if (creator?.role === "agent") {
            await tx
              .update(agents)
              .set({
                settledCommission: sql`${agents.settledCommission} + ${codeRecord.amount}`,
                redemptionLocked: sql`GREATEST(0, ${agents.redemptionLocked} - ${codeRecord.amount})`,
              })
              .where(eq(agents.userId, codeRecord.creatorId));

            // 查实际余额写入 balance_logs
            const [updated] = await tx
              .select({ settledCommission: agents.settledCommission })
              .from(agents)
              .where(eq(agents.userId, codeRecord.creatorId))
              .limit(1);

            await tx.insert(balanceLogs).values({
              userId: codeRecord.creatorId,
              amount: `+${codeRecord.amount}`,
              balanceAfter: updated?.settledCommission ?? codeRecord.amount,
              type: "redemption_refund",
              refType: "redemption_code",
              refId: codeId,
              description: `兑换码 ${codeId} 作废，退还锁定金额 ${codeRecord.amount} 元`,
            });
          }
        });

        reply.status(200).send({
          code: 0,
          data: null,
          message: "兑换码已作废",
        });

        // 通知创建者
        notifyCodeRevoked({
          codeId: codeRecord.id,
          code: codeRecord.code,
          batchId: codeRecord.batchId,
          revokedBy: userId,
        }).catch((err) => {
          request.log.error({ err }, "[Notif] 作废通知发送失败");
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
  //  GET /api/redemption/agent-wallet — 代理商钱包余额
  //  返回 settledCommission / redemptionLocked / frozenAmount / pendingWithdraw
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/agent-wallet", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;

        if (userRole !== "agent") {
          reply.status(403).send({ code: 403, data: null, message: "仅代理商可查看" });
          return;
        }

        const [agent] = await db
          .select({
            settledCommission: agents.settledCommission,
            pendingWithdraw: agents.pendingWithdraw,
            frozenAmount: agents.frozenAmount,
            redemptionLocked: agents.redemptionLocked,
          })
          .from(agents)
          .where(eq(agents.userId, userId))
          .limit(1);

        if (!agent) {
          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });
          return;
        }

        const settled = parseFloat(agent.settledCommission as string ?? "0");
        const pending = parseFloat(agent.pendingWithdraw as string ?? "0");
        const frozen = parseFloat(agent.frozenAmount as string ?? "0");
        const locked = parseFloat(agent.redemptionLocked as string ?? "0");
        const available = settled - pending - frozen - locked;

        reply.status(200).send({
          code: 0,
          data: {
            settledCommission: settled.toFixed(6),
            pendingWithdraw: pending.toFixed(6),
            frozenAmount: frozen.toFixed(6),
            redemptionLocked: locked.toFixed(6),
            available: Math.max(0, available).toFixed(6),
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

  // ════════════════════════════════════════════════
  //  GET /api/redemption/stats — 兑换统计
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/stats", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        let stats;

        if (isAdmin) {
          // 管理员：全量统计
          const [batchStats] = await db
            .select({
              totalBatches: sql<number>`count(*)::int`,
              activeBatches: sql<number>`count(*) filter (where ${redemptionBatches.status} = 'active')::int`,
              totalCodes: sql<number>`coalesce(sum(${redemptionBatches.totalCount}), 0)::int`,
              usedCodes: sql<number>`coalesce(sum(${redemptionBatches.usedCount}), 0)::int`,
            })
            .from(redemptionBatches);

          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
              totalUsers: sql<number>`count(distinct ${redemptionLogs.userId})::int`,
            })
            .from(redemptionLogs);

          stats = {
            ...batchStats,
            ...redeemStats,
          };
        } else if (userRole === "agent") {
          // 代理商：自己的统计
          const [batchStats] = await db
            .select({
              totalBatches: sql<number>`count(*)::int`,
              activeBatches: sql<number>`count(*) filter (where ${redemptionBatches.status} = 'active')::int`,
              totalCodes: sql<number>`coalesce(sum(${redemptionBatches.totalCount}), 0)::int`,
              usedCodes: sql<number>`coalesce(sum(${redemptionBatches.usedCount}), 0)::int`,
            })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));

          // 代理商发起的兑换统计
          const agentBatches = db
            .select({ id: redemptionBatches.id })
            .from(redemptionBatches)
            .where(eq(redemptionBatches.creatorId, userId));

          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
              totalUsers: sql<number>`count(distinct ${redemptionLogs.userId})::int`,
            })
            .from(redemptionLogs)
            .where(eq(redemptionLogs.batchId, sql`ANY(${agentBatches})`));

          stats = {
            ...batchStats,
            ...redeemStats,
          };
        } else {
          // 普通用户：自己的领取统计
          const [redeemStats] = await db
            .select({
              totalRedeemed: sql<number>`count(*)::int`,
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
            })
            .from(redemptionLogs)
            .where(eq(redemptionLogs.userId, userId));

          stats = {
            totalRedeemed: redeemStats?.totalRedeemed ?? 0,
            totalAmount: redeemStats?.totalAmount ?? "0",
          };
        }

        reply.status(200).send({
          code: 0,
          data: stats,
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

  // ════════════════════════════════════════════════
  //  PATCH /api/redemption/batches/:id — 更新批次信息
  //  管理员或创建者可操作
  // ════════════════════════════════════════════════
  app.patch("/api/v1/redemption/batches/:id", {
    preHandler: [authenticateJWT, guardNotImpersonating],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const batchId = parseInt(id, 10);

        if (isNaN(batchId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        // 查询批次
        const [batch] = await db
          .select()
          .from(redemptionBatches)
          .where(eq(redemptionBatches.id, batchId))
          .limit(1);

        if (!batch) {
          reply.status(404).send({ code: 404, data: null, message: "批次不存在" });
          return;
        }

        // 权限检查：管理员或创建者
        if (!isAdmin && batch.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "无操作权限" });
          return;
        }

        const body = request.body as {
          name?: string;
          status?: "active" | "disabled";
          expiresAt?: string;
          note?: string;
          maxUses?: number;
        };

        const updateData: Record<string, any> = {};

        if (body.name !== undefined) {
          updateData.name = String(body.name).trim();
        }
        if (body.status !== undefined) {
          if (!["active", "disabled"].includes(body.status)) {
            reply.status(400).send({ code: 400, data: null, message: "status 仅支持 active/disabled" });
            return;
          }
          updateData.status = body.status;
        }
        if (body.expiresAt !== undefined) {
          updateData.expiresAt = new Date(body.expiresAt);
        }
        if (body.note !== undefined) {
          updateData.note = body.note;
        }
        if (body.maxUses !== undefined) {
          updateData.maxUses = parseInt(String(body.maxUses), 10);
        }

        // 如果没有要更新的字段
        if (Object.keys(updateData).length === 0) {
          reply.status(400).send({ code: 400, data: null, message: "没有提供要更新的字段" });
          return;
        }

        // 设置更新时间
        updateData.updatedAt = new Date();

        // 执行更新
        await db
          .update(redemptionBatches)
          .set(updateData)
          .where(eq(redemptionBatches.id, batchId));

        // 如果状态改为 active：恢复该批次下所有 unused 状态的码
        if (body.status === "active") {
          await db
            .update(redemptionCodes)
            .set({ status: "unused" })
            .where(
              and(
                eq(redemptionCodes.batchId, batchId),
                eq(redemptionCodes.status, "unused")
              )
            );
        }

        reply.status(200).send({
          code: 0,
          data: {
            id: batchId,
            name: updateData.name ?? batch.name,
            status: updateData.status ?? batch.status,
            updatedAt: updateData.updatedAt.toISOString(),
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

  // ════════════════════════════════════════════════
  //  GET /api/redemption/admin-logs — 管理员全量兑换流水
  //  仅管理员可访问
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/admin-logs", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const userRole = request.user!.role;

        if (!isAdminRole(userRole)) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员可查看全量兑换流水" });
          return;
        }

        const query = request.query as {
          page?: string;
          pageSize?: string;
          email?: string;
          batchId?: string;
          startDate?: string;
          endDate?: string;
          code?: string;
          amountMin?: string;
          amountMax?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [];

        if (query.email) {
          conditions.push(eq(users.email, query.email));
        }
        if (query.batchId) {
          conditions.push(eq(redemptionLogs.batchId, parseInt(query.batchId, 10)));
        }
        if (query.startDate) {
          conditions.push(gte(redemptionLogs.createdAt, new Date(query.startDate)));
        }
        if (query.endDate) {
          conditions.push(lte(redemptionLogs.createdAt, new Date(query.endDate)));
        }
        if (query.code) {
          conditions.push(ilike(redemptionCodes.code, `%${query.code.toUpperCase()}%`));
        }
        if (query.amountMin) {
          conditions.push(gte(redemptionLogs.amount, query.amountMin));
        }
        if (query.amountMax) {
          conditions.push(lte(redemptionLogs.amount, query.amountMax));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(users, eq(redemptionLogs.userId, users.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(whereClause);

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: redemptionLogs.id,
            code: redemptionCodes.code,
            amount: redemptionLogs.amount,
            userId: redemptionLogs.userId,
            email: users.email,
            nickname: users.nickname,
            ip: redemptionLogs.ip,
            batchId: redemptionLogs.batchId,
            batchName: redemptionBatches.name,
            createdAt: redemptionLogs.createdAt,
          })
          .from(redemptionLogs)
          .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
          .leftJoin(users, eq(redemptionLogs.userId, users.id))
          .leftJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
          .where(whereClause)
          .orderBy(desc(redemptionLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              id: r.id,
              code: r.code ?? null,
              amount: r.amount,
              userId: r.userId,
              email: r.email ?? null,
              nickname: r.nickname ?? null,
              ip: r.ip ?? null,
              batchId: r.batchId ?? null,
              batchName: r.batchName ?? null,
              createdAt: r.createdAt.toISOString(),
            })),
            total,
            page,
            pageSize,
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

  // ════════════════════════════════════════════════
  //  GET /api/redemption/batches/:id — 批次详情（含统计）
  //  管理员或创建者可查看
  // ════════════════════════════════════════════════
  app.get("/api/v1/redemption/batches/:id", {
    preHandler: [authenticateJWT, guardNotImpersonatingWrite],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const batchId = parseInt(id, 10);

        if (isNaN(batchId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const userId = request.user!.userId;
        const userRole = request.user!.role;
        const isAdmin = isAdminRole(userRole);

        // 查询批次
        const [batch] = await db
          .select()
          .from(redemptionBatches)
          .where(eq(redemptionBatches.id, batchId))
          .limit(1);

        if (!batch) {
          reply.status(404).send({ code: 404, data: null, message: "批次不存在" });
          return;
        }

        // 权限检查：管理员或创建者
        if (!isAdmin && batch.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "无操作权限" });
          return;
        }

        // 统计该批次下各状态码的数量
        const [codeStats] = await db
          .select({
            unused: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'unused')::int`,
            used: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'used')::int`,
            expired: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'expired')::int`,
            revoked: sql<number>`count(*) filter (where ${redemptionCodes.status} = 'revoked')::int`,
          })
          .from(redemptionCodes)
          .where(eq(redemptionCodes.batchId, batchId));

        reply.status(200).send({
          code: 0,
          data: {
            id: batch.id,
            name: batch.name,
            amount: batch.amount,
            totalCount: batch.totalCount,
            usedCount: batch.usedCount,
            maxUses: batch.maxUses,
            status: batch.status,
            expiresAt: batch.expiresAt?.toISOString() ?? null,
            note: batch.note,
            creatorId: batch.creatorId,
            createdAt: batch.createdAt.toISOString(),
            codeStats: {
              unused: codeStats?.unused ?? 0,
              used: codeStats?.used ?? 0,
              expired: codeStats?.expired ?? 0,
              revoked: codeStats?.revoked ?? 0,
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
