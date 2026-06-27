// ============================================================
//  3cloud (3C) — call_logs 分区设置迁移脚本
//  将 call_logs 从普通表转换为 PG 原生分区表
//  运行时机：npm run db:push 之后，首次 seed 之前
//  幂等：如果已分区则跳过
// ============================================================
//  使用方法：
//    npx tsx src/db/migrations/setup-call-logs-partitions.ts
// ============================================================

import "dotenv/config";
import { createDb, pool } from "../index.js";

createDb();

const TABLE_NAME = "call_logs";
const PARTITION_RANGE_MONTHS = 7; // 当前月 + 未来 6 个月

async function isPartitioned(): Promise<boolean> {
  const result = await pool.query(
    `SELECT relkind FROM pg_class WHERE relname = $1`,
    [TABLE_NAME]
  );
  if (result.rows.length === 0) return false;
  return result.rows[0].relkind === "p"; // p = partitioned table
}

function getPartitionName(year: number, month: number): string {
  return `${TABLE_NAME}_${year}${String(month).padStart(2, "0")}`;
}

function getPartitionRange(
  year: number,
  month: number
): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, to };
}

async function main() {
  console.log("🔧 call_logs 分区设置脚本\n");

  const alreadyPartitioned = await isPartitioned();
  if (alreadyPartitioned) {
    console.log("  ✅ call_logs 已经是分区表，跳过");
    await ensureMissingPartitions();
    return;
  }

  // 1. 删除旧表（无数据，安全操作）
  console.log("  🔄 删除旧的 call_logs 普通表...");
  await pool.query(`DROP TABLE IF EXISTS ${TABLE_NAME} CASCADE`);
  await pool.query(`DROP SEQUENCE IF EXISTS ${TABLE_NAME}_id_seq CASCADE`);
  console.log("  ✅ 已删除");

  // 2. 创建分区父表
  console.log("\n  🔄 创建分区父表...");
  await pool.query(`
    CREATE TABLE ${TABLE_NAME} (
      id              SERIAL,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      api_key_id      INTEGER REFERENCES api_keys(id),
      model_id        INTEGER REFERENCES models(id),
      vendor_model_id INTEGER REFERENCES vendor_models(id),
      vendor_name     VARCHAR(100),
      model_name      VARCHAR(100),
      prompt_tokens     INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens      INTEGER NOT NULL DEFAULT 0,
      cost            NUMERIC(18,6) NOT NULL DEFAULT '0.000000',
      duration_ms     INTEGER,
      status          call_status NOT NULL,
      error_message   TEXT,
      is_streaming    BOOLEAN NOT NULL DEFAULT false,
      ip              VARCHAR(45),
      user_agent      VARCHAR(500),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);
  console.log("  ✅ 分区父表已创建");

  // 3. 创建分区及索引
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1; // 1-based

  for (let i = 0; i < PARTITION_RANGE_MONTHS; i++) {
    const y = currentYear;
    const m = currentMonth;
    const partitionName = getPartitionName(y, m);
    const range = getPartitionRange(y, m);

    console.log(`\n  📦 创建分区: ${partitionName}`);
    console.log(`    范围: [${range.from}, ${range.to})`);

    await pool.query(`
      CREATE TABLE ${partitionName} PARTITION OF ${TABLE_NAME}
      FOR VALUES FROM ('${range.from}') TO ('${range.to}')
    `);

    // 每个分区建索引
    await pool.query(`
      CREATE INDEX ${partitionName}_user_created_idx
      ON ${partitionName} (user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX ${partitionName}_api_key_created_idx
      ON ${partitionName} (api_key_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX ${partitionName}_vendor_created_idx
      ON ${partitionName} (vendor_name, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX ${partitionName}_status_created_idx
      ON ${partitionName} (status, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX ${partitionName}_created_at_idx
      ON ${partitionName} (created_at)
    `);

    // 推进到下个月
    if (currentMonth === 12) {
      currentMonth = 1;
      currentYear++;
    } else {
      currentMonth++;
    }
  }

  console.log("\n✅ call_logs 分区设置完成");
}

/**
 * 补充缺失的未来分区（当脚本已经是幂等执行时，确保未来分区存在）
 */
async function ensureMissingPartitions() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  for (let i = 0; i < PARTITION_RANGE_MONTHS; i++) {
    const partitionName = getPartitionName(year, month);
    const exists = await pool.query(
      `SELECT 1 FROM pg_class WHERE relname = $1`,
      [partitionName]
    );

    if (exists.rows.length === 0) {
      const range = getPartitionRange(year, month);
      console.log(`  📦 补充分区: ${partitionName} [${range.from}, ${range.to})`);
      await pool.query(`
        CREATE TABLE ${partitionName} PARTITION OF ${TABLE_NAME}
        FOR VALUES FROM ('${range.from}') TO ('${range.to}')
      `);

      await pool.query(`CREATE INDEX ${partitionName}_user_created_idx ON ${partitionName} (user_id, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_api_key_created_idx ON ${partitionName} (api_key_id, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_vendor_created_idx ON ${partitionName} (vendor_name, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_status_created_idx ON ${partitionName} (status, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_created_at_idx ON ${partitionName} (created_at)`);
    }

    if (month === 12) { month = 1; year++; } else { month++; }
  }
}

main()
  .catch((err) => {
    console.error("❌ 分区设置失败:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
