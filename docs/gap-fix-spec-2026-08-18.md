# 原型差距补齐实施规格（2026-08-18）

> 目标：按用户裁决补齐全部缺失端点，使前端已挂载页面全部有真实后端支撑。
> 裁决：工单管理 1:1 复刻；其余核心功能等价；渠道旧 6 页补别名；磁盘缓存完整闭环。
> 已建 migration 0026 + schema：`api/src/db/schema/gap-fix-2026-08.ts`（announcementReads / refundRequests / followReminders / customerTags / customerNotes / supportTestKeys / knowledgeBaseFeedback）；users.role 枚举已加 `sales`。
> 新增路由统一模式：对齐 `routes/admin-support-missing.ts`（adminAuth / jwtAuth / writeAudit / parsePageQuery / periodStart）。

## 通用契约

- 响应包裹：`{ data: ... }`；错误：`{ error: { message, type, code } }`（lib/errors）。
- 分页：`page / pageSize`（或 page_size），返回 `{ list, total, pagination? }`。
- 所有 admin 端点 adminAuth；用户端点 jwtAuth。
- 写操作写 audit_logs（writeAudit）。

---

## 1. 工单管理全套（P0，1:1 复刻）→ 新文件 `routes/admin-tickets.ts`

前端：`pages/AdminTicketsPage.tsx`。tickets 表现有列：id/userId/type/title/content/status(open|in_progress|waiting_customer|resolved|closed)/priority/assignedTo/resolution/resolvedAt/metadata(jsonb)/createdAt/updatedAt。
**注意 status 映射**：前端用 pending/processing/resolved/closed；后端表是 open/in_progress/waiting_customer/resolved/closed。返回给前端时 status 用表值，status_label 用中文：
- open→待处理 pending、in_progress→处理中、waiting_customer→等待客户、resolved→已解决、closed→已关闭。
前端 STATUS_MAP 的 key 是 pending/processing/resolved/closed，因此**响应中 status 字段请返回 pending/processing/resolved/closed**（映射：open→pending、in_progress→processing、waiting_customer→processing、resolved→resolved、closed→closed）。

### 端点
1. `GET /api/v1/admin/tickets?page_size=&status=&search=` → `{ data: { list: AdminTicket[], stats: { pending,processing,resolved,closed }, avg_response_seconds, avg_resolve_seconds } }`
   - AdminTicket: `{ id, ticket_no (TCK+pad6), title, category (=type), category_label, priority, status, status_label, email, username, assignee_name, created_at }`
   - join users 取 email/username/name；assignedTo join users.name → assignee_name。
   - avg_response_seconds = 平均 创建→首次回复（metadata.replies 第一条 is_staff 时间）；avg_resolve_seconds = 平均 创建→resolvedAt。
2. `GET /api/v1/admin/tickets/stats` → `{ data: { total, resolved, resolve_rate, avg_response_seconds, avg_resolve_seconds, satisfaction, category_distribution: [{category,c}], staff_ranking: [{username,tickets,satisfaction}] } }`
3. `GET /api/v1/admin/tickets/:id` → `{ data: { ticket: AdminTicketDetail(含 description=content, all_tags), replies: [{id,is_staff,content,created_at}], operation_logs: [{id,action,detail,created_at}], satisfaction: {rating,comment}|null } }`
   - replies 存 metadata.replies；operation_logs 存 metadata.operation_logs；satisfaction 存 metadata.satisfaction；all_tags 存 metadata.tags。
4. `POST /api/v1/admin/tickets/:id/status` body `{ status }` → 更新 status（+resolvedAt when resolved）+ 写 operation_logs + audit。
5. `POST /api/v1/admin/tickets/:id/reply` body `{ content }` → metadata.replies 追加 `{ id, is_staff:true, content, created_at }`；status→in_progress（若 open）；写 audit。
6. `POST /api/v1/admin/tickets/:id/note` body `{ note }` → metadata.operation_logs 追加 `{ action:'note', detail:note, created_at }`（用户不可见）；写 audit。
7. `POST /api/v1/admin/tickets/:id/assign` body `{ assignee_id }` → 更新 assignedTo + operation_logs + audit。

