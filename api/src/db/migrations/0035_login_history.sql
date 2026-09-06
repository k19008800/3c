CREATE TABLE IF NOT EXISTS login_history (
 id serial PRIMARY KEY,
 user_id integer NOT NULL,
 success boolean NOT NULL DEFAULT true,
 ip varchar(50),
 city varchar(100),
 browser varchar(100),
 os varchar(100),
 device_info jsonb,
 risk_level varchar(20),
 login_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, login_at);