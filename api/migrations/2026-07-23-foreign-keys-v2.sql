-- 3cloud 数据库外键约束补充迁移（V2版）
-- 创建日期: 2026-07-23
-- 目的: 添加缺失的外键约束以保持数据完整性
-- 版本: V2 - 处理call_logs分区表外键问题

BEGIN;

-- ============================================
-- 步骤1: 安全检查 - 检查所有孤儿数据
-- ============================================

-- 检查所有缺失外键关联的孤儿数据
DO $$
DECLARE
    orphan_count INTEGER;
    total_orphans INTEGER := 0;
BEGIN
    RAISE NOTICE '开始检查孤儿数据...';
    
    -- 1. commission_logs.client_call_log_id → call_logs.id
    SELECT COUNT(*) INTO orphan_count
    FROM commission_logs_202607 cl
    WHERE cl.client_call_log_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM call_logs c WHERE c.id = cl.client_call_log_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'commission_logs.client_call_log_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 2. refund_requests.ref_call_log_id → call_logs.id
    SELECT COUNT(*) INTO orphan_count
    FROM refund_requests rr
    WHERE rr.ref_call_log_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM call_logs c WHERE c.id = rr.ref_call_log_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'refund_requests.ref_call_log_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 3. redemption_fraud_events.code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_fraud_events rfe
    WHERE NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rfe.code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_fraud_events.code_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 4. redemption_gift_logs.original_code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.original_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.original_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_gift_logs.original_code_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 5. redemption_gift_logs.new_code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.new_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.new_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'redemption_gift_logs.new_code_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 6. call_logs.key_group_item_id → vendor_key_group_items.id
    SELECT COUNT(*) INTO orphan_count
    FROM call_logs_202607 cl
    WHERE cl.key_group_item_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM vendor_key_group_items vkgi WHERE vkgi.id = cl.key_group_item_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'call_logs.key_group_item_id: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    -- 7. finance_cost_records.created_by → users.id
    SELECT COUNT(*) INTO orphan_count
    FROM finance_cost_records fcr
    WHERE fcr.created_by IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = fcr.created_by);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'finance_cost_records.created_by: % 条孤儿记录', orphan_count;
        total_orphans := total_orphans + orphan_count;
    END IF;
    
    IF total_orphans > 0 THEN
        RAISE NOTICE '总计发现 % 条孤儿记录。建议先清理孤儿数据再继续。', total_orphans;
        RAISE EXCEPTION '发现孤儿数据，迁移中止。请先清理孤儿数据。';
    ELSE
        RAISE NOTICE '未发现孤儿数据，继续迁移...';
    END IF;
END $$;

-- ============================================
-- 步骤2: 为call_logs.id创建唯一索引（支持外键）
-- ============================================

-- 检查是否已存在唯一索引
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'call_logs' 
          AND indexname = 'call_logs_id_unique_idx'
    ) THEN
        RAISE NOTICE '正在为call_logs.id创建唯一索引...';
        CREATE UNIQUE INDEX CONCURRENTLY call_logs_id_unique_idx ON call_logs(id);
        RAISE NOTICE 'call_logs.id唯一索引创建完成';
    ELSE
        RAISE NOTICE 'call_logs.id唯一索引已存在';
    END IF;
END $$;

-- ============================================
-- 步骤3: 添加缺失的外键约束
-- ============================================

-- 1. commission_logs.client_call_log_id → call_logs.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'commission_logs_202607'
          AND constraint_name = 'fk_commission_logs_client_call_log'
    ) THEN
        ALTER TABLE commission_logs_202607
        ADD CONSTRAINT fk_commission_logs_client_call_log
        FOREIGN KEY (client_call_log_id) REFERENCES call_logs(id)
        ON DELETE SET NULL;
        RAISE NOTICE '添加 commission_logs.client_call_log_id 外键';
    END IF;
END $$;

-- 2. refund_requests.ref_call_log_id → call_logs.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'refund_requests'
          AND constraint_name = 'fk_refund_requests_ref_call_log'
    ) THEN
        ALTER TABLE refund_requests
        ADD CONSTRAINT fk_refund_requests_ref_call_log
        FOREIGN KEY (ref_call_log_id) REFERENCES call_logs(id)
        ON DELETE SET NULL;
        RAISE NOTICE '添加 refund_requests.ref_call_log_id 外键';
    END IF;
END $$;

