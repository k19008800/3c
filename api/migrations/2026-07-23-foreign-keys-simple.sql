-- 3cloud 数据库外键约束补充迁移（简化版）
-- 创建日期: 2026-07-23
-- 目的: 添加缺失的外键约束以保持数据完整性
-- 版本: 简化版 - 跳过call_logs相关外键，先添加其他安全的外键

BEGIN;

-- ============================================
-- 步骤1: 安全检查 - 检查所有孤儿数据
-- ============================================

DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    RAISE NOTICE '检查孤儿数据...';
    
    -- redemption_fraud_events.code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_fraud_events rfe
    WHERE NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rfe.code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_fraud_events.code_id: % 条孤儿记录', orphan_count;
        RAISE EXCEPTION '发现孤儿数据，迁移中止';
    END IF;
    
    -- redemption_gift_logs.original_code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.original_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.original_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_gift_logs.original_code_id: % 条孤儿记录', orphan_count;
        RAISE EXCEPTION '发现孤儿数据，迁移中止';
    END IF;
    
    -- redemption_gift_logs.new_code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.new_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.new_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_gift_logs.new_code_id: % 条孤儿记录', orphan_count;
        RAISE EXCEPTION '发现孤儿数据，迁移中止';
    END IF;
    
    -- finance_cost_records.created_by → users.id
    SELECT COUNT(*) INTO orphan_count
    FROM finance_cost_records fcr
    WHERE fcr.created_by IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = fcr.created_by);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'finance_cost_records.created_by: % 条孤儿记录', orphan_count;
        RAISE EXCEPTION '发现孤儿数据，迁移中止';
    END IF;
    
    RAISE NOTICE '未发现孤儿数据，继续迁移...';
END $$;

-- ============================================
-- 步骤2: 添加安全的外键约束（不涉及call_logs）
-- ============================================

-- 1. redemption_fraud_events.code_id → redemption_codes.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'redemption_fraud_events'
          AND constraint_name = 'fk_redemption_fraud_events_code'
    ) THEN
        ALTER TABLE redemption_fraud_events
        ADD CONSTRAINT fk_redemption_fraud_events_code
        FOREIGN KEY (code_id) REFERENCES redemption_codes(id)
        ON DELETE CASCADE;
        RAISE NOTICE '添加 redemption_fraud_events.code_id 外键';
    END IF;
END $$;

-- 2. redemption_gift_logs.original_code_id → redemption_codes.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'redemption_gift_logs'
          AND constraint_name = 'fk_redemption_gift_logs_original_code'
    ) THEN
        ALTER TABLE redemption_gift_logs
        ADD CONSTRAINT fk_redemption_gift_logs_original_code
        FOREIGN KEY (original_code_id) REFERENCES redemption_codes(id)
        ON DELETE RESTRICT;
        RAISE NOTICE '添加 redemption_gift_logs.original_code_id 外键';
    END IF;
END $$;

-- 3. redemption_gift_logs.new_code_id → redemption_codes.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'redemption_gift_logs'
          AND constraint_name = 'fk_redemption_gift_logs_new_code'
    ) THEN
        ALTER TABLE redemption_gift_logs
        ADD CONSTRAINT fk_redemption_gift_logs_new_code
        FOREIGN KEY (new_code_id) REFERENCES redemption_codes(id)
        ON DELETE RESTRICT;
        RAISE NOTICE '添加 redemption_gift_logs.new_code_id 外键';
    END IF;
END $$;

-- 4. finance_cost_records.created_by → users.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'finance_cost_records'
          AND constraint_name = 'fk_finance_cost_records_created_by'
    ) THEN
        ALTER TABLE finance_cost_records
        ADD CONSTRAINT fk_finance_cost_records_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL;
        RAISE NOTICE '添加 finance_cost_records.created_by 外键';
    END IF;
END $$;

-- ============================================
-- 步骤3: 验证迁移结果
-- ============================================

DO $$
DECLARE
    added_count INTEGER;
BEGIN
    -- 统计新添加的外键
    SELECT COUNT(*) INTO added_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
        'fk_redemption_fraud_events_code',
        'fk_redemption_gift_logs_original_code',
        'fk_redemption_gift_logs_new_code',
        'fk_finance_cost_records_created_by'
      );
    
    RAISE NOTICE '迁移完成!';
    RAISE NOTICE '成功添加 % 个外键约束', added_count;
    
END $$;

COMMIT;

-- ============================================
-- 回滚脚本
-- ============================================
/*
BEGIN;
ALTER TABLE redemption_fraud_events DROP CONSTRAINT IF EXISTS fk_redemption_fraud_events_code;
ALTER TABLE redemption_gift_logs DROP CONSTRAINT IF EXISTS fk_redemption_gift_logs_original_code;
ALTER TABLE redemption_gift_logs DROP CONSTRAINT IF EXISTS fk_redemption_gift_logs_new_code;
ALTER TABLE finance_cost_records DROP CONSTRAINT IF EXISTS fk_finance_cost_records_created_by;
COMMIT;
*/