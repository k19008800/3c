-- Migration: Create agent_balance_ledger table
-- Used by agent reconciliation (月度对账 + 资金流水)

CREATE TABLE IF NOT EXISTS agent_balance_ledger (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  balance_type VARCHAR(20) NOT NULL,   -- 'available' | 'frozen'
  change_type VARCHAR(30) NOT NULL,     -- 'deduction' | 'freeze' | 'unfreeze' | 'refund'
  amount BIGINT NOT NULL,               -- 金额（分为单位，与 schema bigint 对齐）
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  ref_type VARCHAR(20),                 -- 'order' | 'call' | 'withdraw' | 'unfreeze'
  ref_id INTEGER,
  ref_code_id INTEGER REFERENCES redemption_codes(id),
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for agent reconciliation queries
CREATE INDEX IF NOT EXISTS abl_agent_idx ON agent_balance_ledger(agent_id);
CREATE INDEX IF NOT EXISTS abl_agent_created_idx ON agent_balance_ledger(agent_id, created_at);
CREATE INDEX IF NOT EXISTS abl_balance_type_idx ON agent_balance_ledger(balance_type);
CREATE INDEX IF NOT EXISTS abl_ref_code_idx ON agent_balance_ledger(ref_code_id);
