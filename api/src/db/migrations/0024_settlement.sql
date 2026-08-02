-- 代理结算对账模块（Sprint 1）
-- 对齐 docs/sprint-1/03-settlement-overview.md §2.5
-- 2026-08-02

CREATE TABLE IF NOT EXISTS settlement_cycles (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  generated_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_cycle_period ON settlement_cycles(period_start, period_end);

CREATE TABLE IF NOT EXISTS agent_settlements (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES settlement_cycles(id),
  agent_user_id INTEGER NOT NULL REFERENCES users(id),
  total_commission DECIMAL(18,4) NOT NULL DEFAULT '0',
  adjustment_amount DECIMAL(18,4) NOT NULL DEFAULT '0',
  adjustment_reason TEXT,
  settled_amount DECIMAL(18,4) NOT NULL DEFAULT '0',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  confirmed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_cycle_agent ON agent_settlements(cycle_id, agent_user_id);
CREATE INDEX IF NOT EXISTS idx_settlement_agent ON agent_settlements(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_settlement_status ON agent_settlements(status);

CREATE TABLE IF NOT EXISTS settlement_details (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  commission_id INTEGER NOT NULL,
  amount DECIMAL(18,8) NOT NULL DEFAULT '0',
  client_user_id INTEGER NOT NULL REFERENCES users(id),
  consumption_id INTEGER,
  model VARCHAR(100),
  tokens INTEGER DEFAULT 0,
  commission_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlement_detail_sid ON settlement_details(settlement_id);

CREATE TABLE IF NOT EXISTS settlement_confirm_logs (
  id SERIAL PRIMARY KEY,
  settlement_id INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  operator_id INTEGER REFERENCES users(id),
  operator_role VARCHAR(20) NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlement_log_sid ON settlement_confirm_logs(settlement_id);
