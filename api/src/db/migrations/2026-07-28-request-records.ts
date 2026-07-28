// ============================================================
//  3cloud (3C) — 迁移: 创建 request_records 分区表 + 索引
//  可重复执行（IF NOT EXISTS）
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. 创建分区父表
    await client.query(`
      CREATE TABLE IF NOT EXISTS request_records (
        id BIGSERIAL NOT NULL,
        call_log_id BIGINT NOT NULL,
        user_id INTEGER NOT NULL,
        api_key_id INTEGER,
        model_id INTEGER,
        model_name VARCHAR(100),
        vendor_name VARCHAR(100),
        request_body JSONB NOT NULL,
        request_headers JSONB,
        request_body_size INTEGER NOT NULL DEFAULT 0,
        response_body JSONB,
        response_body_size INTEGER DEFAULT 0,
        response_status SMALLINT,
        is_streaming BOOLEAN NOT NULL DEFAULT FALSE,
        stream_content TEXT,
        risk_level VARCHAR(20) NOT NULL DEFAULT 'normal',
        risk_tags TEXT[],
        risk_reason TEXT,
        reviewed BOOLEAN NOT NULL DEFAULT FALSE,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);
    console.log("[OK] 创建 request_records 父表");

    // 2. 外键约束（仅引用有唯一约束的表，call_logs 是分区表故跳过外键）
    const fks = [
      ["request_records_user_id_fkey", "FOREIGN KEY (user_id) REFERENCES users(id)"],
      ["request_records_api_key_id_fkey", "FOREIGN KEY (api_key_id) REFERENCES api_keys(id)"],
      ["request_records_model_id_fkey", "FOREIGN KEY (model_id) REFERENCES models(id)"],
      ["request_records_reviewed_by_fkey", "FOREIGN KEY (reviewed_by) REFERENCES users(id)"],
    ];
    for (const [name, def] of fks) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
            ALTER TABLE request_records ADD CONSTRAINT ${name} ${def};
          END IF;
        END $$;
      `);
    }
    console.log("[OK] 创建外键约束 (5)");

    // 3. 索引
    await client.query("CREATE INDEX IF NOT EXISTS req_user_created_idx ON request_records (user_id, created_at DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS req_call_log_idx ON request_records (call_log_id)");
    await client.query("CREATE INDEX IF NOT EXISTS req_risk_level_idx ON request_records (risk_level) WHERE risk_level != 'normal'");
    await client.query("CREATE INDEX IF NOT EXISTS req_risk_tags_idx ON request_records USING GIN (risk_tags)");
    await client.query("CREATE INDEX IF NOT EXISTS req_created_at_idx ON request_records (created_at DESC)");
    console.log("[OK] 创建索引 (5)");

    // 4. 按月分区（当前月 + 后 3 个月）
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const startDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, "0");
      const partitionName = `request_records_${year}_${month}`;
      const endDate = new Date(year, startDate.getMonth() + 1, 1);
      const startStr = startDate.toISOString();
      const endStr = endDate.toISOString();

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '${partitionName}') THEN
            EXECUTE format(
              'CREATE TABLE %I PARTITION OF request_records FOR VALUES FROM (%L) TO (%L)',
              '${partitionName}', '${startStr}', '${endStr}'
            );
          END IF;
        END $$;
      `);
      console.log(`[OK] 分区 ${partitionName} (${startStr} ~ ${endStr})`);
    }

    await client.query("COMMIT");
    console.log("\n✅ 迁移完成: request_records 表已就绪");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ 迁移失败:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();