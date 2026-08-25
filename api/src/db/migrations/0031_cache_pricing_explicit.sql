-- 0031 缓存定价与缓存计量：显式缓存价 + 审计列 + 定价快照列（P0，ARCH 评审 D-8/D-12 定稿）
-- ============================================================================
-- 背景：P0 为模型缓存定价与缓存计量新增数据列（docs/P0-缓存定价与缓存计量-开发任务书.md §3.2）
--   1. supplier_models（方案术语 vendor_models）：供应商缓存成本价 2 列（L0，P3 同步引擎抓取，P0 仅建列）
--   2. vendor_pricing：缓存读取/写入售价 2 列（L1 标准价，权威计费依据；null = 回退折扣率/全价）
--   3. consumption_records：审计列 3 列 + 定价快照 2 列，共 5 列（D-8：快照并入本表，billing_logs 不建表）
-- ⚠️ consumption_records 为 RANGE 分区表（0025 手工 DDL）：ALTER 父表自动级联全部子表（PG 原生），
--    新列全可空无 default → PG 17 即时执行，不阻塞读写。
-- 执行方式：node run-migration-0031.cjs（不登记 meta/_journal.json，0017+ 手工迁移惯例；
--    详见任务书 §3.3 测试库初始化路径说明）
-- 幂等：各 ALTER 用 IF NOT EXISTS（可安全重跑）。
-- ============================================================================

ALTER TABLE "supplier_models" ADD COLUMN IF NOT EXISTS "cost_cache_read_input_price"  numeric(18, 6);--> statement-breakpoint
ALTER TABLE "supplier_models" ADD COLUMN IF NOT EXISTS "cost_cache_write_input_price" numeric(18, 6);--> statement-breakpoint

ALTER TABLE "vendor_pricing" ADD COLUMN IF NOT EXISTS "cache_read_input_price"  numeric(18, 6);--> statement-breakpoint
ALTER TABLE "vendor_pricing" ADD COLUMN IF NOT EXISTS "cache_write_input_price" numeric(18, 6);--> statement-breakpoint

ALTER TABLE "consumption_records" ADD COLUMN IF NOT EXISTS "cache_write_tokens"    integer;--> statement-breakpoint
ALTER TABLE "consumption_records" ADD COLUMN IF NOT EXISTS "cache_hit_cost"        numeric(18, 8);--> statement-breakpoint
ALTER TABLE "consumption_records" ADD COLUMN IF NOT EXISTS "cache_write_cost"      numeric(18, 8);--> statement-breakpoint
ALTER TABLE "consumption_records" ADD COLUMN IF NOT EXISTS "cache_read_input_price"  numeric(18, 6);--> statement-breakpoint
ALTER TABLE "consumption_records" ADD COLUMN IF NOT EXISTS "cache_write_input_price" numeric(18, 6);
