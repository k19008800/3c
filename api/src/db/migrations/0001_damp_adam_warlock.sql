CREATE TABLE IF NOT EXISTS "recharge_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"pay_amount" numeric(18, 2),
	"actual_amount" numeric(18, 2),
	"payment_method" varchar(20) NOT NULL,
	"trade_no" varchar(128),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"promotion_id" integer,
	"free_amount" numeric(18, 2),
	"voucher_path" varchar(255),
	"review_note" varchar(500),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recharge_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_before" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"order_id" varchar(64),
	"recharge_order_id" integer,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_logs" ADD CONSTRAINT "balance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recharge_user_id" ON "recharge_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recharge_status" ON "recharge_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_user_id" ON "balance_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_type" ON "balance_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bl_created" ON "balance_logs" USING btree ("created_at");