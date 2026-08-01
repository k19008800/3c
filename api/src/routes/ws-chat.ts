import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { pool } from "../db/index";
import { startUserChat, staffAcceptSession, closeSession, addMessage, sessionConnections, staffOnline } from "../services/chat-service";

/**
 * 在线客服 WebSocket 路由 对齐 SPEC-§27.1
 * /ws/chat        — 用户端
 * /ws/chat/staff  — 客服端
 */

function safeSend(ws: any, obj: any) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch { /* noop */ }
  }
}

export function wsChatRoutes(app: FastifyInstance) {
  // ============ 用户端 WS ============
  app.get(
    "/ws/chat",
    { websocket: true },
    (socket: WebSocket, req: any) => {
      // 从 query 校验 userId + JWT
      let userId: number | null = null;
      try {
        const q = (req.query ?? {}) as any;
        const token = String(q.token ?? "");
        const decoded = app.jwt.verify(token) as any;
        userId = Number(decoded.sub);
      } catch { socket.close(4001, "auth_failed"); return; }
      if (!userId) { socket.close(4001, "auth_failed"); return; }

      let currentSessionId: number | null = null;

      socket.on("message", async (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "start") {
            const r = await startUserChat(userId, msg.category);
            currentSessionId = r.sessionId;
            // 注册连接
            const conn = sessionConnections.get(r.sessionId) ?? {};
            conn.userWs = socket;
            sessionConnections.set(r.sessionId, conn);
            if (r.queued) {
              safeSend(socket, { type: "queued", session_id: r.sessionId, position: r.position, staff_online: false });
              // 写系统消息
              await addMessage(r.sessionId, userId, "system", "您已在排队中，客服上线后会第一时间回复。也可提交工单。");
            } else {
              safeSend(socket, { type: "connected", session_id: r.sessionId, staff: true });
              await addMessage(r.sessionId, userId, "system", "客服已接入，请问有什么可以帮助您？");
            }
          } else if (msg.type === "message" && currentSessionId) {
            const saved = await addMessage(currentSessionId, userId, "user", String(msg.content));
            // 转发给客服连接
            const conn = sessionConnections.get(currentSessionId);
            if (conn?.staffWs) safeSend(conn.staffWs, { type: "user_message", session_id: currentSessionId, message: { id: saved!.id, sender_type: "user", content: msg.content, created_at: saved!.createdAt } });
            safeSend(socket, { type: "ack", message_id: saved!.id });
          } else if (msg.type === "close" && currentSessionId) {
            await closeSession(currentSessionId, "user");
            const conn = sessionConnections.get(currentSessionId);
            if (conn?.staffWs) safeSend(conn.staffWs, { type: "session_closed", session_id: currentSessionId, by: "user" });
            safeSend(socket, { type: "closed", session_id: currentSessionId });
          }
        } catch (e: any) {
          safeSend(socket, { type: "error", message: e?.message ?? "处理失败" });
        }
      });

      socket.on("close", () => { sessionConnections.delete(currentSessionId ?? -1); });
    },
  );

  // ============ 客服端 WS ============
  app.get(
    "/ws/chat/staff",
    { websocket: true },
    (socket: WebSocket, req: any) => {
      let staffId: number | null = null;
      try {
        const q = (req.query ?? {}) as any;
        const token = String(q.token ?? "");
        const decoded = app.jwt.verify(token) as any;
        const role = decoded.role;
        if (role !== "admin" && role !== "super_admin") { socket.close(4003, "forbidden"); return; }
        staffId = Number(decoded.sub);
      } catch { socket.close(4001, "auth_failed"); return; }
      if (!staffId) { socket.close(4001, "auth_failed"); return; }

      let currentSessionId: number | null = null;
      // 标记客服在线
      staffOnline.set(staffId, { status: "online", ws: socket });

      socket.on("message", async (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "accept" && msg.session_id) {
            const ok = await staffAcceptSession(staffId, Number(msg.session_id));
            currentSessionId = Number(msg.session_id);
            const conn = sessionConnections.get(currentSessionId) ?? {};
            conn.staffWs = socket;
            sessionConnections.set(currentSessionId, conn);
            // 通知用户客服接入
            if (conn.userWs) {
              safeSend(conn.userWs, { type: "staff_connected", session_id: currentSessionId });
              await addMessage(currentSessionId, staffId, "system", "客服已接入，请问有什么可以帮助您？");
            }
            safeSend(socket, { type: "accepted", session_id: currentSessionId, ok });
          } else if (msg.type === "message" && currentSessionId) {
            const saved = await addMessage(currentSessionId, staffId, "staff", String(msg.content));
            const conn = sessionConnections.get(currentSessionId);
            if (conn?.userWs) safeSend(conn.userWs, { type: "staff_message", session_id: currentSessionId, message: { id: saved!.id, sender_type: "staff", content: msg.content, created_at: saved!.createdAt } });
            safeSend(socket, { type: "ack", message_id: saved!.id });
          } else if (msg.type === "status") {
            staffOnline.set(staffId, { status: msg.status, ws: socket });
            safeSend(socket, { type: "status_ok", status: msg.status });
          } else if (msg.type === "close" && currentSessionId) {
            await closeSession(currentSessionId, "staff");
            const conn = sessionConnections.get(currentSessionId);
            if (conn?.userWs) safeSend(conn.userWs, { type: "session_closed", session_id: currentSessionId, by: "staff" });
            safeSend(socket, { type: "closed_session", session_id: currentSessionId });
          }
          // 推送排队/新会话通知（简化：轮询 REST 获取队列）
          if (msg.type === "queue") {
            const queue = await pollQueue();
            safeSend(socket, { type: "queue", sessions: queue });
          }
        } catch (e: any) {
          safeSend(socket, { type: "error", message: e?.message ?? "处理失败" });
        }
      });

      socket.on("close", () => {
        staffOnline.delete(staffId ?? -1);
        sessionConnections.delete(currentSessionId ?? -1);
      });
    },
  );

  return app;
}

/** 轮询等待队列 */
async function pollQueue(): Promise<any[]> {
  const rows = await pool.query(
    `SELECT cs.id AS session_id, u.email, u.username, cs.created_at,
            EXTRACT(EPOCH FROM (NOW() - cs.waiting_started_at))::int AS wait_seconds
     FROM chat_sessions cs LEFT JOIN users u ON u.id=cs.user_id
     WHERE cs.status='waiting' ORDER BY cs.created_at LIMIT 50`);
  return rows.rows.map((r: any) => ({ session_id: r.session_id, email: r.email, username: r.username, wait_seconds: r.wait_seconds, created_at: r.created_at }));
}
