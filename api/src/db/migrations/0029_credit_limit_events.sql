-- 0029_credit_limit_events.sql
-- R6 拆分规避与限额：24h 滚动窗口「加钱事件」的 PG 权威表（ARCH v1.1 §3.2 / 调度终裁：
-- 创建时预占 + 驳回/红冲不回退，B9/B18/B19）。
--
-- 语义：
--   - scope: 'operator'（操作人）| 'user'（被入账用户）
--   - 每笔「加钱方向运营操作」（人工上账创建 / 调账调增发起 / 红冲加钱方向发起）
--     在创建事务内插两行（op + user 各一）；UNIQUE(scope, ref_type, ref_id) 同单同维度只计一次（幂等）；
--   - 判定：pg_advisory_xact_lock 串行化同维度并发 + 24h 滚动 SUM + 超限（soft 升级 / hard 429）；
--   - 驳回 / 红冲扣钱方向不回退累计（无 DECRBY）；
--   - Redis `lim:op:{userId}` / `lim:user:{userId}` ZSET 为热路径缓存（提交后 ZADD 尽力同步，可回填）。
CREATE TABLE IF NOT EXISTS credit_limit_events (
  id          serial PRIMARY KEY,
  scope       varchar(10)  NOT NULL CHECK (scope IN ('operator', 'user')),
  user_id     integer      NOT NULL REFERENCES users(id),
  amount      numeric(18,2) NOT NULL,
  ref_type    varchar(30)  NOT NULL,              -- manual_topup | adjustment | reverse
  ref_id      varchar(50)  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_limit_event UNIQUE (scope, ref_type, ref_id)
);
COMMENT ON TABLE credit_limit_events IS '24h 滚动加钱事件（元）：operator=操作人，user=被入账用户；创建时预占、驳回/红冲不回退；PG 权威，Redis ZSET 为热路径缓存';
CREATE INDEX IF NOT EXISTS idx_credit_limit_events_scope_user ON credit_limit_events (scope, user_id, created_at);
