// ============================================================
//  3cloud (3C) �?创建活动
//  POST /api/v1/admin/campaigns
// ============================================================

import { FastifyInstance } from "fastify";
import { getDb } from "../../../db/index.js";
import { campaigns } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

export async function createCampaignRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/campaigns", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
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
}
