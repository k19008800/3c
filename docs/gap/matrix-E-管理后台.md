# 差距矩阵 E：管理后台与系统管理（§4 / §12 / §30）

> 生成基准：git HEAD 91f62d3，本地工作区实际代码。
> 提取方式：`api/src/routes/admin-*.ts` 全量正则提取 fastify 路由注册；`web-console/src/pages/**/Admin*.tsx` 递归枚举；对照 `docs/SPEC-§4/§12/§30` 与 `docs/ref-4.* / ref-12.* / ref-30*`。
> 所有 admin 路由均在 `api/src/app.ts` 中 `import { ...Routes } from './routes/admin-*.js'` 显式挂载，端点为真实生效路径。
> 状态图例：✅已实现（前后端闭环）｜🟡部分实现（有后端/有前端但缺另一半或演示数据）｜❌未实现｜📄文档超前（文档有而代码无）

---

## A. 代码实际端点清单（按路由文件分组，共 44 个 admin 路由文件 ≈ 285 端点）

### A.1 看板 / 分析 / 客户成功
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-dashboard.ts | GET | /api/v1/admin/dashboard | 总览看板聚合 |
| admin-analytics.ts | GET | /api/v1/admin/conversion/funnel | 转化漏斗 |
| admin-analytics.ts | GET | /api/v1/admin/cost/dashboard | 成本看板 |
| admin-analytics.ts | GET | /api/v1/admin/cost/prediction | 成本预测 |
| admin-analytics.ts | GET | /api/v1/admin/operator/dashboard | 运营看板 |
| admin-analytics.ts | GET | /api/v1/admin/customer-success | 客户成功指标 |

### A.2 用户 / 用户组 / 实名 / 代客登录
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-customers.ts | GET | /api/v1/admin/customers | 用户列表（筛选/分页） |
| admin-customers.ts | GET | /api/v1/admin/customers/:id | 用户详情 |
| admin-customers.ts | GET | /api/v1/admin/customers/:id/consumption | 用户消费 |
| admin-customers.ts | GET | /api/v1/admin/customers/:id/api-keys | 用户密钥 |
| admin-customers.ts | GET | /api/v1/admin/customers/:id/tickets | 用户工单 |
| admin-customers.ts | GET | /api/v1/admin/customers/:id/recharges | 用户充值 |
| admin-customers.ts | GET | /api/v1/admin/customers/:id/operation-logs | 用户操作日志 |
| admin-customers.ts | PATCH | /api/v1/admin/customers/:id/status | 启停用用户 |
| admin-customers.ts | PUT | /api/v1/admin/customers/:id | 编辑用户 |
| admin-customers.ts | POST | /api/v1/admin/customers/:id/reset-password | 重置密码 |
| admin-customers.ts | POST | /api/v1/admin/customers | 新建用户 |
| admin-customers.ts | POST | /api/v1/admin/customers/batch/status | 批量启停用 |
| admin-customers.ts | POST | /api/v1/admin/customers/batch/reset-password | 批量重置密码 |
| admin-customers.ts | POST | /api/v1/admin/customers/batch/bind-agent | 批量绑定代理 |
| admin-customers.ts | POST | /api/v1/admin/customers/batch/verify | 批量实名认证 |
| admin-customers.ts | POST | /api/v1/admin/customers/:id/impersonate | 代客登录 |
| admin-customers.ts | POST | /api/v1/admin/customers/:id/impersonate/exit | 退出代客登录 |
| admin-groups.ts | GET/POST | /api/v1/admin/groups | 用户组列表/新建 |
| admin-groups.ts | PUT/DELETE | /api/v1/admin/groups/:id | 用户组编辑/删除 |
| admin-groups.ts | GET | /api/v1/admin/groups/:id/members | 组内成员 |
| admin-groups.ts | PUT | /api/v1/admin/users/:userId/group | 改用户所属组 |
| admin-real-name.ts | GET | /api/v1/admin/real-name/stats | 实名统计 |
| admin-real-name.ts | GET | /api/v1/admin/real-name | 实名审核列表 |
| admin-real-name.ts | GET | /api/v1/admin/real-name/:id | 实名详情 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/:id/review | 单条审核 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/review | 批量审核 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/direct | 直接认证 |
| admin-real-name.ts | POST | /api/v1/admin/real-name/invite | 邀请认证 |

