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

// ── Mock invoice-pdf service ──
vi.mock("../src/services/invoice-pdf", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));

// ── Import routes after mock ──
import { invoiceRoutes } from "../src/routes/invoice";

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-inv" });
  await a.register(invoiceRoutes, { prefix: "/api/v1" });
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

describe("发票用户端", () => {
  const mockInvoice = {
    id: 1,
    user_id: 42,
    invoice_no: "INV001",
    amount: "100.00",
    tax_rate: "13",
    tax_amount: "13.00",
    total_amount: "113.00",
    type: "ordinary",
    status: "issued",
    title: "测试公司",
    tax_no: null,
    address: null,
    bank_account: null,
    email: null,
    remark: null,
    reject_reason: null,
    issued_by: null,
    issued_at: null,
    voided_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("GET /invoices 返回发票列表", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockInvoice] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.list).toHaveLength(1);
  });

  it("POST /invoices 申请发票成功", async () => {
    // consumed + applied
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 500 }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 100 }] });
    // insert returning id
    mockDbResult.mockReturnValue([{ id: 1 }]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 100, title: "测试公司", email: "test@x.com" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(1);
  });

  it("POST /invoices 金额无效", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: -1, title: "test" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /invoices 缺少抬头", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 100, title: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /invoices 专票缺税号", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 100, title: "test", type: "special" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /invoices 额度不足", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 50 }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 50 }] });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/invoices",
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 100, title: "test" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /invoices/:id/pdf 下载 PDF", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockInvoice] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ email: "test@x.com", username: "tester" }] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/invoices/1/pdf",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
  });

  it("GET /invoices/:id/pdf 发票不存在", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/invoices/999/pdf",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /invoices/quota 返回额度信息", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 500 }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: 100 }] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/invoices/quota",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.available).toBe(400);
  });

  it("无 token 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/invoices" });
    expect(res.statusCode).toBe(401);
  });
});
