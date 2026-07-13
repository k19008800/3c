// ============================================================
//  3cloud (3C) — Admin Dashboard 共享辅助函数
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

/**
 * 为路由组注册统一的 authenticateJWT preHandler
 */
export function withAuth(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
}
