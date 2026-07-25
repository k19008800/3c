-- ============================================================
--  3cloud (3C) — 监控告警表迁移
--  创建时间: 2026-07-25
-- ============================================================

-- ──────────────────────────────────────────────
--  monitoring_alerts — 告警记录表
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_timestamp ON monitoring_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_type ON monitoring_alerts(type);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_severity ON monitoring_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_acknowledged ON monitoring_alerts(acknowledged);

-- ──────────────────────────────────────────────
--  monitoring_rules — 告警规则表
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monitoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE,
  threshold DOUBLE PRECISION NOT NULL,
  severity TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
--  默认告警规则
-- ──────────────────────────────────────────────

INSERT INTO monitoring_rules (type, threshold, severity, enabled) VALUES
  ('api', 1000, 'warning', true),
  ('database', 500, 'warning', true),
  ('redis', 512, 'warning', true),
  ('disk', 80, 'warning', true),
  ('memory', 85, 'warning', true),
  ('error_rate', 5, 'warning', true)
ON CONFLICT (type) DO NOTHING;

-- ──────────────────────────────────────────────
--  注释
-- ──────────────────────────────────────────────

COMMENT ON TABLE monitoring_alerts IS '系统监控告警记录';
COMMENT ON TABLE monitoring_rules IS '告警规则配置';
COMMENT ON COLUMN monitoring_alerts.type IS '告警类型: api|database|redis|disk|memory|error_rate';
COMMENT ON COLUMN monitoring_alerts.severity IS '告警级别: critical|warning|info';
COMMENT ON COLUMN monitoring_rules.type IS '告警类型: api|database|redis|disk|memory|error_rate';
COMMENT ON COLUMN monitoring_rules.threshold IS '阈值（根据类型不同单位不同）';
