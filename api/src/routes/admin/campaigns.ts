// ============================================================
//  3cloud (3C) — 营销活动管理路由（管理员）
//  POST   /api/v1/admin/campaigns                      — 创建活动
//  GET    /api/v1/admin/campaigns                       — 活动列表（分页+状态筛选）
//  GET    /api/v1/admin/campaigns/:id                   — 活动详情（含各 agent 分配和进度）
//  PATCH  /api/v1/admin/campaigns/:id                   — 更新活动
//  PATCH  /api/v1/admin/campaigns/:id/status            — 变更状态
//  POST   /api/v1/admin/campaigns/:id/allocations       — 给代理商分配兑换码配额
//  GET    /api/v1/admin/campaigns/:id/allocations       — 查看各代理的分配和进度
//  GET    /api/v1/admin/campaigns/:id/codes             — 查看活动的兑换码批次列表
//  POST   /api/v1/admin/campaigns/:id/generate-codes    — 生成兑换码
//  POST   /api/v1/admin/campaigns/:id/commission-rule   — 配置佣金规则
//  GET    /api/v1/admin/campaigns/:id/stats             — 活动统计
//  GET    /api/v1/admin/campaigns/stats                 — 活动汇总统计（总数/进行中/已结束）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  campaigns,
  campaignCodes,
  redemptionBatches,
  redemptionCodes,
  commissionRules,
  commissionLogs,
  auditLogs,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm, guardNotImpersonating } from "../../middleware/auth.js";
import { AppError } from "../../services/auth-service.js";

// ── 工具：判断是否为管理员角色 ──

function isAdminRole(role: string): boolean {
  return ["super_admin", "admin"].includes(role);
}

// ── 工具：生成 16 位随机兑换码 ──

function generateRedemptionCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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

// ── 限制的 status 转换规则 ──

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:  ["active"],
  active: ["ended"],
  ended:  ["archived"],
  archived: [],
};

