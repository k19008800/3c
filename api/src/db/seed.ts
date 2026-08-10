/**
 * 3cloud v3 Seed — 初始化超级管理员
 * 用法: pnpm --filter @3cloud/api db:seed
 * 幂等：重复执行会跳过已存在项 / 更新密码
 */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db, schema } from '.';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = 'admin@3cloud.dev';
const ADMIN_PASSWORD = 'Admin@2024!';

async function main() {
  console.log('🌱 开始 seed...\n');

  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

  // 检查 admin 是否存在
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    const id = existing[0]!.id;
    await db
      .update(schema.users)
      .set({
        passwordHash: adminHash,
        role: 'super_admin',
        name: 'Super Admin',
      })
      .where(eq(schema.users.id, id));
    console.log(`✅ admin 用户已更新 (id=${id}, role=super_admin)`);
  } else {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        name: 'Super Admin',
        role: 'super_admin',
        status: 'active',
      })
      .returning({ id: schema.users.id });

    console.log(`✅ admin 用户已创建 (id=${user!.id}, role=super_admin)`);
  }

  // 确保 super_admin 在 user_role enum 中可用（如果 enum 没这个值会炸，加个 fallback）
  console.log('\n✅ seed 完成');
  process.exit(0);
}

main().catch((e) => {
  console.error('seed 失败:', e);
  process.exit(1);
});
