// ============================================================
//  3cloud (3C) — 用户管理路由（管理员）
//  GET    /api/v1/admin/users              — 用户列表
//  GET    /api/v1/admin/users/export       — 导出用户
//  POST   /api/v1/admin/users             — 创建用户
//  GET    /api/v1/admin/users/:id          — 用户详情
//  PATCH  /api/v1/admin/users/:id          — 更新用户
//  DELETE /api/v1/admin/users/:id          — 删除用户
//  POST   /api/v1/admin/users/:id/recharge — 手动调余额
//  POST   /api/v1/admin/users/:id/reset-pwd — 重置密码
//  POST   /api/v1/admin/users/:id/change-role — 变更角色
//  POST   /api/v1/admin/users/batch/*      — 批量禁用/启用
//  POST   /api/v1/admin/users/impersonate  — 模拟登录
//  GET    /api/v1/admin/users/:id/*        — 审计/余额/登录/备注/白名单/调用等
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../middleware/auth.js";
import { listRoutes } from "./list.js";
import { detailRoutes } from "./detail.js";
import { mutationsRoutes } from "./mutations.js";
import { roleRoutes } from "./role.js";
import { actionsRoutes } from "./actions.js";
import { statsRoutes } from "./stats.js";

export async function adminUserRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  await app.register(listRoutes, { prefix: "" });
  await app.register(detailRoutes, { prefix: "" });
  await app.register(mutationsRoutes, { prefix: "" });
  await app.register(roleRoutes, { prefix: "" });
  await app.register(actionsRoutes, { prefix: "" });
  await app.register(statsRoutes, { prefix: "" });
}
