-- 2026-07-31: 财务结账记录表（SPEC-§29.4）
-- 财务锁账与结转：每月结账锁定财务数据，生成结转凭证
CREATE TABLE IF NOT EXISTS finance_close_records (
  id SERIAL PRIMARY KEY,
  period VARCHAR(7) NOT NULL UNIQUE,
  period_start VARCHAR(10) NOT NULL,
  period_end VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'closed',
  income_total DECIMAL(18,6) NOT NULL DEFAULT '0.000000',
  expense_total DECIMAL(18,6) NOT NULL DEFAULT '0.000000',
  gross_profit DECIMAL(18,6) NOT NULL DEFAULT '0.000000',
  gross_margin DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  precheck_result JSONB NOT NULL DEFAULT '{}',
  carry_voucher_no VARCHAR(32),
  closed_by INTEGER REFERENCES users(id),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_by INTEGER REFERENCES users(id),
  unlocked_at TIMESTAMPTZ,
  unlock_expires_at TIMESTAMPTZ,
  locked_again_at TIMESTAMPTZ,
  remark TEXT
);

CREATE INDEX IF NOT EXISTS fcr_status_idx ON finance_close_records (status);
CREATE INDEX IF NOT EXISTS fcr_closed_idx ON finance_close_records (closed_at DESC);