export async function adminCampaignRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/campaigns — 创建活动
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/campaigns", {
    preHandler: [requirePerm(Perm.USER_EDIT)], // 使用通用的编辑权限；管理员及以上有
  }, async (request, reply) => {
    try {
      const body = request.body as {
        name?: string;
        description?: string;
        start_at?: string;
        end_at?: string;
        budget_amount?: number;
      };

      if (!body.name) {
        reply.status(400).send({ code: 400, data: null, message: "活动名称必填" });
        return;
      }

      const db = getDb();
      const userId = request.user!.userId;

      const [campaign] = await db
        .insert(campaigns)
        .values({
          name: String(body.name).trim(),
          description: body.description ?? null,
          startAt: body.start_at ? new Date(body.start_at) : null,
          endAt: body.end_at ? new Date(body.end_at) : null,
          budgetAmount: body.budget_amount ?? 0,
          createdBy: userId,
        })
        .returning();

      reply.status(200).send({
        code: 0,
        data: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          startAt: campaign.startAt?.toISOString() ?? null,
          endAt: campaign.endAt?.toISOString() ?? null,
          budgetAmount: campaign.budgetAmount,
          createdBy: campaign.createdBy,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        },
        message: "营销活动创建成功",
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
  //  GET /api/v1/admin/campaigns — 活动列表（分页+status筛选）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const db = getDb();
      const conditions: any[] = [];

      if (query.status) {
        conditions.push(eq(campaigns.status, query.status as any));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(campaigns)
        .where(whereClause);

      const total = totalResult?.total ?? 0;

      const rows = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          description: campaigns.description,
          status: campaigns.status,
          startAt: campaigns.startAt,
          endAt: campaigns.endAt,
          budgetAmount: campaigns.budgetAmount,
          createdBy: campaigns.createdBy,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(whereClause)
        .orderBy(desc(campaigns.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status,
            startAt: r.startAt?.toISOString() ?? null,
            endAt: r.endAt?.toISOString() ?? null,
            budgetAmount: r.budgetAmount,
            createdBy: r.createdBy,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
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
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns/stats — 活动汇总统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/stats", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();

      const [overview] = await db
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${campaigns.status} = 'active')::int`,
          ended: sql<number>`count(*) filter (where ${campaigns.status} = 'ended')::int`,
          totalBudget: sql<string>`coalesce(sum(${campaigns.budgetAmount}), 0)::text`,
        })
        .from(campaigns);

      reply.status(200).send({
        code: 0,
        data: {
          total: Number(overview?.total ?? 0),
          active: Number(overview?.active ?? 0),
          ended: Number(overview?.ended ?? 0),
          totalBudget: overview?.totalBudget ?? "0",
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns/:id — 活动详情（含各 agent 分配和进度）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      // 查询各代理分配进度
      const allocations = await db
        .select({
          agentId: campaignCodes.agentId,
          allocatedCount: campaignCodes.allocatedCount,
          usedCount: campaignCodes.usedCount,
        })
        .from(campaignCodes)
        .where(eq(campaignCodes.campaignId, campaignId))
        .orderBy(desc(campaignCodes.allocatedCount));

      // 关联代理商名称
      const allocationsWithAgent = await Promise.all(
        allocations.map(async (a) => {
          if (a.agentId === null) {
            return { ...a, agentName: "平台自营" };
          }
          // 通过 userId 关联 users 表获取昵称/邮箱
          const [agentRow] = await db
            .select({
              agentId: agents.id,
              email: users.email,
              nickname: users.nickname,
            })
            .from(agents)
            .innerJoin(users, eq(agents.userId, users.id))
            .where(eq(agents.id, a.agentId!))
            .limit(1);
          return {
            ...a,
            agentName: agentRow?.nickname ?? agentRow?.email ?? `代理商 #${a.agentId}`,
          };
        })
      );

      reply.status(200).send({
        code: 0,
        data: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          startAt: campaign.startAt?.toISOString() ?? null,
          endAt: campaign.endAt?.toISOString() ?? null,
          budgetAmount: campaign.budgetAmount,
          createdBy: campaign.createdBy,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          allocations: allocationsWithAgent,
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

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/campaigns/:id — 更新活动
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/campaigns/:id", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      // 仅 draft 状态可编辑
      if (campaign.status !== "draft") {
        reply.status(400).send({ code: 400, data: null, message: "仅草稿状态的活动可编辑" });
        return;
      }

      const body = request.body as {
        name?: string;
        description?: string;
        start_at?: string;
        end_at?: string;
        budget_amount?: number;
      };

      const updateData: Record<string, any> = {};

      if (body.name !== undefined) {
        updateData.name = String(body.name).trim();
      }
      if (body.description !== undefined) {
        updateData.description = body.description;
      }
      if (body.start_at !== undefined) {
        updateData.startAt = new Date(body.start_at);
      }
      if (body.end_at !== undefined) {
        updateData.endAt = new Date(body.end_at);
      }
      if (body.budget_amount !== undefined) {
        updateData.budgetAmount = body.budget_amount;
      }

      if (Object.keys(updateData).length === 0) {
        reply.status(400).send({ code: 400, data: null, message: "没有提供要更新的字段" });
        return;
      }

      updateData.updatedAt = new Date();

      await db
        .update(campaigns)
        .set(updateData)
        .where(eq(campaigns.id, campaignId));

      // 重新读取已更新数据
      const [updated] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      reply.status(200).send({
        code: 0,
        data: {
          id: updated!.id,
          name: updated!.name,
          description: updated!.description,
          status: updated!.status,
          startAt: updated!.startAt?.toISOString() ?? null,
          endAt: updated!.endAt?.toISOString() ?? null,
          budgetAmount: updated!.budgetAmount,
          createdBy: updated!.createdBy,
          createdAt: updated!.createdAt.toISOString(),
          updatedAt: updated!.updatedAt.toISOString(),
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

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/campaigns/:id/status — 变更状态
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/campaigns/:id/status", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const body = request.body as { status?: string };
      const targetStatus = body?.status;

      if (!targetStatus) {
        reply.status(400).send({ code: 400, data: null, message: "请提供目标状态" });
        return;
      }

      const validStatuses = ["draft", "active", "ended", "archived"];
      if (!validStatuses.includes(targetStatus)) {
        reply.status(400).send({ code: 400, data: null, message: `无效的状态: ${targetStatus}` });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      const allowed = ALLOWED_STATUS_TRANSITIONS[campaign.status] ?? [];
      if (!allowed.includes(targetStatus)) {
        reply.status(400).send({
          code: 400,
          data: null,
          message: `不允许从 ${campaign.status} 变更为 ${targetStatus}`,
        });
        return;
      }

      await db
        .update(campaigns)
        .set({ status: targetStatus as any, updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId));

      reply.status(200).send({
        code: 0,
        data: {
          id: campaignId,
          status: targetStatus,
        },
        message: `活动状态已变更为 ${targetStatus}`,
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
  //  POST /api/v1/admin/campaigns/:id/allocations — 给代理商分配兑换码配额
  //  创建 redemption_batches + redemption_codes
  //  记录到 campaign_codes 表
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/campaigns/:id/allocations", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      // 仅 active 状态的活动可分配
      if (campaign.status !== "active") {
        reply.status(400).send({ code: 400, data: null, message: "仅进行中的活动可分配兑换码" });
        return;
      }

      const body = request.body as {
        agent_id?: number | null;
        count?: number;
        token_amount?: string | number;
        valid_days?: number;
      };

      if (!body.count || !body.token_amount) {
        reply.status(400).send({ code: 400, data: null, message: "参数不完整：count, token_amount 必填" });
        return;
      }

      const totalCount = parseInt(String(body.count), 10);
      const amount = String(body.token_amount);
      const validDays = body.valid_days ? parseInt(String(body.valid_days), 10) : null;
      const agentId = body.agent_id ?? null;

      if (totalCount <= 0 || totalCount > 100000) {
        reply.status(400).send({ code: 400, data: null, message: "count 必须在 1~100000 之间" });
        return;
      }

      if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        reply.status(400).send({ code: 400, data: null, message: "token_amount 必须为正数" });
        return;
      }

      const userId = request.user!.userId;

      // ── 创建兑换码批次 ──
      let expiresAt: Date | null = null;
      if (validDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + validDays);
      }

      const batchName = `活动 #${campaignId} - ${campaign.name}`;

      const [batch] = await db
        .insert(redemptionBatches)
        .values({
          creatorId: userId,
          name: batchName,
          amount,
          totalCount,
          maxUses: 1,
          expiresAt,
          status: "active",
          note: `营销活动 ${campaign.name} 分配`,
        })
        .returning();

      // ── 生成兑换码 ──
      const uniqueCodes = generateCodes(totalCount);
      const codeValues = Array.from(uniqueCodes).map((code) => ({
        batchId: batch.id,
        code,
        amount,
        usesLeft: 1,
        status: "unused" as const,
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < codeValues.length; i += CHUNK_SIZE) {
        const chunk = codeValues.slice(i, i + CHUNK_SIZE);
        await db.insert(redemptionCodes).values(chunk);
      }

      // ── 记录/更新 campaign_codes ──
      const [existingAlloc] = await db
        .select()
        .from(campaignCodes)
        .where(
          and(
            eq(campaignCodes.campaignId, campaignId),
            agentId !== null
              ? eq(campaignCodes.agentId, agentId!)
              : sql`${campaignCodes.agentId} IS NULL`
          )
        )
        .limit(1);

      if (existingAlloc) {
        await db
          .update(campaignCodes)
          .set({
            allocatedCount: sql`${campaignCodes.allocatedCount} + ${totalCount}`,
          })
          .where(
            and(
              eq(campaignCodes.campaignId, campaignId),
              agentId !== null
                ? eq(campaignCodes.agentId, agentId!)
                : sql`${campaignCodes.agentId} IS NULL`
            )
          );
      } else {
        await db
          .insert(campaignCodes)
          .values({
            campaignId,
            agentId: agentId as number | null,
            allocatedCount: totalCount,
            usedCount: 0,
          });
      }

      reply.status(200).send({
        code: 0,
        data: {
          batchId: batch.id,
          campaignId,
          agentId,
          allocatedCount: totalCount,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
        message: "兑换码分配成功",
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
  //  GET /api/v1/admin/campaigns/:id/codes — 查看活动兑换码批次
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/:id/codes", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "活动不存在" });
        return;
      }

      // 查询关联的兑换码批次
      const allocRows = await db
        .select({
          agentId: campaignCodes.agentId,
          allocatedCount: campaignCodes.allocatedCount,
          usedCount: campaignCodes.usedCount,
        })
        .from(campaignCodes)
        .where(eq(campaignCodes.campaignId, campaignId));

      // 通过 generate-codes 创建的批次没有直接记录关联到活动
      // 我们按批次查询：查找 note 中包含活动名的批次
      const batchRows = await db
        .select({
          id: redemptionBatches.id,
          name: redemptionBatches.name,
          amount: redemptionBatches.amount,
          totalCount: redemptionBatches.totalCount,
          usedCount: redemptionBatches.usedCount,
          expiresAt: redemptionBatches.expiresAt,
          createdAt: redemptionBatches.createdAt,
        })
        .from(redemptionBatches)
        .where(sql`${redemptionBatches.name} ILIKE ${`%活动 #${campaignId}%`}`)
        .orderBy(desc(redemptionBatches.createdAt));

      const list = batchRows.map(b => ({
        id: b.id,
        count: b.totalCount,
        faceValue: b.amount,
        validDays: b.expiresAt
          ? Math.max(0, Math.ceil((b.expiresAt.getTime() - Date.now()) / 86400000))
          : 0,
        createdAt: b.createdAt?.toISOString() ?? null,
        usedCount: b.usedCount,
      }));

      reply.status(200).send({ code: 0, data: { list }, message: "ok" });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns/:id/allocations — 查看各代理的分配和进度
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/:id/allocations", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      const allocations = await db
        .select({
          agentId: campaignCodes.agentId,
          allocatedCount: campaignCodes.allocatedCount,
          usedCount: campaignCodes.usedCount,
        })
        .from(campaignCodes)
        .where(eq(campaignCodes.campaignId, campaignId))
        .orderBy(desc(campaignCodes.allocatedCount));

      // 关联代理商名称
      const allocationsWithAgent = await Promise.all(
        allocations.map(async (a) => {
          if (a.agentId === null) {
            return { ...a, agentName: "平台自营" };
          }
          // 通过 userId 关联 users 表获取昵称/邮箱
          const [agentRow] = await db
            .select({
              agentId: agents.id,
              email: users.email,
              nickname: users.nickname,
            })
            .from(agents)
            .innerJoin(users, eq(agents.userId, users.id))
            .where(eq(agents.id, a.agentId!))
            .limit(1);
          return {
            ...a,
            agentName: agentRow?.nickname ?? agentRow?.email ?? `代理商 #${a.agentId}`,
          };
        })
      );

      reply.status(200).send({
        code: 0,
        data: {
          campaignId,
          campaignName: campaign.name,
          campaignStatus: campaign.status,
          allocations: allocationsWithAgent,
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

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/campaigns/:id/generate-codes — 活动生成兑换码
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/campaigns/:id/generate-codes", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      if (campaign.status !== "active") {
        reply.status(400).send({ code: 400, data: null, message: "仅进行中的活动可生成兑换码" });
        return;
      }

      const body = request.body as {
        agentId?: number | null;
        count?: number;
        amount?: string | number;
        expiresInDays?: number;
      };

      if (!body.count || !body.amount) {
        reply.status(400).send({ code: 400, data: null, message: "参数不完整: count, amount 必填" });
        return;
      }

      const totalCount = parseInt(String(body.count), 10);
      const amount = String(body.amount);
      const expiresInDays = body.expiresInDays ? parseInt(String(body.expiresInDays), 10) : null;
      const agentId = body.agentId ?? null;

      if (totalCount <= 0 || totalCount > 100000) {
        reply.status(400).send({ code: 400, data: null, message: "count 必须在 1~100000 之间" });
        return;
      }

      if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        reply.status(400).send({ code: 400, data: null, message: "amount 必须为正数" });
        return;
      }

      const userId = request.user!.userId;

      // ── 创建兑换码批次 ──
      let expiresAt: Date | null = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      const batchName = `活动 #${campaignId} - ${campaign.name} 生成`;

      const [batch] = await db
        .insert(redemptionBatches)
        .values({
          creatorId: userId,
          name: batchName,
          amount,
          totalCount,
          maxUses: 1,
          expiresAt,
          status: "active",
          note: `营销活动 ${campaign.name} 批量生成`,
        })
        .returning();

      // ── 生成兑换码 ──
      const uniqueCodes = generateCodes(totalCount);
      const codeValues = Array.from(uniqueCodes).map((code) => ({
        batchId: batch.id,
        code,
        amount,
        usesLeft: 1,
        status: "unused" as const,
      }));

      const CHUNK_SIZE = 500;
      for (let i = 0; i < codeValues.length; i += CHUNK_SIZE) {
        const chunk = codeValues.slice(i, i + CHUNK_SIZE);
        await db.insert(redemptionCodes).values(chunk);
      }

      // ── 更新 campaign_codes 的 allocated_count ──
      const [existingAlloc] = await db
        .select()
        .from(campaignCodes)
        .where(
          and(
            eq(campaignCodes.campaignId, campaignId),
            agentId !== null
              ? eq(campaignCodes.agentId, agentId!)
              : sql`${campaignCodes.agentId} IS NULL`
          )
        )
        .limit(1);

      if (existingAlloc) {
        await db
          .update(campaignCodes)
          .set({
            allocatedCount: sql`${campaignCodes.allocatedCount} + ${totalCount}`,
          })
          .where(
            and(
              eq(campaignCodes.campaignId, campaignId),
              agentId !== null
                ? eq(campaignCodes.agentId, agentId!)
                : sql`${campaignCodes.agentId} IS NULL`
            )
          );
      } else {
        await db
          .insert(campaignCodes)
          .values({
            campaignId,
            agentId: agentId as number | null,
            allocatedCount: totalCount,
            usedCount: 0,
          });
      }

      reply.status(200).send({
        code: 0,
        data: {
          batchId: batch.id,
          campaignId,
          agentId,
          generatedCount: codeValues.length,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
        message: "兑换码生成成功",
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
  //  POST /api/v1/admin/campaigns/:id/commission-rule — 配置活动佣金规则
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/campaigns/:id/commission-rule", {
    preHandler: [requirePerm(Perm.AGENT_MANAGE)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      const body = request.body as {
        agentId: number;
        ruleType?: string;
        rate?: string;
        fixedAmount?: string;
        maxCap?: string;
        validFrom?: string;
        validUntil?: string;
      };

      if (!body.agentId) {
        reply.status(400).send({ code: 400, data: null, message: "agentId 必填" });
        return;
      }

      const ruleType = body.ruleType || "activity";

      if (body.rate === undefined && body.fixedAmount === undefined) {
        reply.status(400).send({ code: 400, data: null, message: "请提供 rate 或 fixedAmount" });
        return;
      }

      const [rule] = await db
        .insert(commissionRules)
        .values({
          agentId: body.agentId,
          ruleType: ruleType as any,
          rate: body.rate ?? "0.0000",
          fixedAmount: body.fixedAmount ?? null,
          maxCap: body.maxCap ?? null,
          activityName: campaign.name,
          activityType: campaign.name,
          isEnabled: true,
          createdBy: request.user!.userId,
          validFrom: body.validFrom ? new Date(body.validFrom) : null,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
        } as any)
        .onConflictDoUpdate({
          target: [commissionRules.agentId, commissionRules.ruleType],
          set: {
            rate: body.rate !== undefined ? body.rate : sql`commission_rules.rate`,
            fixedAmount: body.fixedAmount !== undefined ? body.fixedAmount : sql`commission_rules.fixed_amount`,
            maxCap: body.maxCap !== undefined ? body.maxCap : sql`commission_rules.max_cap`,
            activityName: campaign.name,
            activityType: campaign.name,
            isEnabled: true,
            updatedAt: new Date(),
          },
        })
        .returning();

      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "agent_update",
        targetType: "commission_rule",
        targetId: rule.id,
        after: { campaignId, agentId: body.agentId, ruleType, rate: body.rate, fixedAmount: body.fixedAmount },
        ip: request.ip,
        description: `活动 #${campaignId}: 配置代理商 #${body.agentId} 活动佣金规则`,
      });

      reply.status(200).send({
        code: 0,
        data: {
          id: rule.id,
          agentId: rule.agentId,
          ruleType: rule.ruleType,
          rate: rule.rate,
          fixedAmount: rule.fixedAmount,
          activityName: rule.activityName,
          isEnabled: rule.isEnabled,
        },
        message: "活动佣金规则已配置",
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
  //  GET /api/v1/admin/campaigns/:id/stats — 活动统计数据
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/campaigns/:id/stats", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { id } = request.params as { id: string };
      const campaignId = parseInt(id, 10);

      if (isNaN(campaignId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
        return;
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        reply.status(404).send({ code: 404, data: null, message: "营销活动不存在" });
        return;
      }

      // ── 兑换码统计 ──
      const [codeStats] = await db
        .select({
          totalAllocated: sql<number>`COALESCE(SUM(${campaignCodes.allocatedCount}), 0)`,
          totalUsed: sql<number>`COALESCE(SUM(${campaignCodes.usedCount}), 0)`,
        })
        .from(campaignCodes)
        .where(eq(campaignCodes.campaignId, campaignId));

      // ── 活动佣金统计 ──
      const [commissionStats] = await db
        .select({
          totalCommissions: sql<number>`COUNT(*)`,
          totalCommissionAmount: sql<string>`COALESCE(SUM(${commissionLogs.commissionAmount})::TEXT, '0.000000')`,
          pendingAmount: sql<string>`COALESCE(SUM(${commissionLogs.commissionAmount}) FILTER (WHERE ${commissionLogs.status} = 'pending')::TEXT, '0.000000')`,
          settledAmount: sql<string>`COALESCE(SUM(${commissionLogs.commissionAmount}) FILTER (WHERE ${commissionLogs.status} = 'settled')::TEXT, '0.000000')`,
          pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${commissionLogs.status} = 'pending')`,
          settledCount: sql<number>`COUNT(*) FILTER (WHERE ${commissionLogs.status} = 'settled')`,
        })
        .from(commissionLogs)
        .where(
          and(
            eq(commissionLogs.commissionType, 'activity'),
            sql`${commissionLogs.ruleSnapshot}->>'activityName' IS NOT NULL`,
            sql`${commissionLogs.ruleSnapshot}->>'activityName' = ${campaign.name}`,
          )
        );

      // ── 各代理商兑换码分配详情 ──
      const allocations = await db
        .select({
          agentId: campaignCodes.agentId,
          allocatedCount: campaignCodes.allocatedCount,
          usedCount: campaignCodes.usedCount,
        })
        .from(campaignCodes)
        .where(eq(campaignCodes.campaignId, campaignId))
        .orderBy(desc(campaignCodes.allocatedCount));

      const allocationsWithInfo = await Promise.all(
        allocations.map(async (a) => {
          let agentName = "平台自营";
          if (a.agentId !== null) {
            const [agentRow] = await db
              .select({
                email: users.email,
                nickname: users.nickname,
              })
              .from(agents)
              .innerJoin(users, eq(agents.userId, users.id))
              .where(eq(agents.id, a.agentId!))
              .limit(1);
            agentName = agentRow?.nickname ?? agentRow?.email ?? `代理商 #${a.agentId}`;
          }
          return { ...a, agentName };
        })
      );

      reply.status(200).send({
        code: 0,
        data: {
          campaignId,
          campaignName: campaign.name,
          campaignStatus: campaign.status,
          codes: {
            totalAllocated: Number(codeStats?.totalAllocated ?? 0),
            totalUsed: Number(codeStats?.totalUsed ?? 0),
            usageRate: codeStats && codeStats.totalAllocated > 0
              ? ((Number(codeStats.totalUsed) / Number(codeStats.totalAllocated)) * 100).toFixed(2) + "%"
              : "0%",
          },
          commissions: {
            totalCommissions: Number(commissionStats?.totalCommissions ?? 0),
            totalCommissionAmount: commissionStats?.totalCommissionAmount ?? "0.000000",
            pendingCount: Number(commissionStats?.pendingCount ?? 0),
            pendingAmount: commissionStats?.pendingAmount ?? "0.000000",
            settledCount: Number(commissionStats?.settledCount ?? 0),
            settledAmount: commissionStats?.settledAmount ?? "0.000000",
          },
          allocations: allocationsWithInfo,
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
