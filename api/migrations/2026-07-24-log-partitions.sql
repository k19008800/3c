-- ============================================================
--  3cloud (3C) — 日志表分区迁移
--  日期：2026-07-24
--  用途：将 balance_logs、audit_logs、operation_logs 转为按月分区
-- ============================================================

-- ── 1. balance_logs 分区 ──

-- 创建分区父表
CREATE TABLE IF NOT EXISTS balance_logs_partitioned (
  LIKE balance_logs INCLUDING ALL EXCLUDING INDEXES
) PARTITION BY RANGE (created_at);

-- 创建分区索引
CREATE INDEX IF NOT EXISTS balance_logs_p_user_idx ON balance_logs_partitioned (user_id);
CREATE INDEX IF NOT EXISTS balance_logs_p_type_idx ON balance_logs_partitioned (type);
CREATE INDEX IF NOT EXISTS balance_logs_p_created_idx ON balance_logs_partitioned (created_at DESC);
CREATE INDEX IF NOT EXISTS balance_logs_p_user_created_idx ON balance_logs_partitioned (user_id, created_at DESC);

-- 创建分区（2026年5月-12月）
CREATE TABLE IF NOT EXISTS balance_logs_202605 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS balance_logs_202606 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS balance_logs_202607 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS balance_logs_202608 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS balance_logs_202609 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS balance_logs_202610 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS balance_logs_202611 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS balance_logs_202612 PARTITION OF balance_logs_partitioned FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 迁移数据
INSERT INTO balance_logs_partitioned SELECT * FROM balance_logs;

-- 重命名表
DROP TABLE balance_logs;
ALTER TABLE balance_logs_partitioned RENAME TO balance_logs;

-- ── 2. audit_logs 分区 ──

-- 检查表是否存在
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    -- 创建分区父表
    CREATE TABLE IF NOT EXISTS audit_logs_partitioned (
      LIKE audit_logs INCLUDING ALL EXCLUDING INDEXES
    ) PARTITION BY RANGE (created_at);

    -- 创建分区索引
    CREATE INDEX IF NOT EXISTS audit_logs_p_operator_idx ON audit_logs_partitioned (operator_id);
    CREATE INDEX IF NOT EXISTS audit_logs_p_action_idx ON audit_logs_partitioned (action);
    CREATE INDEX IF NOT EXISTS audit_logs_p_target_idx ON audit_logs_partitioned (target_type, target_id);
    CREATE INDEX IF NOT EXISTS audit_logs_p_created_idx ON audit_logs_partitioned (created_at DESC);

    -- 创建分区
    CREATE TABLE IF NOT EXISTS audit_logs_202605 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202606 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202607 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202608 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202609 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202610 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202611 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
    CREATE TABLE IF NOT EXISTS audit_logs_202612 PARTITION OF audit_logs_partitioned FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

    -- 迁移数据
    INSERT INTO audit_logs_partitioned SELECT * FROM audit_logs;

    -- 重命名表
    DROP TABLE audit_logs;
    ALTER TABLE audit_logs_partitioned RENAME TO audit_logs;
  END IF;
END $$;

-- ── 3. operation_logs 分区 ──

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'operation_logs') THEN
    -- 创建分区父表
    CREATE TABLE IF NOT EXISTS operation_logs_partitioned (
      LIKE operation_logs INCLUDING ALL EXCLUDING INDEXES
    ) PARTITION BY RANGE (created_at);

    -- 创建分区索引
    CREATE INDEX IF NOT EXISTS operation_logs_p_user_idx ON operation_logs_partitioned (user_id);
    CREATE INDEX IF NOT EXISTS operation_logs_p_action_idx ON operation_logs_partitioned (action);
    CREATE INDEX IF NOT EXISTS operation_logs_p_created_idx ON operation_logs_partitioned (created_at DESC);

    -- 创建分区
    CREATE TABLE IF NOT EXISTS operation_logs_202605 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202606 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202607 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202608 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202609 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202610 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202611 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
    CREATE TABLE IF NOT EXISTS operation_logs_202612 PARTITION OF operation_logs_partitioned FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

    -- 迁移数据
    INSERT INTO operation_logs_partitioned SELECT * FROM operation_logs;

    -- 重命名表
    DROP TABLE operation_logs;
    ALTER TABLE operation_logs_partitioned RENAME TO operation_logs;
  END IF;
END $$;

-- ── 4. 分区维护函数 ──

CREATE OR REPLACE FUNCTION create_next_partition(
  parent_table TEXT,
  start_date DATE
) RETURNS void AS $$
DECLARE
  partition_name TEXT;
  end_date DATE;
BEGIN
  end_date := start_date + INTERVAL '1 month';
  partition_name := parent_table || '_' || TO_CHAR(start_date, 'YYYYMM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    parent_table,
    start_date,
    end_date
  );
END;
$$ LANGUAGE plpgsql;

-- ── 验证分区 ──
SELECT
  schemaname,
  tablename,
  CASE
    WHEN tablename LIKE '%_2026%' THEN 'partition'
    ELSE 'parent'
  END as type
FROM pg_tables
WHERE tablename LIKE 'balance_logs%' OR tablename LIKE 'audit_logs%' OR tablename LIKE 'operation_logs%'
ORDER BY tablename;
