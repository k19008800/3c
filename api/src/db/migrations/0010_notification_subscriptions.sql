--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"channel" varchar(20) NOT NULL DEFAULT 'site',
	"notify_enabled" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_notif_sub_user_type_channel" ON "notification_subscriptions" USING btree ("user_id","type","channel");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_sub_user" ON "notification_subscriptions" USING btree ("user_id");