### A.3 渠道 / 模型 / 供应商
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-marketplace.ts | GET | /api/v1/admin/models | 模型列表 |
| admin-marketplace.ts | GET | /api/v1/admin/models/marketplace | 模型市场 |
| admin-marketplace.ts | GET | /api/v1/admin/models/marketplace/:model/suppliers | 模型供应商 |
| admin-marketplace.ts | GET | /api/v1/admin/marketplace | 市场总览 |
| admin-model-sync.ts | POST | /api/v1/admin/suppliers/:id/sync-models | 单供应商同步模型 |
| admin-model-sync.ts | POST | /api/v1/admin/suppliers/sync-all | 全量同步模型 |
| admin-model-codes.ts | GET | /api/v1/admin/model-codes | 模型编码列表 |
| admin-model-codes.ts | PUT | /api/v1/admin/model-codes/:id/status | 编码状态切换 |
| admin-model-codes.ts | POST | /api/v1/admin/model-codes/:id/regenerate | 重新生成编码 |
| admin-model-codes.ts | GET/PUT | /api/v1/admin/model-code-rules | 编码规则 |
| admin-model-codes.ts | POST | /api/v1/admin/model-code-rules/preview | 规则预览 |
| admin-vendor-alias.ts | GET/POST/PUT | /api/v1/admin/vendor-profiles | 供应商档案 CRUD |
| admin-vendor-alias.ts | GET/PUT | /api/v1/admin/vendor-pricing | 供应商定价 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendor-pricing/batch-adjust | 批量调价 |
| admin-vendor-alias.ts | GET/PUT | /api/v1/admin/vendor-costs | 供应商成本 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-stats | 供应商统计 |
| admin-vendor-alias.ts | GET | /api/v1/admin/vendor-performance | 供应商性能 |
| admin-vendor-alias.ts | GET/PUT | /api/v1/admin/vendor-models | 供应商模型 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendor-keys/:id/toggle | 密钥开关 |
| admin-vendor-alias.ts | DELETE | /api/v1/admin/vendor-keys/:id | 删除密钥 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/toggle-status | 供应商启停 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/models | 新增供应商模型 |
| admin-vendor-alias.ts | POST | /api/v1/admin/vendors/:id/keys | 新增供应商密钥 |
| admin-misc-missing.ts | GET/PUT | /api/v1/admin/multimodal-models/:id | 多模态模型管理 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes | 调价单列表 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/stats | 调价统计 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/:id | 调价详情 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/:id/impact | 调价影响分析 |
| admin-price-changes.ts | POST | /api/v1/admin/price-changes/:id/notify | 调价通知 |
| admin-price-changes.ts | GET | /api/v1/admin/price-changes/dispatch-logs | 派发日志 |
| admin-price-changes.ts | GET/PATCH | /api/v1/admin/substitutability | 模型可替代性 |

