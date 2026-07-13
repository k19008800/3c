// ============================================================
//  3cloud (3C) — Migration: Remove team feature + Add api_key quota_balance
//  2026-07-11
// ============================================================

import { getDb } from "../index.js";

export async function up() {
  const db = getDb();

  // 1. 清理 users 表 team 字段
  await db.execute(`ALTER TABLE "users" DROP COLUMN IF EXISTS "team_id"`);
  await db.execute(`ALTER TABLE "users" DROP COLUMN IF EXISTS "team_role"`);

  // 2. 删除 team_members 表
  await db.execute(`DROP TABLE IF EXISTS "team_members"`);

  // 3. 删除 team_role enum
  await db.execute(`DROP TYPE IF EXISTS "team_role"`);

  // 4. 在 api_keys 中添加 quota_balance 字段
  await db.execute(`ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "quota_balance" NUMERIC(18,6)`);

  console.log("[Migration] 2026-07-11-remove-team completed");
}

export async function down() {
  const db = getDb();

  // 回滚：恢复 team_role enum
  await db.execute(`CREATE TYPE "team_role" AS ENUM ('team_owner', 'team_admin', 'team_member')`);

  // 回滚：恢复 team_members 表
  await db.execute(`
    CREATE TABLE "team_members" (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL,
      role team_role NOT NULL DEFAULT 'team_member',
      quota_balance NUMERIC(18,6),
      invited_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(`CREATE UNIQUE INDEX team_members_user_id_idx ON team_members(user_id)`);
  await db.execute(`CREATE INDEX team_members_team_id_role_idx ON team_members(team_id, role)`);

  // 回滚：恢复 users 表 team 字段
  await db.execute(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_id" INTEGER`);
  await db.execute(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_role" team_role`);

  // 回滚：删除 api_keys 的 quota_balance
  await db.execute(`ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "quota_balance"`);

  console.log("[Migration] 2026-07-11-remove-team rolled back");
}
