// ============================================================
//  3cloud (3C) — 营销活动自动结束字段迁移
//  新增 auto_end 字段，支持自动结束功能
// ============================================================

import { getDb } from "../index.js";

/**
 * 添加 auto_end 字段到 campaigns 表
 */
export async function addCampaignAutoEndField(): Promise<void> {
  const db = getDb();

  console.log("[Migration] 开始添加 auto_end 字段...");

  try {
    // 检查字段是否已存在
    const checkResult = await db.execute(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
        AND column_name = 'auto_end'
    `);

    if (checkResult.rows.length > 0) {
      console.log("[Migration] auto_end 字段已存在，跳过迁移");
      return;
    }

    // 添加 auto_end 字段
    await db.execute(`
      ALTER TABLE campaigns 
      ADD COLUMN auto_end BOOLEAN NOT NULL DEFAULT true
    `);

    console.log("[Migration] ✅ auto_end 字段添加成功");
  } catch (err) {
    console.error("[Migration] ❌ auto_end 字段添加失败:", err);
    throw err;
  }
}

// 直接运行迁移
if (import.meta.url === `file://${process.argv[1]}`) {
  addCampaignAutoEndField()
    .then(() => {
      console.log("[Migration] 迁移完成");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Migration] 迁移失败:", err);
      process.exit(1);
    });
}
