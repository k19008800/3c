-- ============================================================
--  3cloud (3C) — 兑换码转赠日志表
--  在兑换码批量转赠场景中记录原始码 → 新码的映射
-- ============================================================

CREATE TABLE IF NOT EXISTS redemption_gift_logs (
  id SERIAL PRIMARY KEY,
  original_code_id INTEGER NOT NULL,
  new_code_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS gift_logs_from_user_id_idx ON redemption_gift_logs(from_user_id);
CREATE INDEX IF NOT EXISTS gift_logs_to_user_id_idx ON redemption_gift_logs(to_user_id);
CREATE INDEX IF NOT EXISTS gift_logs_batch_id_idx ON redemption_gift_logs(batch_id);
CREATE INDEX IF NOT EXISTS gift_logs_created_at_idx ON redemption_gift_logs(created_at);
