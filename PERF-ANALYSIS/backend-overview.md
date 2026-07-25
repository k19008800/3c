# 3cloud 后端全量梳理报告
生成时间: 2026/7/24 18:41:17

## 1. 路由清单

| 方法 | 路径 | 文件 |
|------|------|------|
| GET | /api/agent/notifications | notifications.ts |
| GET | /api/agent/notifications/unread-count | notifications.ts |
| GET | /api/me/notifications | notifications.ts |
| PUT | /api/me/notifications/:id/read | notifications.ts |
| PUT | /api/me/notifications/read-all | notifications.ts |
| GET | /api/me/notifications/unread-count | notifications.ts |
| GET | /api/v1/admin/agents | admin\agents.ts |
| POST | /api/v1/admin/agents | admin\agents.ts |
| GET | /api/v1/admin/agents/:agentId/clients | admin\agents.ts |
| POST | /api/v1/admin/agents/:agentId/clients | admin\agents.ts |
| PATCH | /api/v1/admin/agents/:agentId/parent | admin\agents.ts |
| GET | /api/v1/admin/agents/:agentId/rules | admin\agents.ts |
| POST | /api/v1/admin/agents/:agentId/rules | admin\agents.ts |
| DELETE | /api/v1/admin/agents/:agentId/rules/:ruleId | admin\agents.ts |
| GET | /api/v1/admin/agents/:id | admin\agents.ts |
| PATCH | /api/v1/admin/agents/:id | admin\agents.ts |
| DELETE | /api/v1/admin/agents/:id | admin\agents.ts |
| POST | /api/v1/admin/agents/:id/settle | admin\agents.ts |
| GET | /api/v1/admin/agents/:id/settlement-config | admin\agents.ts |
| PUT | /api/v1/admin/agents/:id/settlement-config | admin\agents.ts |
| GET | /api/v1/admin/agents/settlement-history | admin\agents.ts |
| GET | /api/v1/admin/announcements | admin\announcements.ts |
| POST | /api/v1/admin/announcements | admin\announcements.ts |
| GET | /api/v1/admin/announcements/:id | admin\announcements.ts |
| PATCH | /api/v1/admin/announcements/:id | admin\announcements.ts |
| DELETE | /api/v1/admin/announcements/:id | admin\announcements.ts |
| POST | /api/v1/admin/api-keys | admin\admin-keys.ts |
| GET | /api/v1/admin/api-keys | admin\admin-keys.ts |
| PUT | /api/v1/admin/api-keys/:id | admin\admin-keys.ts |
| DELETE | /api/v1/admin/api-keys/:id | admin\admin-keys.ts |
| GET | /api/v1/admin/api-keys/:id/logs | admin\admin-keys.ts |
| POST | /api/v1/admin/api-keys/batch-delete | admin\batch.ts |
| POST | /api/v1/admin/api-keys/batch-toggle | admin\batch.ts |
| GET | /api/v1/admin/audit-logs | admin\audit-logs.ts |
| GET | /api/v1/admin/audit-logs/:id | admin\audit-logs.ts |
| GET | /api/v1/admin/audit-logs/export | admin\audit-logs.ts |
| POST | /api/v1/admin/campaigns | admin\campaigns\create.ts |
| GET | /api/v1/admin/campaigns | admin\campaigns\list.ts |
| GET | /api/v1/admin/campaigns/:id | admin\campaigns\detail.ts |
| PATCH | /api/v1/admin/campaigns/:id | admin\campaigns\detail.ts |
| POST | /api/v1/admin/campaigns/:id/allocations | admin\campaigns\redemption.ts |
| GET | /api/v1/admin/campaigns/:id/allocations | admin\campaigns\redemption.ts |
| GET | /api/v1/admin/campaigns/:id/codes | admin\campaigns\redemption.ts |
| POST | /api/v1/admin/campaigns/:id/commission-rule | admin\campaigns\redemption.ts |
| POST | /api/v1/admin/campaigns/:id/generate-codes | admin\campaigns\redemption.ts |
| GET | /api/v1/admin/campaigns/:id/stats | admin\campaigns\redemption.ts |
| PATCH | /api/v1/admin/campaigns/:id/status | admin\campaigns\detail.ts |
| GET | /api/v1/admin/campaigns/stats | admin\campaigns\list.ts |
| GET | /api/v1/admin/circuit-breakers | admin\circuits.ts |
| GET | /api/v1/admin/circuit-breakers/:id | admin\circuits.ts |
| POST | /api/v1/admin/circuit-breakers/:id/config | admin\circuits.ts |
| POST | /api/v1/admin/circuit-breakers/:id/reset | admin\circuits.ts |
| GET | /api/v1/admin/circuit-breakers/history | admin\circuits.ts |
| GET | /api/v1/admin/circuit-breakers/summary | admin\circuits.ts |
| GET | /api/v1/admin/configs | admin\system.ts |
| PATCH | /api/v1/admin/configs/:key | admin\system.ts |
| POST | /api/v1/admin/configs/rotate-key/:keyName | admin\system.ts |
| GET | /api/v1/admin/configs/security-audit | admin\system.ts |
| GET | /api/v1/admin/content-filters | admin\content-filters.ts |
| POST | /api/v1/admin/content-filters | admin\content-filters.ts |
| PATCH | /api/v1/admin/content-filters/:id | admin\content-filters.ts |
| DELETE | /api/v1/admin/content-filters/:id | admin\content-filters.ts |
| POST | /api/v1/admin/content-filters/:id/test | admin\content-filters.ts |
| GET | /api/v1/admin/content-filters/logs | admin\content-filters.ts |
| GET | /api/v1/admin/content-filters/stats | admin\content-filters.ts |
| GET | /api/v1/admin/dashboard/enterprise-activity | admin\dashboard\enterprise.ts |
| GET | /api/v1/admin/dashboard/enterprise-finance | admin\dashboard\enterprise.ts |
| GET | /api/v1/admin/dashboard/enterprise-model-breakdown | admin\dashboard\enterprise.ts |
| GET | /api/v1/admin/dashboard/enterprise-overview | admin\dashboard\enterprise.ts |
| GET | /api/v1/admin/dashboard/enterprise-users | admin\dashboard\enterprise.ts |
| GET | /api/v1/admin/dashboard/health | admin\dashboard\health.ts |
| GET | /api/v1/admin/dashboard/recent-activity | admin\dashboard\recent-activity.ts |
| GET | /api/v1/admin/dashboard/revenue-analysis | admin\dashboard\revenue.ts |
| GET | /api/v1/admin/dashboard/scheduling-realtime | admin\dashboard\scheduling.ts |
| GET | /api/v1/admin/dashboard/stats | admin\dashboard\stats.ts |
| GET | /api/v1/admin/dashboard/summary | admin\dashboard\summaries.ts |
| GET | /api/v1/admin/dashboard/todo-queue | admin\dashboard\todo-queue.ts |
| GET | /api/v1/admin/dashboard/top-consumers | admin\dashboard\top-consumers.ts |
| GET | /api/v1/admin/dashboard/trends | admin\dashboard\trends.ts |
| GET | /api/v1/admin/dashboard/trends/compare | admin\dashboard\trends.ts |
| GET | /api/v1/admin/dashboard/trends/filters | admin\dashboard\trends.ts |
| GET | /api/v1/admin/dashboard/trends/hourly | admin\dashboard\trends.ts |
| GET | /api/v1/admin/email-templates | admin\email-templates.ts |
| POST | /api/v1/admin/email-templates | admin\email-templates.ts |
| PUT | /api/v1/admin/email-templates/:name | admin\email-templates.ts |
| DELETE | /api/v1/admin/email-templates/:name | admin\email-templates.ts |
| GET | /api/v1/admin/finance/agent-cost | admin\finance\codes\handlers\agent-cost.ts |
| GET | /api/v1/admin/finance/agent-integrity | admin\finance.ts |
| GET | /api/v1/admin/finance/code-cost | admin\finance\codes\handlers\code-cost.ts |
| GET | /api/v1/admin/finance/codes/agent-ledger/:agentId | admin\finance\codes\handlers\agent-ledger.ts |
| GET | /api/v1/admin/finance/codes/agent-settlement | admin\finance\codes\handlers\agent-settlement.ts |
| GET | /api/v1/admin/finance/codes/agent-settlement/:agentId | admin\finance\codes\handlers\agent-settlement-detail.ts |
| GET | /api/v1/admin/finance/codes/cost-detail/:type | admin\finance\codes\handlers\cost-detail.ts |
| GET | /api/v1/admin/finance/codes/cost-overview | admin\finance\codes\handlers\cost-overview.ts |
| POST | /api/v1/admin/finance/codes/finalize-settlement | admin\finance\codes\handlers\finalize-settlement.ts |
| GET | /api/v1/admin/finance/codes/reports/:type | admin\redemption-enhanced\reports.ts |
| GET | /api/v1/admin/finance/commissions | admin\finance.ts |
| POST | /api/v1/admin/finance/commissions/auto-settle | admin\finance.ts |
| POST | /api/v1/admin/finance/commissions/cancel | admin\finance.ts |
| GET | /api/v1/admin/finance/commissions/detail | admin\finance.ts |
| POST | /api/v1/admin/finance/commissions/settle | admin\finance.ts |
| POST | /api/v1/admin/finance/commissions/settle-by-filters | admin\finance.ts |
| GET | /api/v1/admin/finance/dashboard | admin\finance.ts |
| GET | /api/v1/admin/finance/invoices | admin\invoices.ts |
| GET | /api/v1/admin/finance/invoices/:id | admin\invoices.ts |
| POST | /api/v1/admin/finance/invoices/:id/approve | admin\invoices.ts |
| POST | /api/v1/admin/finance/invoices/:id/issue | admin\invoices.ts |
| POST | /api/v1/admin/finance/invoices/:id/reject | admin\invoices.ts |
| GET | /api/v1/admin/finance/invoices/export | admin\invoices.ts |
| GET | /api/v1/admin/finance/prices | admin\prices.ts |
| POST | /api/v1/admin/finance/prices/cost | admin\prices.ts |
| GET | /api/v1/admin/finance/prices/history | admin\prices.ts |
| POST | /api/v1/admin/finance/prices/multiplier | admin\prices.ts |
| POST | /api/v1/admin/finance/prices/sell | admin\prices.ts |
| GET | /api/v1/admin/finance/profit | admin\profit.ts |
| POST | /api/v1/admin/finance/profit/compute | admin\profit.ts |
| GET | /api/v1/admin/finance/profit/low-margin | admin\profit.ts |
| GET | /api/v1/admin/finance/profit/summary | admin\profit.ts |
| GET | /api/v1/admin/finance/profit/trend | admin\profit.ts |
| GET | /api/v1/admin/finance/reconciliation | admin\finance.ts |
| GET | /api/v1/admin/finance/reconciliation/export | admin\finance.ts |
| GET | /api/v1/admin/finance/refunds | admin\refunds.ts |
| GET | /api/v1/admin/finance/refunds/:id | admin\refunds.ts |
| POST | /api/v1/admin/finance/refunds/:id/approve | admin\refunds.ts |
| POST | /api/v1/admin/finance/refunds/:id/reject | admin\refunds.ts |
| PATCH | /api/v1/admin/key-group-items/:itemId | admin\vendor-key-groups.ts |
| DELETE | /api/v1/admin/key-group-items/:itemId | admin\vendor-key-groups.ts |
| GET | /api/v1/admin/key-group-items/:itemId/model-prices | admin\key-model-prices.ts |
| DELETE | /api/v1/admin/key-group-items/:itemId/model-prices | admin\key-model-prices.ts |
| POST | /api/v1/admin/key-group-items/:itemId/model-prices/batch | admin\key-model-prices.ts |
| POST | /api/v1/admin/key-group-items/:itemId/reveal | admin\vendor-key-groups.ts |
| POST | /api/v1/admin/key-group-items/:itemId/test | admin\vendor-key-groups.ts |
| PATCH | /api/v1/admin/key-groups/:groupId | admin\vendor-key-groups.ts |
| DELETE | /api/v1/admin/key-groups/:groupId | admin\vendor-key-groups.ts |
| GET | /api/v1/admin/key-groups/:groupId/associated-channels | admin\vendor-key-groups.ts |
| GET | /api/v1/admin/key-groups/:groupId/items | admin\vendor-key-groups.ts |
| POST | /api/v1/admin/key-groups/:groupId/items | admin\vendor-key-groups.ts |
| PATCH | /api/v1/admin/key-groups/:groupId/items/batch-status | admin\vendor-key-groups.ts |
| POST | /api/v1/admin/key-groups/:groupId/test-all | admin\vendor-key-groups.ts |
| DELETE | /api/v1/admin/key-model-prices/:priceId | admin\key-model-prices.ts |
| GET | /api/v1/admin/logs | admin\logs.ts |
| GET | /api/v1/admin/logs/:id/context | admin\log-analysis.ts |
| GET | /api/v1/admin/logs/analytics | admin\logs.ts |
| GET | /api/v1/admin/logs/analytics/export | admin\logs.ts |
| GET | /api/v1/admin/logs/failure-analysis | admin\log-analysis.ts |
| POST | /api/v1/admin/models | admin\models.ts |
| GET | /api/v1/admin/models | admin\models.ts |
| GET | /api/v1/admin/models/:id | admin\models.ts |
| PATCH | /api/v1/admin/models/:id | admin\models.ts |
| DELETE | /api/v1/admin/models/:id | admin\models.ts |
| GET | /api/v1/admin/models/:id/usage | admin\models.ts |
| POST | /api/v1/admin/models/batch-toggle | admin\batch.ts |
| POST | /api/v1/admin/notifications/announcement | notifications.ts |
| GET | /api/v1/admin/operation-logs | admin\operation-logs.ts |
| GET | /api/v1/admin/operation-logs/export | admin\operation-logs.ts |
| GET | /api/v1/admin/page-contents | admin\page-contents.ts |
| POST | /api/v1/admin/page-contents | admin\page-contents.ts |
| PATCH | /api/v1/admin/page-contents/:id | admin\page-contents.ts |
| DELETE | /api/v1/admin/page-contents/:id | admin\page-contents.ts |
| GET | /api/v1/admin/perf-cache-stats | admin\perf-stats.ts |
| GET | /api/v1/admin/prompt-audit | admin\prompt-audit.ts |
| GET | /api/v1/admin/prompt-audit/:id | admin\prompt-audit.ts |
| PATCH | /api/v1/admin/prompt-audit/:id/audit | admin\prompt-audit.ts |
| POST | /api/v1/admin/prompt-audit/analyze | admin\prompt-audit.ts |
| GET | /api/v1/admin/prompt-audit/stats | admin\prompt-audit.ts |
| POST | /api/v1/admin/quotas | admin\quotas.ts |
| GET | /api/v1/admin/quotas | admin\quotas.ts |
| PUT | /api/v1/admin/quotas/:id | admin\quotas.ts |
| DELETE | /api/v1/admin/quotas/:id | admin\quotas.ts |
| GET | /api/v1/admin/rate-limits/hits | admin\rate-limits.ts |
| GET | /api/v1/admin/rate-limits/overrides | admin\rate-limits.ts |
| POST | /api/v1/admin/rate-limits/overrides | admin\rate-limits.ts |
| DELETE | /api/v1/admin/rate-limits/overrides/:id | admin\rate-limits.ts |
| PATCH | /api/v1/admin/rate-limits/overrides/:id | admin\rate-limits.ts |
| GET | /api/v1/admin/rate-limits/rules | admin\rate-limits.ts |
| PATCH | /api/v1/admin/rate-limits/rules | admin\rate-limits.ts |
| GET | /api/v1/admin/real-name-review | admin\reviews.ts |
| POST | /api/v1/admin/real-name-review/:id | admin\reviews.ts |
| GET | /api/v1/admin/real-name-review/detail/:userId | admin\reviews.ts |
| GET | /api/v1/admin/real-name-reviews | admin\reviews.ts |
| POST | /api/v1/admin/real-name-reviews/batch-review | admin\reviews.ts |
| GET | /api/v1/admin/real-name/file/:userId/:filename | real-name-file.ts |
| GET | /api/v1/admin/recharge-orders | admin\finance.ts |
| GET | /api/v1/admin/recharge-orders/:id | admin\finance.ts |
| POST | /api/v1/admin/recharge-orders/:id/cancel | admin\finance.ts |
| POST | /api/v1/admin/recharge-orders/:id/confirm | admin\finance.ts |
| POST | /api/v1/admin/recharge-orders/:id/first-confirm | admin\finance.ts |
| POST | /api/v1/admin/recharge-orders/:id/second-confirm | admin\finance.ts |
| POST | /api/v1/admin/recharge-orders/batch-confirm | admin\finance.ts |
| GET | /api/v1/admin/redemption/agent-overview | admin\agent-redemption.ts |
| GET | /api/v1/admin/redemption/agent/:agentId/behavior | admin\agent-redemption.ts |
| GET | /api/v1/admin/redemption/agent/:agentId/detail | admin\agent-redemption.ts |
| GET | /api/v1/admin/redemption/audit-logs | admin\redemption-enhanced\audit-logs.ts |
| POST | /api/v1/admin/redemption/batch-action | admin\redemption-enhanced\batch-action.ts |
| POST | /api/v1/admin/redemption/codes/:id/force-action | admin\agent-redemption.ts |
| GET | /api/v1/admin/redemption/codes/:id/full-trace | admin\agent-redemption.ts |
| GET | /api/v1/admin/redemption/export | admin\redemption-enhanced\export.ts |
| GET | /api/v1/admin/redemption/fraud-events | admin\redemption-fraud.ts |
| POST | /api/v1/admin/redemption/fraud/ban-ip | admin\redemption-fraud.ts |
| GET | /api/v1/admin/redemption/fraud/banned-ips | admin\redemption-fraud.ts |
| PATCH | /api/v1/admin/redemption/fraud/config | admin\redemption-fraud.ts |
| GET | /api/v1/admin/redemption/fraud/stats | admin\redemption-fraud.ts |
| POST | /api/v1/admin/redemption/fraud/unban-ip | admin\redemption-fraud.ts |
| POST | /api/v1/admin/redemption/risk-action | admin\redemption-enhanced\risk-action.ts |
| POST | /api/v1/admin/roles | admin\roles.ts |
| GET | /api/v1/admin/roles | admin\roles.ts |
| GET | /api/v1/admin/roles/:id | admin\roles.ts |
| PATCH | /api/v1/admin/roles/:id | admin\roles.ts |
| DELETE | /api/v1/admin/roles/:id | admin\roles.ts |
| POST | /api/v1/admin/roles/:id/users/:userId | admin\roles.ts |
| DELETE | /api/v1/admin/roles/:id/users/:userId | admin\roles.ts |
| GET | /api/v1/admin/roles/permissions/list | admin\roles.ts |
| GET | /api/v1/admin/roles/users/:roleId | admin\roles.ts |
| GET | /api/v1/admin/security/auto-rules | admin\security\rules.ts |
| POST | /api/v1/admin/security/auto-rules | admin\security\rules.ts |
| PUT | /api/v1/admin/security/auto-rules/:id | admin\security\rules.ts |
| DELETE | /api/v1/admin/security/auto-rules/:id | admin\security\rules.ts |
| GET | /api/v1/admin/security/bans | admin\security\bans.ts |
| POST | /api/v1/admin/security/bans/ip | admin\security\bans.ts |
| POST | /api/v1/admin/security/bans/user | admin\security\bans.ts |
| GET | /api/v1/admin/security/circuits | admin\security\index.ts |
| POST | /api/v1/admin/security/circuits/:vmId/reset | admin\security\index.ts |
| GET | /api/v1/admin/security/config | admin\security\config.ts |
| GET | /api/v1/admin/security/config/:key | admin\security\config.ts |
| PATCH | /api/v1/admin/security/config/:key | admin\security\config.ts |
| GET | /api/v1/admin/security/config/history | admin\security\config.ts |
| GET | /api/v1/admin/security/dashboard | admin\security\index.ts |
| GET | /api/v1/admin/security/events | admin\security\events.ts |
| POST | /api/v1/admin/security/events/:id/ack | admin\security\events.ts |
| POST | /api/v1/admin/security/events/batch-ack | admin\security\events.ts |
| POST | /api/v1/admin/security/test-alert | admin\security\events.ts |
| POST | /api/v1/admin/security/unban/ip | admin\security\bans.ts |
| POST | /api/v1/admin/security/unban/user | admin\security\bans.ts |
| GET | /api/v1/admin/sensitive-words | admin\prompt-audit.ts |
| POST | /api/v1/admin/sensitive-words | admin\prompt-audit.ts |
| PATCH | /api/v1/admin/sensitive-words/:id | admin\prompt-audit.ts |
| DELETE | /api/v1/admin/sensitive-words/:id | admin\prompt-audit.ts |
| POST | /api/v1/admin/sensitive-words/batch | admin\prompt-audit.ts |
| GET | /api/v1/admin/site-settings | admin\site-settings.ts |
| PUT | /api/v1/admin/site-settings | admin\site-settings.ts |
| POST | /api/v1/admin/site-settings/upload | admin\site-settings.ts |
| GET | /api/v1/admin/stats | admin\system.ts |
| GET | /api/v1/admin/stats/by-model | admin\stats.ts |
| GET | /api/v1/admin/stats/by-user | admin\stats.ts |
| GET | /api/v1/admin/stats/by-vendor | admin\stats.ts |
| GET | /api/v1/admin/stats/export | admin\stats.ts |
| GET | /api/v1/admin/stats/hourly | admin\stats.ts |
| GET | /api/v1/admin/stats/overview | admin\stats.ts |
| GET | /api/v1/admin/stats/trend | admin\stats.ts |
| GET | /api/v1/admin/stats/usage/summary | admin\stats-usage.ts |
| GET | /api/v1/admin/templates | admin\templates.ts |
| GET | /api/v1/admin/templates/:id | admin\templates.ts |
| POST | /api/v1/admin/templates/:id/apply | admin\templates.ts |
| POST | /api/v1/admin/undo/:token | admin\undo.ts |
| GET | /api/v1/admin/users | admin\users\list.ts |
| POST | /api/v1/admin/users | admin\users\mutations.ts |
| GET | /api/v1/admin/users/:id | admin\users\detail\info.ts |
| PATCH | /api/v1/admin/users/:id | admin\users\mutations.ts |
| DELETE | /api/v1/admin/users/:id | admin\users\mutations.ts |
| GET | /api/v1/admin/users/:id/api-keys | admin\api-keys.ts |
| PATCH | /api/v1/admin/users/:id/api-keys/:keyId | admin\api-keys.ts |
| DELETE | /api/v1/admin/users/:id/api-keys/:keyId | admin\api-keys.ts |
| GET | /api/v1/admin/users/:id/api-keys/:keyId/call-logs | admin\api-keys.ts |
| GET | /api/v1/admin/users/:id/api-keys/:keyId/call-stats | admin\api-keys.ts |
| GET | /api/v1/admin/users/:id/api-keys/:keyId/call-trends | admin\api-keys.ts |
| GET | /api/v1/admin/users/:id/audit-logs | admin\users\detail\logs.ts |
| GET | /api/v1/admin/users/:id/balance-logs | admin\users\detail\balance.ts |
| GET | /api/v1/admin/users/:id/call-logs | admin\users\detail\logs.ts |
| GET | /api/v1/admin/users/:id/call-stats | admin\users\detail\logs.ts |
| GET | /api/v1/admin/users/:id/call-trends | admin\users\detail\logs.ts |
| POST | /api/v1/admin/users/:id/change-role | admin\users\role.ts |
| GET | /api/v1/admin/users/:id/export-data | admin\users\detail\info.ts |
| GET | /api/v1/admin/users/:id/ip-whitelist | admin\users\detail\actions.ts |
| POST | /api/v1/admin/users/:id/ip-whitelist | admin\users\detail\actions.ts |
| DELETE | /api/v1/admin/users/:id/ip-whitelist/:whitelistId | admin\users\detail\actions.ts |
| GET | /api/v1/admin/users/:id/login-history | admin\users\detail\logs.ts |
| GET | /api/v1/admin/users/:id/notes | admin\users\detail\actions.ts |
| POST | /api/v1/admin/users/:id/notes | admin\users\detail\actions.ts |
| DELETE | /api/v1/admin/users/:id/notes/:noteId | admin\users\detail\actions.ts |
| GET | /api/v1/admin/users/:id/oauth-bindings | admin\users\detail\actions.ts |
| GET | /api/v1/admin/users/:id/permissions | admin\roles.ts |
| PUT | /api/v1/admin/users/:id/permissions | admin\roles.ts |
| DELETE | /api/v1/admin/users/:id/permissions | admin\roles.ts |
| POST | /api/v1/admin/users/:id/recharge | admin\users\actions.ts |
| POST | /api/v1/admin/users/:id/reset-pwd | admin\users\actions.ts |
| GET | /api/v1/admin/users/:id/role-history | admin\users\detail\actions.ts |
| POST | /api/v1/admin/users/:id/unbind-oauth | admin\users\detail\actions.ts |
| POST | /api/v1/admin/users/:userId/manual-real-name | admin\reviews.ts |
| GET | /api/v1/admin/users/:userId/real-name-history | admin\reviews.ts |
| POST | /api/v1/admin/users/batch-toggle | admin\batch.ts |
| POST | /api/v1/admin/users/batch/disable | admin\users\actions.ts |
| POST | /api/v1/admin/users/batch/enable | admin\users\actions.ts |
| GET | /api/v1/admin/users/export | admin\users\list.ts |
| POST | /api/v1/admin/users/impersonate | admin\users\actions.ts |
| GET | /api/v1/admin/users/stats | admin\users\stats.ts |
| POST | /api/v1/admin/vendor-models | admin\vendor-models.ts |
| GET | /api/v1/admin/vendor-models | admin\vendor-models.ts |
| GET | /api/v1/admin/vendor-models/:id | admin\vendor-models.ts |
| PATCH | /api/v1/admin/vendor-models/:id | admin\vendor-models.ts |
| DELETE | /api/v1/admin/vendor-models/:id | admin\vendor-models.ts |
| POST | /api/v1/admin/vendor-models/:id/approve | admin\vendors.ts |
| POST | /api/v1/admin/vendor-models/batch-delete | admin\batch.ts |
| POST | /api/v1/admin/vendor-models/batch-toggle | admin\batch.ts |
| GET | /api/v1/admin/vendor-models/by-vendor/:vendorId | admin\vendor-models.ts |
| POST | /api/v1/admin/vendor-models/test | admin\vendor-models.ts |
| POST | /api/v1/admin/vendors | admin\vendors.ts |
| GET | /api/v1/admin/vendors | admin\vendors.ts |
| GET | /api/v1/admin/vendors/:id | admin\vendors.ts |
| PATCH | /api/v1/admin/vendors/:id | admin\vendors.ts |
| DELETE | /api/v1/admin/vendors/:id | admin\vendors.ts |
| POST | /api/v1/admin/vendors/:id/approve | admin\vendors.ts |
| GET | /api/v1/admin/vendors/:id/models | admin\vendors.ts |
| PATCH | /api/v1/admin/vendors/:id/reject | admin\vendors.ts |
| POST | /api/v1/admin/vendors/:id/sync-models | admin\vendors.ts |
| GET | /api/v1/admin/vendors/:id/sync-status | admin\vendors.ts |
| POST | /api/v1/admin/vendors/:id/vendor-key | admin\vendors.ts |
| GET | /api/v1/admin/vendors/:vendorId/key-groups | admin\vendor-key-groups.ts |
| POST | /api/v1/admin/vendors/:vendorId/key-groups | admin\vendor-key-groups.ts |
| POST | /api/v1/admin/vendors/batch-delete | admin\batch.ts |
| POST | /api/v1/admin/vendors/batch-toggle | admin\batch.ts |
| GET | /api/v1/admin/vendors/key-group-summary | admin\vendor-key-groups.ts |
| GET | /api/v1/admin/withdraws | admin\finance.ts |
| GET | /api/v1/admin/withdraws/:id | admin\finance.ts |
| POST | /api/v1/admin/withdraws/:id/first-review | admin\finance.ts |
| POST | /api/v1/admin/withdraws/:id/mark-paid | admin\finance.ts |
| POST | /api/v1/admin/withdraws/:id/second-review | admin\finance.ts |
| POST | /api/v1/admin/withdraws/batch-review | admin\finance.ts |
| GET | /api/v1/admin/withdraws/export | admin\finance.ts |
| GET | /api/v1/admin/withdraws/stats | admin\finance.ts |
| GET | /api/v1/agent/bank-info | agent\withdraw.ts |
| GET | /api/v1/agent/clients | agent\clients.ts |
| DELETE | /api/v1/agent/clients/:clientUserId | agent\clients.ts |
| GET | /api/v1/agent/clients/:customerUserId/export | agent\clients.ts |
| GET | /api/v1/agent/clients/:customerUserId/orders | agent\clients.ts |
| GET | /api/v1/agent/clients/consumption | agent\clients.ts |
| GET | /api/v1/agent/commissions | agent\commissions.ts |
| GET | /api/v1/agent/commissions/:id | agent\commissions.ts |
| GET | /api/v1/agent/commissions/export | agent\commissions.ts |
| GET | /api/v1/agent/commissions/summary | agent\commissions.ts |
| GET | /api/v1/agent/dashboard | agent\dashboard.ts |
| GET | /api/v1/agent/dashboard/income-structure | agent\dashboard.ts |
| GET | /api/v1/agent/dashboard/income-trend | agent\dashboard.ts |
| GET | /api/v1/agent/finance/ledger | agent\finance.ts |
| GET | /api/v1/agent/finance/settlement | agent\finance.ts |
| GET | /api/v1/agent/finance/settlement/export | agent\finance.ts |
| GET | /api/v1/agent/notifications | notifications.ts |
| POST | /api/v1/agent/quotas | agent\quotas.ts |
| GET | /api/v1/agent/quotas | agent\quotas.ts |
| POST | /api/v1/agent/redemption/batch-action | agent\redemption.ts |
| GET | /api/v1/agent/redemption/cost-analysis | agent\redemption.ts |
| GET | /api/v1/agent/redemption/export | agent\redemption.ts |
| GET | /api/v1/agent/redemption/templates | agent\redemption.ts |
| POST | /api/v1/agent/redemption/templates | agent\redemption.ts |
| GET | /api/v1/agent/referral-link | agent\withdraw.ts |
| GET | /api/v1/agent/stats/usage | agent\stats-usage.ts |
| POST | /api/v1/agent/withdraw | agent\withdraw.ts |
| GET | /api/v1/agent/withdraws | agent\withdraw.ts |
| POST | /api/v1/api-keys | api-keys.ts |
| GET | /api/v1/api-keys | api-keys.ts |
| PATCH | /api/v1/api-keys/:id | api-keys.ts |
| DELETE | /api/v1/api-keys/:id | api-keys.ts |
| GET | /api/v1/api-keys/:id/stats | api-keys.ts |
| GET | /api/v1/api-keys/:id/usage | api-keys.ts |
| GET | /api/v1/api-keys/:id/usage/export | api-keys.ts |
| POST | /api/v1/auth/change-password | auth\login.ts |
| POST | /api/v1/auth/forgot-password | auth\reset.ts |
| POST | /api/v1/auth/login | auth\login.ts |
| GET | /api/v1/auth/me | auth\login.ts |
| GET | /api/v1/auth/notifications | notifications.ts |
| POST | /api/v1/auth/notifications/read | notifications.ts |
| POST | /api/v1/auth/real-name/enterprise | auth\realname.ts |
| GET | /api/v1/auth/real-name/file/:filename | auth\realname.ts |
| GET | /api/v1/auth/real-name/history | auth\realname.ts |
| GET | /api/v1/auth/real-name/last-submission | auth\realname.ts |
| POST | /api/v1/auth/real-name/ocr | real-name-ocr.ts |
| POST | /api/v1/auth/real-name/personal | auth\realname.ts |
| GET | /api/v1/auth/real-name/status | auth\realname.ts |
| POST | /api/v1/auth/real-name/upload | auth\realname.ts |
| POST | /api/v1/auth/refresh | auth\login.ts |
| POST | /api/v1/auth/register | auth\register.ts |
| POST | /api/v1/auth/resend-verify | auth\register.ts |
| POST | /api/v1/auth/reset-password | auth\reset.ts |
| GET | /api/v1/auth/security/login-history | auth-security.ts |
| POST | /api/v1/auth/security/logout-all | auth-security.ts |
| POST | /api/v1/auth/security/logout-session/:id | auth-security.ts |
| GET | /api/v1/auth/security/sessions | auth-security.ts |
| POST | /api/v1/auth/verify-email | auth\register.ts |
| POST | /api/v1/invoices | invoices.ts |
| GET | /api/v1/invoices | invoices.ts |
| GET | /api/v1/invoices/:id | invoices.ts |
| GET | /api/v1/invoices/available-amount | invoices.ts |
| GET | /api/v1/logs | logs.ts |
| GET | /api/v1/logs/:id | logs.ts |
| GET | /api/v1/logs/anomalies | logs.ts |
| GET | /api/v1/logs/export | logs.ts |
| GET | /api/v1/logs/stats/by-model | logs.ts |
| GET | /api/v1/logs/summary | logs.ts |
| GET | /api/v1/logs/trends | logs.ts |
| GET | /api/v1/me/notifications/unread-count | notifications.ts |
| GET | /api/v1/me/operation-logs | operation-logs.ts |
| GET | /api/v1/me/quota | stats.ts |
| GET | /api/v1/me/stats/by-model | stats.ts |
| GET | /api/v1/me/stats/daily | stats.ts |
| GET | /api/v1/me/stats/usage | stats.ts |
| GET | /api/v1/models | models.ts |
| POST | /api/v1/playground/chat/completions | playground.ts |
| GET | /api/v1/preferences/:pageKey | preferences.ts |
| PUT | /api/v1/preferences/:pageKey | preferences.ts |
| POST | /api/v1/recharge | recharge.ts |
| POST | /api/v1/recharge/:id/cancel | recharge.ts |
| POST | /api/v1/recharge/bank-transfer | recharge.ts |
| GET | /api/v1/recharge/bank-transfer/saved-info | recharge.ts |
| POST | /api/v1/recharge/notify | recharge.ts |
| GET | /api/v1/recharge/orders | recharge.ts |
| POST | /api/v1/redemption/activate | redemption-user.ts |
| GET | /api/v1/redemption/activities | redemption-user.ts |
| GET | /api/v1/redemption/admin-logs | redemption\query.ts |
| GET | /api/v1/redemption/agent-wallet | redemption\agent.ts |
| PATCH | /api/v1/redemption/batches/:id | redemption\agent.ts |
| GET | /api/v1/redemption/batches/:id | redemption\query.ts |
| GET | /api/v1/redemption/codes | redemption\query.ts |
| PATCH | /api/v1/redemption/codes/:id | redemption-user.ts |
| DELETE | /api/v1/redemption/codes/:id | redemption\agent.ts |
| GET | /api/v1/redemption/codes/:id | redemption\query.ts |
| POST | /api/v1/redemption/codes/:id/gift | redemption-gift.ts |
| POST | /api/v1/redemption/codes/batch | redemption\agent.ts |
| GET | /api/v1/redemption/gift-history | redemption-gift.ts |
| GET | /api/v1/redemption/logs | redemption\query.ts |
| GET | /api/v1/redemption/pending | redemption-user.ts |
| POST | /api/v1/redemption/redeem | redemption\redeem.ts |
| GET | /api/v1/redemption/stats | redemption\query.ts |
| POST | /api/v1/refunds | refunds.ts |
| GET | /api/v1/refunds | refunds.ts |
| GET | /api/v1/refunds/:id | refunds.ts |
| GET | /api/v1/site-config/public | public\site-config.ts |
| GET | /api/v1/stats/usage/aggregated | stats-usage.ts |
| GET | /api/v1/stats/usage/detail | stats-usage.ts |
| POST | /api/v1/user/debug-token | quick-connect.ts |
| GET | /api/v1/user/quick-connect | quick-connect.ts |
| GET | /api/v1/user/quota | user-quota.ts |
| GET | /api/v1/user/transactions | user-transactions.ts |
| POST | /api/vendor/api-keys | vendor-self\models.ts |
| GET | /api/vendor/api-keys | vendor-self\profile.ts |
| GET | /api/vendor/health | vendor-self\models.ts |
| PUT | /api/vendor/key | vendor-self\models.ts |
| POST | /api/vendor/login | vendor-self\profile.ts |
| GET | /api/vendor/me | vendor-self\profile.ts |
| PUT | /api/vendor/me | vendor-self\profile.ts |
| GET | /api/vendor/models | vendor-self\models.ts |
| POST | /api/vendor/models | vendor-self\models.ts |
| PATCH | /api/vendor/models/:id | vendor-self\models.ts |
| PUT | /api/vendor/models/:id | vendor-self\models.ts |
| DELETE | /api/vendor/models/:id | vendor-self\models.ts |
| PUT | /api/vendor/models/:id/price | vendor-self\models.ts |
| PUT | /api/vendor/password | vendor-self\profile.ts |
| GET | /api/vendor/profile | vendor-self\profile.ts |
| PUT | /api/vendor/profile | vendor-self\profile.ts |
| POST | /api/vendor/register | vendor-self\profile.ts |
| GET | /api/vendor/stats | vendor-self\stats.ts |
| GET | /health | health.ts |
| GET | /ready | health.ts |
| GET | /v1/models | models.ts |
| GET | /ws/rate-limits | rate-limit-ws.ts |

