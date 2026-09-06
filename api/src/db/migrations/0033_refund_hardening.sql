-- T-03 refund/reversal hardening. Existing rows are balance_refund by default.
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS refund_type varchar(20) NOT NULL DEFAULT 'balance_refund';
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS source varchar(50);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS reference varchar(100);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS review_stage varchar(20) NOT NULL DEFAULT 'pending';
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS first_reviewed_by integer REFERENCES users(id);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS second_reviewed_by integer REFERENCES users(id);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS super_reviewed_by integer REFERENCES users(id);
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS execution_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS manual_intervention_required boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_business_reference
  ON refund_requests (refund_type, reference) WHERE reference IS NOT NULL;
-- The partitioned balance ledger cannot have a cross-partition unique index;
-- execute therefore enforces (reference_type, reference_id) in its transaction.
