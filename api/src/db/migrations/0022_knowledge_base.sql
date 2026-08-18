-- 客服支撑补齐（2026-08-18）：知识库文章 + 在线客服会话/消息
-- 对齐原型 ref-10.2 knowledge-base / ref-27 在线客服；此前仅有原型无后端表。

-- 客服知识库文章（status: draft | published）
CREATE TABLE IF NOT EXISTS "knowledge_base_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(100) DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- 在线客服会话（status: open | closed）
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"last_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- 在线客服会话消息（role: user | staff）
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation" ON "chat_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_status" ON "chat_conversations" ("status");
CREATE INDEX IF NOT EXISTS "idx_knowledge_base_status" ON "knowledge_base_articles" ("status");
