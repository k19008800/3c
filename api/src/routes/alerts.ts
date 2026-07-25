// ============================================================
//  3cloud (3C) — 用户端异常告警路由
//  GET /api/v1/me/alerts           — 获取告警中心数据
//  POST /api/v1/me/alerts/acknowledge — 确认/忽略告警
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { getUserAlerts, acknowledgeAlert } from "../services/alert-service.js";

export async function alertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/alerts — 获取告警中心数据
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/alerts", async (request, reply) => {
    const userId = request.user!.userId;

    try {
      const alertData = await getUserAlerts(userId);

      reply.send({
        code: 0,
        data: alertData,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取告警数据失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/me/alerts/acknowledge — 确认/忽略告警
  //  Body: { alertId: string, action: 'acknowledge' | 'ignore' }
  // ──────────────────────────────────────────────

  app.post("/api/v1/me/alerts/acknowledge", async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      alertId: string;
      action: "acknowledge" | "ignore";
    };

    if (!body.alertId || !body.action) {
      reply.status(400).send({
        code: 1,
        message: "缺少必要参数: alertId 或 action",
      });
      return;
    }

    if (body.action !== "acknowledge" && body.action !== "ignore") {
      reply.status(400).send({
        code: 1,
        message: "action 必须是 acknowledge 或 ignore",
      });
      return;
    }

    try {
      const success = await acknowledgeAlert(userId, body.alertId, body.action);

      if (success) {
        reply.send({
          code: 0,
          data: { alertId: body.alertId, action: body.action },
          message: "操作成功",
        });
      } else {
        reply.status(404).send({
          code: 1,
          message: "告警不存在或无权操作",
        });
      }
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `操作失败: ${err.message}`,
      });
    }
  });
}
