// ============================================================
//  3cloud (3C) — commission_logs 分区设置迁移脚本
//  将 commission_logs 从普通表转换为 PG 原生分区表（按月分区）
//  运行时机：schema 推送后，首次 seed 之前
//  幂等：如果已分区则跳过
// ============================================================
//  使用方法：
//    npx tsx src/db/migrations/setup-commission-logs-partitions.ts
// ============================================================

import "dotenv/config";
import { createDb, pool } from "../index.js";

createDb();

const TABLE_NAME = "commission_logs";
const PARTITION_RANGE_MONTHS = 7;

async function isPartitioned(): Promise<boolean> {
  const result = await pool.query(
    `SELECT relkind FROM pg_class WHERE relname = $1`,
    [TABLE_NAME]
  );
  if (result.rows.length === 0) return false;
  return result.rows[0].relkind === "p";
}

function getPartitionName(year: number, month: number): string {
  return `${TABLE_NAME}_${year}${String(month).padStart(2, "0")}`;
}

function getPartitionRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, to };
}

async function main() {
  console.log("🔧 commission_logs 分区设置脚本\n");

  const alreadyPartitioned = await isPartitioned();
  if (alreadyPartitioned) {
    console.log("  ✅ commission_logs 已经是分区表，跳过");
    await ensureMissingPartitions();
    return;
  }

  // 1. 备份旧数据
  console.log("  🔄 备份现有数据...");
  const dataResult = await pool.query(`SELECT * FROM ${TABLE_NAME} ORDER BY id`);
  const oldRows = dataResult.rows;
  console.log(`  ✅ 已备份 ${oldRows.length} 条记录`);

  // 2. 删除旧表
  console.log("\n  🔄 删除旧的 commission_logs 普通表...");
  await pool.query(`DROP TABLE IF EXISTS ${TABLE_NAME} CASCADE`);
  await pool.query(`DROP SEQUENCE IF EXISTS ${TABLE_NAME}_id_seq CASCADE`);
  console.log("  ✅ 已删除");

  // 3. 创建分区父表
  console.log("\n  🔄 创建分区父表...");
  await pool.query(`
    CREATE TABLE ${TABLE_NAME} (
      id                SERIAL,
      agent_id          INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      client_call_log_id INTEGER,
      call_cost         NUMERIC(18,6) NOT NULL,
      commission_amount NUMERIC(18,6) NOT NULL,
      status            commission_status NOT NULL DEFAULT 'pending',
      voucher_no        VARCHAR(32),
      commission_type   VARCHAR(20),
      source_order_id   VARCHAR(64),
      source_order_amount NUMERIC(18,6),
      source_customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fee_rate          NUMERIC(5,4) DEFAULT '0.0000',
      fee_amount        NUMERIC(18,6) DEFAULT '0.000000',
      net_amount        NUMERIC(18,6),
      rule_snapshot     JSONB,
      calc_detail       JSONB,
      balance_snapshot  NUMERIC(18,6),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at        TIMESTAMPTZ,
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);
  console.log("  ✅ 分区父表已创建");

  // 4. 创建分区及索引
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1;

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

    await pool.query(`CREATE INDEX ${partitionName}_agent_created_idx ON ${partitionName} (agent_id, created_at DESC)`);
    await pool.query(`CREATE INDEX ${partitionName}_status_created_idx ON ${partitionName} (status, created_at DESC)`);
    await pool.query(`CREATE INDEX ${partitionName}_agent_status_date_idx ON ${partitionName} (agent_id, status, created_at DESC)`);
    await pool.query(`CREATE INDEX ${partitionName}_created_at_idx ON ${partitionName} (created_at DESC)`);

    if (currentMonth === 12) { currentMonth = 1; currentYear++; } else { currentMonth++; }
  }

  // 5. 回写旧数据（逐条 INSERT，4K 条性能可忽略）
  if (oldRows.length > 0) {
    console.log(`\n  🔄 恢复 ${oldRows.length} 条旧数据...`);

    const BATCH = 500;
    for (let i = 0; i < oldRows.length; i += BATCH) {
      const batch = oldRows.slice(i, i + BATCH);
      for (const row of batch) {
        await pool.query(
          `INSERT INTO ${TABLE_NAME}
           (id, agent_id, client_call_log_id, call_cost, commission_amount,
            status, voucher_no, commission_type, source_order_id, source_order_amount,
            source_customer_id, fee_rate, fee_amount, net_amount, rule_snapshot,
            calc_detail, balance_snapshot, created_at, settled_at)
           VALUES ($1, $2, $3, $4, $5, $6::commission_status, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19)
           ON CONFLICT (id, created_at) DO NOTHING`,
          [
            row.id, row.agent_id, row.client_call_log_id,
            row.call_cost, row.commission_amount,
            row.status, row.voucher_no, row.commission_type,
            row.source_order_id, row.source_order_amount,
            row.source_customer_id, row.fee_rate, row.fee_amount,
            row.net_amount, row.rule_snapshot ?? null,
            row.calc_detail ?? null,
            row.balance_snapshot, row.created_at, row.settled_at,
          ]
        );
      }
      console.log(`    ✓ 已恢复 ${Math.min(i + BATCH, oldRows.length)} / ${oldRows.length} 条`);
    }
  }

  // 6. 重置序列
  const maxId = oldRows.length > 0
    ? Math.max(...oldRows.map((r: any) => r.id))
    : 0;
  if (maxId > 0) {
    await pool.query(`ALTER SEQUENCE ${TABLE_NAME}_id_seq RESTART WITH ${maxId + 1}`);
    console.log(`\n  ✅ 序列已重置到 ${maxId + 1}`);
  }

  console.log("\n✅ commission_logs 分区设置完成");
}

async function ensureMissingPartitions() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  for (let i = 0; i < PARTITION_RANGE_MONTHS; i++) {
    const partitionName = getPartitionName(year, month);
    const exists = await pool.query(`SELECT 1 FROM pg_class WHERE relname = $1`, [partitionName]);
    if (exists.rows.length === 0) {
      const range = getPartitionRange(year, month);
      console.log(`  📦 补充分区: ${partitionName} [${range.from}, ${range.to})`);
      await pool.query(`CREATE TABLE ${partitionName} PARTITION OF ${TABLE_NAME} FOR VALUES FROM ('${range.from}') TO ('${range.to}')`);
      await pool.query(`CREATE INDEX ${partitionName}_agent_created_idx ON ${partitionName} (agent_id, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_status_created_idx ON ${partitionName} (status, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_agent_status_date_idx ON ${partitionName} (agent_id, status, created_at DESC)`);
      await pool.query(`CREATE INDEX ${partitionName}_created_at_idx ON ${partitionName} (created_at DESC)`);
    }
    if (month === 12) { month = 1; year++; } else { month++; }
  }
}

main()
  .catch((err) => {
    console.error("❌ commission_logs 分区设置失败:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
