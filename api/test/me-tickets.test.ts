import { vi, describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

// ── Hoisted mock state ──
const { mockDbResult, mockPoolQuery } = vi.hoisted(() => ({
  mockDbResult: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

// ── Mock db ──
vi.mock("../src/db/index", () => {
  const chain: any = {
    then(resolve: any) {
      return resolve(mockDbResult());
    },
    catch(reject: any) {
      return reject(undefined);
    },
  };
  ["select", "from", "where", "limit", "orderBy", "offset", "returning", "insert", "values", "update", "set"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return {
    db: chain,
    pool: { query: mockPoolQuery, connect: vi.fn(), end: vi.fn() },
  };
});

// ── Mock ticket services ──
vi.mock("../src/services/ticket", () => ({
  nextTicketNo: vi.fn().mockResolvedValue("TS20260808-0001"),
  logTicketOp: vi.fn().mockResolvedValue(undefined),
  isDuplicateTicket: vi.fn().mockResolvedValue(false),
}));

// ── Import routes after mock ──
import { meTicketsRoutes } from "../src/routes/me-tickets";

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-tk" });
  await a.register(meTicketsRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

let app: any;
let token: string;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildTestApp();
  token = app.jwt.sign({ sub: "42", email: "test@example.com" });
});

describe("工单用户端", () => {
  const mockTicket = {
    id: 1,
    ticket_no: "TS20260808-0001",
    user_id: 42,
    title: "测试工单",
    category: "billing",
    priority: "normal",
    status: "pending",
    description: "测试描述",
    attachments: null,
    assignee_id: null,
    tags: null,
    source: "user",
    first_response_at: null,
    resolved_at: null,
    closed_at: null,
    closed_by: null,
    is_spam: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockReply = {
    id: 1,
    ticket_id: 1,
    user_id: 42,
    is_staff: false,
    content: "回复内容",
    attachments: null,
    created_at: new Date().toISOString(),
  };

  it("POST /me/tickets 创建工单成功", async () => {
    mockDbResult.mockReturnValue([{ id: 1, ticket_no: "TS20260808-0001" }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "测试工单", description: "问题描述", category: "billing", priority: "normal" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.ticket_no).toBe("TS20260808-0001");
  });

  it("POST /me/tickets 缺少标题", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets",
      headers: { authorization: `Bearer ${token}` },
      payload: { description: "描述" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/tickets 无效分类", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets",
      headers: { authorization: `Bearer ${token}` },
      payload: { title: "test", description: "desc", category: "invalid_cat" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /me/tickets 返回工单列表", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, ticket_no: "TS001", title: "t", category: "billing", priority: "normal", status: "pending", created_at: new Date().toISOString(), unread: 0 }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ c: 1 }] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/tickets",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toHaveLength(1);
  });

  it("GET /me/tickets/:id 返回工单详情", async () => {
    mockDbResult.mockReturnValueOnce([mockTicket]); // ticket
    mockDbResult.mockReturnValueOnce([mockReply]);  // replies
    mockDbResult.mockReturnValueOnce([]);            // satisfaction
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/tickets/1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.ticket).toBeDefined();
    expect(body.data.replies).toHaveLength(1);
  });

  it("GET /me/tickets/:id/messages 返回消息列表", async () => {
    mockDbResult.mockReturnValueOnce([mockTicket]); // ticket
    mockDbResult.mockReturnValueOnce([mockReply]);  // replies
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/tickets/1/messages",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.messages).toHaveLength(1);
  });

  it("GET /me/tickets/:id/messages 工单不存在", async () => {
    mockDbResult.mockReturnValueOnce([]);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/tickets/999/messages",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /me/tickets/:id/reply 回复工单", async () => {
    mockDbResult.mockReturnValueOnce([mockTicket]); // ticket
    mockDbResult.mockReturnValueOnce([]);            // insert reply
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets/1/reply",
      headers: { authorization: `Bearer ${token}` },
      payload: { content: "回复内容" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /me/tickets/:id/reply 缺少内容", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets/1/reply",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/tickets/:id/close 关闭工单", async () => {
    mockDbResult.mockReturnValueOnce([mockTicket]); // ticket
    mockDbResult.mockReturnValueOnce({ rowCount: 1 }); // update
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/tickets/1/close",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("无 token 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/tickets" });
    expect(res.statusCode).toBe(401);
  });
});