**总计: 463 个路由**

## 2. 服务层清单

| 服务名称 | 文件 | 代码行数 | 大小(KB) |
|----------|------|----------|----------|
| agent-finance/reconciliation | agent-finance\reconciliation.ts | 571 | 20.2 |
| agent-withdraw/review | agent-withdraw\review.ts | 488 | 15.5 |
| price-service | price-service.ts | 457 | 14 |
| agent-core/admin | agent-core\admin.ts | 401 | 11.8 |
| notification-service/notifications | notification-service\notifications.ts | 381 | 11.5 |
| agent-core/clients | agent-core\clients.ts | 317 | 9.2 |
| email-service | email-service.ts | 301 | 8.4 |
| recharge-service/orders | recharge-service\orders.ts | 300 | 10 |
| refund-service | refund-service.ts | 299 | 9.9 |
| agent-finance/cron | agent-finance\cron.ts | 295 | 13.1 |
| security-auto-rule-engine | security-auto-rule-engine.ts | 293 | 8.6 |
| agent-settlement/settlements | agent-settlement\settlements.ts | 290 | 10.1 |
| session-manager | session-manager.ts | 289 | 7.7 |
| daily-summary | daily-summary.ts | 272 | 10.5 |
| profit-service | profit-service.ts | 272 | 9.8 |
| vendor-sync/sync-engine | vendor-sync\sync-engine.ts | 259 | 9.7 |
| router/forward | router\forward.ts | 240 | 7.1 |
| login-security/login-flow | login-security\login-flow.ts | 239 | 8.8 |
| circuit-breaker/operations | circuit-breaker\operations.ts | 236 | 8 |
| circuit-breaker/queries | circuit-breaker\queries.ts | 235 | 8.7 |
| agent-commission/queries | agent-commission\queries.ts | 227 | 8.7 |
| real-name-service/auto-verify | real-name-service\auto-verify.ts | 224 | 6.7 |
| geo-check/detect | geo-check\detect.ts | 223 | 7.8 |
| payment-adapter | payment-adapter.ts | 222 | 7.6 |
| security-event | security-event.ts | 216 | 6.2 |
| router/route-selection | router\route-selection.ts | 215 | 7.7 |
| redemption-fraud/checker | redemption-fraud\checker.ts | 203 | 8.2 |
| health-check | health-check.ts | 199 | 6.3 |
| agent-withdraw/queries | agent-withdraw\queries.ts | 196 | 6.7 |
| invoice-service/queries | invoice-service\queries.ts | 195 | 6.4 |
| permission-engine | permission-engine.ts | 194 | 5.4 |
| stats-usage-service/aggregate | stats-usage-service\aggregate.ts | 193 | 6.6 |
| agent-commission/admin-queries | agent-commission\admin-queries.ts | 191 | 6.7 |
| retry-fetch | retry-fetch.ts | 186 | 5.3 |
| agent-core/analytics | agent-core\analytics.ts | 183 | 7 |
| real-name-service/file-manager | real-name-service\file-manager.ts | 182 | 6.3 |
| agent-commission/rules | agent-commission\rules.ts | 176 | 5.5 |
| circuit-breaker/persistence | circuit-breaker\persistence.ts | 174 | 5.7 |
| dashboards/revenue | dashboards\revenue.ts | 169 | 6.3 |
| real-name-ocr/deepseek | real-name-ocr\deepseek.ts | 167 | 5.2 |
| quota-service/checks | quota-service\checks.ts | 166 | 4.9 |
| redemption-scheduler | redemption-scheduler.ts | 160 | 5.2 |
| dashboards/health | dashboards\health.ts | 160 | 7.5 |
| recharge-service/payment | recharge-service\payment.ts | 160 | 5.9 |
| agent-withdraw/create | agent-withdraw\create.ts | 159 | 5.7 |
| dashboards/stats | dashboards\stats.ts | 156 | 8.7 |
| redemption-notify | redemption-notify.ts | 154 | 5.5 |
| real-name-verify/aliyun | real-name-verify\aliyun.ts | 154 | 5 |
| dashboards/scheduling | dashboards\scheduling.ts | 145 | 6 |
| content-filter | content-filter.ts | 143 | 4.3 |
| stats-usage-service/agent | stats-usage-service\agent.ts | 142 | 4.8 |
| agent-finance/customer | agent-finance\customer.ts | 141 | 4.1 |
| router/simulation | router\simulation.ts | 140 | 4.3 |
| auth-service/password | auth-service\password.ts | 135 | 5.5 |
| invoice-service/admin | invoice-service\admin.ts | 133 | 3.9 |
| dashboards/consumers | dashboards\consumers.ts | 132 | 5.1 |
| billing/charge | billing\charge.ts | 121 | 6.9 |
| recharge-service/balance | recharge-service\balance.ts | 118 | 3.8 |
| geo-check/block-lookup | geo-check\block-lookup.ts | 116 | 3.4 |
| agent-finance/dashboard | agent-finance\dashboard.ts | 115 | 3.4 |
| billing/commission | billing\commission.ts | 115 | 8.4 |
| quota-service/alerts | quota-service\alerts.ts | 113 | 4.2 |
| auth-service/login | auth-service\login.ts | 112 | 5.7 |
| router/key-group | router\key-group.ts | 107 | 3.6 |
| vendor-sync/pricing | vendor-sync\pricing.ts | 105 | 4 |
| agent-commission/csv | agent-commission\csv.ts | 102 | 3.7 |
| agent-settlement/admin | agent-settlement\admin.ts | 102 | 3.9 |
| agent-commission/team | agent-commission\team.ts | 101 | 2.9 |
| geo-check/geo-lookup | geo-check\geo-lookup.ts | 101 | 2.8 |
| agent-helpers | agent-helpers.ts | 91 | 2.5 |
| stats-usage-service/admin | stats-usage-service\admin.ts | 90 | 3.2 |
| notification-service/real-name | notification-service\real-name.ts | 88 | 2.7 |
| payment-security | payment-security.ts | 87 | 2.8 |
| agent-withdraw/csv | agent-withdraw\csv.ts | 87 | 2.9 |
| agent-core/dashboard | agent-core\dashboard.ts | 85 | 2.8 |
| circuit-breaker-config | circuit-breaker-config.ts | 83 | 3.1 |
| dashboards/cache-warmup | dashboards\cache-warmup.ts | 81 | 3.3 |
| real-name-ocr/provider | real-name-ocr\provider.ts | 79 | 2.7 |
| stats-usage-service/types | stats-usage-service\types.ts | 75 | 1.9 |
| encryption | encryption.ts | 74 | 2.5 |
| auth-service/registration | auth-service\registration.ts | 73 | 4 |
| stats-usage-service/detail | stats-usage-service\detail.ts | 73 | 2.4 |
| preference-service | preference-service.ts | 72 | 2.2 |
| real-name-verify/provider | real-name-verify\provider.ts | 72 | 2.8 |
| billing/cache | billing\cache.ts | 70 | 3.9 |
| pagination | pagination.ts | 69 | 2.4 |
| geo-check/enrich | geo-check\enrich.ts | 68 | 2 |
| invoice-service/create | invoice-service\create.ts | 60 | 1.8 |
| quota-service/queries | quota-service\queries.ts | 60 | 1.9 |
| recharge-service/types | recharge-service\types.ts | 60 | 1.3 |
| redemption-fraud/ban-manager | redemption-fraud\ban-manager.ts | 59 | 2.5 |
| scheduling-stats | scheduling-stats.ts | 56 | 2.1 |
| stats-usage-service/constants | stats-usage-service\constants.ts | 54 | 1.6 |
| vendor-sync/api-client | vendor-sync\api-client.ts | 54 | 2.2 |
| operation-log | operation-log.ts | 52 | 1.7 |
| router/types | router\types.ts | 52 | 1.6 |
| login-security/config | login-security\config.ts | 49 | 1.5 |
| redemption-fraud/events | redemption-fraud\events.ts | 49 | 1.6 |
| auth-service/types | auth-service\types.ts | 48 | 1 |
| login-security/bans | login-security\bans.ts | 47 | 1.3 |
| auth-service/profile | auth-service\profile.ts | 46 | 2.4 |
| voucher-service | voucher-service.ts | 45 | 1.4 |
| agent-core/referral | agent-core\referral.ts | 42 | 1.2 |
| notification-service/core | notification-service\core.ts | 42 | 1.1 |
| auth-service/tokens | auth-service\tokens.ts | 41 | 1.7 |
| router/model-cache | router\model-cache.ts | 37 | 1.1 |
| redemption-fraud/constants | redemption-fraud\constants.ts | 36 | 1.1 |
| code-snippets | code-snippets.ts | 34 | 2.4 |
| real-name-verify/noop | real-name-verify\noop.ts | 33 | 1.1 |
| recharge-service | recharge-service.ts | 32 | 0.9 |
| real-name-service/system-config | real-name-service\system-config.ts | 32 | 0.9 |
| recharge-service/index | recharge-service\index.ts | 31 | 0.7 |
| notification-service/index | notification-service\index.ts | 30 | 0.9 |
| geo-check/types | geo-check\types.ts | 27 | 0.7 |
| login-security/sliding-window | login-security\sliding-window.ts | 27 | 0.8 |
| quota-service/types | quota-service\types.ts | 25 | 0.6 |
| real-name-service/rate-limit | real-name-service\rate-limit.ts | 25 | 0.9 |
| billing/pricing | billing\pricing.ts | 24 | 1.3 |
| notification-service/types | notification-service\types.ts | 23 | 0.7 |
| billing/types | billing\types.ts | 22 | 1.3 |
| circuit-breaker/constants | circuit-breaker\constants.ts | 22 | 1 |
| login-security/types | login-security\types.ts | 22 | 0.6 |
| circuit-breaker/index | circuit-breaker\index.ts | 21 | 0.5 |
| circuit-breaker/types | circuit-breaker\types.ts | 21 | 0.6 |
| vendor-sync/types | vendor-sync\types.ts | 21 | 0.6 |
| router | router.ts | 19 | 0.7 |
| real-name-service/id-validator | real-name-service\id-validator.ts | 19 | 0.6 |
| agent-service | agent-service.ts | 18 | 0.8 |
| agent-settlement/system-config | agent-settlement\system-config.ts | 18 | 0.6 |
| router/index | router\index.ts | 18 | 0.6 |
| circuit-breaker | circuit-breaker.ts | 17 | 0.8 |
| invoice-service/types | invoice-service\types.ts | 17 | 0.4 |
| real-name-service/types | real-name-service\types.ts | 16 | 0.5 |
| agent-withdraw/index | agent-withdraw\index.ts | 15 | 0.5 |
| agent-finance/index | agent-finance\index.ts | 14 | 0.6 |
| agent-settlement/index | agent-settlement\index.ts | 14 | 0.7 |
| agent-core/index | agent-core\index.ts | 11 | 0.6 |
| agent-settlement/types | agent-settlement\types.ts | 11 | 0.3 |
| real-name-service/index | real-name-service\index.ts | 11 | 0.6 |
| stats-usage-service/index | stats-usage-service\index.ts | 11 | 0.5 |
| agent-commission/index | agent-commission\index.ts | 10 | 0.6 |
| geo-check/index | geo-check\index.ts | 10 | 0.5 |
| redemption-fraud/types | redemption-fraud\types.ts | 10 | 0.3 |
| agent-commission/types | agent-commission\types.ts | 9 | 0.3 |
| invoice-service/index | invoice-service\index.ts | 9 | 0.5 |
| login-security/index | login-security\index.ts | 9 | 0.5 |
| quota-service/index | quota-service\index.ts | 9 | 0.5 |
| stats-usage-service | stats-usage-service.ts | 8 | 0.4 |
| auth-service/index | auth-service\index.ts | 8 | 0.5 |
| redemption-fraud/index | redemption-fraud\index.ts | 8 | 0.4 |
| agent-commission | agent-commission.ts | 7 | 0.3 |
| agent-core | agent-core.ts | 7 | 0.3 |
| agent-finance | agent-finance.ts | 7 | 0.3 |
| agent-withdraw | agent-withdraw.ts | 7 | 0.3 |
| notification-service | notification-service.ts | 7 | 0.2 |
| vendor-sync/index | vendor-sync\index.ts | 7 | 0.3 |
| agent-withdraw/types | agent-withdraw\types.ts | 6 | 0.2 |
| billing/index | billing\index.ts | 6 | 0.5 |
| agent-settlement | agent-settlement.ts | 5 | 0.2 |
| geo-check | geo-check.ts | 5 | 0.2 |
| invoice-service | invoice-service.ts | 5 | 0.2 |
| login-security | login-security.ts | 5 | 0.2 |
| quota-service | quota-service.ts | 5 | 0.2 |
| real-name-service | real-name-service.ts | 5 | 0.2 |
| redemption-fraud | redemption-fraud.ts | 5 | 0.2 |
| vendor-sync | vendor-sync.ts | 5 | 0.2 |

