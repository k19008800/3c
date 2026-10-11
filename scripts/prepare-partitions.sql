-- ============================================================
-- 演示数据前置：补齐 consumption_records 月度分区
-- ============================================================
-- 背景：生产 consumption_records 是 RANGE(created_at) 分区表，
--       现有分区只到 2027_01，而本次造数窗口为「最近 180 天」
--       （2026-04-14~ 2026-10-11）。若不补分区，4~9 月共约 6/10
--       的数据会全部落进 default 分区：
--         - default 分区无独立命名，运维看不出数据归属
--         - 未来按月拆分/清理无从下手
--         - 查询全部走 default，规划器无法按月裁剪
--
-- 本脚本为2026_04~ 2026_09 补 6 个月度分区。
--
-- ⚠️ 2026_08 需要特殊处理：default 分区里已存在 1 条基础数据
--    req_demo_12 (2026-08-01)，PostgreSQL 创建分区时会校验
--    default 中是否有落在新范围内的行，有则报错。所以流程是
--    「暂存 → 建分区 → 回填」。
--
-- 幂等：已存在的分区跳过（IF NOT EXISTS）。
-- ============================================================

\timing on

BEGIN;

-- 幂等保护：seed 数据已存在说明分区已就绪，无需重复执行
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM consumption_records WHERE request_id LIKE 'seed-%' LIMIT 1) THEN
    RAISE NOTICE 'seed 数据已存在，跳过分区准备';
    RETURN;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 步骤 1：暂存 default 分区中落在 2026_04~2026_09 的行
-- ------------------------------------------------------------
CREATE TEMP TABLE _default_stash AS
SELECT * FROM consumption_records_default
WHERE created_at >= TIMESTAMP '2026-04-01 00:00:00'
  AND created_at <  TIMESTAMP '2026-10-01 00:00:00';

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM _default_stash;
  RAISE NOTICE 'default 分区中需迁移的行数: %', n;
END $$;

DELETE FROM consumption_records_default
WHERE created_at >= TIMESTAMP '2026-04-01 00:00:00'
  AND created_at <  TIMESTAMP '2026-10-01 00:00:00';

-- ------------------------------------------------------------
-- 步骤 2：创建 6 个月度分区
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumption_records_2026_04 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-04-01 00:00:00') TO ('2026-05-01 00:00:00');
CREATE TABLE IF NOT EXISTS consumption_records_2026_05 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
CREATE TABLE IF NOT EXISTS consumption_records_2026_06 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
CREATE TABLE IF NOT EXISTS consumption_records_2026_07 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');
CREATE TABLE IF NOT EXISTS consumption_records_2026_08 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');
CREATE TABLE IF NOT EXISTS consumption_records_2026_09 PARTITION OF consumption_records
  FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');

-- ------------------------------------------------------------
-- 步骤 3：回填暂存行（会被路由到正确的月度分区）
-- ------------------------------------------------------------
INSERT INTO consumption_records
SELECT * FROM _default_stash;

COMMIT;

\timing off

\echo '=== 分区现状 ==='
SELECT c.relname AS 分区, pg_get_expr(c.relpartbound, c.oid) AS 边界,
       CASE WHEN c.relname = 'consumption_records_default' THEN NULL
            ELSE pg_size_pretty(pg_total_relation_size(c.oid)) END AS 体积
FROM pg_class c
JOIN pg_inherits i ON i.inhrelid = c.oid
JOIN pg_class p ON p.oid = i.inhparent
WHERE p.relname = 'consumption_records'
ORDER BY c.relname;

\echo '=== 数据完整性校验 ==='
SELECT count(*) AS 总条数,
       count(*) FILTER (WHERE request_id = 'req_demo_12') AS 基础数据仍在
FROM consumption_records;