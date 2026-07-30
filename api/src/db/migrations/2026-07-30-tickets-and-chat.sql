-- ============================================================
--  3cloud (3C) — 工单系统（§26）+ 在线聊天（§27）迁移
--  新建 8 张表
--  编号接续：0009 (after 2026-07-27-agent-settlement.sql)
--  自动生成的编号逻辑由后端应用层处理
-- ============================================================

-- === 工单系统（§26） ===

-- 工单主表
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" SERIAL PRIMARY KEY,
  "ticket_no" VARCHAR(30) NOT NULL UNIQUE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "title" VARCHAR(200) NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "priority" VARCHAR(20) DEFAULT 'normal',
  "status" VARCHAR(20) DEFAULT 'pending',
  "description" TEXT NOT NULL,
  "attachments" TEXT,
  "assignee_id" INTEGER REFERENCES "users"("id"),
  "tags" TEXT,
  "source" VARCHAR(20) DEFAULT 'user',
  "first_response_at" TIMESTAMP,
  "resolved_at" TIMESTAMP,
  "closed_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- 工单回复
CREATE TABLE IF NOT EXISTS "ticket_replies" (
  "id" SERIAL PRIMARY KEY,
  "ticket_id" INTEGER NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "is_staff" BOOLEAN DEFAULT FALSE,
  "content" TEXT NOT NULL,
  "attachments" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 工单标签定义
CREATE TABLE IF NOT EXISTS "ticket_tag_defs" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(50) NOT NULL UNIQUE,
  "color" VARCHAR(20) DEFAULT '#6366f1',
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 满意度评价
CREATE TABLE IF NOT EXISTS "ticket_satisfaction" (
  "id" SERIAL PRIMARY KEY,
  "ticket_id" INTEGER NOT NULL UNIQUE REFERENCES "tickets"("id") ON DELETE CASCADE,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 工单操作日志
CREATE TABLE IF NOT EXISTS "ticket_operation_logs" (
  "id" SERIAL PRIMARY KEY,
  "ticket_id" INTEGER NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "operator_id" INTEGER REFERENCES "users"("id"),
  "action" VARCHAR(50) NOT NULL,
  "detail" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- === 在线聊天（§27） ===

-- 聊天会话
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "staff_id" INTEGER REFERENCES "users"("id"),
  "status" VARCHAR(20) DEFAULT 'waiting',
  "category" VARCHAR(30),
  "queue_position" INTEGER,
  "waiting_started_at" TIMESTAMP,
  "staff_assigned_at" TIMESTAMP,
  "closed_at" TIMESTAMP,
  "closed_by" VARCHAR(20),
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 聊天消息
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" SERIAL PRIMARY KEY,
  "session_id" INTEGER NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "sender_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "sender_type" VARCHAR(10) NOT NULL,
  "content_type" VARCHAR(20) DEFAULT 'text',
  "content" TEXT NOT NULL,
  "read_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 预设消息
CREATE TABLE IF NOT EXISTS "chat_presets" (
  "id" SERIAL PRIMARY KEY,
  "type" VARCHAR(20) NOT NULL,
  "title" VARCHAR(100),
  "content" TEXT NOT NULL,
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- 客服操作日志
CREATE TABLE IF NOT EXISTS "staff_operation_logs" (
  "id" SERIAL PRIMARY KEY,
  "staff_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "operation_type" VARCHAR(50) NOT NULL,
  "target_user_id" INTEGER REFERENCES "users"("id"),
  "target_type" VARCHAR(30),
  "target_id" VARCHAR(50),
  "before_value" TEXT,
  "after_value" TEXT,
  "reason" VARCHAR(500),
  "ip" VARCHAR(45),
  "rollback_to_id" INTEGER,
  "created_at" TIMESTAMP DEFAULT NOW()
);

-- === 索引 ===

-- 工单
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON "tickets"("user_id");
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_id ON "tickets"("assignee_id");
CREATE INDEX IF NOT EXISTS idx_tickets_status ON "tickets"("status");
CREATE INDEX IF NOT EXISTS idx_tickets_category ON "tickets"("category");
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON "tickets"("priority");
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON "tickets"("created_at");
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_no ON "tickets"("ticket_no");
CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket_id ON "ticket_replies"("ticket_id");
CREATE INDEX IF NOT EXISTS idx_ticket_operation_logs_ticket_id ON "ticket_operation_logs"("ticket_id");

-- 聊天
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON "chat_sessions"("user_id");
CREATE INDEX IF NOT EXISTS idx_chat_sessions_staff_id ON "chat_sessions"("staff_id");
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON "chat_sessions"("status");
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON "chat_messages"("session_id");
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON "chat_messages"("created_at");
CREATE INDEX IF NOT EXISTS idx_staff_operation_logs_staff_id ON "staff_operation_logs"("staff_id");
CREATE INDEX IF NOT EXISTS idx_staff_operation_logs_operation_type ON "staff_operation_logs"("operation_type");