-- 3. filter_logs.call_log_id → call_logs.id（如果表存在）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'filter_logs'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = 'filter_logs'
              AND constraint_name = 'fk_filter_logs_call_log'
        ) THEN
            ALTER TABLE filter_logs
            ADD CONSTRAINT fk_filter_logs_call_log
            FOREIGN KEY (call_log_id) REFERENCES call_logs(id)
            ON DELETE CASCADE;
            RAISE NOTICE '添加 filter_logs.call_log_id 外键';
        END IF;
    ELSE
        RAISE NOTICE 'filter_logs表不存在，跳过call_log_id外键';
    END IF;
END $$;

-- 4. filter_logs.user_id → users.id（如果表存在）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'filter_logs'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = 'filter_logs'
              AND constraint_name = 'fk_filter_logs_user'
        ) THEN
            ALTER TABLE filter_logs
            ADD CONSTRAINT fk_filter_logs_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE;
            RAISE NOTICE '添加 filter_logs.user_id 外键';
        END IF;
    END IF;
END $$;

-- 5. filter_logs.api_key_id → api_keys.id（如果表存在）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'filter_logs'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = 'filter_logs'
              AND constraint_name = 'fk_filter_logs_api_key'
        ) THEN
            ALTER TABLE filter_logs
            ADD CONSTRAINT fk_filter_logs_api_key
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
            ON DELETE CASCADE;
            RAISE NOTICE '添加 filter_logs.api_key_id 外键';
        END IF;
    END IF;
END $$;

-- 6. redemption_fraud_events.code_id → redemption_codes.id
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

-- 7. redemption_gift_logs.original_code_id → redemption_codes.id
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

-- 8. redemption_gift_logs.new_code_id → redemption_codes.id
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

-- 9. call_logs.key_group_item_id → vendor_key_group_items.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'call_logs'
          AND constraint_name = 'fk_call_logs_key_group_item'
    ) THEN
        ALTER TABLE call_logs
        ADD CONSTRAINT fk_call_logs_key_group_item
        FOREIGN KEY (key_group_item_id) REFERENCES vendor_key_group_items(id)
        ON DELETE SET NULL;
        RAISE NOTICE '添加 call_logs.key_group_item_id 外键';
    END IF;
END $$;

-- 10. finance_cost_records.created_by → users.id
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
-- 步骤4: 验证迁移结果
-- ============================================

DO $$
DECLARE
    added_count INTEGER;
    expected_count INTEGER := 10; -- 我们尝试添加的外键数量
BEGIN
    -- 统计新添加的外键
    SELECT COUNT(*) INTO added_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
        'fk_commission_logs_client_call_log',
        'fk_refund_requests_ref_call_log',
        'fk_filter_logs_call_log',
        'fk_filter_logs_user',
        'fk_filter_logs_api_key',
        'fk_redemption_fraud_events_code',
        'fk_redemption_gift_logs_original_code',
        'fk_redemption_gift_logs_new_code',
        'fk_call_logs_key_group_item',
        'fk_finance_cost_records_created_by'
      );
    
    RAISE NOTICE '迁移完成!';
    RAISE NOTICE '成功添加 % 个外键约束', added_count;
    
    -- 检查call_logs唯一索引
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename = 'call_logs' 
          AND indexname = 'call_logs_id_unique_idx'
    ) THEN
        RAISE NOTICE 'call_logs.id唯一索引已就绪';
    END IF;
    
END $$;

COMMIT;

-- ============================================
-- 回滚脚本（如果需要）
-- ============================================
/*
BEGIN;

-- 删除外键约束
ALTER TABLE commission_logs_202607 DROP CONSTRAINT IF EXISTS fk_commission_logs_client_call_log;
ALTER TABLE refund_requests DROP CONSTRAINT IF EXISTS fk_refund_requests_ref_call_log;
ALTER TABLE filter_logs DROP CONSTRAINT IF EXISTS fk_filter_logs_call_log;
ALTER TABLE filter_logs DROP CONSTRAINT IF EXISTS fk_filter_logs_user;
ALTER TABLE filter_logs DROP CONSTRAINT IF EXISTS fk_filter_logs_api_key;
ALTER TABLE redemption_fraud_events DROP CONSTRAINT IF EXISTS fk_redemption_fraud_events_code;
ALTER TABLE redemption_gift_logs DROP CONSTRAINT IF EXISTS fk_redemption_gift_logs_original_code;
ALTER TABLE redemption_gift_logs DROP CONSTRAINT IF EXISTS fk_redemption_gift_logs_new_code;
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS fk_call_logs_key_group_item;
ALTER TABLE finance_cost_records DROP CONSTRAINT IF EXISTS fk_finance_cost_records_created_by;

-- 删除唯一索引（如果需要）
DROP INDEX IF EXISTS call_logs_id_unique_idx;

COMMIT;
*/