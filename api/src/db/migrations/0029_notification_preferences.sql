-- §22.6 用户端通知偏好增强
-- 对应 docs/SPEC-§22-用户端体验增强.md §22.6
-- JSONB 列存储避免每类事件一个列

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  email_frequency VARCHAR(20) DEFAULT 'daily',
  email_digest_time VARCHAR(5) DEFAULT '09:00',
  in_app_preferences JSONB DEFAULT '{}',
  email_preferences JSONB DEFAULT '{}',
  balance_low_threshold INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notif_prefs ON user_notification_preferences(user_id);
