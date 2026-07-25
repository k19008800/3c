-- ============================================================
--  3cloud (3C) — 实时告警推送系统数据库迁移
--  创建通知订阅、偏好设置、推送历史表
--  执行时间：2026-07-26
-- ============================================================

-- 1. 创建告警类型枚举
DO $$ BEGIN
    CREATE TYPE alert_type AS ENUM (
        'failure_rate_spike',
        'quota_exhaustion', 
        'suspicious_login',
        'abnormal_call_pattern',
        'security_event',
        'system_maintenance',
        'feature_update',
        'billing_reminder'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. 创建告警级别枚举
DO $$ BEGIN
    CREATE TYPE alert_level AS ENUM (
        'info',
        'warning',
        'error',
        'critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. 创建用户通知订阅表
CREATE TABLE IF NOT EXISTS user_notification_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type alert_type NOT NULL,
    subscribed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 每个用户每种类型只能有一条订阅记录
    UNIQUE(user_id, type)
);

-- 索引
CREATE INDEX IF NOT EXISTS user_notification_subscriptions_user_id_idx 
    ON user_notification_subscriptions(user_id);

-- 4. 创建用户通知偏好设置表
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- 通知渠道设置
    browser_notifications BOOLEAN NOT NULL DEFAULT true,
    mobile_push BOOLEAN NOT NULL DEFAULT true,
    email_notifications BOOLEAN NOT NULL DEFAULT false,
    
    -- 静默时段设置
    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start VARCHAR(5) NOT NULL DEFAULT '22:00', -- HH:mm 格式
    quiet_hours_end VARCHAR(5) NOT NULL DEFAULT '08:00',
    
    -- 告警过滤设置
    enabled_alert_levels TEXT NOT NULL DEFAULT '["critical", "error", "warning", "info"]',
    minimum_alert_level alert_level NOT NULL DEFAULT 'info',
    
    -- 特殊设置
    critical_alerts_always BOOLEAN NOT NULL DEFAULT true,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,
    vibration_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- 元数据
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 创建实时告警推送历史记录表
CREATE TABLE IF NOT EXISTS alert_push_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id VARCHAR(156) NOT NULL,
    alert_type alert_type NOT NULL,
    alert_level alert_level NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    
    -- 推送状态
    pushed_to_browser BOOLEAN NOT NULL DEFAULT false,
    pushed_to_mobile BOOLEAN NOT NULL DEFAULT false,
    pushed_to_email BOOLEAN NOT NULL DEFAULT false,
    
    -- 用户交互状态
    viewed BOOLEAN NOT NULL DEFAULT false,
    viewed_at TIMESTAMPTZ,
    clicked BOOLEAN NOT NULL DEFAULT false,
    clicked_at TIMESTAMPTZ,
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

-- 索引
CREATE INDEX IF NOT EXISTS alert_push_history_user_id_created_at_idx 
    ON alert_push_history(user_id, created_at DESC);
    
CREATE INDEX IF NOT EXISTS alert_push_history_alert_id_idx 
    ON alert_push_history(alert_id);
    
CREATE INDEX IF NOT EXISTS alert_push_history_unviewed_idx 
    ON alert_push_history(user_id, viewed) WHERE NOT viewed;

-- 6. 创建通知历史清理触发器（自动删除过期记录）
CREATE OR REPLACE FUNCTION clean_expired_alert_history()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM alert_push_history 
    WHERE expires_at < NOW();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 每小时清理一次过期记录
CREATE OR REPLACE FUNCTION schedule_alert_history_cleanup()
RETURNS void AS $$
BEGIN
    PERFORM cron.schedule(
        'clean-expired-alerts',
        '0 * * * *', -- 每小时执行一次
        $$DELETE FROM alert_push_history WHERE expires_at < NOW()$$
    );
END;
$$ LANGUAGE plpgsql;

-- 7. 为现有用户初始化默认订阅
INSERT INTO user_notification_subscriptions (user_id, type, subscribed)
SELECT 
    u.id,
    unnest(ARRAY[
        'failure_rate_spike',
        'quota_exhaustion',
        'suspicious_login',
        'abnormal_call_pattern'
    ]::alert_type[]) as type,
    true as subscribed
FROM users u
WHERE u.status = 'active'
    AND NOT EXISTS (
        SELECT 1 
        FROM user_notification_subscriptions us 
        WHERE us.user_id = u.id
    );

-- 8. 为现有活跃用户初始化偏好设置
INSERT INTO user_notification_preferences (
    user_id,
    browser_notifications,
    mobile_push,
    email_notifications,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end,
    enabled_alert_levels,
    minimum_alert_level,
    critical_alerts_always,
    sound_enabled,
    vibration_enabled
)
SELECT 
    u.id,
    true,
    true,
    false,
    false,
    '22:00',
    '08:00',
    '["critical", "error", "warning", "info"]',
    'info',
    true,
    true,
    true
FROM users u
WHERE u.status = 'active'
    AND NOT EXISTS (
        SELECT 1 
        FROM user_notification_preferences up 
        WHERE up.user_id = u.id
    );

-- 9. 更新通知类型枚举（扩展原有枚举）
DO $$ 
DECLARE
    existing_types text[];
BEGIN
    -- 获取现有的通知类型
    SELECT array_agg(enumlabel) INTO existing_types
    FROM pg_enum 
    WHERE enumtypid = 'notification_type'::regtype;
    
    -- 添加新的告警相关类型（如果不存在）
    IF NOT ('failure_rate_spike' = ANY(existing_types)) THEN
        ALTER TYPE notification_type ADD VALUE 'failure_rate_spike';
    END IF;
    
    IF NOT ('quota_exhaustion' = ANY(existing_types)) THEN
        ALTER TYPE notification_type ADD VALUE 'quota_exhaustion';
    END IF;
    
    IF NOT ('suspicious_login' = ANY(existing_types)) THEN
        ALTER TYPE notification_type ADD VALUE 'suspicious_login';
    END IF;
    
    IF NOT ('abnormal_call_pattern' = ANY(existing_types)) THEN
        ALTER TYPE notification_type ADD VALUE 'abnormal_call_pattern';
    END IF;
END $$;

-- 迁移完成注释
COMMENT ON TABLE user_notification_subscriptions IS '用户通知订阅表 - 管理用户对不同类型告警的订阅状态';
COMMENT ON TABLE user_notification_preferences IS '用户通知偏好设置表 - 管理通知渠道、静默时段、过滤设置等';
COMMENT ON TABLE alert_push_history IS '实时告警推送历史记录表 - 记录告警推送状态和用户交互行为，30天自动清理';