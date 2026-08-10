# 原型 → 实现 → 路由 → 后端端点 对照清单

> 依据：`kb/3cloud/prototypes/`（原型） + `web-console/src/`（前端实现） + `api/src/routes/`（后端）。
> 整理日期：2026-08-10。
> 分组结构对齐原型 `admin-sidebar-template.html` 的 13 个导航分组。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ | 已有对应实现且已挂路由（供参考，不在此清单细列） |
| ⚠️ 死代码 | 页面文件存在，但 App.tsx 未挂路由，无法访问 |
| ❌ 缺失 | 原型页面无任何对应实现，需新建 |
| 🗑️ 重复 | 页面已被另一个 live 页面取代 |
| 后端列 | 「缺失」= `api/src/routes/` 中无该端点前缀（**除在途改动外全部缺失**） |

---

## ① 客户管理 👥

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-apikey-security.html | /customers/apikey-security | `AdminApikeySecurityPage.tsx` ⚠️ | `/admin/customers/apikey-security` | `/admin/apikey-policy`（缺失） |
| admin-customer-tags.html | /customers/tags | — ❌ 需新建 | `/admin/customers/tags` | 待定 |
| admin-customer-lifecycle.html | /customers/lifecycle | — ❌ 需新建 | `/admin/customers/lifecycle` | 待定 |

> 其余（list / {id} / quotas / verifications）已挂路由 ✅。

## ② 财务结算 💰

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-reconciliation-diff.html | /finance/reconciliation-diff | `admin/AdminReconciliationDiffPage.tsx` ⚠️ | `/admin/finance/reconciliation-diff` | `/admin/reconciliation/diffs`（缺失） |
| admin-discount-engine.html | /finance/discount-engine | `AdminDiscountEnginePage.tsx` ⚠️ | `/admin/finance/discount-engine` | `/admin/discount-rules`（缺失） |
| admin-tax-banking.html | /finance/tax-banking | `AdminTaxBankingPage.tsx` ⚠️ | `/admin/finance/tax-banking` | `/admin/tax-banking/{config,history,bank-accounts}`（缺失） |
| admin-coupon.html | /finance/coupons | `AdminCouponPage.tsx` 🗑️ | —（live 已用 `AdminRedemptionPage` → `/admin/finance/coupons`） | `/admin/coupons/generate`（缺失） |
| admin-supplier-bill-match.html | /finance/supplier-bill-match | — ❌ 需新建 | `/admin/finance/supplier-bill-match` | 待定 |
| （无原型） | — | `AdminVendorSettlementsPage.tsx` ⚠️ 供应商结算 | `/admin/suppliers/settlements` | `/admin/vendor-settlements/*`（缺失） |

> 其余（dashboard/manual-topup/adjust/orders/commissions/refunds/invoices/withdrawals/reconciliation/cost-dashboard/cost-prediction/settlement/profit/pricing）已挂路由 ✅。

## ③ 消费运营 📊（原型新增分组）

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-consumption-tracking.html | /consumption/tracking | `admin/AdminConsumptionTrackingPage.tsx` ⚠️ | `/admin/consumption/tracking` | `/admin/consumption/tracking`（缺失） |
| admin-consumption-stream.html | /consumption/stream | `admin/AdminConsumptionStreamPage.tsx` ⚠️ | `/admin/consumption/stream` | `/admin/consumption/stream`（缺失） |
| admin-consumption-anomaly.html | /consumption/anomaly | `admin/AdminConsumptionAnomalyPage.tsx` ⚠️ | `/admin/consumption/anomaly` | `/admin/consumption/anomalies`（缺失） |
| admin-balance-alert.html | /consumption/balance-alert | `admin/AdminBalanceAlertPage.tsx` ⚠️ | `/admin/consumption/balance-alert` | `/admin/balance-alerts`, `/admin/balance-alert-config`（缺失） |

## ④ 客户分析 📈（原型新增分组）

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-conversion-funnel.html | /analytics/funnel | `admin/AdminConversionFunnelPage.tsx` ⚠️ | `/admin/analytics/funnel` | `/admin/conversion/funnel`（缺失） |
| admin-customer-success.html | /analytics/success | — ❌ 需新建 | `/admin/analytics/success` | 待定 |

