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
  ["select", "from", "where", "limit", "orderBy", "offset", "returning", "insert", "values", "update", "set", "delete"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return {
    db: chain,
    pool: { query: mockPoolQuery, connect: vi.fn(), end: vi.fn() },
  };
});

// ── Import routes after mock ──
import { meTeamRoutes } from "../src/routes/me-team";

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-tm" });
  await a.register(meTeamRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

let app: any;
let token: string;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildTestApp();
  token = app.jwt.sign({ sub: "42", email: "owner@example.com" });
});

describe("团队管理", () => {
  const mockMember = {
    id: 1,
    team_owner_id: 42,
    user_id: 99,
    role: "member",
    status: "active",
    invited_at: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    email: "member@test.com",
    username: "testmember",
  };

  it("GET /me/team/members 返回成员列表", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [mockMember] });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/team/members",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0].role_label).toBe("成员");
  });

  it("POST /me/team/invite 邀请成员成功", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // find user
    mockDbResult.mockReturnValueOnce([]);                          // check not exist
    mockDbResult.mockReturnValueOnce([{ id: 1 }]);                // insert returning
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "member@test.com", role: "member" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
    expect(body.data.email).toBe("member@test.com");
  });

  it("POST /me/team/invite 缺少邮箱", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/team/invite 用户不存在", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "nobody@test.com" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /me/team/invite 不能邀请自己", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "owner@example.com" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /me/team/invite 已是成员", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    mockDbResult.mockReturnValueOnce([mockMember]); // already exists
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "member@test.com" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST /me/team/invite 无效角色", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/me/team/invite",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "member@test.com", role: "superadmin" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /me/team/members/:id/role 修改角色", async () => {
    mockDbResult.mockReturnValueOnce({ rowCount: 1 }); // update
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/team/members/1/role",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "admin" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(0);
  });

  it("PUT /me/team/members/:id/role 不能设为 owner", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/team/members/1/role",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "owner" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /me/team/members/:id/role 成员不存在", async () => {
    mockDbResult.mockReturnValueOnce({ rowCount: 0 });
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/team/members/999/role",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "member" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /me/team/members/:id 移除成员", async () => {
    mockDbResult.mockReturnValue({ rowCount: 1 }); // delete
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/me/team/members/1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /me/team/members/:id 成员不存在", async () => {
    mockDbResult.mockReturnValue({ rowCount: 0 });
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/me/team/members/999",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("无 token 返回 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/team/members" });
    expect(res.statusCode).toBe(401);
  });
});
