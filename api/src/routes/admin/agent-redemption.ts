// ============================================================
//  3cloud (3C) — Admin 代理钻取管理（兑换码系统）
//
//  GET  /api/v1/admin/redemption/agent-overview            — 代理兑换码总览
//  GET  /api/v1/admin/redemption/agent/:agentId/detail     — 单代理钻取
//  POST /api/v1/admin/redemption/codes/:id/force-action    — 强制操作（停用/延期/作废）
//  GET  /api/v1/admin/redemption/agent/:agentId/behavior   — 代理生成行为分析
//  GET  /api/v1/admin/redemption/codes/:id/full-trace      — 全链路追溯
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  balanceLogs,
  rechargeOrders,
  auditLogs,
} from "../../db/schema.js";
import { authenticateJWT, requireRole, requirePerm, Perm } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service/index.js";

// ── 辅助：兑换码脱敏（显示前4后4，中间*）──
function maskCode(code: string): string {
  if (code.length <= 8) return code.substring(0, 2) + "****" + code.slice(-2);
  return code.substring(0, 4) + "****" + code.slice(-4);
}

// ── 辅助：风险等级判定（基于使用率 + 其他指标）──
function calcRiskLevel(totalIssued: number, totalUsed: number, batchCount: number, anomalyCount: number): string {
  if (totalIssued === 0) return "normal";
  const usageRate = totalIssued > 0 ? (totalUsed / totalIssued) * 100 : 0;
  if (usageRate < 10 && batchCount >= 3) return "restricted";
  if (anomalyCount >= 3) return "restricted";
  if (usageRate < 30 || anomalyCount >= 1) return "watch";
  return "normal";
}

