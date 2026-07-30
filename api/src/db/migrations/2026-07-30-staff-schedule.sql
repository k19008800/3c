-- ============================================================
--  3cloud (3C) — 客服排班与 SLA 表
--  Migration: 2026-07-30-staff-schedule
--  创建客服排班与 SLA 升级相关表
-- ============================================================

-- 客服排班表
CREATE TABLE IF NOT EXISTS staff_schedules (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun, 1=Mon, ..., 6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_holiday BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (staff_id, weekday)
);

-- 排班例外记录（临时调班/请假）
CREATE TABLE IF NOT EXISTS staff_schedule_exceptions (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(20) NOT NULL DEFAULT 'leave',  -- leave / swap / overtime
  start_time TIME,
  end_time TIME,
  reason VARCHAR(500),
  approved_by INTEGER REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / approved / rejected
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (staff_id, exception_date)
);

-- 客服 SLA 配置表
CREATE TABLE IF NOT EXISTS staff_sla_configs (
  id SERIAL PRIMARY KEY,
  ticket_type VARCHAR(30) NOT NULL,  -- urgent / high / normal / low
  first_response_min INTEGER NOT NULL DEFAULT 60,  -- 首次响应时间（分钟）
  resolution_min INTEGER NOT NULL DEFAULT 1440,     -- 解决时间（分钟）
  escalation_50pct_to VARCHAR(20) DEFAULT 'staff',  -- 50% 超时通知对象
  escalation_100pct_to VARCHAR(20) DEFAULT 'supervisor',
  escalation_200pct_to VARCHAR(20) DEFAULT 'manager',
  working_hours_only BOOLEAN DEFAULT TRUE,  -- 是否仅工作时间计算
  is_default BOOLEAN DEFAULT FALSE,  -- 是否为默认配置
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 客服质检记录表
CREATE TABLE IF NOT EXISTS staff_quality_checks (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  session_id INTEGER REFERENCES chat_sessions(id) ON DELETE SET NULL,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  dimensions JSONB DEFAULT '{}',  -- 各项维度评分 { "response_speed": 8, "attitude": 9, "accuracy": 7, ... }
  feedback TEXT,
  status VARCHAR(20) DEFAULT 'draft',  -- draft / published
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_id ON staff_schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_exceptions_staff_id ON staff_schedule_exceptions(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_exceptions_date ON staff_schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_staff_quality_checks_staff_id ON staff_quality_checks(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_quality_checks_reviewer_id ON staff_quality_checks(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_staff_quality_checks_score ON staff_quality_checks(score);