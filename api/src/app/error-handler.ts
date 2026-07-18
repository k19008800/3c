// ============================================================
//  3cloud (3C) — Global Error Handler & Not Found
// ============================================================

import type { FastifyInstance } from "fastify";
import { registerErrorHandler } from "../middleware/response.js";

export function setupErrorHandler(app: FastifyInstance): void {
  // 全局错误处理（在所有路由之前注册）
  registerErrorHandler(app);
}
