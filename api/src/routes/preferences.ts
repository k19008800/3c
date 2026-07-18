// ============================================================
//  3cloud (3C) — 用户偏好路由
//  GET  /api/v1/preferences/:pageKey  — 获取某页筛选条件
//  PUT  /api/v1/preferences/:pageKey  — 保存某页筛选条件
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { AppError } from "../services/auth-service/index.js";
import {
  getPreferences,
  savePreferences,
} from "../services/preference-service.js";

export async function preferenceRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/preferences/:pageKey — 获取偏好
  // ──────────────────────────────────────────────

  app.get("/api/v1/preferences/:pageKey", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { pageKey } = request.params as { pageKey: string };

        // 防止恶意 pageKey
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(pageKey)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 pageKey" });
          return;
        }

        const filters = await getPreferences(request.user!.userId, pageKey);

        reply.status(200).send({
          code: 0,
          data: filters,
          message: "ok",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });

  // ──────────────────────────────────────────────
  //  PUT /api/v1/preferences/:pageKey — 保存偏好
  // ──────────────────────────────────────────────

  app.put("/api/v1/preferences/:pageKey", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      try {
        const { pageKey } = request.params as { pageKey: string };

        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(pageKey)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 pageKey" });
          return;
        }

        const { filters } = request.body as { filters: Record<string, any> };

        await savePreferences(request.user!.userId, pageKey, filters ?? {});

        reply.status(200).send({
          code: 0,
          data: null,
          message: "偏好已保存",
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
          return;
        }
        throw err;
      }
    },
  });
}