## 2. 审计日志 → 并入 `routes/admin-tickets.ts` 或新文件

`GET /api/v1/admin/audit-logs?keyword=&action=&page_size=` → `{ data: { list: [{ id, created_at, operator (users.name/email), action, target (resource:resourceId), detail (details 摘要), ip }] } }`
- 源表 audit_logs join users；action 过滤（create/update/delete/audit/login/export，前端下拉）。

## 3. 风控三页 → 新文件 `routes/admin-risk.ts`

表：risk_rules(id,name,rule_type,description,config,enabled) / risk_events(id,rule_id,user_id,event_type,severity,details,resolved('0'|'1'),resolved_by,resolved_at)。
1. `GET /admin/risk/dashboard?period=` → `{ data: { unhandled_events, frozen_accounts, active_rules, today_blocks, pending_incidents, events: [{id,created_at,user_email,rule_name,detail,status(pending|handled|blocked)}] } }`
   - frozen_accounts = users.status='frozen' count；active_rules = risk_rules enabled；today_blocks = 今日 risk_events event_type=block；pending_incidents = content_moderation/security pending（可简化为 risk_events 未处理）。
2. `GET /admin/risk/events?status=&keyword=&page_size=` → `{ data: { list: [{id,created_at,user_email,rule_name,detail,severity,status(pending|handled|blocked|ignored)}] } }`（resolved 字段映射：'0'→pending）
3. `POST /admin/risk/events/:id/:op` op=resolve|freeze|ignore → 更新 resolved='1' + resolved_at；freeze 时把 users.status→'frozen'；写 audit。
4. `GET /admin/risk/rules` → `{ data: { list: [{id,name,type(=rule_type),threshold,action,is_enabled,description}] } }`（config jsonb 内取 threshold/action）
5. `POST /admin/risk/rules` body `{ name, description, type, threshold, action }` → 新增（rule_type/config 组装）；写 audit。
6. `PUT /admin/risk/rules/:id` body `{ is_enabled }` 或完整 → 更新；写 audit。

## 4. 结算/利润/对账 → 新文件 `routes/admin-finance-stats.ts`

数据源：consumption_records(user_id, model, input_tokens, output_tokens, cost, created_at)、suppliers(id,name)、vendor_pricing、recharge_orders、balance_transactions、agent_commissions。
1. `GET /admin/settlements?period=week|month|quarter&status=` → `{ data: { summary: { pending_total, settled_total, pending_vendors, disputed }, list: [{ id, vendor_name, period, revenue, cost, profit, status(pending|settled|disputed) }] } }`
   - 按渠道聚合 consumption_records.cost 与收入（充值/消费金额），profit=revenue-cost；status 由 vendor_settlements 或计算（存在即 settled）。
2. `POST /admin/settlements/:id/settle` → 标记已结算（可用 vendor_settlements 表或 system_config 记录）；写 audit。
3. `GET /admin/profit?period=` → `{ data: { summary: { revenue, cost, profit, margin }, list: [{ vendor_name, revenue, cost, commission, net_profit, margin, trend(up|down|flat) }] } }`
4. `GET /admin/reconciliation?period=` → `{ data: { summary: { revenue, cost, profit, margin }, list: [{ vendor_name, revenue, cost, profit, margin, diff, status(matched|mismatch) }] } }`
   - diff = 平台金额 vs 渠道账单金额（无账单数据时 diff=0/status=matched 或按差异计算）。

## 5. 退款审核 → 并入 `routes/admin-finance-stats.ts`

表：refund_requests（已建）。
1. `GET /admin/refunds?status=&page_size=` → `{ data: { list: [{ id, user_id, username, email, amount, reason, order_no, status, status_label, review_note, reviewed_by, reviewed_at, created_at }], pagination: { total } } }`
2. `POST /admin/refunds/:id/review` body `{ action: approve|reject, note }` → approve：调 balance.ts 退余额（refund）+ 写 balance_transactions；reject：仅更新状态；写 audit。

