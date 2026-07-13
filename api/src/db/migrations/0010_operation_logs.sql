-- ============================================================
--  操作日志表 — 用户/代理商日常操作记录
--  (管理员操作不入此表，见 audit_logs)
-- ============================================================

-- 1. 枚举类型
DO $$ BEGIN
  CREATE TYPE operation_category AS ENUM ('auth','api_key','finance','profile','agent','system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. 表
CREATE TABLE IF NOT EXISTS operation_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  user_role   VARCHAR(20) NOT NULL,        -- 'user' | 'agent' | 'admin' | 'super_admin'

  -- 操作分类
  category    operation_category NOT NULL,
  action      VARCHAR(80) NOT NULL,         -- 如 'login', 'api_key_create', 'recharge_submit'

  -- 操作上下文
  target_type    VARCHAR(50),               -- 'api_key', 'order', 'user', 'agent_client', 'redemption_code'
  target_id      INT,
  resource_name  VARCHAR(200),              -- 人类可读资源名

  -- 摘要
  summary     TEXT,                          -- 一句话摘要
  metadata    JSONB,                         -- 附加字段

  -- 结果
  status      VARCHAR(20) NOT NULL DEFAULT 'success',  -- 'success' | 'failure' | 'pending'
  error_reason TEXT,

  ip          VARCHAR(45),
  user_agent  VARCHAR(500),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS oplog_user_time_idx       ON operation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS oplog_category_time_idx   ON operation_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS oplog_action_time_idx     ON operation_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS oplog_status_time_idx     ON operation_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS oplog_target_idx          ON operation_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS oplog_created_at_idx      ON operation_logs(created_at);
