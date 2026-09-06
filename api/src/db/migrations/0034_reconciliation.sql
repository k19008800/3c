CREATE TABLE IF NOT EXISTS reconciliation_reports (
 id serial PRIMARY KEY, start_date timestamptz NOT NULL, end_date timestamptz NOT NULL,
 recon_type varchar(30) NOT NULL DEFAULT 'full', status varchar(20) NOT NULL DEFAULT 'pending',
 total_orders integer NOT NULL DEFAULT 0, matched_orders integer NOT NULL DEFAULT 0,
 mismatched_orders integer NOT NULL DEFAULT 0, total_amount numeric(18,6) NOT NULL DEFAULT 0,
 difference numeric(18,6) NOT NULL DEFAULT 0, summary jsonb, error_message text,
 created_by integer REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, completed_at timestamptz,
 CONSTRAINT chk_recon_report_status CHECK (status IN ('pending','running','completed','failed'))
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_range ON reconciliation_reports(start_date,end_date);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_status ON reconciliation_reports(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_reports_running_range
 ON reconciliation_reports(start_date, end_date, recon_type) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS reconciliation_mismatches (
 id serial PRIMARY KEY, report_id integer NOT NULL REFERENCES reconciliation_reports(id) ON DELETE CASCADE,
 source varchar(50) NOT NULL DEFAULT 'platform', reference varchar(150),
 difference_amount numeric(18,8) NOT NULL DEFAULT 0, severity varchar(20) NOT NULL DEFAULT 'low',
 status varchar(20) NOT NULL DEFAULT 'pending', resolution_note text,
 processing_by integer REFERENCES users(id) ON DELETE SET NULL, processing_at timestamptz,
 resolved_by integer REFERENCES users(id) ON DELETE SET NULL, resolved_at timestamptz,
 reviewer_id integer REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT chk_recon_mismatch_status CHECK (status IN ('pending','processing','resolved','false_positive','ignored'))
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_mismatches_report ON reconciliation_mismatches(report_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_mismatches_status ON reconciliation_mismatches(status);
