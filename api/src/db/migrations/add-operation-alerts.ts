-- ============================================================
--  3cloud (3C) — 异常操作告警表迁移
--  operation_alerts + operation_alert_rules
-- ============================================================

-- ── 异常操作告警记录表 ──
CREATE TABLE IF NOT EXISTS operation_alerts (
  id SERIAL PRIMARY KEY,
  
  -- 告警类型
  alert_type VARCHAR(50) NOT NULL,
  -- frequent_failure | remote_login | batch_delete | sensitive_operation
  
  -- 严重程度
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  -- critical | warning | info
  
  -- 关联用户
  user_id INTEGER NOT NULL REFERENCES users(id),
  
  -- 告警标题和详情
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  
  -- 关联的操作日志 ID 列表
  related_operation_ids JSONB,
  
  -- 告警元数据
  metadata JSONB,
  
  -- 处理状态
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | acknowledged | resolved | ignored
  
  -- 处理信息
  handled_by INTEGER REFERENCES users(id),
  handled_at TIMESTAMP WITH TIME ZONE,
  handle_note TEXT,
  
  -- 通知状态
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS operation_alerts_type_idx ON operation_alerts(alert_type);
CREATE INDEX IF NOT EXISTS operation_alerts_user_idx ON operation_alerts(user_id);
CREATE INDEX IF NOT EXISTS operation_alerts_status_idx ON operation_alerts(status);
CREATE INDEX IF NOT EXISTS operation_alerts_created_at_idx ON operation_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS operation_alerts_severity_idx ON operation_alerts(severity);

-- ── 告警规则配置表 ──
CREATE TABLE IF NOT EXISTS operation_alert_rules (
  id SERIAL PRIMARY KEY,
  
  -- 规则类型（唯一）
  rule_type VARCHAR(50) NOT NULL UNIQUE,
  -- frequent_failure | remote_login | batch_delete | sensitive_operation
  
  -- 规则名称和描述
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- 是否启用
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- 严重程度
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  
  -- 规则参数（JSON 配置）
  params JSONB NOT NULL DEFAULT '{}',
  
  -- 通知配置
  notify_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email BOOLEAN NOT NULL DEFAULT FALSE,
  email_recipients JSONB,
  
  -- 创建/更新信息
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS operation_alert_rules_type_idx ON operation_alert_rules(rule_type);
CREATE INDEX IF NOT EXISTS operation_alert_rules_enabled_idx ON operation_alert_rules(enabled);

-- ── 注释 ──
COMMENT ON TABLE operation_alerts IS '异常操作告警记录';
COMMENT ON TABLE operation_alert_rules IS '异常操作告警规则配置';

COMMENT ON COLUMN operation_alerts.alert_type IS '告警类型：frequent_failure/remote_login/batch_delete/sensitive_operation';
COMMENT ON COLUMN operation_alerts.severity IS '严重程度：critical/warning/info';
COMMENT ON COLUMN operation_alerts.status IS '处理状态：pending/acknowledged/resolved/ignored';
COMMENT ON COLUMN operation_alerts.related_operation_ids IS '关联的操作日志 ID 数组';

COMMENT ON COLUMN operation_alert_rules.rule_type IS '规则类型（唯一标识）';
COMMENT ON COLUMN operation_alert_rules.params IS '规则参数 JSON，如 { "timeWindowMinutes": 10, "threshold": 10 }';
COMMENT ON COLUMN operation_alert_rules.notify_in_app IS '是否发送站内信通知';
COMMENT ON COLUMN operation_alert_rules.notify_email IS '是否发送邮件通知';
COMMENT ON COLUMN operation_alert_rules.email_recipients IS '邮件接收者邮箱数组';
