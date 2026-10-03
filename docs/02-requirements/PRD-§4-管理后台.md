# §4 管理后台 — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> 规模：44 个 admin 路由文件 ≈ 285 端点；web-console 97 个 Admin 页面。所有端点 `/api/v1/admin/*`，adminAuth（角色校验 + requirePerm 权限点）。

## 功能清单

### 4.1 看板与分析

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.1.1 | 总览看板 | `admin-dashboard.ts` GET `/admin/dashboard` | ✅已实现 | 聚合卡片 + 待办 widget |
| 4.1.2 | 转化漏斗 / 成本看板 / 成本预测 / 运营看板 / 客户成功 | `admin-analytics.ts` | ✅已实现 | 5 个分析端点 |
| 4.1.3 | 数据驾驶舱/健康大屏 | web-console AdminCockpitPage | 🟡部分实现 | 网关/DB/缓存/供应商为真实探针；实时用户/消费/模型运营为演示数据 |

### 4.2 用户与渠道

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.2.1 | 用户管理（CRUD/筛选/消费/Key/工单/充值/操作日志） | `admin-customers.ts`（17 端点） | ✅已实现 | |
| 4.2.2 | 批量操作（启停/重置密码/绑代理/实名） | `admin-customers.ts` POST `/admin/customers/batch/*` | ✅已实现 | |
| 4.2.3 | 代客登录 / 退出代客 | `admin-customers.ts` POST `/admin/customers/:id/impersonate[/exit]` | ✅已实现 | |
| 4.2.4 | 用户组管理 | `admin-groups.ts` | ✅已实现 | 列表/新建/编辑/删除/成员/改用户组 |
| 4.2.5 | 实名认证审核 | `admin-real-name.ts`（7 端点） | ✅已实现 | 统计/列表/详情/单条+批量审核/直接认证/邀请认证 |

### 4.3 渠道与模型

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.3.1 | 供应商档案/定价/成本/性能/模型/密钥 | `admin-vendor-alias.ts`（17 端点） | ✅已实现 | vendor-profiles/pricing/costs/stats/performance/models/keys |
| 4.3.2 | 供应商模型同步（单个/全量） | `admin-model-sync.ts` | ✅已实现 | |
| 4.3.3 | 模型编码管理 / 编码规则 | `admin-model-codes.ts` | ✅已实现 | 列表/状态/重生成/规则/预览 |
| 4.3.4 | 销售定价管理 | `suppliers.ts` `/admin/pricing` | ✅已实现 | requirePerm supplier.pricing |
| 4.3.5 | 调价单 / 影响分析 / 派发日志 | `admin-price-changes.ts` | ✅已实现 | |
| 4.3.6 | 模型可替代性 | `admin-price-changes.ts` `/admin/substitutability` | ✅已实现 | |
| 4.3.7 | 多模态模型管理 | `admin-misc-missing.ts` `/admin/multimodal-models/:id` | ✅已实现 | |

