// ============================================================
//  3cloud (3C) — A/B 测试管理
//  创建与管理 A/B 实验，配置分流比例，查看实验结果
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql, asc, isNull } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";
import { z } from "zod";

// ── Schema ──

const AB_TEST_TABLE = "ab_tests";
const AB_TEST_RESULTS_TABLE = "ab_test_results";

// 内存模拟表（正式环境应使用真实数据库表）
// 简化实现：所有数据存储到 Redis Hash

interface ABTest {
  id: number;
  name: string;
  description: string;
  status: "draft" | "running" | "paused" | "completed";
  trafficPercent: number;       // 参与流量百分比
  variants: ABVariant[];
  metrics: string[];            // 观测指标：latency, error_rate, token_usage 等
  targetRoute: string;          // 目标路由/功能
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: number;
}

interface ABVariant {
  name: string;
  weight: number;  // 权重百分比，总和=100
  config: Record<string, any>;
}

interface ABTestResult {
  id: number;
  testId: number;
  variant: string;
  impressions: number;
  conversions: number;
  metrics: Record<string, number>;
  updatedAt: string;
}

// ── 路由 ──

export async function adminABTestingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // 用 Redis Hash 存储测试数据
  const REDIS_KEY_TESTS = "ab:tests";
  const REDIS_KEY_RESULTS = "ab:results:";
  const REDIS_KEY_COUNTER = "ab:counter";

  // ── Helpers ──

  async function getNextId(redis: any): Promise<number> {
    try {
      return await redis.incr(REDIS_KEY_COUNTER);
    } catch {
      return Date.now();
    }
  }

  async function getTests(redis: any): Promise<ABTest[]> {
    try {
      const raw = await redis.hgetall(REDIS_KEY_TESTS);
      if (!raw) return [];
      return Object.values(raw).map((v: string) => JSON.parse(v)).sort((a, b) => b.id - a.id);
    } catch {
      return [];
    }
  }

  async function getTest(redis: any, id: number): Promise<ABTest | null> {
    try {
      const raw = await redis.hget(REDIS_KEY_TESTS, id.toString());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function saveTest(redis: any, test: ABTest): Promise<void> {
    await redis.hset(REDIS_KEY_TESTS, test.id.toString(), JSON.stringify(test));
  }

  async function getResults(redis: any, testId: number): Promise<ABTestResult[]> {
    try {
      const raw = await redis.hgetall(`${REDIS_KEY_RESULTS}${testId}`);
      if (!raw) return [];
      return Object.values(raw).map((v: string) => JSON.parse(v));
    } catch {
      return [];
    }
  }

  async function saveResult(redis: any, result: ABTestResult): Promise<void> {
    await redis.hset(`${REDIS_KEY_RESULTS}${result.testId}`, result.variant, JSON.stringify(result));
  }

  // ──────────────────────────────────────────────
  //  CRUD: 实验列表 / 创建 / 详情 / 更新 / 删除
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/ab-testing
  app.get("/api/v1/admin/ab-testing", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    const tests = await getTests(redis);
    reply.status(200).send({ code: 0, data: { list: tests }, message: "ok" });
  });

  // POST /api/v1/admin/ab-testing
  app.post("/api/v1/admin/ab-testing", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const body = request.body as any;
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      trafficPercent: z.number().min(1).max(100),
      variants: z.array(z.object({
        name: z.string().min(1).max(50),
        weight: z.number().min(1).max(100),
        config: z.record(z.any()).optional(),
      })).min(2).max(10),
      metrics: z.array(z.string()).optional(),
      targetRoute: z.string().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 400, message: parsed.error.errors.map(e => e.message).join("; ") });
    }

    const data = parsed.data;
    const weightSum = data.variants.reduce((s, v) => s + v.weight, 0);
    if (weightSum !== 100) {
      return reply.status(400).send({ code: 400, message: `变量权重之和必须为 100（当前 ${weightSum}）` });
    }

    const redis = getRedis();
    const id = await getNextId(redis);

    const test: ABTest = {
      id,
      name: data.name,
      description: data.description || "",
      status: "draft",
      trafficPercent: data.trafficPercent,
      variants: data.variants.map(v => ({ name: v.name, weight: v.weight, config: v.config || {} })),
      metrics: data.metrics || ["latency", "error_rate"],
      targetRoute: data.targetRoute || "",
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      createdBy: request.user!.userId,
    };

    await saveTest(redis, test);

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "create" as any,
      targetType: "ab_test",
      targetId: id.toString(),
      ip: request.ip,
      description: `创建 A/B 测试：${test.name}`,
    });

    reply.status(200).send({ code: 0, data: test, message: "实验已创建" });
  });

  // GET /api/v1/admin/ab-testing/:id
  app.get("/api/v1/admin/ab-testing/:id", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));
    if (!test) {
      return reply.status(404).send({ code: 404, message: "实验不存在" });
    }

    const results = await getResults(redis, test.id);
    reply.status(200).send({ code: 0, data: { ...test, results }, message: "ok" });
  });

  // PUT /api/v1/admin/ab-testing/:id
  app.put("/api/v1/admin/ab-testing/:id", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));

    if (!test) {
      return reply.status(404).send({ code: 404, message: "实验不存在" });
    }
    if (test.status === "completed") {
      return reply.status(400).send({ code: 400, message: "已完成的实验不可修改" });
    }

    const updated: ABTest = {
      ...test,
      name: body.name ?? test.name,
      description: body.description ?? test.description,
      trafficPercent: body.trafficPercent ?? test.trafficPercent,
      variants: body.variants ?? test.variants,
      metrics: body.metrics ?? test.metrics,
      targetRoute: body.targetRoute ?? test.targetRoute,
    };

    if (body.variants) {
      const weightSum = body.variants.reduce((s: number, v: ABVariant) => s + v.weight, 0);
      if (weightSum !== 100) {
        return reply.status(400).send({ code: 400, message: `变量权重之和必须为 100（当前 ${weightSum}）` });
      }
    }

    await saveTest(redis, updated);

    reply.status(200).send({ code: 0, data: updated, message: "实验已更新" });
  });

  // DELETE /api/v1/admin/ab-testing/:id
  app.delete("/api/v1/admin/ab-testing/:id", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));
    if (!test) {
      return reply.status(404).send({ code: 404, message: "实验不存在" });
    }

    await redis.hdel(REDIS_KEY_TESTS, id);
    await redis.del(`${REDIS_KEY_RESULTS}${id}`);

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "delete" as any,
      targetType: "ab_test",
      targetId: id,
      ip: request.ip,
      description: `删除 A/B 测试：${test.name}`,
    });

    reply.status(200).send({ code: 0, message: "实验已删除" });
  });

  // ──────────────────────────────────────────────
  //  实验状态控制：启动/暂停/完成
  // ──────────────────────────────────────────────

  // POST /api/v1/admin/ab-testing/:id/start
  app.post("/api/v1/admin/ab-testing/:id/start", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));
    if (!test) return reply.status(404).send({ code: 404, message: "实验不存在" });

    if (test.status === "running") {
      return reply.status(400).send({ code: 400, message: "实验已在运行中" });
    }

    test.status = "running";
    test.startedAt = test.startedAt || new Date().toISOString();
    await saveTest(redis, test);

    reply.status(200).send({ code: 0, data: test, message: "实验已启动" });
  });

  // POST /api/v1/admin/ab-testing/:id/pause
  app.post("/api/v1/admin/ab-testing/:id/pause", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));
    if (!test) return reply.status(404).send({ code: 404, message: "实验不存在" });
    if (test.status !== "running") return reply.status(400).send({ code: 400, message: "只有运行中的实验才能暂停" });

    test.status = "paused";
    await saveTest(redis, test);

    reply.status(200).send({ code: 0, data: test, message: "实验已暂停" });
  });

  // POST /api/v1/admin/ab-testing/:id/complete
  app.post("/api/v1/admin/ab-testing/:id/complete", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const redis = getRedis();
    const test = await getTest(redis, parseInt(id));
    if (!test) return reply.status(404).send({ code: 404, message: "实验不存在" });

    test.status = "completed";
    test.completedAt = new Date().toISOString();
    await saveTest(redis, test);

    reply.status(200).send({ code: 0, data: test, message: "实验已完成" });
  });
}
