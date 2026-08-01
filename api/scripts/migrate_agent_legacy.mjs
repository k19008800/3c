/**
 * 代理商体系旧数据迁移（D8）：裂变/绑定旧数据 → agent_customer_bindings 归属关系
 * 对齐 SPEC-代理商后台主导版.md §七
 *
 * 逻辑：
 * 1. 遍历 users 中 agent_id IS NOT NULL 的记录（旧裂变绑定），构造 agent_customer_bindings
 * 2. 仅迁移「目标用户存在 且 上级用户具备 agent_profiles」的关系
 * 3. 每条写 agent_binding_logs（action='migrate'）
 * 4. 归属唯一性：同一客户多条旧裂变记录，保留最新一条，其余丢弃并记异常
 * 5. 多级 parent_user_id 扁平化：仅保留最底层实际归属客户的代理为归属人（此脚本只处理 users.agent_id 单点，若有 parent 链需手工核查）
 * 6. 输出核对报告（迁移条数/冲突/异常堆）
 *
 * 用法：cd api && node scripts/migrate_agent_legacy.mjs [--dry-run]
 */
import pg from "pg";
import "dotenv/config";

const DRY_RUN = process.argv.includes("--dry-run");
const CONN = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud_v2";
const pool = new pg.Pool({ connectionString: CONN });

async function main() {
  console.log(`代理商旧数据迁移 ${DRY_RUN ? "[DRY-RUN 仅核对]" : "[执行]"}`);

  // 1. 收集旧裂变绑定：users.agent_id（上级代理）非空的记录
  const bindings = await pool.query(
    `SELECT cu.id AS customer_user_id, cu.agent_id AS agent_user_id, cu.created_at
     FROM users cu
     WHERE cu.agent_id IS NOT NULL
     ORDER BY cu.id`,
  );
  console.log(`候选旧绑定记录: ${bindings.rows.length} 条`);

  // 2. 已存在的有效归属（防止重复迁移）
  const existing = await pool.query(
    `SELECT customer_user_id FROM agent_customer_bindings WHERE status='active'`,
  );
  const existingSet = new Set(existing.rows.map((r) => r.customer_user_id));

  // 3. 校验：代理档案存在；且避免迁移到已存在归属的客户
  const migrated = [];
  const skippedNoAgentProfile = [];
  const skippedConflict = [];

  for (const b of bindings.rows) {
    const agentUserId = Number(b.agent_user_id);
    const customerUserId = Number(b.customer_user_id);

    // 该客户已有 active 归属 → 跳过并记异常（保留现状）
    if (existingSet.has(customerUserId)) {
      skippedConflict.push({ customer_user_id: customerUserId, agent_user_id: agentUserId, reason: "已有归属" });
      continue;
    }

    // 上级用户必须已具备 agent_profiles（否则不是有效代理）
    const prof = await pool.query(
      `SELECT id FROM agent_profiles WHERE user_id=$1 LIMIT 1`,
      [agentUserId],
    );
    if (prof.rows.length === 0) {
      skippedNoAgentProfile.push({ customer_user_id: customerUserId, agent_user_id: agentUserId, reason: "上级无代理档案" });
      continue;
    }

    migrated.push({ customer_user_id: customerUserId, agent_user_id: agentUserId, bound_at: b.created_at });
  }

  console.log(`可迁移: ${migrated.length} 条`);
  console.log(`跳过(上级无代理档案): ${skippedNoAgentProfile.length} 条`);
  console.log(`跳过(已有归属冲突): ${skippedConflict.length} 条`);

  // 4. 写入（或 dry-run 仅打印）
  if (!DRY_RUN && migrated.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const m of migrated) {
        await client.query(
          `INSERT INTO agent_customer_bindings (agent_user_id, customer_user_id, status, bound_at, reason)
           VALUES ($1, $2, 'active', $3, $4)
           ON CONFLICT DO NOTHING`,
          [m.agent_user_id, m.customer_user_id, new Date(m.bound_at ?? new Date()), "迁移自旧裂变数据"],
        );
        await client.query(
          `INSERT INTO agent_binding_logs (customer_user_id, from_agent_user_id, to_agent_user_id, action, operator_id, reason)
           VALUES ($1, NULL, $2, 'migrate', NULL, '迁移自旧裂变数据')`,
          [m.customer_user_id, m.agent_user_id],
        );
      }
      await client.query("COMMIT");
      console.log(`已写入 ${migrated.length} 条归属 + 审计日志`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // 5. 核对报告
  console.log("\n===== 核对报告 =====");
  console.log(`迁移成功: ${migrated.length}`);
  console.log(`跳过-上级无代理档案: ${skippedNoAgentProfile.length}（可人工确认后补）`);
  console.log(`跳过-归属冲突: ${skippedConflict.length}`);
  await pool.end();
}

main().catch((e) => {
  console.error("迁移失败:", e);
  process.exit(1);
});