export async function adminAgentRedemptionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════════
  //  A. GET /api/v1/admin/redemption/agent-overview
  //  代理兑换码总览 — 返回所有代理的兑换码统计汇总
  //  筛选：riskLevel, usageRateMin, usageRateMax
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/agent-overview", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        riskLevel?: string;
        usageRateMin?: string;
        usageRateMax?: string;
      };

      // ── 1. 查出所有代理商 ──
      const allAgents = await db
        .select({
          agentId: agents.id,
          userId: agents.userId,
          agentEmail: users.email,
          agentName: users.nickname,
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id));

      if (allAgents.length === 0) {
        reply.status(200).send({ code: 0, data: [], message: "ok" });
        return;
      }

      // ── 2. 【优化】一次性查询所有代理的批次汇总（消除 N+1）──
      // 批量查询：按 creator_id 分组聚合
      const userIds = allAgents.map(a => a.userId);
      const batchAggregates = await db
        .select({
          creatorId: redemptionBatches.creatorId,
          batchCount: sql<number>`count(*)::int`,
          totalIssued: sql<number>`coalesce(sum(${redemptionBatches.totalCount}), 0)::int`,
          totalUsed: sql<number>`coalesce(sum(${redemptionBatches.usedCount}), 0)::int`,
        })
        .from(redemptionBatches)
        .where(sql`${redemptionBatches.creatorId} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}::int`), sql`, `)}])`)
        .groupBy(redemptionBatches.creatorId);

      const agentBatchMap = new Map<number, {
        batchCount: number;
        totalIssued: number;
        totalUsed: number;
      }>();
      // 初始化所有代理为 0
      for (const agent of allAgents) {
        agentBatchMap.set(agent.agentId, { batchCount: 0, totalIssued: 0, totalUsed: 0 });
      }
      // 填充有批次的代理数据
      for (const agg of batchAggregates) {
        const agent = allAgents.find(a => a.userId === agg.creatorId);
        if (agent) {
          agentBatchMap.set(agent.agentId, {
            batchCount: agg.batchCount,
            totalIssued: agg.totalIssued,
            totalUsed: agg.totalUsed,
          });
        }
      }

      // ── 3. 【优化】一次性查询所有代理的充值带动金额（消除 N+1）──
      // 通过 redemption_logs -> redemption_batches 关联，按批次创建者聚合
      const revenueAggregates = await db
        .select({
          creatorId: redemptionBatches.creatorId,
          totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
        })
        .from(redemptionLogs)
        .innerJoin(redemptionBatches, eq(redemptionLogs.batchId, redemptionBatches.id))
        .where(sql`${redemptionBatches.creatorId} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}::int`), sql`, `)}])`)
        .groupBy(redemptionBatches.creatorId);

      const revenueMap = new Map<number, number>();
      for (const agent of allAgents) {
        revenueMap.set(agent.agentId, 0);
      }
      for (const rev of revenueAggregates) {
        const agent = allAgents.find(a => a.userId === rev.creatorId);
        if (agent) {
          // 带动充值按兑换金额 × 1.5 估算（用户获得免费额度后，额外充值）
          const redeemAmount = parseFloat(rev.totalAmount);
          revenueMap.set(agent.agentId, Math.round(redeemAmount * 150));
        }
      }

      // ── 4. 【优化】一次性查询所有批次数据，在内存中计算异常（消除 N+1）──
      // 拉取所有批次，按 creator_id 分组后在内存计算异常
      const allBatches = await db
        .select({
          creatorId: redemptionBatches.creatorId,
          totalCount: redemptionBatches.totalCount,
          usedCount: redemptionBatches.usedCount,
          createdAt: redemptionBatches.createdAt,
        })
        .from(redemptionBatches)
        .where(sql`${redemptionBatches.creatorId} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}::int`), sql`, `)}])`)
        .orderBy(redemptionBatches.creatorId, redemptionBatches.createdAt);

      // 按 creatorId 分组
      const batchesByCreator = new Map<number, typeof allBatches>();
      for (const batch of allBatches) {
        const list = batchesByCreator.get(batch.creatorId) ?? [];
        list.push(batch);
        batchesByCreator.set(batch.creatorId, list);
      }

      const anomalyMap = new Map<number, number>();
      for (const agent of allAgents) {
        const batches = batchesByCreator.get(agent.userId) ?? [];
        let anomalyCount = 0;
        for (let i = 1; i < batches.length; i++) {
          const prev = batches[i - 1];
          const curr = batches[i];
          // 日生成量环比≥300%
          if (prev.totalCount > 0 && curr.totalCount / prev.totalCount >= 3) {
            anomalyCount++;
          }
          // 批次使用率<10%
          const usageRate = curr.totalCount > 0 ? (curr.usedCount / curr.totalCount) * 100 : 0;
          if (usageRate < 10) {
            anomalyCount++;
          }
        }
        anomalyMap.set(agent.agentId, anomalyCount);
      }

      // ── 5. 组装结果 ──
      let result = allAgents.map((agent) => {
        const batchInfo = agentBatchMap.get(agent.agentId) ?? { batchCount: 0, totalIssued: 0, totalUsed: 0 };
        const totalIssued = batchInfo.totalIssued;
        const totalUsed = batchInfo.totalUsed;
        const frozenToken = totalIssued - totalUsed;
        const usageRate = totalIssued > 0 ? parseFloat(((totalUsed / totalIssued) * 100).toFixed(1)) : 0;
        const revenueDriven = revenueMap.get(agent.agentId) ?? 0;
        const anomalyCount = anomalyMap.get(agent.agentId) ?? 0;
        const riskLevel = calcRiskLevel(totalIssued, totalUsed, batchInfo.batchCount, anomalyCount);

        return {
          agentId: agent.agentId,
          agentName: agent.agentName ?? "",
          agentEmail: agent.agentEmail ?? "",
          totalIssued,
          totalUsed,
          frozenToken,
          usageRate,
          revenueDriven,
          riskLevel,
        };
      });

      // ── 筛选 ──
      if (query.riskLevel) {
        result = result.filter((r) => r.riskLevel === query.riskLevel);
      }
      if (query.usageRateMin) {
        const min = parseFloat(query.usageRateMin);
        result = result.filter((r) => r.usageRate >= min);
      }
      if (query.usageRateMax) {
        const max = parseFloat(query.usageRateMax);
        result = result.filter((r) => r.usageRate <= max);
      }

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
  });

  // ════════════════════════════════════════════════════════════════
  //  B. GET /api/v1/admin/redemption/agent/:agentId/detail
  //  单代理钻取 — 返回该代理的兑换码明细列表（分页）
  //  筛选：status, batchId
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/agent/:agentId/detail", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      // 校验代理商存在
      const [agent] = await db
        .select({ userId: agents.userId })
        .from(agents)
        .where(eq(agents.id, id))
        .limit(1);

      if (!agent) {
        reply.status(404).send({ code: 404, data: null, message: "代理商不存在" });
        return;
      }

      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
        batchId?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      // 查出该代理创建的批次 ID
      const agentBatches = db
        .select({ id: redemptionBatches.id })
        .from(redemptionBatches)
        .where(eq(redemptionBatches.creatorId, agent.userId));

      const conditions: any[] = [
        eq(redemptionCodes.batchId, sql`ANY(${agentBatches})`),
      ];

      if (query.status) {
        conditions.push(eq(redemptionCodes.status, query.status as any));
      }
      if (query.batchId) {
        conditions.push(eq(redemptionCodes.batchId, parseInt(query.batchId, 10)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 总数
      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(redemptionCodes)
        .where(whereClause);

      const total = totalResult?.total ?? 0;

      // 查询明细
      const rows = await db
        .select({
          id: redemptionCodes.id,
          code: redemptionCodes.code,
          amount: redemptionCodes.amount,
          status: redemptionCodes.status,
          usesLeft: redemptionCodes.usesLeft,
          usedAt: redemptionCodes.usedAt,
          createdAt: redemptionCodes.createdAt,
          batchId: redemptionCodes.batchId,
          batchName: redemptionBatches.name,
          // 使用人信息
          usedByUserId: redemptionLogs.userId,
          usedByEmail: users.email,
          usedByNickname: users.nickname,
        })
        .from(redemptionCodes)
        .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .leftJoin(redemptionLogs, eq(redemptionCodes.id, redemptionLogs.codeId))
        .leftJoin(users, eq(redemptionLogs.userId, users.id))
        .where(whereClause)
        .orderBy(desc(redemptionCodes.createdAt))
        .limit(pageSize)
        .offset(offset);

      const list = rows.map((r) => ({
        id: r.id,
        code: maskCode(r.code),
        amount: r.amount,
        status: r.status,
        usesLeft: r.usesLeft,
        usedAt: r.usedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        batchId: r.batchId,
        batchName: r.batchName ?? "",
        usedBy: r.usedByUserId
          ? { userId: r.usedByUserId, email: r.usedByEmail, nickname: r.usedByNickname }
          : null,
      }));

      reply.status(200).send({
        code: 0,
        data: { list, total, page, pageSize },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  C. POST /api/v1/admin/redemption/codes/:id/force-action
  //  Admin 强制操作：disable | extend | revoke
  //  需二次确认（查出操作人手机/邮箱），实际发送为 TODO
  //  操作记录 audit_logs
  // ════════════════════════════════════════════════════════════════
  app.post("/api/v1/admin/redemption/codes/:id/force-action", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const codeId = parseInt(id, 10);

      if (isNaN(codeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的兑换码 ID" });
        return;
      }

      const body = request.body as {
        forceType: "disable" | "extend" | "revoke";
        reason?: string;
        expiresAt?: string;  // extend 时必填，新过期时间
        confirmSms?: boolean; // 用户端二次确认标识
      };

      if (!body.forceType || !["disable", "extend", "revoke"].includes(body.forceType)) {
        reply.status(400).send({
          code: 400,
          data: null,
          message: "forceType 必须为 disable/extend/revoke",
        });
        return;
      }

      if (body.forceType === "extend" && !body.expiresAt) {
        reply.status(400).send({
          code: 400,
          data: null,
          message: "延期操作需要提供 expiresAt",
        });
        return;
      }

      // 查询兑换码
      const [codeRecord] = await db
        .select({
          id: redemptionCodes.id,
          code: redemptionCodes.code,
          status: redemptionCodes.status,
          batchId: redemptionCodes.batchId,
          batchName: redemptionBatches.name,
          batchCreatorId: redemptionBatches.creatorId,
        })
        .from(redemptionCodes)
        .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .where(eq(redemptionCodes.id, codeId))
        .limit(1);

      if (!codeRecord) {
        reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
        return;
      }

      // ── 二次确认（第一次请求返回确认信息；第二次携带 confirmSms=true 才执行）──
      const operatorId = request.user!.userId;

      // 查操作人信息
      const [operator] = await db
        .select({ email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, operatorId))
        .limit(1);

      if (!body.confirmSms) {
        // 第一次请求：返回确认提示
        reply.status(200).send({
          code: 0,
          data: {
            requireConfirm: true,
            operatorEmail: operator?.email ?? "",
            operatorPhone: operator?.phone ?? "",
            targetCode: maskCode(codeRecord.code),
            forceType: body.forceType,
            batchName: codeRecord.batchName,
            message: "请在请求体中添加 confirmSms: true 以确认操作",
            // TODO: 实际发送短信/邮件通知
          },
          message: "操作需二次确认",
        });
        return;
      }

      // ── 第二次请求：执行实际操作 ──
      const reason = body.reason ?? "管理员强制操作";

      if (body.forceType === "disable") {
        await db
          .update(redemptionCodes)
          .set({ status: "disabled" as any })
          .where(eq(redemptionCodes.id, codeId));
      } else if (body.forceType === "extend") {
        // 更新 batch 的 expires_at
        const newExpires = new Date(body.expiresAt!);
        await db
          .update(redemptionBatches)
          .set({ expiresAt: newExpires, updatedAt: new Date() })
          .where(eq(redemptionBatches.id, codeRecord.batchId));
      } else if (body.forceType === "revoke") {
        await db
          .update(redemptionCodes)
          .set({ status: "revoked" })
          .where(eq(redemptionCodes.id, codeId));
      }

      // ── 写入 audit_logs ──
      try {
        await db.insert(auditLogs).values({
          operatorId,
          action: "config_update",
          targetType: "redemption_code",
          targetId: codeId,
          after: { forceType: body.forceType, reason, code: maskCode(codeRecord.code) },
          ip: request.ip,
          description: `兑换码 #${codeId} force-action: ${body.forceType}, 原因: ${reason}`,
        });
      } catch {
        // audit_logs 表的 action enum 可能没有 code_force_action，使用通用方式记录
        request.log.warn({
          operatorId,
          action: "code_force_action",
          targetType: "redemption_code",
          targetId: codeId,
          detail: { forceType: body.forceType, reason, operatorEmail: operator?.email },
        }, "TODO: 写入 audit_logs 表失败");
      }

      // TODO: 发送短信/邮件通知操作人确认结果
      // this.sendSms(operator?.phone, `兑换码 ${maskCode(code.code)} 已${body.forceType === 'disable' ? '停用' : body.forceType === 'extend' ? '延期' : '作废'}`);
      // this.sendEmail(operator?.email, ...);

      reply.status(200).send({
        code: 0,
        data: {
          codeId,
          forceType: body.forceType,
          oldStatus: codeRecord.status,
          newStatus: body.forceType === "extend" ? "延期中" : body.forceType,
        },
        message: `兑换码已${body.forceType === "disable" ? "停用" : body.forceType === "extend" ? "延期" : "作废"}`,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  D. GET /api/v1/admin/redemption/agent/:agentId/behavior
  //  代理生成行为分析 — 批次趋势 + 异常标记
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/agent/:agentId/behavior", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { agentId } = request.params as { agentId: string };
      const id = parseInt(agentId, 10);

      if (isNaN(id)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      // 校验代理商存在并获取其 userId
      const [agent] = await db
        .select({ userId: agents.userId })
        .from(agents)
        .where(eq(agents.id, id))
        .limit(1);

      if (!agent) {
        reply.status(404).send({ code: 404, data: null, message: "代理商不存在" });
        return;
      }

      // 查出该代理的所有批次，按创建时间排序
      const batches = await db
        .select({
          id: redemptionBatches.id,
          name: redemptionBatches.name,
          amount: redemptionBatches.amount,
          totalCount: redemptionBatches.totalCount,
          usedCount: redemptionBatches.usedCount,
          createdAt: redemptionBatches.createdAt,
          status: redemptionBatches.status,
        })
        .from(redemptionBatches)
        .where(eq(redemptionBatches.creatorId, agent.userId))
        .orderBy(redemptionBatches.createdAt);

      // 按天聚合批次趋势
      const dailyMap = new Map<string, {
        totalAmount: number;
        totalCount: number;
        totalUsed: number;
      }>();

      for (const batch of batches) {
        const dateKey = batch.createdAt.toISOString().substring(0, 10);
        const existing = dailyMap.get(dateKey) ?? { totalAmount: 0, totalCount: 0, totalUsed: 0 };
        existing.totalAmount += parseFloat(batch.amount as string) * batch.totalCount;
        existing.totalCount += batch.totalCount;
        existing.totalUsed += batch.usedCount;
        dailyMap.set(dateKey, existing);
      }

      // 构建趋势数组
      const dailyKeys = Array.from(dailyMap.keys()).sort();
      const batchTrends = dailyKeys.map((date, idx) => {
        const data = dailyMap.get(date)!;
        const usageRate = data.totalCount > 0
          ? parseFloat(((data.totalUsed / data.totalCount) * 100).toFixed(1))
          : 0;

        // 异常标记
        const anomalies: string[] = [];
        if (idx > 0) {
          const prev = dailyMap.get(dailyKeys[idx - 1])!;
          if (prev.totalCount > 0 && data.totalCount / prev.totalCount >= 3) {
            anomalies.push("日生成量环比≥300%");
          }
        }
        if (usageRate < 10) {
          anomalies.push("使用率<10%");
        }

        return {
          date,
          totalAmount: data.totalAmount,
          totalCount: data.totalCount,
          totalUsed: data.totalUsed,
          usageRate,
          anomalies: anomalies.length > 0 ? anomalies : undefined,
        };
      });

      reply.status(200).send({
        code: 0,
        data: {
          agentId: id,
          batches: batchTrends,
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
  });

  // ════════════════════════════════════════════════════════════════
  //  E. GET /api/v1/admin/redemption/codes/:id/full-trace
  //  兑换码全链路追溯
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/codes/:id/full-trace", {
    preHandler: [requirePerm(Perm.AGENT_LIST)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const codeId = parseInt(id, 10);

      if (isNaN(codeId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的兑换码 ID" });
        return;
      }

      // ── 1. 兑换码基本信息 ──
      const [codeInfo] = await db
        .select({
          id: redemptionCodes.id,
          code: redemptionCodes.code,
          amount: redemptionCodes.amount,
          status: redemptionCodes.status,
          usesLeft: redemptionCodes.usesLeft,
          usedAt: redemptionCodes.usedAt,
          createdAt: redemptionCodes.createdAt,
          batchId: redemptionCodes.batchId,
          batchName: redemptionBatches.name,
          batchStatus: redemptionBatches.status,
          batchExpiresAt: redemptionBatches.expiresAt,
          batchNote: redemptionBatches.note,
          // 生成者
          creatorId: redemptionBatches.creatorId,
          creatorEmail: users.email,
          creatorNickname: users.nickname,
        })
        .from(redemptionCodes)
        .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .leftJoin(users, eq(redemptionBatches.creatorId, users.id))
        .where(eq(redemptionCodes.id, codeId))
        .limit(1);

      if (!codeInfo) {
        reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });
        return;
      }

      // ── 2. 兑换记录 ──
      const redeemRecords = await db
        .select({
          id: redemptionLogs.id,
          userId: redemptionLogs.userId,
          email: users.email,
          nickname: users.nickname,
          ip: redemptionLogs.ip,
          amount: redemptionLogs.amount,
          createdAt: redemptionLogs.createdAt,
          // 设备信息（所在表结构可能无 device 字段，通过关联查询）
          userAgent: sql<string>`NULL`,
        })
        .from(redemptionLogs)
        .leftJoin(users, eq(redemptionLogs.userId, users.id))
        .where(eq(redemptionLogs.codeId, codeId))
        .orderBy(redemptionLogs.createdAt);

      // ── 3. 【优化】兑换前后余额（批量查询消除 N+1）──
      // 先批量查询所有相关用户的余额日志
      const userIdsForBalance = [...new Set(redeemRecords.map(r => r.userId))];
      const allBalanceLogs = await db
        .select({
          userId: balanceLogs.userId,
          refId: balanceLogs.refId,
          balanceAfter: balanceLogs.balanceAfter,
        })
        .from(balanceLogs)
        .where(
          and(
            sql`${balanceLogs.userId} = ANY(ARRAY[${sql.join(userIdsForBalance.map(id => sql`${id}::int`), sql`, `)}])`,
            eq(balanceLogs.refType, "redemption_code"),
            eq(balanceLogs.refId, sql`${codeId}::int`)
          )
        );

      // 构建 userId -> balanceAfter 映射
      const balanceMap = new Map<number, string>();
      for (const bl of allBalanceLogs) {
        balanceMap.set(bl.userId, bl.balanceAfter as string);
      }

      const redeemRecordsWithBalance = redeemRecords.map((rec) => {
        const afterBalance = balanceMap.has(rec.userId) ? parseFloat(balanceMap.get(rec.userId)!) : 0;
        const redeemAmount = parseFloat(rec.amount as string);
        const beforeBalance = afterBalance - redeemAmount;

        return {
          ...rec,
          amount: rec.amount,
          balanceBefore: beforeBalance.toFixed(6),
          balanceAfter: afterBalance.toFixed(6),
          createdAt: rec.createdAt.toISOString(),
        };
      });

      // ── 4. 用户后续行为（兑换后 7 天 / 30 天消费和充值金额）──
      let userPostBehavior: Record<string, any> = {};

      if (redeemRecords.length > 0) {
        const redeemUserId = redeemRecords[0].userId;
        const redeemTime = redeemRecords[0].createdAt;

        // 7天内的充值
        const [recharge7d] = await db
          .select({
            totalRecharge: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')`,
            count: sql<number>`count(*)::int`,
          })
          .from(rechargeOrders)
          .where(
            and(
              eq(rechargeOrders.userId, redeemUserId),
              eq(rechargeOrders.status, "paid"),
              gte(rechargeOrders.createdAt, sql`${redeemTime}::timestamp`),
              lte(rechargeOrders.createdAt, sql`${redeemTime}::timestamp + interval '7 days'`)
            )
          );

        // 30天内的充值
        const [recharge30d] = await db
          .select({
            totalRecharge: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')`,
            count: sql<number>`count(*)::int`,
          })
          .from(rechargeOrders)
          .where(
            and(
              eq(rechargeOrders.userId, redeemUserId),
              eq(rechargeOrders.status, "paid"),
              gte(rechargeOrders.createdAt, sql`${redeemTime}::timestamp`),
              lte(rechargeOrders.createdAt, sql`${redeemTime}::timestamp + interval '30 days'`)
            )
          );

        // 7天内的 API 消耗（通过 balance_logs 的 consumption 类型估算）
        const [consumption7d] = await db
          .select({
            totalConsumption: sql<string>`coalesce(sum(abs(${balanceLogs.amount})), '0')`,
            count: sql<number>`count(*)::int`,
          })
          .from(balanceLogs)
          .where(
            and(
              eq(balanceLogs.userId, redeemUserId),
              eq(balanceLogs.type, "consumption"),
              gte(balanceLogs.createdAt, sql`${redeemTime}::timestamp`),
              lte(balanceLogs.createdAt, sql`${redeemTime}::timestamp + interval '7 days'`)
            )
          );

        const [consumption30d] = await db
          .select({
            totalConsumption: sql<string>`coalesce(sum(abs(${balanceLogs.amount})), '0')`,
            count: sql<number>`count(*)::int`,
          })
          .from(balanceLogs)
          .where(
            and(
              eq(balanceLogs.userId, redeemUserId),
              eq(balanceLogs.type, "consumption"),
              gte(balanceLogs.createdAt, sql`${redeemTime}::timestamp`),
              lte(balanceLogs.createdAt, sql`${redeemTime}::timestamp + interval '30 days'`)
            )
          );

        userPostBehavior = {
          userId: redeemUserId,
          recharge7d: recharge7d?.totalRecharge ?? "0",
          recharge7dCount: recharge7d?.count ?? 0,
          recharge30d: recharge30d?.totalRecharge ?? "0",
          recharge30dCount: recharge30d?.count ?? 0,
          consumption7d: consumption7d?.totalConsumption ?? "0",
          consumption7dCount: consumption7d?.count ?? 0,
          consumption30d: consumption30d?.totalConsumption ?? "0",
          consumption30dCount: consumption30d?.count ?? 0,
        };
      }

      reply.status(200).send({
        code: 0,
        data: {
          basic: {
            id: codeInfo.id,
            code: codeInfo.code,
            amount: codeInfo.amount,
            status: codeInfo.status,
            usesLeft: codeInfo.usesLeft,
            usedAt: codeInfo.usedAt?.toISOString() ?? null,
            createdAt: codeInfo.createdAt.toISOString(),
            batch: {
              id: codeInfo.batchId,
              name: codeInfo.batchName,
              status: codeInfo.batchStatus,
              expiresAt: codeInfo.batchExpiresAt?.toISOString() ?? null,
              note: codeInfo.batchNote,
            },
            creator: {
              id: codeInfo.creatorId,
              email: codeInfo.creatorEmail,
              nickname: codeInfo.creatorNickname,
            },
          },
          redemption: redeemRecordsWithBalance.map((r) => ({
            userId: r.userId,
            email: r.email,
            nickname: r.nickname,
            ip: r.ip,
            amount: r.amount,
            balanceBefore: r.balanceBefore,
            balanceAfter: r.balanceAfter,
            createdAt: r.createdAt,
          })),
          userPostBehavior,
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
  });
}
