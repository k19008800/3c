// ============================================================
//  Migration: 2026-06-29 — 性能优化复合索引
//  1. commission_logs:  (agent_id, created_at DESC) 加速代理商流水
//  2. commission_logs:  (status, created_at DESC)   加速佣金筛选
//  3. call_logs:        (model_name, created_at DESC) 加速管理端筛选
//  4. recharge_orders:  (user_id, created_at DESC)   加速用户订单列表
//  5. audit_logs:       (target_type, target_id, created_at DESC) 加速审计查询
// ============================================================

import { getDb } from "../index.js";

export async function migrate() {
  const db = getDb();
  console.log("[Migration] Creating performance composite indexes…");

  // 1. commission_logs: 代理商流水查询加速
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "commission_logs_agent_id_created_at_idx"
      ON "commission_logs" ("agent_id", "created_at" DESC);
  `);
  console.log("[Migration] ✓ commission_logs_agent_id_created_at_idx");

  // 2. commission_logs: 佣金状态筛选加速
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "commission_logs_status_created_at_idx"
      ON "commission_logs" ("status", "created_at" DESC);
  `);
  console.log("[Migration] ✓ commission_logs_status_created_at_idx");

  // 3. call_logs: 管理端按模型名筛选加速
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "call_logs_model_name_created_at_idx"
      ON "call_logs" ("model_name", "created_at" DESC);
  `);
  console.log("[Migration] ✓ call_logs_model_name_created_at_idx");

  // 4. recharge_orders: 用户充值订单列表加速
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "recharge_orders_user_created_at_idx"
      ON "recharge_orders" ("user_id", "created_at" DESC);
  `);
  console.log("[Migration] ✓ recharge_orders_user_created_at_idx");

  // 5. audit_logs: 审计日志按目标查询加速
  await db.execute(`
    CREATE INDEX IF NOT EXISTS "audit_logs_target_created_at_idx"
      ON "audit_logs" ("target_type", "target_id", "created_at" DESC);
  `);
  console.log("[Migration] ✓ audit_logs_target_created_at_idx");

  console.log("[Migration] ✓ All performance indexes created successfully");
}
