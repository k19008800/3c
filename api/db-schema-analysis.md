# 3cloud API 数据库层分析报告

> 分析日期：2026-07-21
> 分析范围：src/db/schema/*.ts + src/db/migrations/*
> 数据引擎：PostgreSQL 17

---

## 一、表清单与字段统计

| 表名 | schema 文件 | 列数 | 索引数 | 主键 | 分区 |
|------|-----------|------|--------|------|------|
| users | users.ts | 39 | 3 | id (PK) | — |
| admin_accounts | users.ts | 8 | 2 | id (PK) | — |
| user_role_history | users.ts | 8 | 2 | id (PK) | — |
| user_oauth_bindings | users.ts | 10 | 2 | id (PK) | — |
| user_login_history | users.ts | 11 | 3 | id (PK) | — |
| user_notes | users.ts | 7 | 1 | id (PK) | — |
| user_ip_whitelist | users.ts | 8 | 1 | id (PK) | — |
| user_real_name_reviews | users.ts | 18 | 3 | id (PK) | — |
| agents | agents.ts | 17 | 2 | id (PK) | — |
| agent_clients | agents.ts | 4 | 2 | id (PK) | — |
| commission_logs | agents.ts | 20 | 5 | (id, created_at) 复合 | ✅ 按月分区 |
| agent_customer_consumption | agents.ts | 12 | 2 | id (PK) | — |
| commission_rules | agents.ts | 14 | 1 | id (PK) | — |
| commission_daily_rollup | agents.ts | 21 | 2 | id (PK) | — |
| withdraw_orders | agents.ts | 24 | 3 | id (PK) | — |
| agent_balance_ledger | agents.ts | 12 | 4 | id (PK) | — |
| api_keys | api-keys.ts | 9 | 3 | id (PK) | — |
| call_logs | billing.ts | 23 | 11 | (id, created_at) 复合 | ✅ 按月分区 |
| recharge_orders | billing.ts | 24 | 4 | id (PK) | — |
| balance_logs | billing.ts | 9 | 2 | id (PK) | — |
| user_discounts | billing.ts | 7 | 1 | id (PK) | — |
| vendors | vendors.ts | 16 | 2 | id (PK) | — |
| models | vendors.ts | 7 | 2 | id (PK) | — |
| vendor_models | vendors.ts | 22 | 7 | id (PK) | — |
| vendor_key_groups | vendors.ts | 8 | 1 | id (PK) | — |
| vendor_key_group_items | vendors.ts | 19 | 1 | id (PK) | — |
| vendor_key_group_model_prices | vendors.ts | 8 | 2 | id (PK) | — |
| vendor_api_keys | vendors.ts | 7 | 2 | id (PK) | — |
| redemption_batches | redemption.ts | 12 | 3 | id (PK) | — |
| redemption_codes | redemption.ts | 27 | 10 | id (PK) | — |
| redemption_logs | redemption.ts | 19 | 5 | id (PK) | — |
| redemption_fraud_events | redemption.ts | 13 | 5 | id (PK) | — |
| redemption_gift_logs | redemption.ts | 8 | 4 | id (PK) | — |
| code_templates | code-templates.ts | 12 | 1 | id (PK) | — |
| code_notification_logs | code-templates.ts | 11 | 2 | id (PK) | — |
| campaigns | campaigns.ts | 24 | 6 | id (PK) | — |
| campaign_codes | campaigns.ts | 4 | 0 | (campaign_id, agent_id) 复合 | — |
| daily_recon_summary | finance.ts | 16 | 2 | id (PK) | — |
| finance_cost_records | finance.ts | 15 | 5 | id (PK) | — |
| finance_profit_records | finance.ts | 14 | 4 | id (PK) | — |
| price_change_history | finance.ts | 8 | 2 | id (PK) | — |
| invoice_requests | finance.ts | 17 | 3 | id (PK) | — |
| refund_requests | finance.ts | 11 | 2 | id (PK) | — |
| audit_logs | system.ts | 10 | 5 | id (PK) | — |
| operation_logs | system.ts | 16 | 6 | id (PK) | — |
| system_configs | system.ts | 6 | 1 | id (PK) | — |
| email_templates | system.ts | 7 | 1 | id (PK) | — |
| page_contents | system.ts | 10 | 1 | id (PK) | — |
| user_preferences | system.ts | 6 | 1 | id (PK) | — |
| announcements | system.ts | 9 | 2 | id (PK) | — |
| login_security_configs | security.ts | 5 | 1 | id (PK) | — |
| security_events | security.ts | 13 | 5 | id (PK) | — |
| user_login_sessions | security.ts | 12 | 3 | id (PK) | — |
| security_auto_rules | security.ts | 12 | 2 | id (PK) | — |
| circuit_history | security.ts | 8 | 2 | id (PK) | — |
| content_filters | security.ts | 16 | 2 | id (PK) | — |
| filter_logs | security.ts | 11 | 3 | id (PK) | — |
| user_quotas | quotas.ts | 14 | 3 | id (PK) | — |
| key_quotas | quotas.ts | 8 | 1 | id (PK) | — |
| user_notifications | notification.ts | 8 | 2 | id (PK) | — |
| admin_roles | roles.ts | 8 | 2 | id (PK) | — |
| user_role_assignments | roles.ts | 5 | 3 | id (PK) | — |
| user_permission_overrides | roles.ts | 8 | 0 | id (PK) | — |
| admin_api_keys | admin.ts | 10 | 2 | id (PK) | — |
| admin_key_usage_logs | admin.ts | 8 | 2 | id (PK) | — |
| ip_geo_blocks | (migration) | 12 | 2 | id (PK) | — |

**总计：63 张表，约 790+ 列，152+ 索引**

---

## 二、已执行迁移清单

| # | 文件名 | 日期 | 摘要 |
|---|--------|------|------|
| 1 | v2-create-all-tables.ts | — | 初始化创建 redemption/admin_keys 等 V2 表 |
| 2 | setup-call-logs-partitions.ts | — | call_logs 按月 RANGE 分区，7 个月预创建 |
| 3 | setup-commission-logs-partitions.ts | — | commission_logs 按月 RANGE 分区，7 个月预创建 |
| 4 | 2026-06-28-alter-users.ts | 06-28 | users 表字段调整 |
| 5 | 2026-06-28-real-name-reviews.ts | 06-28 | user_real_name_reviews 表 |
| 6 | 2026-06-28-second-wave.ts | 06-28 | 第二波 schema 变更 |
| 7 | 2026-06-28-vendor-models-partial-index.ts | 06-28 | vendor_models 部分唯一索引(status=true) |
| 8 | 2026-06-29-backfill-agent-consumption.ts | 06-29 | agent_customer_consumption 回填 |
| 9 | 2026-06-29-backfill-commission-data.ts | 06-29 | 佣金数据回填 |
| 10 | 2026-06-29-daily-recon-summary.ts | 06-29 | daily_recon_summary 表 |
| 11 | 2026-06-29-ip-geo-blocks.ts | 06-29 | ip_geo_blocks 表 (CIDR + GIST 索引) |
| 12 | 2026-06-29-performance-indexes.ts | 06-29 | 5 个性能复合索引 |
| 13 | 2026-06-30-commission-rules.ts | 06-30 | commission_rules 表 |
| 14 | 2026-07-01-admin-roles.ts | 07-01 | admin_roles / user_role_assignments 表 |
| 15 | 2026-07-01-remove-agent-commission-rate.ts | 07-01 | 移除 agents.commission_rate 字段 |
| 16 | 2026-07-04-ocr-result.ts | 07-04 | OCR 结果字段 |
| 17 | 2026-07-09-announcements-audit-actions.ts | 07-09 | announcements 审计 action |
| 18 | 2026-07-09-create-announcements.ts | 07-09 | announcements 表 |
| 19 | 2026-07-09-quotas-circuit-breaker-stats.ts | 07-09 | quotas/熔断器统计 |
| 20 | 2026-07-09-redemption-and-admin-api-keys.ts | 07-09 | 兑换码 + 管理 API Key 完整实现 |
| 21 | 2026-07-09-redemption-fix-columns.ts | 07-09 | 兑换码列修复 |
| 22 | 2026-07-09-vendor-self-notification-model-types.ts | 07-09 | 厂商自助/通知/模型类型 |
| 23 | 2026-07-10-admin-roles-table.ts | 07-10 | 管理员角色表 |
| 24 | 2026-07-10-quota-audit-actions.ts | 07-10 | 配额审计 action |
| 25 | 2026-07-10-user-quota-tpm-rpm-delete.ts | 07-10 | 移除用户表 tpm/rpm |
| 26 | 2026-07-11-campaign.ts | 07-11 | campaigns/campaign_codes 表 |
| 27 | 2026-07-11-create-agent-balance-ledger.sql | 07-11 | agent_balance_ledger 表 |
| 28 | 2026-07-11-finance-cost.ts | 07-11 | finance_cost_records 表 |
| 29 | 2026-07-11-invoice-refund-tables.ts | 07-11 | invoice_requests / refund_requests 表 |
| 30 | 2026-07-11-profit-price-tables.ts | 07-11 | finance_profit_records / price_change_history |
| 31 | 2026-07-11-remove-team.ts | 07-11 | 移除 team 相关表 |
| 32 | 2026-07-11-settlement-cycle.ts | 07-11 | 结算周期字段 |
| 33 | 2026-07-12-redemption-fraud-events.sql | 07-12 | redemption_fraud_events 表 |
| 34 | 2026-07-13-add-model-description.ts | 07-13 | models.description 字段 |
| 35 | 2026-07-13-page-content-email-template-audit-actions.ts | 07-13 | page/email template 审计 action |
| 36 | 2026-07-15-performance-optimizations.sql | 07-15 | **主要性能优化**：覆盖索引 + 物化视图 |
| 37 | 2026-07-16-site-configs.ts | 07-16 | site_configs 表 |
| 38 | 2026-07-17-key-group-pricing.ts | 07-17 | key 分组定价 |
| 39 | 2026-07-18-content-filter-audit-actions.ts | 07-18 | 内容过滤审计 action |
| 40 | 2026-07-20-vendor-key-group-items-enhance.sql | 07-20 | key 分组条目增强 |
| 41 | 2026-07-20-vendor-key-groups.sql | 07-20 | vendor_key_groups / vendor_key_group_items |
| 42 | 2026-07-22-content-filters.sql | 07-22 | content_filters / filter_logs 表 |
| 43 | 2026-07-25-key-model-prices.sql | 07-25 | vendor_key_group_model_prices 表 |
| 44 | 0010_operation_logs.sql | — | operation_logs 表 |
| 45 | 0011-redemption-supplement.ts | — | 兑换码系统补充：code_templates + 字段扩展 |
| 46 | backfill-commission-daily-rollup.sql | — | 佣金日汇总回填 |
| 47 | create-redemption-gift-logs.sql | — | redemption_gift_logs 表 |

---

## 三、性能分析

### 3.1 缺失索引分析

#### P1 ~ 严重

| # | 表名 | 字段/查询模式 | 问题描述 | 严重程度 | 建议 |
|---|------|-------------|---------|---------|------|
| 1 | **call_logs** | `key_group_item_id` | 2026-07-15 之后新增的字段，用于 Key 定价溯源；典型查询 `WHERE key_group_item_id=? | price_source=? | price_source_id=?`。无索引会导致全分区扫描。 | 🔴 高 | 增加 `call_logs_key_item_idx(key_group_item_id, price_source)、call_logs_price_source_idx(price_source)` |
| 2 | **call_logs** | `discount_type` / `discount_type` JOIN | discount_type 字段存在但无任何索引，后台反算利润时需要按此过滤 | 🟡 中 | 若后台有 `WHERE discount_type=?` 查询，加索引 |
| 3 | **balance_logs** | `ref_id` / `ref_type` | 退款/回滚需要定位某笔关联流水，`WHERE ref_type=? AND ref_id=?` 高频查询但无索引 | 🔴 高 | 增加 `balance_logs_ref_idx(ref_type, ref_id)` |
| 4 | **call_logs** | `user_id` 单独过滤 | 现有索引均为 `(user_id, created_at)` 复合，若查询只需 `WHERE user_id=?` (不限时间)，仍可用但效率略低 | 🟢 低 | 检查业务代码；大部分查询带时间范围，可接受 |
| 5 | **user_notifications** | `type` | `WHERE type=? AND user_id=?` 查询高频，但已有 `(user_id, created_at)` 和 `(user_id, read_at)`，缺 type 前导 | 🟡 中 | 若后台按通知类型批量发信，加 `notif_type_user_idx(type, user_id)` |
| 6 | **commission_logs** | `client_call_log_id` | 外键引用 call_logs，按 call 定位佣金记录。无索引导致 1:N 反向查找大量扫描 | 🔴 高 | 增加 `comm_logs_client_call_idx(client_call_log_id)` |
| 7 | **agent_customer_consumption** | `customer_user_id` 单独过滤 | 唯一索引是 `(agent_id, customer_user_id)`，若后台独立查某用户所有代理关系（无 agent_id），无法走索引 | 🟡 中 | 增加 `agent_consumption_customer_idx(customer_user_id)` |
| 8 | **redemption_codes** | `batch_no` | 已有索引, OK | 🟢 安全 | 已有索引 |
| 9 | **redemption_logs** | `batch_id` | 加入 `batch_id` 字段后无索引，批次级统计查询需扫全表 | 🟡 中 | 增加 `redeem_logs_batch_idx(batch_id)` |
| 10 | **filter_logs** | `call_log_id` / `user_id` / `api_key_id` | 三个外键字段均无索引，反向排查问题时 (按 call/user/key 查过滤命中) 需全表扫描 | 🔴 高 | 增加 `filter_logs_call_idx(call_log_id)`、`filter_logs_user_idx(user_id)` |
| 11 | **agent_balance_ledger** | `ref_id` | 审计追踪需要按 ref_id 定位台账变更，无索引 | 🟡 中 | 增加 `abl_ref_idx(ref_type, ref_id)` |
| 12 | **audit_logs** | `description` | 按描述文本搜索场景（运维排查），无全文索引 | 🟢 低 | 需要时加 gin 索引 |
| 13 | **vendor_key_group_items** | `is_down` / `status` / `consecutive_failures` | 路由引擎按状态筛选 Key，`WHERE status=true AND is_down=false` 是最常用查询但无复合索引 | 🔴 高 | 增加 `kg_items_route_idx(status, is_down) INCLUDE (weight, priority)` |

#### P2 ~ 中等

| # | 表名 | 字段 | 问题描述 | 严重程度 | 建议 |
|---|------|------|---------|---------|------|
| 14 | **user_login_history** | `ip` | IP 登录频率分析是安全风控核心，但仅按 `(user_id, created_at)` 和 `(city)` 有索引，IP 单独过滤缺失 | 🟡 中 | 增加 `user_login_history_ip_idx(ip, created_at DESC)` |

---

### 3.2 冗余索引分析

| # | 表名 | 冗余索引 | 说明 | 严重程度 | 建议 |
|---|------|---------|------|---------|------|
| 1 | **call_logs** | `call_logs_model_name_created_at_idx` | 2026-07-15 注明了此索引已被 `call_logs_cover_stats`（覆盖索引）替代。但迁移脚本做了 DROP + CREATE CONCURRENTLY，实际可能仍然存在 | 🟡 中 | 确认无查询依赖后执行 `DROP INDEX call_logs_model_name_created_at_idx` |
| 2 | **call_logs** | `call_logs_user_created_at_idx` | 与部分分区索引 `call_logs_YYYYMM_user_created_idx` 功能重复 — 父表索引和分区索引都建了同样的 `(user_id, created_at)` | 🟡 中 | 确认是否需要双重复。PG 12+ 父表索引自动传播，分区索引可能是历史遗留。观察索引大小 |
| 3 | **commission_logs** | `commission_logs_status_created_at_idx` | 2026-07-15 加了 `commission_logs_time_range(created_at, status)`，基本覆盖了原有 `(status, created_at)` 的功能 | 🟢 低 | 可长期保留，不影响写入；写放大可忽略 |
| 4 | **user_quotas** | `user_quotas_active_idx` | 与 `user_quotas_user_type_period_idx` 存在部分重复，`(user_id, quota_type, period_end)` 基本是 `(user_id, quota_type, period_start)` 的子集 | 🟢 低 | minor，保留也无妨 |

---

### 3.3 字段类型不合理

#### P1 ~ 关键

| # | 表名 | 字段 | 当前类型 | 分析 | 建议 |
|---|------|------|---------|------|------|
| 1 | **system_configs** | `value` | `text` (JSON 字符串) | 所有配置都存 JSON 字符串，查询时必须反序列化，无法使用 JSON 索引和校验，也无 PG 类型约束 | 🔴 改为 `jsonb`，或为高频配置加 specific type |
| 2 | **campaigns** | `budget_amount` | `bigint` (分) | 而其他金额字段都是 `numeric(18,6)`，单位不统一，跨表 JOIN 比较需单位换算，易出错 | 🔴 统一为 `numeric(18,6)` 或使用一致的内部单位 |
| 3 | **invoice_requests** | `status` | `varchar(20)` | 没有用枚举，与系统其他表风格不一致，缺少类型安全 | 🟡 改为 `CREATE TYPE invoice_status AS ENUM(...)` |
| 4 | **refund_requests** | `status` | `varchar(20)` | 同上，缺少枚举类型 | 🟡 改为枚举 |
| 5 | **finance_cost_records** | `total_face` / `total_used` / `cost_amount` / `subsidy_amount` / `revenue_attributed` | `bigint` (分) | 与系统其他表 `numeric(18,6)` 不统一。金额计算使用 bigint 容易溢出，且求和比较时不兼容 | 🔴 统一改为 `numeric(18,6)` |
| 6 | **redemption_codes** | 部分金额字段（迁移添加） | `bigint` | 0011-redemption-supplement.ts 添加的 `cost_price / face_price / min_consumption` 为 bigint 而非 numeric(18,6) | 🔴 统一为 `numeric(18,6)` |
| 7 | **finance_cost_records** / **finance_profit_records** | `created_by` | `integer` | 表中有外键引用但无 FK 约束（`created_by` 引用 users.id） | 🟡 添加外键约束 |

---

### 3.4 分区策略评估

#### 已分区表 ✅

| 表名 | 分区键 | 策略 | 状态 |
|------|--------|------|------|
| **call_logs** | `created_at` | 按月 RANGE，预创建 7 个月 | ✅ 良好。迁移脚本有自动补充分区能力 |
| **commission_logs** | `created_at` | 按月 RANGE，预创建 7 个月 | ✅ 良好。迁移脚本有自动补充分区能力 |

#### 建议新增分区

| # | 表名 | 估算数据规模 | 建议 | 严重程度 |
|---|------|-------------|------|---------|
| 1 | **operation_logs** | 用户每次操作都记录，日增量大 | 未来建议按月分区，避免单表过大影响性能 | 🟡 中 |
| 2 | **audit_logs** | 管理员操作日志 | 当前可接受，若 >5000 万行建议分区 | 🟢 低 (未来) |
| 3 | **balance_logs** | 每次余额变更 | 若高频使用且 >1 亿行，建议按月分区 | 🟢 低 (未来) |
| 4 | **filter_logs** | 每次内容过滤命中都记录 | 日增量大时建议按月分区 | 🟢 低 (未来) |
| 5 | **user_login_history** | 每次登录记录，安全审计需要保留长时间 | 建议按月或按季分区 | 🟡 中 |

---

### 3.5 数据膨胀 & 清理策略

| # | 表名 | 增长模式 | 当前策略 | 问题 | 建议 |
|---|------|---------|---------|------|------|
| 1 | **call_logs** | 每分钟数千条，日增量极大 | 仅分区无自动清理 | 分区只扩展不清除，7 个月后旧分区从未被删或归档，数据无限膨胀 | 🔴 **增加分区自动清理 TTL 策略：`=> 6 个月自动 DETACH + 归档 S3/cold storage，或只保留 N 个月在线`** |
| 2 | **commission_logs** | 每日大量记录 | 仅分区无自动清理 | 同上，佣金记录常年在线无意义 | 🟡 增加 12 个月自动清理 |
| 3 | **audit_logs** | 管理员每日操作 | **无自动清理** | 审计日志按法规可能需要保留，但 90 天以上的数据对日常查询无价值 | 🟡 建议：180 天在线 + 自动归档 |
| 4 | **operation_logs** | 用户操作较高频 | **无自动清理** | 与 audit_logs 类似，但粒度更细、量更大 | 🔴 建议：90 天后自动清理或归档 |
| 5 | **user_login_history** | 每次登录 | **无自动清理** | 安全审计需求，但 1 年以上的历史基本无用 | 🟡 建议：12 个月后自动清理 |
| 6 | **balance_logs** | 每次余额变更 | **无自动清理** | 与对账强相关，需要长期保留但不一定在线 | 🟢 建议：12 个月自动归档 |
| 7 | **filter_logs** | 过滤命中记录 | **无自动清理** | 纯日志表，无引用价值超过 30 天 | 🔴 建议：30 天自动清理 |
| 8 | **security_events** | 按事件记录 | **无自动清理** | 同上 | 🔴 建议：90 天自动清理 |

---

### 3.6 外键约束缺失

| # | 表名 | 字段 | 引用目标 | 当前状态 | 风险 | 建议 |
|---|------|------|---------|---------|------|------|
| 1 | **commission_logs** | `client_call_log_id` | call_logs | **无 FK** (代码注释说明原因：call_logs 分区表 PK 复合) | 脏数据：call 删除后佣金记录指向无效 ID | 🟡 通过应用层保证。也可以加 FK ON DELETE SET NULL |
| 2 | **refund_requests** | `ref_call_log_id` | call_logs | **无 FK** | 同上 | 🟡 加 FK 或应用层保证 |
| 3 | **filter_logs** | `call_log_id` | call_logs | **无 FK** | 同上 | 🟡 加 FK 或应用层保证 |
| 4 | **filter_logs** | `user_id` | users | **无 FK** | 用户删除后过滤日志指向无效 ID | 🟡 加 FK ON DELETE SET NULL |
| 5 | **filter_logs** | `api_key_id` | api_keys | **无 FK** | Key 删除后日志指向无效 | 🟡 加 FK |
| 6 | **redemption_fraud_events** | `code_id` | redemption_codes | **无 FK** | code 删除后风控事件变成孤儿 | 🟡 加 FK |
| 7 | **redemption_gift_logs** | `original_code_id` / `new_code_id` | redemption_codes | **无 FK** | 转赠日志指向无效 code | 🟡 加 FK |
| 8 | **call_logs** | `key_group_item_id` | vendor_key_group_items | **无 FK** | 分组删除后 call 指向无效 | 🟡 加 FK ON DELETE SET NULL |
| 9 | **code_notification_logs** | `code_id` | redemption_codes | 有 FK (`REFERENCES redemption_codes(id)`) | ✅ 良好 | — |
| 10 | **finance_cost_records** | `created_by` | users | **无 FK** | 创建者删除后财务成本记录无主 | 🟡 加 FK |
| 11 | **agent_balance_ledger** | `ref_code_id` | redemption_codes | 有 FK ✅ | 良好 | — |

---

### 3.7 物化视图 & 预聚合

| 名称 | 当前状态 | 用途 | 评价 |
|------|---------|------|------|
| **daily_user_consumption** | 已创建（WITH NO DATA），唯一索引已建 | 解决 topConsumers 全表 GROUP BY | ✅ 良好设计。**但尚未 schedule REFRESH**：需要配置定时任务 `REFRESH MATERIALIZED VIEW CONCURRENTLY`，每 5 分钟执行 |
| **commission_daily_rollup** | 普通表，应用层写入 | 代理商日级佣金汇总 | ✅ 标准化设计，无 REFRESH 问题 |
| **daily_recon_summary** | 普通表，应用层写入 | 每日对账汇总 | ✅ |

---

## 四、总结 & 优先级行动项

### 🔴 必须立即处理

| # | 问题 | 影响 |
|---|------|------|
| 1 | **call_logs 无 TTL 清理策略** | 数据无限膨胀，存储成本线性增长，旧分区查询越来越慢 |
| 2 | **operation_logs / filter_logs / security_events 无清理策略** | 同上一并处理 |
| 3 | **vendor_key_group_items 缺少路由筛选复合索引** | 每次路由决策需扫全表 |
| 4 | **balance_logs 缺少 ref_type+ref_id 索引** | 退款/审计追踪慢 |
| 5 | **commission_logs 缺失 client_call_log_id 索引** | 按 call 找佣金慢 |
| 6 | **system_configs.value 使用 text 而非 jsonb** | 查询成本高、无法校验 |
| 7 | **金额字段 bigint / numeric 单位不统一** | 跨表计算易错（campaigns.budget_amount, finance_cost_records.*, redemption_codes 部分字段） |

### 🟡 中期优化

| # | 问题 |
|---|------|
| 1 | 索引冗余清理（call_logs_model_name_created_at_idx） |
| 2 | filter_logs 外键约束添加 |
| 3 | operation_logs / audit_logs 分区计划 |
| 4 | user_login_history IP 索引 + 清理策略 |
| 5 | daily_user_consumption REFRESH 定时 job 配置 |
| 6 | 枚举类型统一（invoice_requests.status、refund_requests.status 等 varchar → enum） |

### 🟢 低优先 / 技术债务

| # | 问题 |
|---|------|
| 1 | 部分分区索引在父表和分区上双重存在 |
| 2 | 少数表使用 bigint 存 ID 而系统统一用 serial |
| 3 | user_permission_overrides 表完全无索引 |

---

*报告完*
