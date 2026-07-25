-- ============================================================
-- 3cloud (3C) — 监控告警系统增强迁移
-- 添加增强的监控告警表结构
-- ============================================================

-- 检查并删除已有的监控表（如果存在）
DROP TABLE IF EXISTS notification_history CASCADE;
DROP TABLE IF EXISTS notification_config CASCADE;
DROP TABLE IF EXISTS monitoring_rules CASCADE;
DROP TABLE IF EXISTS monitoring_alerts CASCADE;

-- 创建监控告警表
CREATE TABLE monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('api_response_time', 'api_error_rate', 'database_connection', 'redis_health', 'disk_usage', 'memory_usage')),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    message TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    escalated BOOLEAN NOT NULL DEFAULT FALSE,
    escalation_level INTEGER DEFAULT 0,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_monitoring_alerts_type ON monitoring_alerts(type);
CREATE INDEX idx_monitoring_alerts_severity ON monitoring_alerts(severity);
CREATE INDEX idx_monitoring_alerts_acknowledged ON monitoring_alerts(acknowledged);
CREATE INDEX idx_monitoring_alerts_created_at ON monitoring_alerts(created_at);
CREATE INDEX idx_monitoring_alerts_resolved ON monitoring_alerts(resolved);

-- 创建监控规则表
CREATE TABLE monitoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL UNIQUE CHECK (type IN ('api_response_time', 'api_error_rate', 'database_connection', 'redis_health', 'disk_usage', 'memory_usage')),
    name TEXT NOT NULL,
    description TEXT,
    threshold DOUBLE PRECISION NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    duration INTEGER DEFAULT 60,
    silence_period INTEGER DEFAULT 300,
    escalation_enabled BOOLEAN DEFAULT FALSE,
    escalation_after INTEGER DEFAULT 3600,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_monitoring_rules_enabled ON monitoring_rules(enabled);
CREATE INDEX idx_monitoring_rules_severity ON monitoring_rules(severity);
CREATE INDEX idx_monitoring_rules_updated_at ON monitoring_rules(updated_at);

-- 创建通知配置表
CREATE TABLE notification_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_recipients JSONB,
    webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    webhook_url TEXT,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sms_phone_numbers JSONB,
    push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    push_tokens JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建通知历史表
CREATE TABLE notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES monitoring_alerts(id) ON DELETE SET NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'webhook', 'sms', 'push')),
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_notification_history_alert_id ON notification_history(alert_id);
CREATE INDEX idx_notification_history_channel ON notification_history(channel);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_created_at ON notification_history(created_at);

-- 插入默认监控规则
INSERT INTO monitoring_rules (type, name, description, threshold, severity, enabled) VALUES
    ('api_response_time', 'API响应时间告警', 'API P95响应时间超过阈值', 1000, 'warning', true),
    ('api_error_rate', 'API错误率告警', 'API错误率超过阈值', 5, 'critical', true),
    ('database_connection', '数据库连接告警', '数据库连接失败', 0, 'critical', true),
    ('redis_health', 'Redis健康状态告警', 'Redis连接失败', 0, 'critical', true),
    ('disk_usage', '磁盘使用率告警', '磁盘使用率超过阈值', 90, 'warning', true),
    ('memory_usage', '内存使用率告警', '内存使用率超过阈值', 90, 'warning', true);

-- 插入默认通知配置
INSERT INTO notification_config (name, email_enabled, email_recipients, webhook_enabled, push_enabled) VALUES
    ('default', true, '["admin@3cloud.com"]', false, false);

-- 添加触发器：更新规则时自动更新updated_at
CREATE OR REPLACE FUNCTION update_monitoring_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_monitoring_rules_updated_at
    BEFORE UPDATE ON monitoring_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_monitoring_rules_updated_at();

-- 添加触发器：更新通知配置时自动更新updated_at
CREATE OR REPLACE FUNCTION update_notification_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_config_updated_at
    BEFORE UPDATE ON notification_config
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_config_updated_at();

-- 添加注释
COMMENT ON TABLE monitoring_alerts IS '监控告警记录表';
COMMENT ON TABLE monitoring_rules IS '监控告警规则表';
COMMENT ON TABLE notification_config IS '通知配置表';
COMMENT ON TABLE notification_history IS '通知历史记录表';