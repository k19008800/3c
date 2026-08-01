import { db, pool } from "../db/index";
import { chatSessions, chatMessages } from "../db/schema/chat";

/**
 * 在线客服服务 对齐 SPEC-§27
 * 会话管理 + 排队分配 + WS 连接注册表
 */

// 客服在线状态（内存）
export const staffOnline: Map<number, { status: string; ws: any | null }> = new Map();
// 会话 → 连接（用户/客服）
export const sessionConnections: Map<number, { userWs?: any; staffWs?: any }> = new Map();

/** 获取在线+非忙碌客服列表 */
export async function getAvailableStaff(): Promise<any[]> {
  const staff: any[] = [];
  for (const [staffId, info] of staffOnline.entries()) {
    if (info.status === "online" || info.status === "busy") {
      // 检查会话数
      const active = await countActiveSessions(staffId);
      staff.push({ staffId, status: info.status, activeSessions: active });
    }
  }
  return staff;
}

export async function countActiveSessions(staffId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM chat_sessions WHERE staff_id=$1 AND status='active'`,
    [staffId],
  );
  return r.rows[0]?.c ?? 0;
}

/** 用户发起聊天：分配客服 or 排队 */
export async function startUserChat(userId: number, category?: string) {
  // 检查是否有进行中的会话
  const existing = await pool.query(
    `SELECT id FROM chat_sessions WHERE user_id=$1 AND status IN ('waiting','active') ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) {
    return { sessionId: existing.rows[0].id, alreadyActive: true };
  }
  // 找可用客服：优先上次接待(简化为取闲置最少的在线客服)
  const staff = await getAvailableStaff();
  if (staff.length === 0) {
    // 排队：记录 waiting
    const created = await db.insert(chatSessions).values({
      userId, status: "waiting", category, waitingStartedAt: new Date(), queuePosition: 1,
    }).returning();
    return { sessionId: created[0]!.id, queued: true, position: 1, staffOnline: false };
  }
  // 分配给在线客服（取会话最少的）
  staff.sort((a, b) => a.activeSessions - b.activeSessions);
  const chosen = staff[0]!.staffId;
  const created = await db.insert(chatSessions).values({
    userId, staffId: chosen, status: "active", category, staffAssignedAt: new Date(),
  }).returning();
  return { sessionId: created[0]!.id, queued: false, staffId: chosen, staffOnline: true };
}

/** 客服接单/抢单 */
export async function staffAcceptSession(staffId: number, sessionId: number) {
  const r = await pool.query(
    `UPDATE chat_sessions SET status='active', staff_id=$1, staff_assigned_at=NOW() WHERE id=$2 AND status='waiting' RETURNING id`,
    [staffId, sessionId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** 关闭会话 */
export async function closeSession(sessionId: number, by: string) {
  await pool.query(
    `UPDATE chat_sessions SET status='closed', closed_at=NOW(), closed_by=$2 WHERE id=$1`,
    [sessionId, by],
  );
}

/** 写消息 */
export async function addMessage(sessionId: number, senderId: number, senderType: "user" | "staff" | "system", content: string) {
  const ins = await db.insert(chatMessages).values({ sessionId, senderId, senderType, content, contentType: "text" }).returning();
  return ins[0];
}
