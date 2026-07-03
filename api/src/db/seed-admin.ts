// ============================================================
//  3cloud (3C) — 创建所有管理角色账号
//
//  运行：npx tsx src/db/seed-admin.ts
//  幂等：账号已存在则跳过，不会重复创建
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { createDb, closeDb } from "./index.js";
import { users } from "./schema.js";
import { eq, sql } from "drizzle-orm";

interface AdminSeed {
  email: string;
  password: string;
  nickname: string;
  role: "super_admin" | "admin" | "finance_ops" | "ops" | "support" | "auditor";
}

const ADMIN_ACCOUNTS: AdminSeed[] = [
  { email: "admin@3cloud.ai",  password: "Admin1234!", nickname: "超级管理员",       role: "super_admin" },
  { email: "admin@3cloud.dev", password: "admin123",    nickname: "通用管理员",       role: "admin" },
  { email: "finance@3cloud.ai",password: "Finance123!", nickname: "财务专员",         role: "finance_ops" },
  { email: "ops@3cloud.ai",    password: "Ops1234!",    nickname: "运营专员",         role: "ops" },
  { email: "support@3cloud.ai",password: "Support123!", nickname: "客服专员",         role: "support" },
  { email: "auditor@3cloud.ai",password: "Auditor123!", nickname: "审计员",           role: "auditor" },
];

async function seedAdmin() {
  const db = createDb();
  console.log("\n🔐 创建管理员账号...\n");

  for (const account of ADMIN_ACCOUNTS) {
    // 检查是否已存在
    const existing = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, account.email))
      .limit(1);

    if (existing.length > 0) {
      // 更新角色（如果已存在但角色不对）
      if (existing[0].role !== account.role) {
        await db
          .update(users)
          .set({ role: account.role } as any)
          .where(eq(users.id, existing[0].id));
        console.log(`  🔄 更新 ${account.email} 角色: ${existing[0].role} → ${account.role}`);
      } else {
        console.log(`  ℹ️  ${account.email} (${account.role}) 已存在`);
      }
      continue;
    }

    // 密码哈希
    const passwordHash = await bcrypt.hash(account.password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        email: account.email,
        passwordHash,
        nickname: account.nickname,
        userType: "enterprise",
        role: account.role as any,
        status: "active",
        balance: "0.000000",
        emailVerifiedAt: new Date(),
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        nickname: users.nickname,
      });

    console.log(`  ✅ 创建 ${account.role}: id=${newUser.id} email=${newUser.email}`);
  }

  await closeDb();
  console.log("\n🎉 管理员账号创建完成！");
  console.log("\n📋 账号列表:");
  console.log("  ┌──────────────────────┬────────────────┬────────────────┐");
  console.log("  │ 邮箱                  │ 密码           │ 角色           │");
  console.log("  ├──────────────────────┼────────────────┼────────────────┤");
  console.log("  │ admin@3cloud.ai      │ Admin1234!     │ super_admin    │");
  console.log("  │ admin@3cloud.dev     │ admin123       │ admin          │");
  console.log("  │ finance@3cloud.ai    │ Finance123!    │ finance_ops    │");
  console.log("  │ ops@3cloud.ai        │ Ops1234!       │ ops            │");
  console.log("  │ support@3cloud.ai    │ Support123!    │ support        │");
  console.log("  │ auditor@3cloud.ai    │ Auditor123!    │ auditor        │");
  console.log("  └──────────────────────┴────────────────┴────────────────┘\n");
}

seedAdmin().catch((err) => {
  console.error("\n❌ 创建管理员账号失败:", err);
  process.exit(1);
});
