// ============================================================
//  3cloud (3C) — Migration: 扩展管理角色 + 管理员账户表
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();
  
  // 1. 扩展角色枚举
  await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance_ops'`);
  await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ops'`);
  await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support'`);
  await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auditor'`);

  // 2. 创建 admin_accounts 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role user_role NOT NULL DEFAULT 'admin',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMP WITH TIME ZONE,
      login_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `);

  // 3. 为现有 super_admin 创建 admin_accounts 记录
  await db.execute(sql`
    INSERT INTO admin_accounts (user_id, role, is_active)
    SELECT id, role, true FROM users WHERE role IN ('super_admin', 'admin')
    ON CONFLICT (user_id) DO NOTHING
  `);

  console.log("[Migration] 2026-07-01-admin-roles: ✅ 角色扩展 + admin_accounts 表创建完成");
}

// Self-invoke for CLI execution
import { createDb, closeDb } from "../index.js";
createDb();
up().catch((err) => { console.error("Migration failed:", err); process.exit(1); }).finally(() => closeDb());
