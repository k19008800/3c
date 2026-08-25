-- 0030_adjustment_pending_super.sql
-- R5 三级审批：adjustment_status 枚举追加 pending_super + 调账审批链扩展列
-- （ARCH v1.1 §5.1 / PRD §3.1.2 字段表，调度终裁 §10 其余裁决有效）。
--
-- 注意：
--   - PG 12+ 允许事务内 ALTER TYPE ADD VALUE，但同一事务内不得使用新值；
--     本迁移为独立语句（枚举 + 列），人工检查后执行。
--   - 回滚说明：PG 不支持 DROP VALUE，回滚 = 保留该值不用；新列可 DROP COLUMN（追加反向 migration）。
ALTER TYPE adjustment_status ADD VALUE 'pending_super';

-- 调账审批链扩展（PRD §3.1.2 字段表 / ARCH v1.1 §2.2.1）
ALTER TABLE adjustment_records ADD COLUMN super_reviewed_by integer REFERENCES users(id);
ALTER TABLE adjustment_records ADD COLUMN limit_escalated boolean NOT NULL DEFAULT false;
ALTER TABLE adjustment_records ADD COLUMN escalation_reason varchar(255);
