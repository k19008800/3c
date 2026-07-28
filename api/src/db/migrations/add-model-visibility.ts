// ============================================================
//  迁移脚本：models.status(boolean) → models.visibility(enum)
//  新增 model_visibility 枚举类型，迁移数据，重建索引
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();

  // 1. 创建枚举类型（如果不存在）
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'model_visibility') THEN
        CREATE TYPE model_visibility AS ENUM ('public', 'internal', 'disabled');
      END IF;
    END
    $$;
  `);

  // 2. 新增列（nullable 以便迁移数据）
  await db.execute(sql`
    ALTER TABLE models ADD COLUMN IF NOT EXISTS visibility model_visibility;
  `);

  // 3. 迁移数据：status=true → 'public', status=false → 'disabled'
  await db.execute(sql`
    UPDATE models SET visibility = 'public' WHERE status = true AND visibility IS NULL;
  `);
  await db.execute(sql`
    UPDATE models SET visibility = 'disabled' WHERE status = false AND visibility IS NULL;
  `);

  // 4. 设置 NOT NULL 和默认值
  await db.execute(sql`
    ALTER TABLE models ALTER COLUMN visibility SET NOT NULL;
  `);
  await db.execute(sql`
    ALTER TABLE models ALTER COLUMN visibility SET DEFAULT 'public';
  `);

  // 5. 重建索引
  await db.execute(sql`
    DROP INDEX IF EXISTS models_type_status_idx;
  `);
  await db.execute(sql`
    CREATE INDEX models_type_visibility_idx ON models (type, visibility);
  `);

  // 6. 删除旧列
  await db.execute(sql`
    ALTER TABLE models DROP COLUMN IF EXISTS status;
  `);

  console.log("[Migration] add-model-visibility: ✅ 完成");
}

export async function down() {
  const db = getDb();

  // 回滚：恢复 status 列
  await db.execute(sql`
    ALTER TABLE models ADD COLUMN IF NOT EXISTS status boolean NOT NULL DEFAULT true;
  `);

  await db.execute(sql`
    UPDATE models SET status = true WHERE visibility = 'public' OR visibility = 'internal';
  `);
  await db.execute(sql`
    UPDATE models SET status = false WHERE visibility = 'disabled';
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS models_type_visibility_idx;
  `);
  await db.execute(sql`
    CREATE INDEX models_type_status_idx ON models (type, status);
  `);

  await db.execute(sql`
    ALTER TABLE models DROP COLUMN IF EXISTS visibility;
  `);

  // 注意：不删除枚举类型（可能被其他列引用）
  console.log("[Migration] add-model-visibility: ⬇️ 已回滚");
}
