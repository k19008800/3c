-- =====================================================
-- 3cloud 数据库优化脚本
-- 优先级: P0 (紧急) - 补充缺失的关键索引
-- =====================================================

-- 1. 补充 call_logs 系列表的外键索引
-- 这些表是查询最频繁的表，外键无索引会导致JOIN性能极差

-- call_logs (当前月)
CREATE INDEX IF NOT EXISTS idx_call_logs_api_key_id ON call_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_model_id ON call_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_vendor_model_id ON call_logs(vendor_model_id);

-- 2026年6月分区
CREATE INDEX IF NOT EXISTS idx_call_logs_202606_api_key_id ON call_logs_202606(api_key_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202606_model_id ON call_logs_202606(model_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202606_user_id ON call_logs_202606(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202606_vendor_model_id ON call_logs_202606(vendor_model_id);

-- 2026年7月分区 (当前最大表)
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_api_key_id ON call_logs_202607(api_key_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_model_id ON call_logs_202607(model_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_user_id ON call_logs_202607(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_vendor_model_id ON call_logs_202607(vendor_model_id);

-- 其他月份分区 (202608-202612)
CREATE INDEX IF NOT EXISTS idx_call_logs_202608_api_key_id ON call_logs_202608(api_key_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202608_model_id ON call_logs_202608(model_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202608_user_id ON call_logs_202608(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_202608_vendor_model_id ON call_logs_202608(vendor_model_id);

-- 2. 补充其他高频外键索引

-- admin_api_keys.created_by
CREATE INDEX IF NOT EXISTS idx_admin_api_keys_created_by ON admin_api_keys(created_by);

-- announcements.created_by
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);

-- commission_logs 系列表
CREATE INDEX IF NOT EXISTS idx_commission_logs_agent_id ON commission_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_commission_logs_source_customer_id ON commission_logs(source_customer_id);

-- 分区 commission_logs 表
DO $$ 
BEGIN
    -- 为所有 commission_logs 分区表创建相同索引
    FOR i IN 202605..202612 LOOP
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_commission_logs_%s_agent_id ON commission_logs_%s(agent_id)',
            i, i
        );
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_commission_logs_%s_source_customer_id ON commission_logs_%s(source_customer_id)',
            i, i
        );
    END LOOP;
END $$;

-- finance_cost_records.created_by
CREATE INDEX IF NOT EXISTS idx_finance_cost_records_created_by ON finance_cost_records(created_by);

-- invoice_requests 相关
CREATE INDEX IF NOT EXISTS idx_invoice_requests_issued_by ON invoice_requests(issued_by);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_ref_order_id ON invoice_requests(ref_order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_reviewer_id ON invoice_requests(reviewer_id);

-- recharge_orders 审核人索引
CREATE INDEX IF NOT EXISTS idx_recharge_orders_confirmed_by ON recharge_orders(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_first_confirmed_by ON recharge_orders(first_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_second_confirmed_by ON recharge_orders(second_confirmed_by);

-- redemption_fraud_events.code_id
CREATE INDEX IF NOT EXISTS idx_redemption_fraud_events_code_id ON redemption_fraud_events(code_id);

-- 3. 大表分析字段索引 (P1优先级)

-- call_logs_202607 分析字段 (177万行大表)
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_model_name ON call_logs_202607(model_name);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_ip ON call_logs_202607(ip);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_duration_ms ON call_logs_202607(duration_ms);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_error_message ON call_logs_202607(error_message) WHERE error_message IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_user_agent ON call_logs_202607(user_agent);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_total_tokens ON call_logs_202607(total_tokens);
CREATE INDEX IF NOT EXISTS idx_call_logs_202607_cost ON call_logs_202607(cost);

-- 为其他大表分区也创建类似索引
DO $$ 
BEGIN
    FOR i IN 202606..202612 LOOP
        -- model_name 是高频分析字段
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_call_logs_%s_model_name ON call_logs_%s(model_name)',
            i, i
        );
        -- ip 用于安全分析
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_call_logs_%s_ip ON call_logs_%s(ip)',
            i, i
        );
        -- duration_ms 用于性能分析
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS idx_call_logs_%s_duration_ms ON call_logs_%s(duration_ms)',
            i, i
        );
    END LOOP;
END $$;

-- 4. 复合索引优化建议

-- 现有索引检查: 检查是否有冗余索引
-- 建议删除的重复索引 (需要手动确认后删除)
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef,
    COUNT(*) OVER (PARTITION BY tablename, 
                   -- 提取索引字段
                   regexp_replace(indexdef, '.*ON.*USING.*\((.*)\).*', '\1')) as dup_count
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, dup_count DESC;
*/

-- 5. 监控索引创建进度
-- 检查已创建索引
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE 'idx_%'
ORDER BY pg_relation_size(indexname::regclass) DESC;

-- 6. 索引使用情况监控
-- 定期运行查看索引使用效率
/*
SELECT 
    schemaname,
    relname AS tablename,
    indexrelname AS indexname,
    idx_scan AS index_scans,
    idx_tup_read AS rows_read,
    idx_tup_fetch AS rows_fetched
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;
*/

-- 7. 创建索引的注意事项
-- 大表索引创建会锁表，建议在低峰期执行
-- 可以使用 CONCURRENTLY 选项避免锁表（但创建时间更长）
-- 例如: CREATE INDEX CONCURRENTLY idx_name ON table_name(column_name);

-- =====================================================
-- 性能监控脚本
-- =====================================================

-- 查看表大小和索引大小
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_size,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS table_size,
    pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) - 
                   pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS index_size,
    n_live_tup AS row_count
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) DESC
LIMIT 20;

-- 查看最活跃的表
SELECT 
    relname AS tablename,
    n_tup_ins + n_tup_upd + n_tup_del AS total_ops,
    n_tup_ins AS inserts,
    n_tup_upd AS updates,
    n_tup_del AS deletes,
    seq_scan AS full_scans,
    idx_scan AS index_scans
FROM pg_stat_user_tables 
ORDER BY total_ops DESC 
LIMIT 20;

-- 查看缺失索引的表（seq_scan远大于idx_scan）
SELECT 
    schemaname,
    relname AS tablename,
    seq_scan,
    idx_scan,
    CASE 
        WHEN seq_scan > 0 THEN (seq_scan * 100.0 / (seq_scan + idx_scan)) 
        ELSE 0 
    END AS seq_scan_percent
FROM pg_stat_user_tables 
WHERE seq_scan > 1000 
  AND idx_scan < seq_scan * -10  -- 索引扫描远小于全表扫描
ORDER BY seq_scan_percent DESC
LIMIT 20;