### 4.4 财务

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.4.1 | 财务看板/交易流水/资金账户/账期关闭 | `admin-finance.ts` | ✅已实现 | dashboard/transactions/accounts/close/* |
| 4.4.2 | **平台总账 platform_ledger（Step4 新增）** | `routes/admin-ledger.ts` + `services/finance/platform-ledger.ts` | ✅已实现 | 见下 |
| 4.4.3 | 供应商结算 / 生成 / 打款 / 异议 | `admin-vendor-settlements.ts` | ✅已实现 | |
| 4.4.4 | 对账（发起/报告/导出/差异处理） | `admin-reconciliation.ts` + `admin-finance-missing.ts` | ✅已实现 | 新旧两套路径并存（`/admin/finance/reconciliation/*` 与 `/admin/reconciliation`） |
| 4.4.5 | 退款审核 / 执行 | `admin-finance-stats.ts` `/admin/refunds/:id/(review\|execute)` | 🟡部分实现 | 单审+执行；缺金额分级多级审批、网关实际退款对接、佣金扣回 |
| 4.4.6 | 发票（开具/驳回/发送/下载/统计） | `admin-invoices.ts` | ✅已实现 | invoice-stats summary/trend/uninvoiced |
| 4.4.7 | 支付配置 / 证书 | `admin-payment.ts` | ✅已实现 | wechat/alipay/qq/bank 四组 |
| 4.4.8 | 调账审批流 | `admin-adjust.ts`（7 端点） | ✅已实现 | ledger/pending/创建/approve/review/reject/reverse，requireOperation2fa |
| 4.4.9 | 授信规则 / 授信客户 | `admin-credit.ts` | ✅已实现 | |
| 4.4.10 | 手动充值审批 / 兑换码批次 / 折扣规则 / 税务银行 | `admin-finance-missing.ts` | ✅已实现 | |

**4.4.2 platform_ledger 明细（Step4，migration 0044）**：
- 双分录写入：`postLedgerEntries`，由 `recordRechargeLedger` / `recordConsumptionLedger` / `recordRefundLedger` 在充值/消费/退款主链路副作用触发（接入点 `services/billing/balance.ts`）。
- 查询：`GET /admin/finance/ledger`（按科目/方向/用户/日期分页）。
- **会计恒等式校验**：`GET /admin/finance/ledger/summary` 按科目汇总并校验 debit=credit。

### 4.5 营销与公告

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.5.1 | 营销活动 CRUD / 启停 / 发放 / 参与人 | `admin-marketing-missing.ts` `/admin/campaigns*` | ✅已实现 | |
| 4.5.2 | 公告 CRUD / 已读读者 | `admin-announcements.ts` | ✅已实现 | |
| 4.5.3 | 优惠券生成 / 代理返利 | `admin-affiliate-coupons.ts` | ✅已实现 | |
| 4.5.4 | 客诉争议处理 | `admin-marketing-missing.ts` `/admin/disputes*` | ✅已实现 | |
| 4.5.5 | 同意书政策 / 同意记录 | `admin-marketing-missing.ts` `/admin/consent/*` | ✅已实现 | |

### 4.6 安全与风控

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.6.1 | IP 黑名单（CRUD/批量/解封） | `admin-security.ts` `/admin/security/ip-blacklist*` | ✅已实现 | 语义为风控黑名单 |
| 4.6.2 | 风控看板 / 事件 / 规则 | `admin-risk.ts` | ✅已实现 | 事件处置闭环 |
| 4.6.3 | 安全事件 / 内容审核 | `admin-risk-missing.ts` | ✅已实现 | |
| 4.6.4 | 合规报告 | `admin-security.ts` GET `/admin/compliance/report` | 🟡部分实现 | 后端在，前端无独立页 |

### 4.7 监控与消费

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.7.1 | 消费追踪 / 实时流 / 异常处置 | `admin-consumption.ts` | ✅已实现 | |
| 4.7.2 | 余额告警配置 / 告警列表 / 手动催缴 | `admin-consumption.ts` `/admin/balance-alert*` | ✅已实现 | 用户级余额提醒，非平台运维 7 项告警 |
| 4.7.3 | 在线日志 / 标记已读 | `admin-ops.ts` `/admin/sys/logs*` | ✅已实现 | |
| 4.7.4 | 性能配置 | `admin-ops.ts` `/admin/performance` | ✅已实现 | |

### 4.8 系统配置

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.8.1 | 全量/分项系统配置（site/rate-limit/security/features/api/billing/smtp） | `admin-settings.ts` | ✅已实现 | 含 SMTP 测试 |
| 4.8.2 | 国际化词条（CRUD/导入） | `admin-i18n.ts` | ✅已实现 | |
| 4.8.3 | 外部 Webhook（配置/测试/日志/重投/开关） | `admin-webhooks.ts` | ✅已实现 | 用户端入站 webhook 管理 |
| 4.8.4 | 缓存管理（key/删除/清空/配置） | `admin-sys-cache.ts` | ✅已实现 | |
| 4.8.5 | 邮件模板 / 模板测试 / 邮件日志 | `admin-email.ts` | ✅已实现 | |
| 4.8.6 | 静态内容管理 / 操作撤销 / 版本 / 迁移 / DB 表查询 | `admin-ops.ts`、`admin-support-missing.ts` | ✅已实现 | undo 记录可执行撤销 |

### 4.9 客服与对话

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.9.1 | 工单流转（状态/回复/备注/指派） | `admin-tickets.ts` | ✅已实现 | |
| 4.9.2 | 客服会话 / 回复 / 关闭 / KPI | `admin-support-missing.ts` `/admin/support/*` | ✅已实现 | |
| 4.9.3 | 知识库 CRUD | `admin-support-missing.ts` `/admin/knowledge-base` | ✅已实现 | |
| 4.9.4 | 辅助诊断 / 意图识别 / 测试密钥 | `admin-support-extra.ts` | ✅已实现 | |
| 4.9.5 | 对话记录查询 / 导出 / 留存策略 | `admin-conversation-records.ts` | ✅已实现 | retention 可执行清理 |

### 4.10 权限管理（§30）

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 4.10.1 | 角色 CRUD / 权限点清单 | `admin-permissions.ts` `/admin/roles*` | ✅已实现 | bitset 权限体系 |
| 4.10.2 | 用户角色分配 / 权限明细 | `admin-permissions.ts` `/admin/users/:id/*` | ✅已实现 | |
| 4.10.3 | 权限变更审计 | `admin-risk-missing.ts` `/admin/audit/permissions` | ✅已实现 | |
| 4.10.4 | API Key 全局策略 | `admin-permissions.ts` `/admin/apikey-policy` | 🟡部分实现 | 全局策略在；per-key 细粒度归 §2.3.3（Step4 ✅） |
| 4.10.5 | 通知策略 | `admin-permissions.ts` `/admin/notification-policies` | ✅已实现 | |

## 关键架构说明

- **权限模型**：后端 bitset 权限（requirePerm），9 等级角色 / 10 资源 / 7 操作；管理后台 AdminRolesPage / AdminUsersPermissionPage / AdminPermissionAuditPage 三页闭环。
- **历史补缺文件**：多个 `*-missing.ts`（finance/marketing/misc/risk/support）为历史补缺产物，按业务域使用即可，勿按文件名组织文档。
- **命名注意**：`AdminSettlementPage` 指向的 `/admin/settlements` 实为供应商结算，与代理月度结算无关。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| 跨域统一待办中心（独立页+聚合 API） | ❌未实现（规划中） | 仅看板内嵌 widget |
| 快捷命令面板（command palette） | ❌未实现（规划中） | 前后端均无 |
| 仪表盘自定义（卡片拖拽/布局持久化） | ❌未实现（规划中） | 静态卡片 |
| 后台品牌定制（品牌色/Logo/布局配置） | ❌未实现（规划中） | |
| 备份管理 | ❌未实现（规划中） | 无 backup 端点（仅 2FA backup codes 同名） |
| 升级执行/回滚（版本对比/一键升级） | ❌未实现（规划中） | 仅只读查看版本/迁移 |
| Open API 平台（接入管理/密钥发放/用量看板） | ❌未实现（规划中） | |
| 后台操作水印 | ❌未实现（规划中） | 仅实名照片水印 |
| 任务调度中心（查看/手动触发/暂停） | ❌未实现（规划中） | 后端有 scheduler jobs 但对管理员黑盒 |
| 变更计划与沙箱预览 | ❌未实现（规划中） | 全库无 sandbox/change-plan |
| 权限模板/预设角色、权限自检 | ❌未实现（规划中） | |
| 健康大屏真实指标（实时用户/消费/模型运营） | ❌未实现（规划中） | 当前演示数据 |
