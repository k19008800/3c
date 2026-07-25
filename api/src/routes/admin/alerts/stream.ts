// ============================================================
//  3cloud (3C) — 管理后台告警实时推送 WebSocket 端点
//  GET /api/v1/admin/alerts/stream — WebSocket 实时告警流
// ============================================================

import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { authenticateJWT } from "../../../middleware/auth.js";
import { subscribeToAlerts, unsubscribeFromAlerts, AlertPushMessage } from "../../../services/alert-push-service.js";

// ── WebSocket 消息类型 ──

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  alertTypes?: string[];  // 订阅的告警类型
}

// ── 连接状态 ──

interface ClientState {
  userId: number;
  subscribedTypes: Set<string>;
  lastPing: number;
}

// ── WebSocket 路由 ──

export async function adminAlertStreamRoutes(app: FastifyInstance) {
  // ── WebSocket 升级处理 ──
  app.get("/api/v1/admin/alerts/stream", { websocket: true }, async (connection, request) => {
    const ws = connection.socket;
    const user = request.user;

    if (!user) {
      ws.send(JSON.stringify({ type: "error", message: "未授权" }));
      ws.close();
      return;
    }

    const state: ClientState = {
      userId: user.userId,
      subscribedTypes: new Set(),
      lastPing: Date.now(),
    };

    // ── 推送回调 ──
    const pushCallback = (message: AlertPushMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    // ── 消息处理 ──
    ws.on("message", (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "subscribe":
            // 订阅告警类型
            if (msg.alertTypes && Array.isArray(msg.alertTypes)) {
              msg.alertTypes.forEach(t => state.subscribedTypes.add(t));
              subscribeToAlerts(state.userId, state.subscribedTypes, pushCallback);
              ws.send(JSON.stringify({ type: "subscribed", alertTypes: Array.from(state.subscribedTypes) }));
            }
            break;

          case "unsubscribe":
            // 取消订阅
            if (msg.alertTypes && Array.isArray(msg.alertTypes)) {
              msg.alertTypes.forEach(t => state.subscribedTypes.delete(t));
              if (state.subscribedTypes.size === 0) {
                unsubscribeFromAlerts(state.userId);
              }
              ws.send(JSON.stringify({ type: "unsubscribed", alertTypes: Array.from(state.subscribedTypes) }));
            }
            break;

          case "ping":
            // 心跳响应
            state.lastPing = Date.now();
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;

          default:
            ws.send(JSON.stringify({ type: "error", message: "未知消息类型" }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: "消息解析失败" }));
      }
    });

    // ── 连接关闭 ──
    ws.on("close", () => {
      unsubscribeFromAlerts(state.userId);
    });

    // ── 初始连接成功 ──
    ws.send(JSON.stringify({
      type: "connected",
      userId: state.userId,
      message: "WebSocket 连接成功，请发送 subscribe 消息订阅告警",
    }));
  });
}

// ── 带鉴权的路由注册 ──

export async function adminAlertStreamRoutesProtected(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  await adminAlertStreamRoutes(app);
}
