// ============================================================
//  3cloud (3C) — 实时活动流 WebSocket 路由
//  端点: GET /ws/activity
//  实时推送用户最新的 API 调用记录
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../middleware/auth.js";
import { subscribeToActivity, unsubscribeFromActivity, pushActivityEvent } from "../../services/activity-push-service.js";

// 心跳间隔（秒）
const HEARTBEAT_INTERVAL = 30;
// 连接超时（秒）
const CONNECTION_TIMEOUT = 300;
// 最大缓存事件数
const MAX_CACHED_EVENTS = 50;

export async function activityWsRoutes(app: FastifyInstance) {
  app.get("/ws/activity", {
    websocket: true,
    preHandler: [authenticateJWT]
  }, (socket, req) => {
    const userId = (req as any).user!.userId;
    let closed = false;
    let heartbeatTimer: NodeJS.Timeout;
    let timeoutTimer: NodeJS.Timeout;
    let paused = false;
    const eventQueue: ActivityEvent[] = [];

    // 发送初始连接确认
    socket.send(JSON.stringify({
      type: "connected",
      userId,
      timestamp: new Date().toISOString(),
      message: "活动流 WebSocket 连接已建立"
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

    // 注册推送回调
    subscribeToActivity(userId, (event) => {
      if (closed) return;
      
      if (paused) {
        // 暂停时加入队列
        if (eventQueue.length >= MAX_CACHED_EVENTS) {
          eventQueue.shift(); // 移除最旧的
        }
        eventQueue.push(event);
      } else {
        // 直接推送
        socket.send(JSON.stringify({
          type: "activity",
          data: event,
          timestamp: new Date().toISOString()
        }));
      }
    });

    // 消息处理
    socket.on("message", async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.action) {
          case "pause":
            // 暂停实时更新
            paused = true;
            socket.send(JSON.stringify({
              type: "paused",
              timestamp: new Date().toISOString()
            }));
            break;

          case "resume":
            // 恢复实时更新，发送队列中的事件
            paused = false;
            if (eventQueue.length > 0) {
              socket.send(JSON.stringify({
                type: "queued_events",
                data: eventQueue.splice(0), // 清空队列并返回
                timestamp: new Date().toISOString()
              }));
            }
            socket.send(JSON.stringify({
              type: "resumed",
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
        console.error("[ActivityWS] Message handling error:", err);
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
      unsubscribeFromActivity(userId);
    });

    socket.on("error", (err: Error) => {
      console.error("[ActivityWS] Socket error:", err);
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      unsubscribeFromActivity(userId);
    });
  });
}

// 导出推送函数供其他模块使用
export { pushActivityEvent };

// 类型定义
export interface ActivityEvent {
  id: string;
  timestamp: Date;
  model: string;
  status: 'success' | 'error';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  keyName?: string;
}
