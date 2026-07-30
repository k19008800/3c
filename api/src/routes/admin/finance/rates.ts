// ============================================================
//  3cloud (3C) — 多币种汇率管理
//  GET/POST /api/v1/admin/finance/rates
//  GET /api/v1/admin/finance/rates/history
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { exchangeRates, exchangeRateHistory, auditLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function adminFinanceRatesRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/finance/rates — 当前汇率列表
  app.get("/api/v1/admin/finance/rates", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
    schema: {
      querystring: {
        type: "object",
        properties: {
          active: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as any;
    const where = query.active !== "false" ? eq(exchangeRates.isActive, true) : undefined;
    const rates = await db
      .select()
      .from(exchangeRates)
      .where(where)
      .orderBy(exchangeRates.currency);
    reply.send({ code: 0, data: rates });
  });

  // POST /api/v1/admin/finance/rates — 更新汇率
  app.post("/api/v1/admin/finance/rates", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
    schema: {
      body: {
        type: "object",
        required: ["currency", "rate_to_cny"],
        properties: {
          currency: { type: "string", minLength: 2, maxLength: 10 },
          rate_to_cny: { type: "string" },
          source: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const parsed = request.body as any;
    const operatorId = (request as any).user?.id;

    const existing = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.currency, parsed.currency))
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      // 记录历史
      await db.insert(exchangeRateHistory).values({
        currency: existing[0].currency,
        rateToCny: existing[0].rateToCny,
        source: existing[0].source,
        recordedAt: now,
      });

      // 更新
      await db
        .update(exchangeRates)
        .set({
          rateToCny: parsed.rate_to_cny,
          source: parsed.source || "manual",
          updatedAt: now,
        })
        .where(eq(exchangeRates.currency, parsed.currency));
    } else {
      // 新建
      await db.insert(exchangeRates).values({
        currency: parsed.currency,
        rateToCny: parsed.rate_to_cny,
        source: parsed.source || "manual",
      });
    }

    // 记录审计
    await db.insert(auditLogs).values({
      operatorId,
      action: existing.length > 0 ? "rate_update" : "rate_create",
      targetType: "exchange_rates",
      targetId: existing[0]?.id || 0,
      before: existing.length > 0 ? { rate: existing[0].rateToCny } : null,
      after: { rate: parsed.rate_to_cny, currency: parsed.currency },
      ip: request.ip,
      description: `${existing.length > 0 ? "更新" : "新增"}汇率 ${parsed.currency}: ${parsed.rate_to_cny}`,
    });

    reply.send({ code: 0, data: null, message: "汇率更新成功" });
  });

  // GET /api/v1/admin/finance/rates/history — 汇率历史
  app.get("/api/v1/admin/finance/rates/history", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
    schema: {
      querystring: {
        type: "object",
        properties: {
          currency: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as any;
    const conditions = query.currency ? [eq(exchangeRateHistory.currency, query.currency)] : [];
    const history = await db
      .select()
      .from(exchangeRateHistory)
      .where(conditions.length > 0 ? (conditions as any)[0] : undefined)
      .orderBy(exchangeRateHistory.recordedAt, "desc")
      .limit(100);
    reply.send({ code: 0, data: history });
  });
}