### A.4 财务
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-finance.ts | GET | /api/v1/admin/finance/dashboard | 财务看板 |
| admin-finance.ts | GET | /api/v1/admin/finance/transactions | 交易流水 |
| admin-finance.ts | GET | /api/v1/admin/finance/accounts | 资金账户 |
| admin-finance.ts | GET | /api/v1/admin/finance/accounts/trend | 账户趋势 |
| admin-finance.ts | GET/POST | /api/v1/admin/finance/close/* | 账期关闭/解锁/历史 |
| admin-finance.ts | GET | /api/v1/admin/commission/flow | 佣金流水 |
| admin-finance-stats.ts | GET | /api/v1/admin/settlements | 结算单 |
| admin-finance-stats.ts | POST | /api/v1/admin/settlements/:id/settle | 执行结算 |
| admin-finance-stats.ts | GET | /api/v1/admin/profit | 利润 |
| admin-finance-stats.ts | GET | /api/v1/admin/reconciliation | 对账 |
| admin-finance-stats.ts | GET | /api/v1/admin/refunds | 退款列表 |
| admin-finance-stats.ts | POST | /api/v1/admin/refunds/:id/review | 退款审核 |
| admin-finance-stats.ts | POST | /api/v1/admin/refunds/:id/execute | 退款执行 |
| admin-finance-rules.ts | GET/PUT | /api/v1/admin/finance/rules | 财务规则 |
| admin-finance-missing.ts | GET/POST | /api/v1/admin/manual-topup | 手动充值审批 |
| admin-finance-missing.ts | GET | /api/v1/admin/manual-topup/users | 充值用户选择 |
| admin-finance-missing.ts | POST | /api/v1/admin/manual-topup/:id/review | 充值复核 |
| admin-finance-missing.ts | GET/POST/PUT | /api/v1/admin/redemption/batches | 兑换码批次 |
| admin-finance-missing.ts | POST | /api/v1/admin/redemption/batches/:id/toggle | 批次启停 |
| admin-finance-missing.ts | GET/POST | /api/v1/admin/reconciliation/diffs | 对账差异 |
| admin-finance-missing.ts | GET/POST/PUT | /api/v1/admin/discount-rules | 折扣规则 |
| admin-finance-missing.ts | GET/PUT | /api/v1/admin/tax-banking/config | 税务银行配置 |
| admin-finance-missing.ts | GET | /api/v1/admin/tax-banking/history | 税务历史 |
| admin-finance-missing.ts | GET/POST | /api/v1/admin/tax-banking/bank-accounts | 银行账户 |
| admin-reconciliation.ts | POST | /api/v1/admin/finance/reconciliation/run | 发起对账 |
| admin-reconciliation.ts | GET | /api/v1/admin/finance/reconciliation/reports[/:id] | 对账报告 |
| admin-reconciliation.ts | GET | /api/v1/admin/finance/reconciliation/export/:id | 导出报告 |
| admin-reconciliation.ts | POST | /api/v1/admin/finance/reconciliation/mismatches/:id/(resolve\|process) | 差异处理 |
| admin-adjust.ts | GET | /api/v1/admin/adjust/ledger | 调账台账 |
| admin-adjust.ts | GET | /api/v1/admin/adjust/pending | 待审调账 |
| admin-adjust.ts | POST | /api/v1/admin/adjust | 创建调账 |
| admin-adjust.ts | POST | /api/v1/admin/adjust/:id/(approve\|review\|reject\|reverse) | 调账审批流 |
| admin-credit.ts | GET | /api/v1/admin/credit/meta,/opened,/customers[/:id] | 授信查询 |
| admin-credit.ts | GET/POST/PATCH | /api/v1/admin/credit/rules[/:id] | 授信规则 |
| admin-credit.ts | POST | /api/v1/admin/credit/rules/:id/toggle | 规则启停 |
| admin-credit.ts | GET | /api/v1/admin/credit/rules/:id/history | 规则历史 |
| admin-invoices.ts | GET | /api/v1/admin/invoices | 发票列表 |
| admin-invoices.ts | POST | /api/v1/admin/invoices/:id/(issue\|reject\|send-email) | 发票开具/驳回/发送 |
| admin-invoices.ts | GET | /api/v1/admin/invoices/:id/download | 发票下载 |
| admin-invoices.ts | GET | /api/v1/admin/invoice-stats/(summary\|trend\|uninvoiced) | 发票统计 |
| admin-payment.ts | GET/PUT | /api/v1/admin/payment/config | 支付配置 |
| admin-payment.ts | GET/POST/DELETE | /api/v1/admin/payment/certs(/:name) | 支付证书 |
| admin-withdrawals.ts | GET | /api/v1/admin/agent-withdrawals[/:id] | 代理商提现 |
| admin-withdrawals.ts | POST | /api/v1/admin/agent-withdrawals/:id/(review\|transfer) | 提现打款 |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/generate | 生成供应商结算 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/vendor-settlements[/:id] | 结算单查询 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/vendor-settlements/:id/download | 结算单下载 |
| admin-vendor-settlements.ts | POST | /api/v1/admin/vendor-settlements/:id/(confirm\|paid\|dispute) | 确认/打款/异议 |
| admin-vendor-settlements.ts | GET | /api/v1/admin/supplier-bill-match | 供应商账单匹配 |

### A.5 营销 / 公告 / 代理
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-announcements.ts | GET/POST/PUT/DELETE | /api/v1/admin/announcements[/:id] | 公告 CRUD |
| admin-announcements.ts | GET | /api/v1/admin/announcements/:id/readers | 公告已读 |
| admin-marketing-missing.ts | GET/POST/PUT/DELETE | /api/v1/admin/campaigns[/:id] | 营销活动 CRUD |
| admin-marketing-missing.ts | POST | /api/v1/admin/campaigns/:id/(status\|grant) | 活动启停/发放 |
| admin-marketing-missing.ts | GET | /api/v1/admin/campaigns/:id/participants | 活动参与人 |
| admin-marketing-missing.ts | GET | /api/v1/admin/disputes | 客诉/争议列表 |
| admin-marketing-missing.ts | POST | /api/v1/admin/disputes/:id/resolve | 争议处理 |
| admin-marketing-missing.ts | GET/PUT | /api/v1/admin/consent/policies[/:id] | 同意书政策 |
| admin-marketing-missing.ts | GET | /api/v1/admin/consent/logs | 同意记录 |
| admin-affiliate-coupons.ts | GET/PUT | /api/v1/admin/affiliate/config | 代理配置 |
| admin-affiliate-coupons.ts | GET | /api/v1/admin/affiliate/records | 代理记录 |
| admin-affiliate-coupons.ts | GET/POST | /api/v1/admin/coupons(/generate) | 优惠券生成 |

### A.6 安全 / 风控 / 内容
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-security.ts | GET/POST | /api/v1/admin/security/ip-blacklist | IP 黑名单 |
| admin-security.ts | POST | /api/v1/admin/security/ip-blacklist/batch | 批量拉黑 |
| admin-security.ts | PUT | /api/v1/admin/security/ip-blacklist/:id | 改黑名单 |
| admin-security.ts | POST | /api/v1/admin/security/ip-blacklist/:id/unblock | 解封 |
| admin-security.ts | DELETE | /api/v1/admin/security/ip-blacklist/:id | 删除 |
| admin-security.ts | GET | /api/v1/admin/compliance/report | 合规报告 |
| admin-risk.ts | GET | /api/v1/admin/risk/dashboard | 风控看板 |
| admin-risk.ts | GET | /api/v1/admin/risk/events | 风控事件 |
| admin-risk.ts | POST | /api/v1/admin/risk/events/:id/:op | 事件处置 |
| admin-risk.ts | GET/POST/PUT | /api/v1/admin/risk/rules[/:id] | 风控规则 |
| admin-risk-missing.ts | GET | /api/v1/admin/security/incidents | 安全事件 |
| admin-risk-missing.ts | POST | /api/v1/admin/security/incidents/:id/:op | 事件处置 |
| admin-risk-missing.ts | GET | /api/v1/admin/content-moderation | 内容审核 |
| admin-risk-missing.ts | POST | /api/v1/admin/content-moderation/:id/:op | 内容处置 |
| admin-risk-missing.ts | GET | /api/v1/admin/operation/diff | 操作 diff |
| admin-risk-missing.ts | GET/POST/PUT | /api/v1/admin/subscription/plans[/:id] | 订阅套餐 |
| admin-risk-missing.ts | GET | /api/v1/admin/audit/permissions | 权限审计 |
| admin-competitive.ts | GET | /api/v1/admin/competitive/monitor | 竞品监控 |

### A.7 监控 / 消费 / 告警
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-consumption.ts | GET | /api/v1/admin/consumption/tracking | 消费追踪 |
| admin-consumption.ts | GET | /api/v1/admin/consumption/stream | 实时消费流 |
| admin-consumption.ts | GET | /api/v1/admin/consumption/anomalies | 消费异常 |
| admin-consumption.ts | POST | /api/v1/admin/consumption/anomalies/:id/:op | 异常处置 |
| admin-consumption.ts | GET/PUT | /api/v1/admin/balance-alert-config | 余额告警配置 |
| admin-consumption.ts | GET | /api/v1/admin/balance-alerts | 余额告警 |
| admin-consumption.ts | POST | /api/v1/admin/balance-alerts/:userId/notify | 手动催缴 |

### A.8 客服 / 工单 / 知识库 / 对话
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-tickets.ts | GET | /api/v1/admin/tickets[/stats] | 工单列表/统计 |
| admin-tickets.ts | GET | /api/v1/admin/tickets/:id | 工单详情 |
| admin-tickets.ts | POST | /api/v1/admin/tickets/:id/(status\|reply\|note\|assign) | 工单流转 |
| admin-tickets.ts | GET | /api/v1/admin/audit-logs | 操作审计日志 |
| admin-support-missing.ts | GET | /api/v1/admin/support/kpi | 客服 KPI |
| admin-support-missing.ts | GET | /api/v1/admin/support/tickets | 客服工单视图 |
| admin-support-missing.ts | GET/POST/PUT/DELETE | /api/v1/admin/knowledge-base[/:id] | 知识库 CRUD |
| admin-support-missing.ts | GET | /api/v1/admin/chat/conversations[/:id/messages] | 客服会话 |
| admin-support-missing.ts | POST | /api/v1/admin/chat/conversations/:id/(reply\|close) | 会话回复/关闭 |
| admin-support-extra.ts | GET | /api/v1/admin/support/assist/diagnose/:id | 辅助诊断 |
| admin-support-extra.ts | POST | /api/v1/admin/support/assist/intent | 意图识别 |
| admin-support-extra.ts | GET/POST | /api/v1/admin/support/test-keys | 测试密钥 |
| admin-support-extra.ts | POST | /api/v1/admin/support/test-key/:id/revoke | 吊销测试密钥 |
| admin-support-extra.ts | GET | /api/v1/admin/support/audit-logs | 客服审计 |
| admin-conversation-records.ts | GET | /api/v1/admin/conversation-records | 对话记录查询 |
| admin-conversation-records.ts | GET | /api/v1/admin/conversation-records/:requestId | 单条对话 |
| admin-conversation-records.ts | GET | /api/v1/admin/conversation-records/export | 导出 |
| admin-conversation-records.ts | GET/PUT | /api/v1/admin/conversation-records/retention | 留存策略 |
| admin-conversation-records.ts | POST | /api/v1/admin/conversation-records/retention/run | 执行清理 |

### A.9 系统配置 / 缓存 / 日志 / 版本 / DB / Webhook / I18n / 邮件
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-settings.ts | GET | /api/v1/admin/settings | 全量配置 |
| admin-settings.ts | PUT | /api/v1/admin/settings/(site\|rate-limit\|security\|features\|api\|billing\|smtp) | 分项配置 |
| admin-settings.ts | POST | /api/v1/admin/settings/smtp/test | SMTP 测试 |
| admin-i18n.ts | GET/POST/PUT/DELETE | /api/v1/admin/i18n/entries[/:id] | 国际化词条 |
| admin-i18n.ts | POST | /api/v1/admin/i18n/entries/import | 词条导入 |
| admin-webhooks.ts | GET/POST/PUT/DELETE | /api/v1/admin/webhooks[/:id] | Webhook 配置 |
| admin-webhooks.ts | PUT | /api/v1/admin/webhooks/:id/toggle | Webhook 开关 |
| admin-webhooks.ts | POST | /api/v1/admin/webhooks/:id/test | 测试推送 |
| admin-webhooks.ts | GET | /api/v1/admin/webhooks/:id/logs | 推送日志 |
| admin-sys-cache.ts | GET | /api/v1/admin/sys/cache/keys | 缓存键列表 |
| admin-sys-cache.ts | DELETE | /api/v1/admin/sys/cache/key | 删缓存键 |
| admin-sys-cache.ts | POST | /api/v1/admin/sys/cache/flush | 清空缓存 |
| admin-sys-cache.ts | GET | /api/v1/admin/sys/cache/temp-stats | 临时缓存统计 |
| admin-sys-cache.ts | GET/PUT | /api/v1/admin/sys/cache/config | 缓存配置 |
| admin-ops.ts | GET/PUT | /api/v1/admin/performance | 性能配置 |
| admin-ops.ts | GET/POST/PUT | /api/v1/admin/content[/:id] | 静态内容管理 |
| admin-ops.ts | GET/PUT | /api/v1/admin/undo/config | 撤销配置 |
| admin-ops.ts | GET | /api/v1/admin/undo/records | 撤销记录 |
| admin-ops.ts | POST | /api/v1/admin/undo/:id/execute | 执行撤销 |
| admin-ops.ts | GET/PUT | /api/v1/admin/webhook-retry[/:id] | Webhook 重投 |
| admin-ops.ts | GET | /api/v1/admin/sys/version | 版本信息 |
| admin-ops.ts | GET | /api/v1/admin/sys/migrations | 迁移记录 |
| admin-ops.ts | GET | /api/v1/admin/sys/logs(/read) | 系统日志/标记已读 |
| admin-support-missing.ts | GET | /api/v1/admin/sys/db/tables | DB 表清单 |
| admin-support-missing.ts | POST | /api/v1/admin/sys/db/query | DB 查询 |
| admin-support-missing.ts | GET | /api/v1/admin/ops/activity | 运维活动流 |
| admin-email.ts | GET/POST/PUT/DELETE | /api/v1/admin/email-templates[/:name] | 邮件模板 |
| admin-email.ts | POST | /api/v1/admin/email-templates/:name/test | 模板测试 |
| admin-email.ts | GET | /api/v1/admin/email-logs | 邮件日志 |

### A.10 权限 / 角色 / 通知策略
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-permissions.ts | GET | /api/v1/admin/users | 用户列表（权限视角） |
| admin-permissions.ts | GET | /api/v1/admin/users/:id/roles | 用户角色 |
| admin-permissions.ts | GET | /api/v1/admin/users/:id/permissions/detail | 用户权限明细 |
| admin-permissions.ts | POST | /api/v1/admin/users/:id/roles/(assign\|remove) | 角色分配/移除 |
| admin-permissions.ts | GET | /api/v1/admin/roles | 角色列表 |
| admin-permissions.ts | GET | /api/v1/admin/roles/permissions/list | 权限点清单 |
| admin-permissions.ts | GET/PUT | /api/v1/admin/apikey-policy | API Key 策略 |
| admin-permissions.ts | GET/POST/PUT/DELETE | /api/v1/admin/notification-policies[/:id] | 通知策略 |

### A.11 其他
| 路由文件 | 方法 | 路径 | 功能 |
|---|---|---|---|
| admin-agents.ts | GET/PUT | /api/v1/admin/agents[/:id] | 代理商管理 |
| admin-misc-missing.ts | GET | /api/v1/admin/deletion/(requests\|stats) | 注销请求 |
| admin-misc-missing.ts | POST | /api/v1/admin/deletion/requests/:id/(reject\|complete) | 注销审批 |
| admin-misc-missing.ts | GET | /api/v1/admin/agents/approvals | 代理入驻审批 |
| admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals/:id/(approve\|reject\|re-review\|unbind) | 代理审批流 |
| admin-misc-missing.ts | POST | /api/v1/admin/agents/approvals | 新建代理审批 |

---

## B. 前端页面清单（web-console/src/pages，共 97 个 Admin 页面，不含 *.test.tsx）

### B.1 根目录 `pages/`（60 个）
| 页面文件 | 对应功能域 |
|---|---|
| AdminDashboardPage.tsx | §4.1 总览看板（含待办 widget） |
| AdminCockpitPage.tsx | §12.6 数据驾驶舱/健康大屏 |
| AdminCustomersPage.tsx / AdminCustomerDetailPage.tsx | §4.2 用户管理 |
| AdminGroupsPage.tsx | §4.2 用户组 |
| AdminRealNamePage.tsx | §4.2 实名认证 |
| AdminModelsPage.tsx / AdminModelCodes(test) / AdminPricingPage.tsx / AdminVendorsPage.tsx | §4.3 渠道模型 |
| AdminFinancePage.tsx / AdminFinanceRiskConfigPage.tsx / AdminFundsAccountsPage.tsx | §4.4 财务看板 |
| AdminInvoicesPage.tsx / AdminPaymentPage.tsx / AdminTaxBankingPage.tsx | §4.4 发票/支付/税务 |
| AdminRechargeOrdersPage.tsx / AdminManualRechargePage.tsx / AdminRefundReviewPage.tsx | §4.4 充值/退款 |
| AdminVendorSettlementsPage.tsx / AdminWithdrawalsPage.tsx / AdminAdjustPage.tsx | §4.4 结算/提现/调账 |
| AdminCreditPage.tsx / AdminDisputePage.tsx | §4.4 授信/争议 |
| AdminCampaignsPage.tsx / AdminAnnouncementsPage.tsx / AdminCouponPage.tsx / AdminRedemptionPage.tsx | §4.5 营销 |
| AdminApikeySecurityPage.tsx / AdminDataExportGrantPage.tsx / AdminDataRequestPage.tsx / AdminDeletionPage.tsx | §4.6 安全/数据 |
| AdminContentModerationPage.tsx / AdminContentPage.tsx | §4.6 内容 |
| AdminSysLogsPage.tsx / AdminPerformancePage.tsx | §4.7 监控日志 |
| AdminSettingsPage.tsx / AdminI18nPage.tsx / AdminSmtpSettingsPage(子目录) / AdminWebhooksPage.tsx / AdminWebhookRetryPage.tsx | §4.8 系统配置 |
| AdminTicketsPage.tsx / AdminSupportPage.tsx / AdminKnowledgeBasePage.tsx / AdminChatPage.tsx | §4.11/客服 |
| AdminRolesPage.tsx / AdminUsersPermissionPage.tsx / AdminPermissionAuditPage.tsx | §30 权限 |
| AdminSysCachePage.tsx / AdminSysDbPage.tsx / AdminSysVersionPage.tsx | §12 系统管理 |
| AdminActivityPage.tsx / AdminUndoPage.tsx / AdminClosePage.tsx / AdminSubscriptionPage.tsx | 运维操作 |
| AdminNotificationPolicyPage.tsx / AdminEmailTemplatesPage.tsx | 通知/邮件 |
| AdminAgentsPage.tsx / AdminAffiliatePage.tsx / AdminConversationRecordsPage.tsx | 代理/对话记录 |
| AdminDiscountEnginePage.tsx | 折扣引擎 |

### B.2 子目录 `pages/admin/`（37 个，多为分析/运营专项）
| 页面文件 | 对应功能域 |
|---|---|
| AdminAgentApprovalsPage.tsx | 代理入驻审批 |
| AdminAuditLogPage.tsx | §12.1 操作审计 |
| AdminBalanceAlertPage.tsx | 余额告警 |
| AdminCommissionFlowPage.tsx | 佣金流水 |
| AdminCompetitiveMonitorPage.tsx | 竞品监控 |
| AdminConsumptionAnomalyPage.tsx / AdminConsumptionStreamPage.tsx / AdminConsumptionTrackingPage.tsx | 消费监控 |
| AdminConversionFunnelPage.tsx / AdminCostDashboardPage.tsx / AdminCostPredictionPage.tsx / AdminOperatorDashboardPage.tsx / AdminCustomerSuccessPage.tsx | §4.9 分析报表 |
| AdminMarketplaceHealthPage.tsx / AdminMarketplacePage.tsx / AdminModelServicePage.tsx / AdminMultimodalModelsPage.tsx | §4.3 市场/模型 |
| AdminOperationDiffPage.tsx | 操作 diff |
| AdminPriceChangePage.tsx | 调价单 |
| AdminProfitPage.tsx / AdminReconciliationPage.tsx / AdminReconciliationDiffPage.tsx / AdminSettlementPage.tsx | §4.4 财务分析 |
| AdminRiskPage.tsx / AdminRiskEventsPage.tsx / AdminRiskRulesPage.tsx | §4.13 风控工作台 |
| AdminSecurityIncidentPage.tsx / AdminSecurityIpBlacklistPage.tsx | §4.6 安全 |
| AdminSupplierBillMatchPage.tsx / AdminSupplierDetailPage.tsx / AdminSupplierListPage.tsx | 供应商 |
| AdminVendorCostPage.tsx / AdminVendorPerformancePage.tsx / AdminVendorPricingPage.tsx / AdminVendorProfilesPage.tsx / AdminVendorStatsPage.tsx | 供应商运营 |

---

## C. 功能点差距矩阵（按 SPEC 章节）

### C.1 §4 管理后台
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 4.1 | 总览看板 | admin-dashboard.ts + AdminDashboardPage | ref-4.1-admin-dashboard | ✅ | 聚合卡片 + 待办 widget 已闭环 |
| 4.2 | 用户管理 | admin-customers.ts(17ep) + AdminCustomersPage/Detail | ref-4.2-user-management | ✅ | CRUD/批量/代客登录齐备 |
| 4.2 | 用户组 | admin-groups.ts + AdminGroupsPage | ref-4.2 | ✅ | |
| 4.2 | 实名认证 | admin-real-name.ts(7ep) + AdminRealNamePage | ref-4.2 | ✅ | 含批量审核/邀请/直接认证 |
| 4.3 | 渠道与模型管理 | admin-vendor-alias.ts(17ep)+marketplace+model-codes+model-sync + 20+ 前端页 | ref-4.3-vendor-model | ✅ | 供应商档案/定价/成本/性能/密钥齐全 |
| 4.3 | 多模态模型 | admin-misc-missing.ts multimodal + AdminMultimodalModelsPage | ref-4.3 | ✅ | |
| 4.4 | 财务管理 | admin-finance*.ts(≈50ep)+invoices+payment+adjust+credit+withdrawals+vendor-settlements + 15+ 前端页 | ref-4.4-finance | ✅ | 账期/结算/退款/发票/税务/银行齐备 |
| 4.4.5 | 对账 | admin-reconciliation.ts + AdminReconciliationPage/Diff | ref-4.4.5-reconciliation-prd | ✅ | 发起/报告/导出/差异处理闭环 |
| 4.5 | 营销活动 | admin-marketing-missing.ts campaigns + AdminCampaignsPage | ref-4.5-marketing | ✅ | |
| 4.5 | 公告 | admin-announcements.ts + AdminAnnouncementsPage | ref-4.5 | ✅ | 含已读读者查询 |
| 4.5 | 优惠券/代理 | admin-affiliate-coupons.ts + AdminCouponPage/AffiliatePage | ref-4.5 | ✅ | |
| 4.6 | IP 黑名单 | admin-security.ts ip-blacklist(6ep) + AdminSecurityIpBlacklistPage | ref-4.6-security / 4.24.1 | ✅ | 含批量/解封 |
| 4.6 | 风控规则/事件 | admin-risk.ts(6ep) + AdminRiskPage/Events/Rules | ref-4.6 / 4.13 | ✅ | |
| 4.6 | 安全事件/内容审核 | admin-risk-missing.ts + AdminSecurityIncidentPage/ContentModerationPage | ref-4.6 | ✅ | |
| 4.6 | 合规报告 | admin-security.ts /compliance/report | ref-4.6 | 🟡 | 后端有端点，前端未见独立合规报告页 |
| 4.7 | 在线日志 | admin-ops.ts /sys/logs + AdminSysLogsPage | ref-4.7-monitor-logs / 12.5 | ✅ | |
| 4.7 | 消费监控/异常/余额告警 | admin-consumption.ts(8ep) + AdminConsumption*/BalanceAlertPage | ref-4.7 | ✅ | 实时流+异常+催缴 |
| 4.7 | 性能配置 | admin-ops.ts /performance + AdminPerformancePage | ref-4.7 | ✅ | |
| 4.8 | 系统配置 | admin-settings.ts(9ep) + AdminSettingsPage | ref-4.8-system-config | ✅ | site/rate-limit/security/features/api/billing/smtp 分项 |
| 4.8 | 国际化 | admin-i18n.ts(5ep) + AdminI18nPage | ref-4.8 | ✅ | |
| 4.8 | Webhook | admin-webhooks.ts(7ep) + AdminWebhooksPage/RetryPage | ref-4.8 / 4.23 | ✅ | |
| 4.9 | 报表/分析测试 | admin-analytics.ts(5ep) + ConversionFunnel/Cost*/Operator/CustomerSuccess 页 | ref-4.9-report-testing | 🟡 | 漏斗/成本预测/运营看板已做；AB 测试页面未见 |
| 4.10 | 渠道自助管理(P1) | admin-vendor-alias.ts vendor-* 端点 + SupplierList/Detail/Vendor* 页 | ref-4.10-vendor-self-service | 🟡 | 供应商视角页面已具备；自助门户（供应商登录侧）待核 |
| 4.11 | 待办中心(P0) | AdminDashboardPage 内嵌待办 widget（grep 命中 todo/待办） | SPEC-4.11 / ref-4.11-ticketing | 🟡 | **无独立待办中心页面/聚合 API**，仅看板内 widget；SPEC 要求跨工单/调账/实名/提现/对账的统一待办聚合 |
| 4.12 | 批量运营工具(P0) | admin-customers.ts batch/*(4ep) + AdminCustomersPage 批量按钮 | SPEC-4.12 | 🟡 | 用户批量启停/重置/绑代理/实名已做；跨模块批量运营（批量调价/批量发券）未见统一工具页 |
| 4.13 | 异常交易工作台(P0) | admin-risk.ts + admin-consumption anomalies + AdminRiskPage/RiskEvents/ConsumptionAnomaly | SPEC-4.13 | ✅ | 异常+风控事件+处置闭环 |
| 4.14 | 快捷命令面板(P1) | — | SPEC-4.14 | ❌ | 前端无 command palette/快捷命令，后端无对应端点 |
| 4.15 | 系统通知广播(P1) | admin-announcements.ts | SPEC-4.15 / ref-4.14.5-notification-rules | 🟡 | 公告已做；SPEC 要求的多渠道广播/通知规则（notification-policies 有端点）前端 AdminNotificationPolicyPage 已配 |
| 4.16 | 仪表盘自定义(P1) | AdminDashboardPage 静态卡片 | SPEC-4.16 | ❌ | 无卡片拖拽/布局持久化/自定义配置端点 |
| 4.17 | 后台品牌定制(P1) | — | SPEC-4.17 / ref-4.17-template-library | ❌ | 无品牌色/Logo/布局配置端点与页面（grep brand custom/品牌定制 全无命中） |
| 4.18 | 新手指引与帮助系统(P0) | @3cloud/shared-ui HelpIcon，152 个 tsx 引用 | SPEC-4.18 / PRODUCT-DESIGN-PRINCIPLES | 🟡 | HelpIcon/HelpPopover 组件已接入 152 文件；逐页 `[?]` 覆盖率需逐页核验，未做新手引导 tour |
| 4.19 | 备份管理(P2) | — | SPEC-4.19 | ❌ | 后端无 backup 端点（grep 仅命中 2FA backup codes），前端无备份页 |
| 4.20 | 升级管理(P2) | admin-ops.ts /sys/version,/sys/migrations + AdminSysVersionPage | SPEC-4.20 / ref-12.8 | 🟡 | 版本/迁移**只读查看**已做；无执行升级/回滚端点 |
| 4.21 | Open API 平台(P2) | — | SPEC-4.21 / ref-4.19-open-api-platform | ❌ | 无 OpenAPI 接入管理/密钥发放/用量看板端点与页面 |
| 4.22 | 数据生命周期(P0) | admin-conversation-records.ts retention + admin-misc-missing deletion + AdminDeletionPage/DataExportGrant/DataRequest | SPEC-4.22 | ✅ | 对话留存策略+注销审批+导出授权闭环 |
| 4.23 | 外部通知渠道(P0) | admin-webhooks.ts + AdminWebhooksPage | SPEC-4.23 / ref-4.14-report-push | ✅ | Webhook 配置/测试/日志/重投齐备 |
| 4.24.1 | 后台 IP 白名单(P0) | admin-security.ts ip-blacklist | SPEC-4.24.1 | 🟡 | IP 黑名单已做；SPEC 4.24.1 要求的是**后台访问白名单**，现有为风控黑名单，语义需核对 |
| 4.24.2 | 操作水印(P0) | —（仅 AdminRealNamePage 有实名照片水印） | SPEC-4.24.2 | ❌ | 无后台操作水印（前端水印组件/后端水印注入） |
| 4.24.3 | 会话管理增强(P0) | admin-ops undo/* + Operation2faModal + 2fa 路由 | SPEC-4.24.3 | 🟡 | 操作撤销 + 2FA 已有；强制会话管理/在线会话列表/远端登出未见独立端点 |

### C.2 §12 系统管理员支撑
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 12.1 | 操作审计控制台 | admin-tickets.ts /audit-logs + admin-risk-missing /audit/permissions + AdminAuditLogPage/AdminPermissionAuditPage | ref-12.1-audit-console | ✅ | 审计日志+权限审计双视图 |
| 12.2 | 数据库管理面板 | admin-support-missing.ts /sys/db/tables,/sys/db/query + AdminSysDbPage | ref-12.2-db-panel | ✅ | 表清单+查询面板 |
| 12.3 | 缓存管理控制台 | admin-sys-cache.ts(6ep) + AdminSysCachePage | ref-12.3-cache-manager | ✅ | key 列举/删除/清空/配置 |
| 12.4 | 任务调度中心 | 后端 services 有 scheduler jobs（task-poller/retention/pre-consume/model-health-aggregator/price-notification/temp-cleanup） | ref-12.4-task-scheduler | ❌ | **后端有定时任务但无 admin 端点/页面查看任务状态/手动触发/暂停调度**，调度对管理员黑盒 |
| 12.5 | 在线日志查看器 | admin-ops.ts /sys/logs,/sys/logs/read + AdminSysLogsPage | ref-12.5-log-viewer | ✅ | 日志列表+标记已读 |
| 12.6 | 健康检查大屏 | AdminCockpitPage（4 张健康卡对接真实 /health）+ health.ts | ref-12.6-health-dashboard | 🟡 | 网关/DB/缓存/供应商连通为真实探针；实时用户/实时消费/模型运营用**演示数据**（页面注释明示后端未提供） |
| 12.7 | 变更计划与沙箱预览 | — | ref-12.7-change-plan | ❌ | 全代码库无 sandbox/change-plan/变更计划/沙箱，沙箱→生产审批闭环未实现 |
| 12.8 | 系统升级与版本管理 | admin-ops.ts /sys/version,/sys/migrations + AdminSysVersionPage | ref-12.8-version-manager | 🟡 | 只读版本/迁移记录；无版本对比/一键升级/回滚 |
| 12.9 | 权限矩阵集成 | admin-permissions.ts 权限点清单 /roles/permissions/list | ref-12.9-conversation-records | ✅ | 权限点清单端点存在 |

### C.3 §30 权限管理
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 30.1 | 角色管理增强 | admin-permissions.ts /roles,/roles/permissions/list + AdminRolesPage | ref-30-permission-management / SPEC-30.1 | ✅ | 角色 CRUD + 权限点清单 |
| 30.2 | 用户权限一览 | /users/:id/permissions/detail + AdminUsersPermissionPage | SPEC-30.2 | ✅ | 用户角色/权限明细闭环 |
| 30.3 | 权限变更审计(P1) | /audit/permissions + AdminPermissionAuditPage | SPEC-30.3 | ✅ | 权限操作审计端点+页面 |
| 30.4 | API Key 细粒度权限(P1) | /apikey-policy + AdminApikeySecurityPage | SPEC-30.4 | 🟡 | 全局策略配置已做；SPEC 要求的 per-key 细粒度（按模型/按路由/按额度）粒度需逐 Key 核对 |
| 30.5 | 权限模板与预设角色(P1) | — | SPEC-30.5 | ❌ | 无预设角色模板/权限模板端点（grep permission template/预设角色 无命中） |
| 30.6 | 权限自检(P2) | — | SPEC-30.6 | ❌ | 无权限自检端点与页面（grep self-check/自检 无命中） |

---

## D. 关键发现

1. **实现密度极高**：44 个 admin 路由文件、≈285 端点、97 个前端 Admin 页面，§4.2/4.3/4.4/4.5/4.6/4.7/4.8/4.13/4.22/4.23 与 §12.1/12.2/12.3/12.5 及 §30.1/30.2/30.3 均为前后端闭环 ✅。财务域最重（≈50 端点，含对账/结算/发票/税务/调账/授信/提现全链路）。

2. **明确未实现（❌，7 项，建议优先补）**：
   - **§4.14 快捷命令面板** — 前后端均无
   - **§4.16 仪表盘自定义** — 无卡片布局持久化
   - **§4.17 后台品牌定制** — 无品牌配置端点/页面
   - **§4.19 备份管理** — 无任何备份端点（仅 2FA backup codes 同名误命中）
   - **§4.21 Open API 平台** — 无接入管理端点
   - **§4.24.2 后台操作水印** — 仅实名照片水印，非后台操作水印
   - **§12.4 任务调度中心** — 后端有 scheduler jobs 但对管理员黑盒，无查看/触发/暂停端点与页面
   - **§12.7 变更计划与沙箱预览** — 全库无 sandbox/change-plan
   - **§30.5 权限模板/预设角色**、**§30.6 权限自检**

3. **部分实现（🟡，需补另一半或真实数据）**：
   - **§4.11 待办中心(P0)**：仅看板内嵌 widget，无跨域统一待办聚合 API/独立页——SPEC 标 P0，建议优先补
   - **§12.6 健康大屏**：实时用户/消费/模型运营为演示数据（页面注释明示），需后端补真实指标端点
   - **§4.18 [?] 帮助系统**：HelpIcon 已接入 152 文件，但逐页 `[?]` 覆盖率与新手 tour 未核验（AGENTS.md 红线：按钮旁必须有 `[?]`）
   - **§4.20/§12.8 升级版本管理**：仅只读，无执行/回滚
   - **§4.24.1**：现有 IP 黑名单为风控语义，与 SPEC「后台访问白名单」语义需核对
   - **§30.4**：API Key 仅全局策略，per-key 细粒度待核

4. **文档超前 vs 代码**：§4.14/4.16/4.17/4.19/4.21、§12.4/12.7、§30.5/30.6 在 ref 文档中有完整 PRD（ref-4.17-template-library 34KB、ref-4.19-open-api-platform 41KB、ref-12.7-change-plan 16KB），但代码零实现——属「📄文档超前」，重写 PRD 时应将这些章节标注为「未实现/规划中」，不得写成已部署。

5. **命名/结构提示**：多个 `*-missing.ts` 文件（finance-missing/marketing-missing/misc-missing/risk-missing/support-missing）说明历史上是「补缺」时追加的路由，命名不规范；重写 PRD 时建议按业务域重新归组，不要按 `missing` 后缀组织文档。

6. **未验证项**：本矩阵基于路由注册提取 + 前端文件枚举 + 关键词 grep，**未逐端点跑通前后端联调**；🟡 状态的细粒度判断（如 30.4 per-key、4.24.1 白名单语义）需后续逐文件读 handler 确认。
