// ============================================================
//  3cloud (3C) — 共享日志器
//  Service 层使用，路由层使用 app.log（Fastify 内建 pino）
// ============================================================

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
