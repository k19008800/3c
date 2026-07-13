-- ============================================================
--  兑换码风控事件表 — redemption_fraud_events
--  记录爆破攻击、IP 异常、用户高频兑换、码泄露等高危事件
-- ============================================================

CREATE TABLE IF NOT EXISTS redemption_fraud_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,         -- brute_force / ip_anomaly / user_frequency / code_leak / high_risk_score
  ip VARCHAR(45),                          -- 触发 IP
  user_id INTEGER,                         -- 触发用户
  code_id INTEGER,                         -- 关联兑换码
  code VARCHAR(20),                        -- 尝试的码
  risk_score INTEGER DEFAULT 0,            -- 0-100 风险分数
  detail TEXT,                             -- JSON 详情
  severity VARCHAR(20) DEFAULT 'warning',  -- warning / high / critical
  acknowledged BOOLEAN DEFAULT false,      -- 是否已处理
  acknowledged_by INTEGER,                 -- 处理人
  acknowledged_at TIMESTAMP,               -- 处理时间
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_fraud_type      ON redemption_fraud_events(event_type);
CREATE INDEX IF NOT EXISTS idx_fraud_ip        ON redemption_fraud_events(ip);
CREATE INDEX IF NOT EXISTS idx_fraud_user      ON redemption_fraud_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_created   ON redemption_fraud_events(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_severity  ON redemption_fraud_events(severity);
CREATE INDEX IF NOT EXISTS idx_fraud_acked     ON redemption_fraud_events(acknowledged);
