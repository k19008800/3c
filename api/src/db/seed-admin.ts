// ============================================================
//  3cloud (3C) — 创建超级管理员
//
//  运行：npx tsx src/db/seed-admin.ts
//  幂等：已存在则跳过，不会重复创建
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { createDb, closeDb } from "./index.js";
import { users, auditLogs, balanceLogs } from "./schema.js";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@3cloud.dev";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NICKNAME = "超级管理员";

async function seedAdmin() {
  const db = createDb();
  console.log("\n🔐 创建超级管理员...\n");

  // 检查是否已存在
  const existing = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  ℹ️  管理员 ${ADMIN_EMAIL} 已存在 (id=${existing[0].id}, role=${existing[0].role})`);
    console.log("\n✅ 无需创建，直接使用即可。");
    await closeDb();
    return;
  }

  // 密码哈希
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // 创建用户 - 注意超级管理员的 ID 会从前台注册的用户之后开始（假设前台注册用户从 1 开始增长）
  const [newUser] = await db
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      passwordHash,
      nickname: ADMIN_NICKNAME,
      userType: "enterprise",     // 企业类型
      role: "super_admin",        // 超级管理员
      status: "active",           // 直接激活
      balance: "0.000000",
      emailVerifiedAt: new Date(), // 邮箱已验证
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      nickname: users.nickname,
    });

  console.log(`  ✅ 创建管理员用户:`);
  console.log(`     ID:       ${newUser.id}`);
  console.log(`     邮箱:     ${newUser.email}`);
  console.log(`     角色:     ${newUser.role}`);
  console.log(`     昵称:     ${newUser.nickname}`);

  await closeDb();
  console.log("\n🎉 超级管理员创建成功！");
  console.log(`   登录邮箱: ${ADMIN_EMAIL}`);
  console.log(`   登录密码: ${ADMIN_PASSWORD}`);
  console.log(`   登录地址: http://localhost:3000/login\n`);
}

seedAdmin().catch((err) => {
  console.error("\n❌ 创建超级管理员失败:", err);
  process.exit(1);
});