## ⑤ 供应商管理 🔌

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-multimodal-models.html | /suppliers/multimodal-models | `admin/AdminMultimodalModelsPage.tsx` ⚠️ | `/admin/suppliers/multimodal-models` | `/admin/multimodal-models`（缺失） |
| admin-competitive-monitor.html | /suppliers/competitive-monitor | `admin/AdminCompetitiveMonitorPage.tsx` ⚠️ | `/admin/suppliers/competitive-monitor` | `/admin/competitive/monitor`（缺失） |
| admin-supplier.html | /suppliers/list | `AdminVendorsPage.tsx` 🗑️ | —（live 已用 `AdminSupplierListPage` → `/admin/suppliers`） | `/admin/vendors/*`（缺失，建议归档） |

> 其余（{id}/model-service/vendor-profiles/vendor-pricing/vendor-cost/vendor-stats/price-change/vendor-performance）已挂路由 ✅。

## ⑥ 代理商管理 🤝

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-agent-customer-approval.html | /agents/approvals | — ❌ 需新建 | `/admin/agents/approvals` | 待定 |

> 其余（list/{id}/commission-config/withdrawals）已挂路由 ✅。

## ⑦ 模型管理 🤖

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-marketplace.html | /models/marketplace | `admin/AdminMarketplacePage.tsx` 🗑️ | —（live 已用 `AdminModelsPage` → `/admin/models/marketplace`） | `/admin/marketplace`（缺失） |

## ⑧ 营销推广 📢

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-campaign.html | /marketing/campaigns | `AdminCampaignsPage.tsx` ⚠️ | `/admin/marketing/campaigns` | `/admin/campaigns`（缺失） |

> affiliate（推荐返利）已挂路由 ✅。

## ⑨ 工单客服 🎫

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-dispute.html | /tickets/dispute | `AdminDisputePage.tsx` ⚠️ | `/admin/tickets/dispute` | `/admin/disputes`（缺失） |
| （无原型） | — | `AdminSupportPage.tsx` ⚠️ 客服效能 | `/admin/tickets/support` | `/admin/support/*`（缺失） |
| （无原型） | — | `AdminChatPage.tsx` ⚠️ 在线客服 | `/admin/tickets/chat` | `/admin/chat/*`（缺失） |
| （无原型） | — | `AdminKnowledgeBasePage.tsx` ⚠️ 客服支撑 | `/admin/tickets/knowledge-base` | `/admin/knowledge-base`, `/admin/quick-replies`（缺失） |

> tickets/list 已挂路由 ✅。

## ⑩ 系统设置 ⚙️

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-notification-policy.html | /settings/notification-policy | `AdminNotificationPolicyPage.tsx` ⚠️ | `/admin/settings/notification-policy` | `/admin/notification-policies`, `/admin/email-templates`（缺失） |
| admin-operator-dashboard.html | /settings/operator-dashboard | `admin/AdminOperatorDashboardPage.tsx` ⚠️ | `/admin/settings/operator-dashboard` | `/admin/operator/dashboard`（缺失） |
| （无原型） | — | `AdminUsersPermissionPage.tsx` ⚠️ 用户权限一览 | `/admin/settings/user-permissions` | `/admin/users`（缺失） |
| （无原型） | — | `AdminPermissionAuditPage.tsx` ⚠️ 权限审计日志 | `/admin/audit/permissions` | 无 api 调用（本地 mock） |
| （无原型） | — | `AdminActivityPage.tsx` ⚠️ 实时活动流 | `/admin/ops/activity` | 无 api 调用（本地 mock） |

> announcements/roles/i18n 已挂路由 ✅。

## ⑪ 运维配置 🛠

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| （无原型） | — | `AdminWebhooksPage.tsx` ⚠️ 全局 Webhook | `/admin/config/webhooks` | `/admin/webhooks`（缺失） |
| （无原型） | — | `AdminSysDbPage.tsx` ⚠️ 数据库管理 | `/admin/config/database` | `/admin/sys/db/{schema,query}`（缺失） |
| （无原型） | — | `AdminSysCachePage.tsx` ⚠️ 缓存管理 | `/admin/config/cache` | `/admin/sys/cache/{keys,key,flush}`（缺失） |
| （无原型） | — | `AdminConsentPage.tsx` ⚠️ 合规法务管理 | `/admin/config/compliance` | `/admin/settings/*/versions`, `/admin/data-export/*`（缺失） |

