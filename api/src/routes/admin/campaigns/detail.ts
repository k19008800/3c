// ============================================================
//  3cloud (3C) — 活动详情 / 编辑 / 状态变更
//  GET    /api/v1/admin/campaigns/:id          — 活动详情+分配
//  PATCH  /api/v1/admin/campaigns/:id          — 更新活动(draft)
//  PATCH  /api/v1/admin/campaigns/:id/status   — 变更状态
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  campaigns,
  campaignCodes,
  agents,
  users,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";
import { ALLOWED_STATUS_TRANSITIONS } from "./types.js";

export async function detailCampaignRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/campaigns/:id — 活动详情+分配进度
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
  //  PATCH /api/v1/admin/campaigns/:id — 更新活动(draft)
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

}