## 6. 公告 CRUD + 用户公告已读 → 新文件 `routes/admin-announcements.ts` + me.ts 扩展

表：announcements(id,title,content,type,priority,status(published|draft),publish_at,created_by) + announcementReads。
1. `GET /admin/announcements?status=` → `{ data: { list: [{ id, title, content, type, type_label, status(boolean: published), priority, read_count, created_by_email, created_at }] } }`（read_count = announcement_reads count）
2. `POST /admin/announcements` body `{ title, content, type, priority, publish }` → publish ? status='published'+publish_at=now : 'draft'；写 audit。
3. `PUT /admin/announcements/:id` body 同上 → 更新；写 audit。
4. `DELETE /admin/announcements/:id` → 删除（+级联 reads）；写 audit。
5. `GET /admin/announcements/:id/readers` → `{ data: { readers: [{ id, email, username, read_at }] } }`
用户端（me.ts 扩展）：
6. `GET /me/announcements` → `{ data: { list: [{ id, title, content, type, type_label, priority, is_read, created_at }] } }`（published only；is_read 按 announcementReads）
7. `GET /me/announcements/unread-count` → `{ data: { unread } }`
8. `POST /me/announcements/:id/read` → 写 announcementReads（幂等）
9. `POST /me/announcements/read-all` → 批量

## 7. 用户端小功能 → me.ts 扩展 + webhooks.ts 扩展

1. `GET /me/devices` → `{ data: { devices: [{ id, ip_address, user_agent, created_at, last_active_at? }] } }`（user_sessions 表）
2. `POST /me/devices/:id/logout` → 删除该 session；写 audit。
3. `POST /me/knowledge-base/:id/feedback` body `{ helpful, comment? }` → 写 knowledgeBaseFeedback。
4. `POST /me/notification-settings/:type/email` body `{ enabled }` → 存 system_config（user notification prefs：可存 key `notify_pref.{userId}.{type}` JSON）或 user_notifications 扩展；简单实现：存 system_config JSON。
5. `PATCH /me/webhooks/:id` body `{ isEnabled }` → userWebhooks 表更新 isEnabled（webhooks.ts 现仅 PUT）。

## 8. 客服辅助（AdminSupportPage 缺失项）→ 并入 `routes/admin-support-missing.ts`

1. `GET /admin/support/assist/diagnose/:id` → `{ data: { user, recent_calls, errors: [...], key_status, balance_alert } }`（聚合 users/api_keys/consumption_records/balance）
2. `POST /admin/support/assist/intent` body `{ text }` → 关键词规则识别意图 → `{ data: { intent, confidence, suggested_reply, action } }`
3. `GET /admin/support/test-keys` → `{ data: { list: [{ id, name, key_prefix, associated_user_id, expires_at, revoked, created_at }] } }`
4. `POST /admin/support/test-key` body `{ name, associated_user_id? }` → 生成 24h key（key_hash 存 hash，key_prefix 返回）+ supportTestKeys；写 audit。
5. `POST /admin/support/test-key/:id/revoke` → revoked=true；写 audit。
6. `GET /admin/support/audit-logs` → `{ data: { list: [...] } }`（audit_logs resource 含 support）

## 9. 业务员支撑 4 页 → 新文件 `routes/me-sales.ts`（jwtAuth + role=sales/admin）

表：agent_customers 复用（业务员-客户关系），customerTags/customerNotes/followReminders 新表。
1. `GET /me/customers?keyword=&status=&tag=` → `{ data: { list: [{ id, email, username, status, tags: [], balance, total_spend, last_active_at, created_at }] } }`（本 sales 名下）
2. `POST /me/customers/:id/assign` → 建立/更新 agent_customers 归属。
3. `GET /me/customers/:id` → 详情（基本信息 + 标签 + 联系记录 + 最近消费 + 工单数）。
4. `POST /me/customers/:id/contacts` body `{ channel, content, next_follow_at? }` → customerNotes。
5. `PUT /me/customers/:id/status` body `{ status }` → 更新 agent_customers.status 或 users.status。
6. `PUT /me/customers/:id/tags` body `{ tags: [] }` → 全量替换 customerTags。
7. `GET /me/customers/:id/consumption?period=` → 消费记录/趋势。
8. `GET /me/customers/:id/recharges?page_size=` → 充值记录。
9. `GET /me/follow-reminders?status=` → 跟进提醒列表。
10. `POST /me/follow-reminders` body `{ customer_user_id, content, remind_at }` → 新增。
11. `POST /me/follow-reminders/:id/complete`、`POST /me/follow-reminders/:id/ignore`。
12. `GET /me/sales-performance?period=` → `{ data: { customers, new_customers, reminders_done, total_spend, revenue, rank } }`。