### 大文件警告（>500行）

- **agent-finance/reconciliation** (571 行) - agent-finance\reconciliation.ts

## 3. 中间件清单

| 中间件名称 | 文件 | 代码行数 | 描述 |
|------------|------|----------|------|
| adminKeyAuth | adminKeyAuth.ts | 249 | 管理员密钥验证中间件 |
| auth | auth.ts | 462 | 身份验证中间件 |
| disk-monitor | disk-monitor.ts | 61 | 磁盘监控中间件 |
| idempotent | idempotent.ts | 73 | 幂等性中间件 |
| log | log.ts | 43 | 日志中间件 |
| rate-limit | rate-limit.ts | 273 | 速率限制中间件 |
| response | response.ts | 186 | 响应格式化中间件 |

## 4. 热点分析

### 高频路由模式

- **/api/v1/admin** - 323 个相关路由
- **/api/v1/agent** - 28 个相关路由
- **/api/v1/auth** - 23 个相关路由
- **/api/v1/redemption** - 17 个相关路由
- **/api/v1/api-keys** - 7 个相关路由
- **/api/v1/logs** - 7 个相关路由
- **/api/v1/me** - 6 个相关路由
- **/api/v1/recharge** - 6 个相关路由
- **/api/vendor/models** - 6 个相关路由
- **/api/me/notifications** - 4 个相关路由

### 复杂服务（>200行）

- **agent-finance/reconciliation** (571 行)
- **agent-withdraw/review** (488 行)
- **price-service** (457 行)
- **agent-core/admin** (401 行)
- **notification-service/notifications** (381 行)
- **agent-core/clients** (317 行)
- **email-service** (301 行)
- **recharge-service/orders** (300 行)
- **refund-service** (299 行)
- **agent-finance/cron** (295 行)
- **security-auto-rule-engine** (293 行)
- **agent-settlement/settlements** (290 行)
- **session-manager** (289 行)
- **daily-summary** (272 行)
- **profit-service** (272 行)
- **vendor-sync/sync-engine** (259 行)
- **router/forward** (240 行)
- **login-security/login-flow** (239 行)
- **circuit-breaker/operations** (236 行)
- **circuit-breaker/queries** (235 行)
- **agent-commission/queries** (227 行)
- **real-name-service/auto-verify** (224 行)
- **geo-check/detect** (223 行)
- **payment-adapter** (222 行)
- **security-event** (216 行)
- **router/route-selection** (215 行)
- **redemption-fraud/checker** (203 行)
