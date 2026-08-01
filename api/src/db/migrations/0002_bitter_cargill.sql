CREATE TABLE IF NOT EXISTS "agent_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"level" varchar(20) DEFAULT 'prepare' NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"verify_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"withdraw_account" varchar(64),
	"withdraw_bank" varchar(100),
	"withdraw_name" varchar(50),
	"notif_prefs" varchar(255) DEFAULT '{}',
	"referral_code" varchar(32),
	"parent_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "agent_profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_profile_level" ON "agent_profiles" USING btree ("level");