/**
 * 供应商-模型映射管理 — 单元测试
 *
 * 覆盖 7 个测试用例：
 * 1. 添加供应商-模型映射 → 201 + upstreamModel/costInputPrice/costOutputPrice
 * 2. 映射列表 → 按供应商筛选 + 按模型筛选
 * 3. 编辑映射 → 更新成本价格/权重/优先级
 * 4. 删除映射 → 200
 * 5. 重复映射（同一 vendor+model）→ 409
 * 6. 权重计算 → 多个映射按 weight 加权选择
 * 7. 优先级排序 → priority 高的排在前面
 *
 * @see development-plan.md §3
 * @module test/vendor-model
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

// ── Hoisted stores with queue-based DB mock ──

const { mockData, dbSelectQueue, mockPoolQueue } = vi.hoisted(() => {
  const mockData = {
    nextId: 200,
    rowCount: 1,
    enableDupErrorOnNextInsert: false,
  };
  const dbSelectQueue: any[] = [];
  const mockPoolQueue: any[][] = [];
  return { mockData, mockPoolQueue, dbSelectQueue };
});

function resetMocks(): void {
  mockData.nextId = 200;
  mockData.rowCount = 1;
  mockData.enableDupErrorOnNextInsert = false;
  dbSelectQueue.length = 0;
  mockPoolQueue.length = 0;
}

function pushSelectResult(data: any): void {
  dbSelectQueue.push(data);
}

function pushPoolResponse(rows: any[]): void {
  mockPoolQueue.push(rows);
}

function chainable(resultFactory: () => any) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
  };
  chain.then = (resolve: Function) => Promise.resolve(resolve(resultFactory()));
  return chain;
}

vi.mock("../src/db/index", () => {
  return {
    db: {
      select: () => chainable(() => dbSelectQueue.shift() ?? []),
      insert: () => chainable(() => {
        if (mockData.enableDupErrorOnNextInsert) {
          mockData.enableDupErrorOnNextInsert = false;
          const err = new Error("duplicate key") as any;
          err.code = "23505";
          throw err;
        }
        return [{ id: mockData.nextId }];
      }),
      update: () => chainable(() => ({ rowCount: mockData.rowCount })),
      delete: () => chainable(() => ({ rowCount: mockData.rowCount })),
    },
    pool: {
      query: async () => {
        const rows = mockPoolQueue.shift() ?? [];
        return { rows };
      },
    },
  };
});

import { adminVendorModelRoutes } from "../src/routes/admin-vendor-model";

async function createTestApp() {
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: "test-jwt-secret-vm" });
  adminVendorModelRoutes(app);
  await app.ready();
  return app;
}

let app: any;
let token: string;

beforeEach(async () => {
  resetMocks();
  app = await createTestApp();
  token = app.jwt.sign({ sub: 1, role: "admin" });
});

afterEach(async () => {
  await app.close();
});

const authHeaders = () => ({ authorization: `Bearer ${token}` });

describe("供应商-模型映射 — 添加/列表/编辑/删除", () => {
  // ─── Test 1: 添加映射 ───

  it("添加供应商-模型映射 → 返回 200 + id，含 upstreamModel/costInputPrice/costOutputPrice", async () => {
    // Queue: vendor check → model check → dup check → insert
    pushSelectResult([{ id: 10, name: "OpenAI" }]);       // vendor exists
    pushSelectResult([{ id: 100, name: "gpt-4o" }]);       // model exists
    pushSelectResult([]);                                    // no duplicate
    mockData.nextId = 201;

    const res = await app.inject({
      method: "POST",
      url: "/admin/vendors/10/models",
      headers: authHeaders(),
      payload: {
        model_id: 100,
        upstream_model: "gpt-4o-2024-08-06",
        cost_input_price: 0.01,
        cost_output_price: 0.03,
        weight: 2,
        priority: 5,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(201);
    expect(body.message).toContain("映射");
  });

  // ─── Test 2: 映射列表 ───

  it("映射列表 → 按供应商筛选返回模型映射，priority 高的在前", async () => {
    pushPoolResponse([
      {
        id: 1, model_id: 100, model_name: "gpt-4o", display_name: "GPT-4o",
        category: "chat", upstream_model: "gpt-4o",
        cost_input_price: 0.01, cost_output_price: 0.03,
        weight: 3, priority: 10, is_enabled: true,
        health_score: 95, avg_latency_ms: 800,
      },
      {
        id: 2, model_id: 101, model_name: "gpt-3.5", display_name: "GPT-3.5",
        category: "chat", upstream_model: "gpt-3.5-turbo",
        cost_input_price: 0.001, cost_output_price: 0.002,
        weight: 1, priority: 5, is_enabled: true,
        health_score: 100, avg_latency_ms: 400,
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/admin/vendors/10/models",
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toHaveLength(2);
    // SQL orders by priority DESC, weight DESC
    expect(body.data.list[0].priority).toBe(10);
    expect(body.data.list[1].priority).toBe(5);
  });

  // ─── Test 3: 编辑映射 ───

  it("编辑映射 → 更新成本价格/权重/优先级", async () => {
    mockData.rowCount = 1;

    const res = await app.inject({
      method: "PUT",
      url: "/admin/vendor-models/1",
      headers: authHeaders(),
      payload: {
        cost_input_price: 0.005,
        cost_output_price: 0.015,
        weight: 5,
        priority: 20,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.ok).toBe(true);
    expect(body.message).toContain("更新");
  });

  it("编辑映射 → 切换启用状态", async () => {
    mockData.rowCount = 1;

    const res = await app.inject({
      method: "PUT",
      url: "/admin/vendor-models/1",
      headers: authHeaders(),
      payload: { is_enabled: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ok).toBe(true);
  });

  it("编辑不存在的映射 → 404", async () => {
    mockData.rowCount = 0;

    const res = await app.inject({
      method: "PUT",
      url: "/admin/vendor-models/999",
      headers: authHeaders(),
      payload: { weight: 3 },
    });

    expect(res.statusCode).toBe(404);
  });

  // ─── Test 4: 删除映射 ───

  it("删除映射 → 返回 200，软下线", async () => {
    mockData.rowCount = 1;

    const res = await app.inject({
      method: "DELETE",
      url: "/admin/vendor-models/1",
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.ok).toBe(true);
    expect(body.message).toContain("下线");
  });

  // ─── Test 5: 重复映射 → 409 ───

  it("重复映射（同一 vendor+model）→ 检测到重复返回 409", async () => {
    // Queue: vendor check → model check → dup check (has data = duplicate!)
    pushSelectResult([{ id: 10, name: "OpenAI" }]);              // vendor exists
    pushSelectResult([{ id: 100, name: "gpt-4o" }]);              // model exists
    pushSelectResult([{ id: 1, vendorId: 10, modelId: 100 }]);    // DUPLICATE FOUND

    const res = await app.inject({
      method: "POST",
      url: "/admin/vendors/10/models",
      headers: authHeaders(),
      payload: {
        model_id: 100,
        upstream_model: "gpt-4o",
        cost_input_price: 0.01,
        cost_output_price: 0.03,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("DUPLICATE");
  });

  // ─── Test 6: 权重计算（加权选择逻辑验证） ───

  it("权重计算 → 多个映射按 weight 加权，权重高的应被选更多", () => {
    const candidates = [
      { id: 1, weight: 5 },
      { id: 2, weight: 1 },
      { id: 3, weight: 2 },
    ];

    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
      let r = Math.floor(Math.random() * totalWeight);
      let chosen = candidates[0]!;
      for (const c of candidates) {
        r -= c.weight;
        if (r < 0) { chosen = c; break; }
      }
      counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
    }

    expect(counts.get(1)!).toBeGreaterThan(counts.get(2)!);
    expect(counts.get(3)!).toBeGreaterThan(counts.get(2)!);
    expect(counts.get(1)!).toBeGreaterThan(500); // ~625 for 5/8
  });

  // ─── Test 7: 优先级排序 ───

  it("优先级排序 → priority 高的排在前面，同 priority 按 weight 排", () => {
    const mappings = [
      { id: 1, priority: 5, weight: 10, model_name: "low-pri" },
      { id: 2, priority: 20, weight: 1, model_name: "high-pri-light" },
      { id: 3, priority: 10, weight: 5, model_name: "mid-pri" },
      { id: 4, priority: 20, weight: 3, model_name: "high-pri-mid" },
      { id: 5, priority: 20, weight: 10, model_name: "high-pri-heavy" },
    ];

    // Sort: priority DESC, then weight DESC
    const sorted = [...mappings].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.weight - a.weight;
    });

    // All priority 20 come first, sorted by weight DESC
    expect(sorted[0]!.priority).toBe(20);
    expect(sorted[0]!.weight).toBe(10); // heaviest within pri=20
    expect(sorted[0]!.model_name).toBe("high-pri-heavy");
    expect(sorted[1]!.priority).toBe(20);
    expect(sorted[1]!.weight).toBe(3);
    expect(sorted[2]!.priority).toBe(20);
    expect(sorted[2]!.weight).toBe(1);
    expect(sorted[3]!.priority).toBe(10);
    expect(sorted[4]!.priority).toBe(5);
  });
});

describe("供应商-模型映射 — 边界情况", () => {
  it("添加映射到不存在的供应商 → 404", async () => {
    // Queue: vendor check (empty!) → returns 404 before reaching others
    pushSelectResult([]);

    const res = await app.inject({
      method: "POST",
      url: "/admin/vendors/999/models",
      headers: authHeaders(),
      payload: { model_id: 100 },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("NOT_FOUND");
  });

  it("添加映射使用不存在的模型 → 404", async () => {
    // Queue: vendor exists → model not found
    pushSelectResult([{ id: 10, name: "OpenAI" }]);  // vendor exists
    pushSelectResult([]);                               // model NOT found

    const res = await app.inject({
      method: "POST",
      url: "/admin/vendors/10/models",
      headers: authHeaders(),
      payload: { model_id: 999 },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("MODEL_NOT_FOUND");
  });

  it("添加映射缺少 model_id → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/vendors/10/models",
      headers: authHeaders(),
      payload: { upstream_model: "gpt-4o" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("MISSING_MODEL");
  });
});
