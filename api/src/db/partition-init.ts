import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

/**
 * 分区表初始化
 * 将 call_logs / billing_logs 改建为 PostgreSQL 原生按月 RANGE 分区
 * 替代 pg_partman（本地 PG17 未安装），用自管理脚本实现同等分区能力
 *
 * ⚠️ 空库阶段调用（有数据后不能这样 DROP 重建）
 */
const PARTITION_SQL = `
-- 1. 拆除 billing_logs 对 call_logs 的外键（分区表跨分区 FK 受限）
ALTER TABLE billing_logs DROP CONSTRAINT IF EXISTS billing_logs_call_log_id_call_logs_id_fk;

-- 2. 重建 call_logs 为分区父表（复合主键 id+created_at）
DROP TABLE IF EXISTS call_logs;
CREATE TABLE call_logs (
  id              bigint NOT NULL,
  user_id         integer NOT NULL,
  api_key_id      integer,
  model_id        integer,
  vendor_id       integer,
  request_id      varchar(64),
  provider        varchar(100),
  upstream_model  varchar(200),
  request_tokens  integer DEFAULT 0,
  response_tokens integer DEFAULT 0,
  total_tokens    integer DEFAULT 0,
  cost            numeric(18,4) DEFAULT 0,
  status          varchar(20) NOT NULL DEFAULT 'success',
  error_code      varchar(50),
  error_message   text,
  latency_ms      integer,
  fallback_used   varchar(10) DEFAULT 'false',
  created_at      timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 3. 重建 billing_logs 为分区父表
DROP TABLE IF EXISTS billing_logs;
CREATE TABLE billing_logs (
  id              bigint NOT NULL,
  user_id         integer NOT NULL,
  call_log_id     bigint,
  price_source    varchar(20),
  input_price     numeric(18,6),
  output_price    numeric(18,6),
  discount_rate   numeric(5,4),
  estimated_cost  numeric(18,6),
  actual_cost     numeric(18,6),
  refund_amount   numeric(18,6),
  balance_before  integer,
  balance_after   integer,
  status          varchar(20) NOT NULL DEFAULT 'pending',
  created_at      timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
`;

// 建初始 12 个月分区 + 未来 3 个月
function partitionDDL(table: string, column: string, month: string): string {
  const suffix = month.replace("-", "_");
  const from = `${month}-01`; // e.g. 2025-08-01
  // 计算下月首日：YYYY-MM-01
  const parts = month.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const next = `${ny}-${String(nm).padStart(2, "0")}-01`; // e.g. 2025-09-01
  return `CREATE TABLE IF NOT EXISTS ${table}_${suffix} PARTITION OF ${table}
    FOR VALUES FROM ('${from} 00:00:00') TO ('${next} 00:00:00');`;
}

function monthOffset(date: Date, n: number): string {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const now = new Date();
  try {
    console.log("重建分区父表...");
    await pool.query(PARTITION_SQL);

    console.log("创建初始分区子表（过去12月 + 未来3月）...");
    for (const table of ["call_logs", "billing_logs"]) {
      for (let i = -11; i <= 3; i++) {
        const m = monthOffset(now, i);
        await pool.query(partitionDDL(table, "created_at", m));
      }
    }

    // 索引（分区表建在父表, 子表自动继承）
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON call_logs (user_id, created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_model_created ON call_logs (model_id, created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_user_created ON billing_logs (user_id, created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_call_log ON billing_logs (call_log_id)`);

    // 恢复 billing_logs FK 到 users
    await pool.query(`ALTER TABLE billing_logs ADD CONSTRAINT billing_logs_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)`);
    // call_logs 的 FK（分区表允许 FK 到普通表）
    await pool.query(`ALTER TABLE call_logs ADD CONSTRAINT call_logs_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)`);
    await pool.query(`ALTER TABLE call_logs ADD CONSTRAINT call_logs_model_id_models_id_fk
      FOREIGN KEY (model_id) REFERENCES models(id)`);
    await pool.query(`ALTER TABLE call_logs ADD CONSTRAINT call_logs_vendor_id_vendors_id_fk
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)`);

    console.log("分区表初始化完成 ✅");
  } catch (e) {
    console.error("分区初始化失败:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
