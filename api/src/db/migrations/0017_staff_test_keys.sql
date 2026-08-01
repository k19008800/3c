--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_test_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "staff_id" integer NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "key_prefix" varchar(20) NOT NULL,
  "name" varchar(100),
  "associated_user_id" integer,
  "token_limit" bigint DEFAULT 1000000 NOT NULL,
  "cost_limit" numeric(10, 2) DEFAULT '5.00' NOT NULL,
  "used_tokens" bigint DEFAULT 0 NOT NULL,
  "used_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
  "is_test" boolean DEFAULT true NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "revoked_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_test_keys_key_hash_unique" ON "staff_test_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_key_staff" ON "staff_test_keys" ("staff_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_test_key_hash" ON "staff_test_keys" ("key_hash");
