// ============================================================
//  3cloud (3C) — 代理团队层级管理
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  auditLogs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

// ══════════════════════════════════════════════
//  设置上级代理商
// ══════════════════════════════════════════════

export async function setAgentParent(
  agentId: number,
  parentAgentId: number | null,
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  if (parentAgentId) {
    // 验证上级代理商存在
    const [parent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);

    if (!parent) {
      throw new AppError("PARENT_NOT_FOUND", "上级代理商不存在", 404);
    }

    // 防止循环引用（不能把自己设为自己的上级）
    if (parentAgentId === agentId) {
      throw new AppError("SELF_PARENT", "不能将自己设为上级代理商", 400);
    }

    // 防止循环引用（上级的下级不能反过来成为上级）
    const [cycle] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(
        eq(agents.parentAgentId, agentId),
        eq(agents.id, parentAgentId),
      ))
      .limit(1);

    if (cycle) {
      throw new AppError("CYCLE_DETECTED", "循环引用: 该代理商的下级不能成为其上级", 400);
    }
  }

  // 计算新的深度
  let newDepth = 0;
  if (parentAgentId) {
    const [parent] = await db
      .select({ teamDepth: agents.teamDepth })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);
    newDepth = (parent?.teamDepth ?? 0) + 1;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({
        parentAgentId: parentAgentId,
        teamDepth: newDepth,
      })
      .where(eq(agents.id, agentId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "agent",
      targetId: agentId,
      before: null,
      after: { parentAgentId, teamDepth: newDepth },
      ip: null,
      description: `设置代理商 #${agentId} 的上级为 #${parentAgentId ?? "无"}`,
    });
  });

  return { id: agentId, parentAgentId, teamDepth: newDepth };
}
