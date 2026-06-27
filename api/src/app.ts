// ============================================================
//  3cloud (3C) — Fastify Application
// ============================================================

import Fastify from "fastify";
import { config } from "./config.js";
import { createDb, closeDb } from "./db/index.js";
import { createRedis, getRedis, checkRedisConnection } from "./redis.js";
import { checkDbConnection } from "./db/index.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { apiKeyRoutes } from "./routes/api-keys.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.log.level,
      transport: config.isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── CORS ──
  await app.register(import("@fastify/cors"), {
    origin: config.cors.origin,
    credentials: true,
  });

  // ── 健康检查 ──
  await app.register(healthRoutes, { prefix: "" });

  // ── 钩子：请求日志 ──
  app.addHook("onRequest", async (request) => {
    request.log.info({ url: request.url, method: request.method }, "incoming request");
  });

  // ── Auth 路由 ──
  await app.register(authRoutes, { prefix: "" });

  // ── API Key 管理 ──
  await app.register(apiKeyRoutes, { prefix: "" });

  return app;
}

export async function startServer() {
  const app = await buildApp();

  // 初始化数据库
  createDb();
  createRedis();

  // 启动
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(`\n  🚀 3cloud API 已启动`);
    console.log(`  📡 http://${config.server.host}:${config.server.port}`);
    console.log(`  🏥 http://localhost:${config.server.port}/health`);
    console.log(`  ✅ http://localhost:${config.server.port}/ready\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
