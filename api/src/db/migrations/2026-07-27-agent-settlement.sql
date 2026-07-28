-- ============================================================
--  3cloud (3C) — Migration: 代理结算周期与对账
--  2026-07-27
--  新增表：settlement_cycles, agent_settlements, settlement_details, settlement_confirm_logs
-- ============================================================

-- 1. 结算周期定义
CREATE TABLE IF NOT EXISTS settlement_cycles (
  id                SERIAL PRIMARY KEY,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
  generated_at      TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sc_period_idx
  ON settlement_cycles (period_start, period_end);

-- 2. 代理结算账单
CREATE TABLE IF NOT EXISTS agent_settlements (
  id                  SERIAL PRIMARY KEY,
  cycle_id             INTEGER NOT NULL REFERENCES settlement_cycles(id),
  agent_id             INTEGER NOT NULL REFERENCES agents(id),
  total_commission     DECIMAL(18,4) NOT NULL DEFAULT 0,
  settled_amount       DECIMAL(18,4) NOT NULL DEFAULT 0,
  adjustment_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,
  adjustment_reason    TEXT,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',
  confirmed_at         TIMESTAMPTZ,
  settled_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS as_agent_cycle_idx
  ON agent_settlements (cycle_id, agent_id);

CREATE INDEX IF NOT EXISTS as_agent_id_idx
  ON agent_settlements (agent_id);

CREATE INDEX IF NOT EXISTS as_status_idx
  ON agent_settlements (status);

-- 3. 结算明细
CREATE TABLE IF NOT EXISTS settlement_details (
  id                SERIAL PRIMARY KEY,
  settlement_id      INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  commission_id      INTEGER NOT NULL,
  amount             DECIMAL(18,4) NOT NULL,
  client_user_id     INTEGER NOT NULL REFERENCES users(id),
  consumption_id     INTEGER,
  model              VARCHAR(100),
  tokens             INTEGER,
  commission_rate    DECIMAL(5,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sd_settlement_idx
  ON settlement_details (settlement_id);

CREATE INDEX IF NOT EXISTS sd_client_idx
  ON settlement_details (client_user_id);

-- 4. 对账确认日志
CREATE TABLE IF NOT EXISTS settlement_confirm_logs (
  id                SERIAL PRIMARY KEY,
  settlement_id      INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  action             VARCHAR(20) NOT NULL,
  operator_id        INTEGER REFERENCES users(id),
  operator_role      VARCHAR(20),
  detail             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scl_settlement_idx
  ON settlement_confirm_logs (settlement_id);
