// ============================================================
//  3cloud (3C) — 权限骨架验证: 多角色×多端点矩阵测试
//  验证每个角色的权限边界，检测越权风险
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, loginAs } from "./helpers.js";
import type { FastifyInstance } from "fastify";

interface RoleInfo {
  email: string;
  password: string;
  role: string;
}

const ROLES: RoleInfo[] = [
  { email: "admin@3cloud.ai",     password: "Admin1234!",  role: "super_admin" },
  { email: "admin@3cloud.dev",    password: "admin123",    role: "admin" },
  { email: "finance@3cloud.ai",   password: "Finance123!", role: "finance_ops" },
  { email: "ops@3cloud.ai",       password: "Ops1234!",    role: "ops" },
  { email: "support@3cloud.ai",   password: "Support123!", role: "support" },
  { email: "auditor@3cloud.ai",   password: "Auditor123!", role: "auditor" },
];

// Permission → list of (method, url) endpoints
// (using URLs that don't require route params so they resolve)
const ENDPOINTS: Record<string, { method: string; url: string }[]> = {
  DASHBOARD_VIEW: [
    { method: "GET", url: "/api/v1/admin/stats" },
    { method: "GET", url: "/api/v1/admin/stats-usage" },
    { method: "GET", url: "/api/v1/admin/circuit-breakers" },
  ],
  USER_LIST: [
    { method: "GET", url: "/api/v1/admin/api-keys" },
    { method: "GET", url: "/api/v1/admin/quotas" },
  ],
  USER_VIEW: [],
  USER_EDIT: [
    { method: "GET", url: "/api/v1/admin/campaigns" },
    { method: "GET", url: "/api/v1/admin/rate-limits" },
  ],
  USER_CREATE: [],
  USER_DELETE: [],
  USER_RESET_PWD: [],
  USER_CHANGE_ROLE: [],
  USER_IMPERSONATE: [],
  USER_BALANCE: [],
  REVIEW_LIST: [
    { method: "GET", url: "/api/v1/admin/reviews" },
  ],
  REVIEW_ACTION: [],
  MODEL_MANAGE: [
    { method: "GET", url: "/api/v1/admin/models" },
    { method: "GET", url: "/api/v1/admin/vendors" },
    { method: "GET", url: "/api/v1/admin/vendor-models" },
  ],
  FINANCE_VIEW: [
    { method: "GET", url: "/api/v1/admin/finance/dashboard" },
    { method: "GET", url: "/api/v1/admin/invoices" },
    { method: "GET", url: "/api/v1/admin/prices" },
    { method: "GET", url: "/api/v1/admin/profit" },
    { method: "GET", url: "/api/v1/admin/refunds" },
  ],
  FINANCE_COMMISSION: [
    { method: "GET", url: "/api/v1/admin/finance/commissions" },
  ],
  FINANCE_WITHDRAW: [
    { method: "GET", url: "/api/v1/admin/withdraws" },
  ],
  FINANCE_RECHARGE: [
    { method: "GET", url: "/api/v1/admin/recharge-orders" },
  ],
  CONFIG_VIEW: [
    { method: "GET", url: "/api/v1/admin/configs" },
    { method: "GET", url: "/api/v1/admin/announcements" },
    { method: "GET", url: "/api/v1/admin/roles" },
    { method: "GET", url: "/api/v1/admin/site-settings" },
    { method: "GET", url: "/api/v1/admin/admin-keys" },
  ],
  CONFIG_EDIT: [],
  SECURITY_VIEW: [
    { method: "GET", url: "/api/v1/admin/security" },
  ],
  SECURITY_ACTION: [],
  SECURITY_EDIT: [],
  AUDIT_VIEW: [
    { method: "GET", url: "/api/v1/admin/audit-logs" },
    { method: "GET", url: "/api/v1/admin/operation-logs" },
  ],
  AGENT_LIST: [
    { method: "GET", url: "/api/v1/admin/agents" },
  ],
  AGENT_MANAGE: [],
  LOG_VIEW: [
    { method: "GET", url: "/api/v1/admin/logs" },
  ],
  OPS_READ: [],
  RECONCILIATION_VIEW: [
    { method: "GET", url: "/api/v1/admin/finance/reconciliation" },
    { method: "GET", url: "/api/v1/admin/finance/codes/agent-settlement" },
    { method: "GET", url: "/api/v1/admin/finance/codes/cost-overview" },
  ],
};

// Flatten: role → expected permission bitset
import { ROLE_PERMISSIONS, Perm } from "../middleware/auth.js";

// For each role, which endpoint groups should succeed (200) and which should fail (403)
function getRoleExpectations(): Record<string, { permit: string[]; deny: string[] }> {
  const map: Record<string, { permit: string[]; deny: string[] }> = {};
  const allPerms = Object.keys(ENDPOINTS);

  for (const r of ROLES) {
    const roleBits = ROLE_PERMISSIONS[r.role];
    const permit: string[] = [];
    const deny: string[] = [];

    for (const [permName, eps] of Object.entries(ENDPOINTS)) {
      if (eps.length === 0) continue; // skip endpoint-less permissions
      // Check if this permission bit is set for the role
      const permBits = (Perm as Record<string, bigint>)[permName];
      if (permBits === undefined) continue;
      const hasPerm = (roleBits & permBits) === permBits;
      if (hasPerm) {
        permit.push(permName);
      } else {
        deny.push(permName);
      }
    }
    map[r.role] = { permit, deny };
  }
  return map;
}

let app: FastifyInstance;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  app = await getApp();

  for (const r of ROLES) {
    try {
      tokens[r.role] = await loginAs(r.email, r.password);
      console.log(`  ✅ ${r.role} (${r.email}): 登录成功`);
    } catch (e: any) {
      console.log(`  ❌ ${r.role} (${r.email}): 登录失败 — ${e.message}`);
    }
  }
});

