-- 3cloud 数据库外键约束补充迁移
-- 创建日期: 2026-07-23
-- 目的: 添加缺失的外键约束以保持数据完整性

BEGIN;

-- ============================================
-- 检查孤儿数据（安全起见，先检查后清理）
-- ============================================

-- 1. 检查所有缺失外键关联的孤儿数据
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    -- commission_logs.client_call_log_id → call_logs.id
    SELECT COUNT(*) INTO orphan_count
    FROM commission_logs_202607 cl
    WHERE cl.client_call_log_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM call_logs c WHERE c.id = cl.client_call_log_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 commission_logs.client_call_log_id 孤儿记录，建议清理后再添加外键', orphan_count;
    END IF;
    
    -- refund_requests.ref_call_log_id → call_logs.id
    SELECT COUNT(*) INTO orphan_count
    FROM refund_requests rr
    WHERE rr.ref_call_log_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM call_logs c WHERE c.id = rr.ref_call_log_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 refund_requests.ref_call_log_id 孤儿记录，建议清理后再添加外键', orphan_count;
    END IF;
    
    -- redemption_fraud_events.code_id → redemption_codes.id
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_fraud_events rfe
    WHERE NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rfe.code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 redemption_fraud_events.code_id 孤儿记录，建议清理后再添加外键', orphan_count;
    END IF;
    
    -- redemption_gift_logs 孤儿记录检查
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.original_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.original_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 redemption_gift_logs.original_code_id 孤儿记录', orphan_count;
    END IF;
    
    SELECT COUNT(*) INTO orphan_count
    FROM redemption_gift_logs rgl
    WHERE rgl.new_code_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM redemption_codes rc WHERE rc.id = rgl.new_code_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 redemption_gift_logs.new_code_id 孤儿记录', orphan_count;
    END IF;
    
    -- call_logs.key_group_item_id → vendor_key_group_items.id
    SELECT COUNT(*) INTO orphan_count
    FROM call_logs_202607 cl
    WHERE cl.key_group_item_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM vendor_key_group_items vkgi WHERE vkgi.id = cl.key_group_item_id);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 call_logs.key_group_item_id 孤儿记录', orphan_count;
    END IF;
    
    -- finance_cost_records.created_by → users.id
    SELECT COUNT(*) INTO orphan_count
    FROM finance_cost_records fcr
    WHERE fcr.created_by IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = fcr.created_by);
    
    IF orphan_count > 0 THEN
        RAISE NOTICE '发现 % 条 finance_cost_records.created_by 孤儿记录', orphan_count;
    END IF;
END $$;

-- ============================================
-- 添加缺失的外键约束
-- ============================================

-- 1. commission_logs.client_call_log_id → call_logs.id
-- 注意：call_logs是分区表，主键为(id, created_at)复合主键
-- 外键需要引用父表call_logs的id列
-- 使用ON DELETE SET NULL，因为call记录可能被清理但佣金记录仍需保留
ALTER TABLE commission_logs_202607
ADD CONSTRAINT fk_commission_logs_client_call_log
FOREIGN KEY (client_call_log_id) REFERENCES call_logs(id)
ON DELETE SET NULL;

-- 2. refund_requests.ref_call_log_id → call_logs.id
ALTER TABLE refund_requests
ADD CONSTRAINT fk_refund_requests_ref_call_log
FOREIGN KEY (ref_call_log_id) REFERENCES call_logs(id)
ON DELETE SET NULL;

-- 3. filter_logs.call_log_id → call_logs.id
-- 注意：filter_logs表可能不存在，先检查
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' AND table_name = 'filter_logs') THEN
        ALTER TABLE filter_logs
        ADD CONSTRAINT fk_filter_logs_call_log
        FOREIGN KEY (call_log_id) REFERENCES call_logs(id)
        ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'filter_logs表不存在，跳过外键添加';
    END IF;
END $$;

-- 4. filter_logs.user_id → users.id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' AND table_name = 'filter_logs') THEN
        ALTER TABLE filter_logs
        ADD CONSTRAINT fk_filter_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 5. filter_logs.api_key_id → api_keys.id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' AND table_name = 'filter_logs') THEN
        ALTER TABLE filter_logs
        ADD CONSTRAINT fk_filter_logs_api_key
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 6. redemption_fraud_events.code_id → redemption_codes.id
ALTER TABLE redemption_fraud_events
ADD CONSTRAINT fk_redemption_fraud_events_code
FOREIGN KEY (code_id) REFERENCES redemption_codes(id)
ON DELETE CASCADE;

-- 7. redemption_gift_logs.original_code_id → redemption_codes.id
ALTER TABLE redemption_gift_logs
ADD CONSTRAINT fk_redemption_gift_logs_original_code
FOREIGN KEY (original_code_id) REFERENCES redemption_codes(id)
ON DELETE RESTRICT;

-- 8. redemption_gift_logs.new_code_id → redemption_codes.id
ALTER TABLE redemption_gift_logs
ADD CONSTRAINT fk_redemption_gift_logs_new_code
FOREIGN KEY (new_code_id) REFERENCES redemption_codes(id)
ON DELETE RESTRICT;

-- 9. call_logs.key_group_item_id → vendor_key_group_items.id
-- 注意：call_logs是分区表，需要在父表上添加外键
-- 使用ON DELETE SET NULL，因为key_group_item可能被删除但call记录需要保留
ALTER TABLE call_logs
ADD CONSTRAINT fk_call_logs_key_group_item
FOREIGN KEY (key_group_item_id) REFERENCES vendor_key_group_items(id)
ON DELETE SET NULL;

-- 10. finance_cost_records.created_by → users.id
ALTER TABLE finance_cost_records
ADD CONSTRAINT fk_finance_cost_records_created_by
FOREIGN KEY (created_by) REFERENCES users(id)
ON DELETE SET NULL;

-- ============================================
-- 验证外键添加成功
-- ============================================

DO $$
DECLARE
    fk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO fk_count
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
    
    RAISE NOTICE '成功添加 % 个外键约束', fk_count;
END $$;

COMMIT;

-- ============================================
-- 回滚脚本（如果需要）
-- ============================================
/*
BEGIN;
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
COMMIT;
*/