> system/monitoring/performance/webhook-retry/undo/smtp/logs/maintenance/site/rate-limit/email-templates/content/oauth 已挂路由 ✅（部分共用 AdminSettingsPage 占位）。

## ⑫ 审计合规 🔍

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-operation-diff.html | /audit/operation-diff | `admin/AdminOperationDiffPage.tsx` ⚠️ | `/admin/audit/operation-diff` | `/admin/operation/diff`（缺失） |
| admin-data-request.html | /audit/data-request | `AdminDataRequestPage.tsx` ⚠️ | `/admin/audit/data-request` | `/admin/data-requests/*`（缺失） |

> login-logs/operations/api-logs 已挂路由 ✅（共用 AdminAuditLogPage）。

## ⑬ 风控合规 🚨

| 原型 | 原型路由 | React 页面 | 建议 React 路由 | 后端端点（现状） |
|---|---|---|---|---|
| admin-security-incident.html | /risk/incidents | `admin/AdminSecurityIncidentPage.tsx` ⚠️ | `/admin/risk/incidents` | `/admin/security/incidents/*`（缺失） |
| admin-security-ip-blacklist.html | /risk/ip-blacklist | `admin/AdminSecurityIpBlacklistPage.tsx` ⚠️ | `/admin/risk/ip-blacklist` | `/admin/security/ip-blacklist`（缺失） |
| admin-content-moderation.html | /risk/content-moderation | `AdminContentModerationPage.tsx` ⚠️ | `/admin/risk/content-moderation` | `/admin/content-moderation/*`（缺失） |

> dashboard/rules/events/blocks 已挂路由 ✅（blocks 共用 AdminRiskPage）。

---

## 侧栏之外（原型有文件但不在 13 分组 / 纯新增）

| 原型 | React 页面 | 建议 React 路由 | 后端端点（现状） | 说明 |
|---|---|---|---|---|
| admin-subscription.html | `AdminSubscriptionPage.tsx` ⚠️ | `/admin/subscription` | `/admin/subscription/*`（缺失） | 订阅套餐，原型孤儿页，侧栏未收录 |
| portal-account-deletion.html | `AdminDeletionPage.tsx` ⚠️ | `/admin/account-deletion` | `/admin/deletion/*`（缺失） | 用户侧注销的 admin 审核端 |

---

## 统计汇总

| 类别 | 数量 | 明细 |
|---|---|---|
| ⚠️ 死代码（页面存在未挂路由） | **36** | 上表 ⚠️ 行 |
| 🗑️ 重复页面 | **3** | AdminCouponPage / AdminVendorsPage / AdminMarketplacePage |
| ❌ 缺失原型页面（需新建） | **5** | customer-tags、customer-lifecycle、customer-success、supplier-bill-match、agent-customer-approval |
| 🔍 后端缺失端点 | **33/33 组** | 上表所有端点前缀在 `api/src/routes/` 均无实现 |

**实施建议批次（按业务价值 + 后端聚合度）：**

1. **批次 A — 消费运营+客户分析**（4+1 页，同一套消费/漏斗端点，原型明确的新分组）：tracking / stream / anomaly / balance-alert / funnel（+success 新建）
2. **批次 B — 财务结算**（reconciliation-diff / discount-engine / tax-banking / supplier-bill-match 新建）
3. **批次 C — 风控+审计**（security-incident / ip-blacklist / content-moderation / operation-diff / data-request）
4. **批次 D — 供应商+代理商+营销**（multimodal-models / competitive-monitor / campaigns / approvals 新建）
5. **批次 E — 客服+系统+运维杂项**（support / chat / knowledge-base / webhooks / sys-db / sys-cache / consent / users-permission / permission-audit / activity / notification-policy / operator-dashboard / subscription / deletion）
6. **清理**：3 个 🗑️ 重复页面（删除或注释 import），侧栏补「消费运营」「客户分析」两组，13 个配置路由解耦出各自独立页面
