-- 2026-07-31: 授信额度与逾期管理（SPEC-§29.6）
-- 信用额度账户 + 逾期记录 + 罚息计算
CREATE TABLE IF NOT EXISTS credit_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_limit DECIMAL(18,2) NOT NULL DEFAULT '0.00',
  used_amount DECIMAL(18,2) NOT NULL DEFAULT '0.00',
  available_amount DECIMAL(18,2) NOT NULL DEFAULT '0.00',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active | suspended | frozen
  interest_rate_daily DECIMAL(8,6) NOT NULL DEFAULT '0.000500',
  grace_days INTEGER NOT NULL DEFAULT 7,
  last_billing_date DATE,
  next_billing_date DATE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_accounts_user_idx ON credit_accounts (user_id);
CREATE INDEX IF NOT EXISTS credit_accounts_status_idx ON credit_accounts (status);

CREATE TABLE IF NOT EXISTS overdue_records (
  id SERIAL PRIMARY KEY,
  credit_account_id INTEGER NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overdue_days INTEGER NOT NULL DEFAULT 0,
  overdue_amount DECIMAL(18,2) NOT NULL DEFAULT '0.00',
  penalty_amount DECIMAL(18,2) NOT NULL DEFAULT '0.00',
  stage VARCHAR(20) NOT NULL DEFAULT 'reminding',
  -- reminding(1-7天) | collecting(8-15天) | suspended(16-30天) | frozen(>30天)
  waived BOOLEAN NOT NULL DEFAULT false,
  waived_by INTEGER REFERENCES users(id),
  waived_at TIMESTAMPTZ,
  waived_note TEXT,
  notify_sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  -- open | resolved
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overdue_records_user_idx ON overdue_records (user_id);
CREATE INDEX IF NOT EXISTS overdue_records_stage_idx ON overdue_records (stage);
CREATE INDEX IF NOT EXISTS overdue_records_status_idx ON overdue_records (status);
