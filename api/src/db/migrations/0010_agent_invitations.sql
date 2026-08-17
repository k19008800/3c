CREATE TABLE IF NOT EXISTS "agent_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"used_by" integer,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_invitations_code_unique" ON "agent_invitations" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_invitations_agent" ON "agent_invitations" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_invitations_status" ON "agent_invitations" ("status");
