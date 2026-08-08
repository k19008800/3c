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

// ── Import routes after mock ──
import { realNameRoutes } from "../src/routes/real-name";

// ── Build minimal test app ──
async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-rn" });
  await a.register(realNameRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

let app: any;
let userToken: string;
let adminToken: string;

const mockUser = {
  id: 1,
  email: "user@test.com",
  username: "testuser",
  realNameStatus: "unverified",
};

const mockAdminUser = {
  id: 99,
  email: "admin@test.com",
  role: "admin",
};

const mockPendingRecord = {
  id: 10,
  userId: 1,
  type: "individual",
  realName: "张三",
  idNumber: "110101199001011234",
  phone: "13800138000",
  legalPerson: null,
  companyAddress: null,
  status: "pending_review",
  reviewerId: null,
  reviewedAt: null,
  rejectReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockApprovedRecord = {
  ...mockPendingRecord,
  realName: "欧阳修大书法家",
  idNumber: "110101199001011234",
  status: "approved",
  reviewerId: 99,
  reviewedAt: new Date(),
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockDbResult.mockReset();
  mockDbResult.mockResolvedValue([]);
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [] });

  app = await buildTestApp();
  userToken = app.jwt.sign({ sub: "1", role: "user" });
  adminToken = app.jwt.sign({ sub: "99", role: "admin" });
});

// ═══════════════════════════════════════════════════════════════════
describe("real-name", () => {

  // ── My real-name status ──
  describe("获取我的实名状态", () => {
    it("应返回 unverified 状态（无记录）", async () => {
      // users query
      mockDbResult.mockResolvedValueOnce([mockUser]);
      // real_name_records query — empty
      mockDbResult.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/real-name",
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.status).toBe("unverified");
      expect(body.data.status_label).toBe("未认证");
    });

    it("应返回已认证状态", async () => {
      mockDbResult.mockResolvedValueOnce([{ ...mockUser, realNameStatus: "approved" }]);
      mockDbResult.mockResolvedValueOnce([mockApprovedRecord]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/real-name",
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe("approved");
      // 姓名应脱敏（name > 6 chars → maskId applies: 张***喜）
      expect(body.data.real_name).toContain("********");
    });
  });

  // ── Submit real-name ──
  describe("提交实名认证", () => {
    it("应提交成功 → 201 + status=pending_review", async () => {
      // 检查现有记录 → 无
      mockDbResult.mockResolvedValueOnce([]);
      // insert real_name_records
      mockDbResult.mockResolvedValueOnce([mockPendingRecord]);
      // update users.real_name_status
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/me/real-name",
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          type: "individual",
          real_name: "张三",
          id_number: "110101199001011234",
          phone: "13800138000",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.status).toBe("pending_review");
      expect(body.data.status_label).toBe("待审核");
    });

    it("应已认证用户再次提交 → 400（EXISTS）", async () => {
      // 已有 approved 记录（使用旧真实姓名以匹配 EXIST 检查）
      mockDbResult.mockResolvedValueOnce([{ ...mockApprovedRecord, realName: "张三", idNumber: "110101199001011234" }]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/me/real-name",
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          type: "individual",
          real_name: "李四",
          id_number: "110101199501012345",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("EXISTS");
    });

    it("应已驳回用户重新提交 → 更新为 pending_review", async () => {
      const rejectedRecord = { ...mockPendingRecord, status: "rejected" };
      // 已有 rejected 记录 → 走更新分支
      mockDbResult.mockResolvedValueOnce([rejectedRecord]);
      // update real_name_records
      mockDbResult.mockResolvedValueOnce([mockPendingRecord]);
      // update users.real_name_status
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/me/real-name",
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          type: "individual",
          real_name: "张三",
          id_number: "110101199001011234",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe("pending_review");
    });
  });

  // ── Admin: review list ──
  describe("管理端审核列表", () => {
    it("应返回分页列表 + 按状态筛选", async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [{ id: 10, user_id: 1, real_name: "张三", id_number: "110101********1234", status: "pending_review", email: "user@test.com", username: "testuser" }],
        })
        .mockResolvedValueOnce({
          rows: [{ total: 1 }],
        });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/real-name?status=pending_review&page=1&page_size=10",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.list).toHaveLength(1);
      expect(body.data.pagination.total).toBe(1);
      // 身份证应脱敏
      expect(body.data.list[0].id_number).toContain("********");
    });

    it("应非管理员访问 → 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/real-name",
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toBe("FORBIDDEN");
    });
  });

  // ── Admin: review (approve/reject) ──
  describe("管理端审核", () => {
    it("应审核通过 → status=verified", async () => {
      // Find record
      mockDbResult.mockResolvedValueOnce([mockPendingRecord]);
      // Update record
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });
      // Update users
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/10/review",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: "approve" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.status).toBe("approved");
      expect(body.data.ok).toBe(true);
    });

    it("应审核拒绝 → status=rejected + 原因", async () => {
      // Find record
      mockDbResult.mockResolvedValueOnce([mockPendingRecord]);
      // Update record
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });
      // Update users
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/10/review",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: "reject", reason: "证件照片不清晰" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.status).toBe("rejected");
      expect(body.message).toContain("驳回");
    });

    it("应无效 action → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/10/review",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: "invalid_action" },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("BAD_ACTION");
    });

    it("应记录不存在 → 404", async () => {
      mockDbResult.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/9999/review",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: "approve" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Admin: direct confirm ──
  describe("管理端直接确认", () => {
    it("应直接确认用户实名（绕过申请）", async () => {
      // Find user
      mockDbResult.mockResolvedValueOnce([mockUser]);
      // Update users.realNameStatus = approved
      mockDbResult.mockResolvedValueOnce({ rowCount: 1 });
      // Check existing real_name_records → none
      mockDbResult.mockResolvedValueOnce([]);
      // Insert real_name_records
      mockDbResult.mockResolvedValueOnce([{ id: 100 }]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/1/confirm",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.status).toBe("approved");
    });

    it("应用户不存在 → 404", async () => {
      mockDbResult.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/real-name/9999/confirm",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── Auth checks ──
  describe("认证检查", () => {
    it("应无 token 访问实名接口 → 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/real-name",
      });
      expect(res.statusCode).toBe(401);
    });

    it("应非管理员无法访问管理接口 → 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/real-name",
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
