-- 0027_recharge_orders_idempotency.sql
-- R1 人工上账创建幂等：L2 DB 唯一兜底（L1 为 Redis 锁，见 ARCH-2026-ADMIN-RECHARGE-R1R4-001 §3.4）
-- 本迁移仅新增可空唯一列，存量行 idempotency_key 全 NULL（PG 唯一索引允许多个 NULL），无需数据回填。
ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS idempotency_key varchar(100);

-- 唯一索引：同 Idempotency-Key 重复创建由 DB 层兜底拒绝（并发双写场景）
CREATE UNIQUE INDEX IF NOT EXISTS uq_recharge_orders_idempotency_key ON recharge_orders (idempotency_key);

-- 兜底核查（上线前）：SELECT idempotency_key, count(*) FROM recharge_orders GROUP BY 1 HAVING count(*) > 1;  预期 0 行
