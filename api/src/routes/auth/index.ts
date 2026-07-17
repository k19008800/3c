// ============================================================
//  3cloud (3C) — 认证路由入口
//  注册所有认证子路由
// ============================================================

import { FastifyInstance } from "fastify";

import { authLoginRoutes } from "./login.js";
import { authRegisterRoutes } from "./register.js";
import { authOAuthRoutes } from "./oauth.js";
import { authResetRoutes } from "./reset.js";
import { authRealNameRoutes } from "./realname.js";

export async function authRoutes(app: FastifyInstance) {
  await authLoginRoutes(app);
  await authRegisterRoutes(app);
  await authOAuthRoutes(app);
  await authResetRoutes(app);
  await authRealNameRoutes(app);
}
