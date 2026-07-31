import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";
import { redis } from "../lib/redis";

/**
 * 健康检查路由
 * 返回 API 进程、DB、Redis 三方状态
 */
export function healthRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["ok"] },
              db: { type: "string", enum: ["up", "down"] },
              redis: { type: "string", enum: ["up", "down"] },
              uptime: { type: "number" },
            },
          },
        },
      },
    },
    async () => {
      let db = "down";
      let redisStatus = "down";
      try {
        await pool.query("SELECT 1");
        db = "up";
      } catch {
        /* db down */
      }
      try {
        await redis.ping();
        redisStatus = "up";
      } catch {
        /* redis down */
      }
      return {
        status: "ok",
        db,
        redis: redisStatus,
        uptime: process.uptime(),
      };
    },
  );
}
