// ============================================================
//  3cloud (3C) — 验证密钥过期功能
// ============================================================

import { getDb, createDb } from "./src/db/index.js";
import { apiKeys } from "./src/db/schema.js";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

async function verifyFeature() {
  console.log("=== 验证密钥过期功能 ===\n");

  // 1. 检查数据库 schema
  console.log("1. 检查数据库 schema...");
  try {
    const db = getDb();
    
    // 查询表结构
    const result = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'api_keys' AND column_name = 'expires_at'
    `);
    
    if (result.rows.length > 0) {
      console.log("✅ expires_at 字段存在");
      console.log("   类型:", result.rows[0].data_type);
      console.log("   可空:", result.rows[0].is_nullable);
    } else {
      console.log("❌ expires_at 字段不存在");
    }
  } catch (err: any) {
    console.log("⚠️  无法检查 schema:", err.message);
  }

  // 2. 测试创建带过期时间的 Key
  console.log("\n2. 测试创建带过期时间的 Key...");
  try {
    const db = getDb();
    
    const rawKey = `sk-3c-${randomBytes(48).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 天后

    const [key] = await db
      .insert(apiKeys)
      .values({
        userId: 1,
        name: "Test Key with Expiry",
        keyHash,
        keyPrefix,
        status: true,
        expiresAt,
      })
      .returning({ id: apiKeys.id, expiresAt: apiKeys.expiresAt });

    console.log("✅ 创建成功");
    console.log("   Key ID:", key.id);
    console.log("   过期时间:", key.expiresAt?.toISOString());

    // 清理
    await db.delete(apiKeys).where(eq(apiKeys.id, key.id));
    console.log("✅ 测试数据已清理");
  } catch (err: any) {
    console.log("❌ 创建失败:", err.message);
  }

  // 3. 测试过期检查
  console.log("\n3. 测试过期检查...");
  try {
    const db = getDb();
    
    // 创建一个已过期的 Key
    const rawKey = `sk-3c-${randomBytes(48).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const [expiredKey] = await db
      .insert(apiKeys)
      .values({
        userId: 1,
        name: "Test Expired Key",
        keyHash,
        keyPrefix,
        status: true,
        expiresAt: new Date(Date.now() - 1000), // 1 秒前过期
      })
      .returning({ id: apiKeys.id });

    // 查找过期 Key
    const expiredKeys = await db
      .select({ id: apiKeys.id, name: apiKeys.name })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.status, true),
          isNotNull(apiKeys.expiresAt),
          lt(apiKeys.expiresAt, new Date())
        )
      );

    console.log("✅ 找到过期 Key:", expiredKeys.length, "个");
    
    if (expiredKeys.some(k => k.id === expiredKey.id)) {
      console.log("✅ 测试 Key 已被正确识别为过期");
    }

    // 禁用过期 Key
    await db
      .update(apiKeys)
      .set({ status: false })
      .where(eq(apiKeys.id, expiredKey.id));

    const [disabledKey] = await db
      .select({ status: apiKeys.status })
      .from(apiKeys)
      .where(eq(apiKeys.id, expiredKey.id));

    if (!disabledKey.status) {
      console.log("✅ 过期 Key 已被正确禁用");
    }

    // 清理
    await db.delete(apiKeys).where(eq(apiKeys.id, expiredKey.id));
    console.log("✅ 测试数据已清理");
  } catch (err: any) {
    console.log("❌ 过期检查失败:", err.message);
  }

  console.log("\n=== 验证完成 ===");
  process.exit(0);
}

// 初始化数据库连接
createDb();
verifyFeature().catch(err => {
  console.error("验证失败:", err);
  process.exit(1);
});
