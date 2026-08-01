--> statement-breakpoint
-- 迁移 0003: call_logs 计费精度对齐 DeepSeek (4 位小数, 元)
-- 将 cost_cents(integer 分) 替换为 cost(numeric(18,4) 元)
-- 幂等: clean 环境与已迁移环境均可重复执行
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "cost" numeric(18,4) DEFAULT 0;
--> statement-breakpoint
-- 迁移既有数据: 分 -> 元 (仅在 cost_cents 列存在时执行)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='call_logs' AND column_name='cost_cents') THEN
    UPDATE "call_logs" SET "cost" = COALESCE("cost_cents", 0)::numeric / 100 WHERE "cost" IS NULL OR "cost" = 0;
  END IF;
END $$;
--> statement-breakpoint
-- 删除旧列
ALTER TABLE "call_logs" DROP COLUMN IF EXISTS "cost_cents";