## 10. 渠道旧 6 页别名 → 新文件 `routes/admin-vendor-alias.ts`

前端 AdminVendorCostPage/ProfilesPage/PricingPage/StatsPage/PerformancePage/ModelServicePage 调用 /admin/vendor-*，后端已有 /admin/suppliers/* 与 /admin/pricing。
1. `GET/PUT /admin/vendor-profiles` → suppliers 表映射（id,name,status,description,base_url…）
2. `GET/PUT /admin/vendor-pricing` + `POST /admin/vendor-pricing/batch-adjust` → vendor_pricing 映射（model,provider,input_price,output_price,status）
3. `GET/PUT /admin/vendor-costs` → supplier_models 成本映射
4. `GET /admin/vendor-stats?period=` → 用户选购统计（consumption_records 按 supplier/model 聚合）
5. `GET /admin/vendor-performance?period=` → 渠道绩效（成功率/延迟/调用量聚合 consumption_records + model-health-stats）
6. `GET/PUT/DELETE /admin/vendor-models` → supplier_models 映射
7. `POST /admin/vendor-keys/:id/toggle`、`DELETE /admin/vendor-keys/:id`、`POST /admin/vendors/:id/toggle-status` → supplier_keys/suppliers 映射
   实现策略：**别名转发到 suppliers.ts 对应逻辑**（可复制 suppliers.ts 中的查询，路径换成 /admin/vendor-*），保持前端零改动。

## 11. 磁盘缓存管理完整闭环 → 扩展 `routes/admin-sys-cache.ts` + `services/upstream/temp-asset-store.ts`

1. `GET /admin/sys/cache/temp-stats` → `{ data: { hit_count, file_count, dir_size, usage_pct, dir_path, last_cleanup_at, freed_today } }`（扫描 MULTIMODAL_TMP_DIR）
2. `GET /admin/sys/cache/config` → media.temp_ttl_hours / media.cleanup_interval_minutes / media.max_total_size_gb / media.emergency_cleanup_ttl_minutes（system_config）
3. `PUT /admin/sys/cache/config` → 保存
4. TTL 清理调度器：新增 `services/upstream/temp-cleanup.ts`，注册到 app.ts（参照 startRetentionScheduler）；按 temp_ttl_hours 删除过期文件；超过 max_total_size_gb 触发紧急清理（删最旧，降至 70%）；每次清理写日志/统计。
5. 现有 GET keys / DELETE key / POST flush 保留。

## 12. IP 黑名单 DELETE 补充

`DELETE /admin/security/ip-blacklist/:id`（admin-security.ts 增加）→ 删除记录；写 audit。

---

## 测试要求（每个路由文件必须带 .test.ts，vitest）

- 每个端点至少 1 个正向 case（mock db 或真实 PG 冒烟，参照 admin-support-missing 现有测试风格）。
- 权限：未登录 → 401；非 admin → 403。
- 写操作后 audit_logs 有记录。
- 最后全量：`pnpm --filter @3cloud/api test` + `pnpm --filter @3cloud/api typecheck` + `pnpm --filter @3cloud/web-console build`（或 tsc）。

## 注册（统一由主 agent 在 app.ts 完成）

- 新路由文件在 `routes/` 下创建后，主 agent 负责 import + register。
- me.ts / webhooks.ts / admin-security.ts / admin-support-missing.ts / admin-sys-cache.ts 的扩展由主 agent 合并。
