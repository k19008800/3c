// ============================================================
//  3cloud (3C) — 告警WebSocket实时推送路由
//  端点: GET /ws/alerts
//  实时推送用户告警，支持订阅过滤和心跳保持
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { getUserAlerts, acknowledgeAlert } from "../services/alert-service.js";
import { subscribeToAlerts, unsubscribeFromAlerts } from "../services/alert-push-service.js";

// 心跳间隔（秒）
const HEARTBEAT_INTERVAL = 30;
// 连接超时（秒）
const CONNECTION_TIMEOUT = 300;

export async function alertWsRoutes(app: FastifyInstance) {
  // WebSocket 已在 plugins.ts 中注册
  // await app.register(import("@fastify/websocket"));

  app.get("/ws/alerts", { 
    websocket: true,
    preHandler: [authenticateJWT]
  }, (socket, req) => {
    const userId = (req as any).user!.userId;
    let closed = false;
    let heartbeatTimer: NodeJS.Timeout;
    let timeoutTimer: NodeJS.Timeout;
    
    // 用户订阅的告警类型
    const subscribedTypes = new Set<string>();

    // 发送初始连接确认
    socket.send(JSON.stringify({
      type: "connected",
      userId,
      timestamp: new Date().toISOString(),
      message: "告警WebSocket连接已建立"
    }));

    // 心跳机制
    heartbeatTimer = setInterval(() => {
      if (!closed) {
        socket.send(JSON.stringify({
          type: "heartbeat",
          timestamp: new Date().toISOString()
        }));
      }
    }, HEARTBEAT_INTERVAL * 1000);

    // 连接超时处理
    timeoutTimer = setTimeout(() => {
      if (!closed) {
        socket.close(1000, "Connection timeout");
      }
    }, CONNECTION_TIMEOUT * 1000);

    // 消息处理
    socket.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.action) {
          case "subscribe":
            // 订阅特定类型的告警
            const types = data.types || [];
            subscribedTypes.clear();
            types.forEach((type: string) => subscribedTypes.add(type));
            
            // 注册推送回调
            subscribeToAlerts(userId, subscribedTypes, (alertMessage) => {
              if (!closed) {
                socket.send(JSON.stringify(alertMessage));
              }
            });
            
            socket.send(JSON.stringify({
              type: "subscribed",
              subscribedTypes: Array.from(subscribedTypes),
              timestamp: new Date().toISOString()
            }));
            break;
            
          case "unsubscribe":
            unsubscribeFromAlerts(userId);
            subscribedTypes.clear();
            socket.send(JSON.stringify({
              type: "unsubscribed",
              timestamp: new Date().toISOString()
            }));
            break;
            
          case "get_alerts":
            // 获取当前告警
            const alertsData = await getUserAlerts(userId);
            socket.send(JSON.stringify({
              type: "alerts",
              data: alertsData,
              timestamp: new Date().toISOString()
            }));
            break;
            
          case "acknowledge":
            // 确认告警
            const { alertId, action } = data;
            const success = await acknowledgeAlert(userId, alertId, action);
            socket.send(JSON.stringify({
              type: "acknowledged",
              alertId,
              action,
              success,
              timestamp: new Date().toISOString()
            }));
            break;
            
          case "heartbeat":
            // 重置超时计时器
            clearTimeout(timeoutTimer);
            timeoutTimer = setTimeout(() => {
              if (!closed) {
                socket.close(1000, "Connection timeout");
              }
            }, CONNECTION_TIMEOUT * 1000);
            break;
            
          default:
            socket.send(JSON.stringify({
              type: "error",
              message: `Unknown action: ${data.action}`
            }));
        }
      } catch (err: any) {
        console.error("[AlertWS] Message handling error:", err);
        socket.send(JSON.stringify({
          type: "error",
          message: err?.message || "Invalid message format"
        }));
      }
    });

    // 连接关闭处理
    socket.on("close", () => {
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      unsubscribeFromAlerts(userId);
    });

    socket.on("error", (err) => {
      console.error("[AlertWS] Socket error:", err);
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      unsubscribeFromAlerts(userId);
    });
  });
}