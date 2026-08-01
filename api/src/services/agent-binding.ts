import { db, pool } from "../db/index";
import { agentCustomerBindings, type NewAgentCustomerBinding } from "../db/schema/agent-customer-bindings";
import { agentBindingLogs } from "../db/schema/agent-binding-logs";

/**
 * 客户归属服务（后台主导 · 报备划拨制）
 * 对齐 PRD-代理商体系-后台主导版.md + SPEC-代理商后台主导版.md
 * 归属唯一来源 = 报备划拨；一个客户同一时刻仅一条 active 归属
 */

/** 解析某客户在指定时刻的归属代理（null=无归属）*/
export async function resolveAgentByCustomerAt(customerUserId: number, at: Date): Promise<number | null> {
  const rows = await pool.query(
    `SELECT agent_user_id FROM agent_customer_bindings
     WHERE customer_user_id = $1 AND status = 'active'
       AND bound_at <= $2
       AND (unbound_at IS NULL OR unbound_at > $2)
     LIMIT 1`,
    [customerUserId, at],
  );
  const agentId = rows.rows[0]?.agent_user_id;
  return agentId ? Number(agentId) : null;
}

/** 解析某客户当前的归属代理（null=无归属）*/
export async function getCustomerAgent(customerUserId: number): Promise<number | null> {
  const rows = await pool.query(
    `SELECT agent_user_id FROM agent_customer_bindings
     WHERE customer_user_id = $1 AND status = 'active'
     LIMIT 1`,
    [customerUserId],
  );
  const agentId = rows.rows[0]?.agent_user_id;
  return agentId ? Number(agentId) : null;
}

/**
 * 划拨核心事务：将客户归属到某代理商（transfer 或 bind）
 * - 存在旧 active 归属 → 置 inactive，写 action='transfer'
 * - 无旧归属 → 直接插入，写 action='bind'
 * - 全部在事务内完成，生效时刻 = COMMIT 时刻（D7 佣金切分依据）
 */
export async function transferCustomer(params: {
  customerUserId: number;
  toAgentUserId: number;
  operatorId: number;
  reason?: string;
}): Promise<{ action: "bind" | "transfer"; fromAgentUserId: number | null }> {
  const { customerUserId, toAgentUserId, operatorId, reason } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. 取当前 active 归属
    const cur = await client.query(
      `SELECT agent_user_id FROM agent_customer_bindings
       WHERE customer_user_id = $1 AND status = 'active' FOR UPDATE`,
      [customerUserId],
    );
    const fromAgentUserId: number | null = cur.rows[0]?.agent_user_id ? Number(cur.rows[0].agent_user_id) : null;

    // 2. 旧归属置 inactive
    if (fromAgentUserId) {
      await client.query(
        `UPDATE agent_customer_bindings SET status='inactive', unbound_at=now()
         WHERE customer_user_id=$1 AND status='active'`,
        [customerUserId],
      );
    }

    // 3. 插入新 active 归属
    await client.query(
      `INSERT INTO agent_customer_bindings (agent_user_id, customer_user_id, status, bound_at, operator_id, reason)
       VALUES ($1, $2, 'active', now(), $3, $4)`,
      [toAgentUserId, customerUserId, operatorId, reason ?? null],
    );

    // 4. 写审计日志
    const action = fromAgentUserId ? "transfer" : "bind";
    await client.query(
      `INSERT INTO agent_binding_logs (customer_user_id, from_agent_user_id, to_agent_user_id, action, operator_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerUserId, fromAgentUserId, toAgentUserId, action, operatorId, reason ?? null],
    );

    await client.query("COMMIT");
    return { action, fromAgentUserId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** 解除客户归属（回到无归属状态）*/
export async function unbindCustomer(params: {
  customerUserId: number;
  operatorId: number;
  reason?: string;
}): Promise<{ action: "unbind"; fromAgentUserId: number | null }> {
  const { customerUserId, operatorId, reason } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT agent_user_id FROM agent_customer_bindings
       WHERE customer_user_id = $1 AND status = 'active' FOR UPDATE`,
      [customerUserId],
    );
    const fromAgentUserId: number | null = cur.rows[0]?.agent_user_id ? Number(cur.rows[0].agent_user_id) : null;
    if (fromAgentUserId) {
      await client.query(
        `UPDATE agent_customer_bindings SET status='inactive', unbound_at=now()
         WHERE customer_user_id=$1 AND status='active'`,
        [customerUserId],
      );
    }
    await client.query(
      `INSERT INTO agent_binding_logs (customer_user_id, from_agent_user_id, to_agent_user_id, action, operator_id, reason)
       VALUES ($1, $2, NULL, 'unbind', $3, $4)`,
      [customerUserId, fromAgentUserId, operatorId, reason ?? null],
    );
    await client.query("COMMIT");
    return { action: "unbind", fromAgentUserId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** 迁移用：直接插入一条归属并写 migrate 审计（用于旧数据 D8，事务内调用）*/
export async function insertBindingRecord(
  input: { agentUserId: number; customerUserId: number; boundAt: Date; reason?: string },
): Promise<void> {
  const row: NewAgentCustomerBinding = {
    agentUserId: input.agentUserId,
    customerUserId: input.customerUserId,
    status: "active",
    boundAt: input.boundAt,
    reason: input.reason,
  };
  await db.insert(agentCustomerBindings).values(row).onConflictDoNothing();
  await db.insert(agentBindingLogs).values({
    customerUserId: input.customerUserId,
    fromAgentUserId: null,
    toAgentUserId: input.agentUserId,
    action: "migrate",
    operatorId: null,
    reason: input.reason ?? "迁移自旧裂变数据",
  });
}
