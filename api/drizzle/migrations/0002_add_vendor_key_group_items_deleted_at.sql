-- Add missing columns to vendor_key_group_items
-- Schema already defines deletedAt and notes, but migration was never generated
ALTER TABLE "vendor_key_group_items" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "vendor_key_group_items" ADD COLUMN IF NOT EXISTS "notes" text;
