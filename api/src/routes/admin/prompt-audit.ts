// ============================================================
//  3cloud (3C) — Admin 提示词审计
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, like, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  promptAuditLogs,
  sensitiveWords,
  users,
  apiKeys,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import crypto from "crypto";

// ── 敏感词检测 ──

async function detectSensitiveWords(
  db: ReturnType<typeof getDb>,
  text: string
): Promise<{ isSensitive: boolean; words: string[] }> {
  // 获取启用的敏感词
  const words = await db
    .select({ word: sensitiveWords.word })
    .from(sensitiveWords)
    .where(eq(sensitiveWords.enabled, true));

  const detected: string[] = [];
  const lowerText = text.toLowerCase();

  for (const { word } of words) {
    if (lowerText.includes(word.toLowerCase())) {
      detected.push(word);
    }
  }

  return {
    isSensitive: detected.length > 0,
    words: detected,
  };
}

// ── SHA256 哈希 ──

function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

export async function promptAuditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-audit — 提示词审计列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-audit", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      userId?: string;
      apiKeyId?: string;
      modelName?: string;
      auditStatus?: string;
      isSensitive?: string;
      startDate?: string;
      endDate?: string;
      keyword?: string; // 搜索 prompt 内容
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];

    if (query.userId) {
      conditions.push(eq(promptAuditLogs.userId, parseInt(query.userId, 10)));
    }
    if (query.apiKeyId) {
      conditions.push(eq(promptAuditLogs.apiKeyId, parseInt(query.apiKeyId, 10)));
    }
    if (query.modelName) {
      conditions.push(like(promptAuditLogs.modelName, `%${query.modelName}%`));
    }
    if (query.auditStatus) {
      conditions.push(eq(promptAuditLogs.auditStatus, query.auditStatus as any));
    }
    if (query.isSensitive !== undefined) {
      conditions.push(eq(promptAuditLogs.isSensitive, query.isSensitive === "true"));
    }
    if (query.startDate) {
      conditions.push(gte(promptAuditLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(promptAuditLogs.createdAt, end));
    }
    if (query.keyword) {
      conditions.push(sql`${promptAuditLogs.prompt} ILIKE ${`%${query.keyword}%`}`);
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promptAuditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const rows = await db
      .select({
        id: promptAuditLogs.id,
        callLogId: promptAuditLogs.callLogId,
        userId: promptAuditLogs.userId,
        apiKeyId: promptAuditLogs.apiKeyId,
        modelName: promptAuditLogs.modelName,
        promptHash: promptAuditLogs.promptHash,
        promptPreview: sql<string>`left(${promptAuditLogs.prompt}, 200)`,
        responseStatus: promptAuditLogs.responseStatus,
        isSensitive: promptAuditLogs.isSensitive,
        sensitiveWords: promptAuditLogs.sensitiveWords,
        auditStatus: promptAuditLogs.auditStatus,
        auditedBy: promptAuditLogs.auditedBy,
        auditedAt: promptAuditLogs.auditedAt,
        flagReason: promptAuditLogs.flagReason,
        createdAt: promptAuditLogs.createdAt,
        userEmail: users.email,
        keyName: apiKeys.name,
      })
      .from(promptAuditLogs)
      .leftJoin(users, eq(promptAuditLogs.userId, users.id))
      .leftJoin(apiKeys, eq(promptAuditLogs.apiKeyId, apiKeys.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(promptAuditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.send({
      code: 0,
      data: {
        list: rows,
        total: countResult.count,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-audit/:id — 详情（含完整 prompt）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-audit/:id", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [row] = await db
      .select({
        id: promptAuditLogs.id,
        callLogId: promptAuditLogs.callLogId,
        callLogCreatedAt: promptAuditLogs.callLogCreatedAt,
        userId: promptAuditLogs.userId,
        apiKeyId: promptAuditLogs.apiKeyId,
        modelName: promptAuditLogs.modelName,
        prompt: promptAuditLogs.prompt,
        promptHash: promptAuditLogs.promptHash,
        responseSummary: promptAuditLogs.responseSummary,
        responseStatus: promptAuditLogs.responseStatus,
        isSensitive: promptAuditLogs.isSensitive,
        sensitiveWords: promptAuditLogs.sensitiveWords,
        auditStatus: promptAuditLogs.auditStatus,
        auditedBy: promptAuditLogs.auditedBy,
        auditedAt: promptAuditLogs.auditedAt,
        flagReason: promptAuditLogs.flagReason,
        createdAt: promptAuditLogs.createdAt,
        userEmail: users.email,
        keyName: apiKeys.name,
      })
      .from(promptAuditLogs)
      .leftJoin(users, eq(promptAuditLogs.userId, users.id))
      .leftJoin(apiKeys, eq(promptAuditLogs.apiKeyId, apiKeys.id))
      .where(eq(promptAuditLogs.id, parseInt(id, 10)));

    if (!row) {
      return reply.status(404).send({ code: 404, data: null, message: "记录不存在" });
    }

    reply.send({ code: 0, data: row, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/prompt-audit/:id/audit — 审核操作
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/prompt-audit/:id/audit", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as {
      auditStatus: "reviewed" | "flagged" | "ignored";
      flagReason?: string;
    };

    const [existing] = await db
      .select({ id: promptAuditLogs.id })
      .from(promptAuditLogs)
      .where(eq(promptAuditLogs.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "记录不存在" });
    }

    const [updated] = await db
      .update(promptAuditLogs)
      .set({
        auditStatus: body.auditStatus,
        auditedBy: (request.user as any).id,
        auditedAt: new Date(),
        flagReason: body.flagReason ?? null,
      })
      .where(eq(promptAuditLogs.id, parseInt(id, 10)))
      .returning();

    reply.send({ code: 0, data: updated, message: "审核完成" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/prompt-audit/stats — 统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/prompt-audit/stats", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      startDate?: string;
      endDate?: string;
    };

    const conditions: any[] = [];
    if (query.startDate) {
      conditions.push(gte(promptAuditLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(promptAuditLogs.createdAt, end));
    }

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${promptAuditLogs.auditStatus} = 'pending')::int`,
        reviewed: sql<number>`count(*) filter (where ${promptAuditLogs.auditStatus} = 'reviewed')::int`,
        flagged: sql<number>`count(*) filter (where ${promptAuditLogs.auditStatus} = 'flagged')::int`,
        ignored: sql<number>`count(*) filter (where ${promptAuditLogs.auditStatus} = 'ignored')::int`,
        sensitive: sql<number>`count(*) filter (where ${promptAuditLogs.isSensitive} = true)::int`,
      })
      .from(promptAuditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    reply.send({ code: 0, data: stats, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/sensitive-words — 敏感词列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/sensitive-words", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      category?: string;
      enabled?: string;
      keyword?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "50", 10) || 50));
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];

    if (query.category) {
      conditions.push(eq(sensitiveWords.category, query.category));
    }
    if (query.enabled !== undefined) {
      conditions.push(eq(sensitiveWords.enabled, query.enabled === "true"));
    }
    if (query.keyword) {
      conditions.push(sql`${sensitiveWords.word} ILIKE ${`%${query.keyword}%`}`);
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sensitiveWords)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const rows = await db
      .select()
      .from(sensitiveWords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sensitiveWords.hitCount))
      .limit(pageSize)
      .offset(offset);

    reply.send({
      code: 0,
      data: {
        list: rows,
        total: countResult.count,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/sensitive-words — 创建敏感词
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/sensitive-words", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      word: string;
      category?: string;
      severity?: string;
      description?: string;
    };

    if (!body.word || body.word.trim().length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "敏感词不能为空" });
    }

    const [created] = await db
      .insert(sensitiveWords)
      .values({
        word: body.word.trim(),
        category: body.category ?? "general",
        severity: body.severity ?? "medium",
        description: body.description ?? null,
        createdBy: (request.user as any).id,
      })
      .returning();

    reply.send({ code: 0, data: created, message: "创建成功" });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/sensitive-words/:id — 更新敏感词
  // ──────────────────────────────────────────────

  app.patch("/api/v1/admin/sensitive-words/:id", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as {
      word?: string;
      category?: string;
      severity?: string;
      description?: string;
      enabled?: boolean;
    };

    const [existing] = await db
      .select({ id: sensitiveWords.id })
      .from(sensitiveWords)
      .where(eq(sensitiveWords.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "敏感词不存在" });
    }

    const [updated] = await db
      .update(sensitiveWords)
      .set({
        ...body,
        word: body.word?.trim(),
        updatedAt: new Date(),
      })
      .where(eq(sensitiveWords.id, parseInt(id, 10)))
      .returning();

    reply.send({ code: 0, data: updated, message: "更新成功" });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/sensitive-words/:id — 删除敏感词
  // ──────────────────────────────────────────────

  app.delete("/api/v1/admin/sensitive-words/:id", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select({ id: sensitiveWords.id })
      .from(sensitiveWords)
      .where(eq(sensitiveWords.id, parseInt(id, 10)));

    if (!existing) {
      return reply.status(404).send({ code: 404, data: null, message: "敏感词不存在" });
    }

    await db
      .delete(sensitiveWords)
      .where(eq(sensitiveWords.id, parseInt(id, 10)));

    reply.send({ code: 0, data: null, message: "删除成功" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/sensitive-words/batch — 批量导入
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/sensitive-words/batch", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      words: string[];
      category?: string;
      severity?: string;
    };

    if (!body.words || body.words.length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "词列表不能为空" });
    }

    const values = body.words
      .map(w => w.trim())
      .filter(w => w.length > 0)
      .map(word => ({
        word,
        category: body.category ?? "general",
        severity: body.severity ?? "medium",
        createdBy: (request.user as any).id,
      }));

    if (values.length === 0) {
      return reply.status(400).send({ code: 400, data: null, message: "无有效词汇" });
    }

    const created = await db
      .insert(sensitiveWords)
      .values(values)
      .returning();

    reply.send({
      code: 0,
      data: { count: created.length },
      message: `成功导入 ${created.length} 个敏感词`,
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/prompt-audit/analyze — 手动触发敏感词分析
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/prompt-audit/analyze", {
    preHandler: [requirePerm(Perm.AUDIT_REVIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      ids?: number[]; // 指定 ID 列表
      pendingOnly?: boolean; // 仅分析 pending 状态
      limit?: number;
    };

    const limit = Math.min(1000, body.limit ?? 100);

    const conditions: any[] = [sql`${promptAuditLogs.isSensitive} = false`];
    if (body.ids && body.ids.length > 0) {
      conditions.push(inArray(promptAuditLogs.id, body.ids));
    } else if (body.pendingOnly) {
      conditions.push(eq(promptAuditLogs.auditStatus, "pending"));
    }

    const logs = await db
      .select({
        id: promptAuditLogs.id,
        prompt: promptAuditLogs.prompt,
      })
      .from(promptAuditLogs)
      .where(and(...conditions))
      .limit(limit);

    let updated = 0;
    for (const log of logs) {
      const detection = await detectSensitiveWords(db, log.prompt);
      if (detection.isSensitive) {
        await db
          .update(promptAuditLogs)
          .set({
            isSensitive: true,
            sensitiveWords: detection.words,
          })
          .where(eq(promptAuditLogs.id, log.id));
        updated++;
      }
    }

    reply.send({
      code: 0,
      data: { analyzed: logs.length, updated },
      message: `分析完成，${updated} 条标记为敏感`,
    });
  });
}