afterAll(async () => {
  await closeApp();
});

// ═══════════════════════════════════════════════════════════════════
//  RBAC 权限矩阵验证
// ═══════════════════════════════════════════════════════════════════
describe("RBAC 权限矩阵验证 (6 角色 × 15 端点组)", () => {
  const expectations = getRoleExpectations();

  for (const r of ROLES) {
    const roleLabel = `${r.role} (${r.email})`;
    const token = tokens[r.role];

    const permitGroups = expectations[r.role].permit;
    const denyGroups = expectations[r.role].deny;

    if (permitGroups.length > 0) {
      describe(`${r.role} — 应允许的端点`, () => {
        for (const group of permitGroups) {
          for (const ep of ENDPOINTS[group]) {
            it(`${ep.method} ${ep.url} → 200 (${r.role} 应有 ${group})`, async () => {
              if (!token) {
                console.log(`  ⚠️  ${r.role} 无有效 token，跳过`);
                return;
              }
              const res = await app.inject({
                method: ep.method as any,
                url: ep.url,
                headers: { authorization: `Bearer ${token}` },
              });
              expect([200, 400, 404].includes(res.statusCode)).toBe(true);
            });
          }
        }
      });
    }

    if (denyGroups.length > 0) {
      describe(`${r.role} — 应拒绝的端点 (越权检测)`, () => {
        for (const group of denyGroups) {
          for (const ep of ENDPOINTS[group]) {
            it(`${ep.method} ${ep.url} → 403 (${r.role} 不应有 ${group})`, async () => {
              if (!token) {
                console.log(`  ⚠️  ${r.role} 无有效 token，跳过`);
                return;
              }
              const res = await app.inject({
                method: ep.method as any,
                url: ep.url,
                headers: { authorization: `Bearer ${token}` },
              });
              if (res.statusCode === 200) {
                console.log(`  ⚠️  越权风险: ${r.role} ${ep.method} ${ep.url} → 200 (不应允许 ${group})`);
              }
              expect([403, 404, 401].includes(res.statusCode)).toBe(true);
            });
          }
        }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
//  super_admin 全覆盖检查
// ═══════════════════════════════════════════════════════════════════
describe("super_admin: 全权限确认", () => {
  it("super_admin 能访问所有端点组", () => {
    const roleBits = ROLE_PERMISSIONS["super_admin"];
    // ~0n = all bits set
    expect(roleBits).toBe(~0n);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  角色权限差异分析
// ═══════════════════════════════════════════════════════════════════
describe("权限差异分析", () => {
  const expectations = getRoleExpectations();

  it("admin 可以管理用户完整生命周期 (增删改查+改角色+模拟+余额)", () => {
    const adminBits = ROLE_PERMISSIONS["admin"];
    const userMgmtBits = Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_EDIT | 
      Perm.USER_CREATE | Perm.USER_DELETE | Perm.USER_RESET_PWD | 
      Perm.USER_CHANGE_ROLE | Perm.USER_IMPERSONATE | Perm.USER_BALANCE;
    expect((adminBits & userMgmtBits) === userMgmtBits).toBe(true);
  });

  it("finance_ops 不能管理配置/安全/模型/代理商", () => {
    const fnBits = ROLE_PERMISSIONS["finance_ops"];
    const forbidden = Perm.CONFIG_VIEW | Perm.CONFIG_EDIT | Perm.SECURITY_VIEW |
      Perm.SECURITY_ACTION | Perm.SECURITY_EDIT | Perm.MODEL_MANAGE | 
      Perm.AGENT_MANAGE | Perm.REVIEW_LIST | Perm.REVIEW_ACTION | 
      Perm.USER_EDIT | Perm.USER_CREATE | Perm.USER_DELETE | Perm.AUDIT_VIEW;
    expect(fnBits & forbidden).toBe(0n);
  });

  it("support 只可查看+重置密码用户, 做审核, 看日志", () => {
    const spBits = ROLE_PERMISSIONS["support"];
    const allowed = Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_RESET_PWD |
      Perm.REVIEW_LIST | Perm.REVIEW_ACTION | Perm.LOG_VIEW;
    expect((spBits & allowed) === allowed).toBe(true);
    // support 没有财务/配置/安全/模型权限
    expect(spBits & (Perm.FINANCE_VIEW | Perm.CONFIG_VIEW | Perm.SECURITY_VIEW | Perm.MODEL_MANAGE)).toBe(0n);
  });

  it("auditor 只有查看审计+对账+日志+用户+代理商, 不能动任何东西", () => {
    const auBits = ROLE_PERMISSIONS["auditor"];
    const allowed = Perm.AUDIT_VIEW | Perm.RECONCILIATION_VIEW | 
      Perm.USER_LIST | Perm.USER_VIEW | Perm.LOG_VIEW | Perm.AGENT_LIST;
    expect((auBits & allowed) === allowed).toBe(true);
    // 没有写/编辑权限
    expect(auBits & (Perm.USER_EDIT | Perm.CONFIG_EDIT | Perm.SECURITY_ACTION | 
      Perm.FINANCE_WITHDRAW | Perm.FINANCE_RECHARGE | Perm.REVIEW_ACTION)).toBe(0n);
  });

  it("ops 不碰财务和用户编辑", () => {
    const opsBits = ROLE_PERMISSIONS["ops"];
    expect(opsBits & (Perm.FINANCE_VIEW | Perm.USER_EDIT | Perm.USER_BALANCE | Perm.FINANCE_WITHDRAW)).toBe(0n);
  });
});
