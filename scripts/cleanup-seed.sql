-- ============================================================
-- 3cloud 演示数据清理
-- ============================================================
-- 与 seed-demo-data.sql 配对使用。
-- 幂等：可重复执行，无 seed 数据时静默通过。
--
-- ⚠️ 只删 request_id 以 'seed-' 开头的记录，不触碰任何真实业务数据。
--    造数脚本用固定前缀就是为了这条清理语句能精准命中。
--
-- 用法：psql -d threecloud_v3 -f scripts/cleanup-seed.sql
-- ============================================================

\echo '=== 清理前 ==='
SELECT count(*) AS 待清理条数,
       round(coalesce(sum(cost), 0)::numeric, 2) AS 涉及成本
FROM consumption_records
WHERE request_id LIKE 'seed-%';

BEGIN;

DELETE FROM consumption_records WHERE request_id LIKE 'seed-%';

COMMIT;

\echo '=== 清理后 ==='
SELECT count(*) AS 剩余seed条数 FROM consumption_records WHERE request_id LIKE 'seed-%';
SELECT count(*) AS 真实数据保留 FROM consumption_records WHERE request_id NOT LIKE 'seed-%';