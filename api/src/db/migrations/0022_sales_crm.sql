-- §11 CRM 业务员支撑模块表
-- 2026-08-01

-- 客户状态枚举
DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('lead','trial','active','silent','churned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE contact_method AS ENUM ('phone','wechat','email','meeting','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 客户表
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  status customer_status NOT NULL DEFAULT 'lead',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_salesperson ON customers(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- 联系记录
CREATE TABLE IF NOT EXISTS customer_contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  method contact_method NOT NULL,
  summary TEXT NOT NULL,
  next_follow_up TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_user ON customer_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_salesperson ON customer_contacts(salesperson_id);

-- 客户状态变更日志
CREATE TABLE IF NOT EXISTS customer_status_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  from_status customer_status,
  to_status customer_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_status_logs_user ON customer_status_logs(user_id);

-- 客户标签定义
CREATE TABLE IF NOT EXISTS customer_tag_defs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(7) DEFAULT '#6366f1',
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 跟进提醒
CREATE TABLE IF NOT EXISTS follow_reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_follow_reminders_salesperson ON follow_reminders(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_follow_reminders_due ON follow_reminders(due_at) WHERE status='pending';

-- 销售业绩
CREATE TABLE IF NOT EXISTS sales_performance (
  id SERIAL PRIMARY KEY,
  salesperson_id INTEGER NOT NULL REFERENCES users(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  new_customers INTEGER NOT NULL DEFAULT 0,
  total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  active_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_performance_salesperson ON sales_performance(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sales_performance_period ON sales_performance(period_start, period_end);

-- 预设标签（§11.1 预置标签）
INSERT INTO customer_tag_defs (name, color, is_preset) VALUES
  ('企业客户', '#6366f1', true),
  ('开发者', '#22c55e', true),
  ('高价值', '#f59e0b', true),
  ('需跟进', '#ef4444', true),
  ('流失预警', '#ec4899', true),
  ('已签约', '#8b5cf6', true),
  ('VIP', '#d946ef', true)
ON CONFLICT (name) DO NOTHING;
