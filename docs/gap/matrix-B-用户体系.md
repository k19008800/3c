# 差距矩阵 B：用户体系与个人中心（§2 / §18 / §20 / §22 / §9.5 / §9.6）

> 分片范围：§2 用户体系、§18 用户端体验增强（第一批）、§20 用户端安全与预算增强、§22 用户端体验增强（第二批）、§9.5 退款、§9.6 税票统计
>
> 生成日期：2026-10-02　|　git HEAD：91f62d3　|　数据来源：`api/src/routes/*.ts` 实际端点 + `web-console/src/App.tsx` 实际路由 + `docs/SPEC-§*` 与 `docs/ref-*.md`
>
> 状态图例：✅ 已实现　🟡 部分实现　❌ 未实现　📄 文档超前（代码未动）

---

## A. 代码实际端点清单（本分片覆盖的后端路由文件）

### A.1 认证与账户（`auth.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| POST | `/api/v1/auth/register` | 89 | 邮箱注册 |
| POST | `/api/v1/auth/login` | 178 | 邮箱密码登录（2FA 触发 tempToken） |
| POST | `/api/v1/auth/logout` | 240 | 登出 |
| POST | `/api/v1/auth/refresh` | 250 | 刷新 JWT |
| GET | `/api/v1/auth/me` | 267 | 当前用户（含 2FA 状态） |
| GET | `/api/v1/me` | 290 | 别名 `/me` |
| POST | `/api/v1/auth/forgot-password` | 328 | 忘记密码 |
| POST | `/api/v1/auth/reset-password` | 365 | 重置密码 |
| POST | `/api/v1/auth/send-email-code` | 408 | 发送邮箱验证码 |

### A.2 双因素认证（`2fa.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| POST | `/api/v1/auth/2fa/setup` | 164 | 生成 secret + otpauth URL + 备用码（暂存态 10min） |
| POST | `/api/v1/auth/2fa/enable` | 183 | TOTP 验证后落库启用 |
| POST | `/api/v1/auth/2fa/disable` | 243 | TOTP/备用码验证后关闭 |
| POST | `/api/v1/auth/2fa/verify` | 307 | tempToken + TOTP/备用码 → 正式 JWT（登录第二步） |
| GET | `/api/v1/auth/2fa/status` | 402 | 当前用户 2FA 状态 |
| POST | `/api/v1/auth/2fa/operation-verify` | 428 | 敏感操作二次 2FA 验证（财务操作） |

### A.3 OAuth 第三方登录（`oauth.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/auth/oauth/github/url` | 51 | GitHub 授权 URL |
| GET | `/api/v1/auth/oauth/github/callback` | 63 | GitHub OAuth 回调 |
| GET | `/api/v1/auth/oauth/bindings` | 86 | 已绑定的第三方账号 |
| POST | `/api/v1/auth/oauth/:provider/bind` | 93 | 绑定第三方账号 |
| POST | `/api/v1/auth/oauth/:provider/unbind` | 106 | 解绑第三方账号 |

### A.4 个人中心主路由（`me.ts`，54KB）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/stats` | 85 | 用户统计概览 |
| GET | `/api/v1/me/keys` | 134 | 我的 Key（列表） |
| GET | `/api/v1/me/models` | 150 | 可用模型列表 |
| GET | `/api/v1/me/models/:id/price` | 230 | 模型单价查询 |
| GET/PUT/DELETE | `/api/v1/me/preferences/default-code` | 259/275/305 | 默认模型代码偏好 |
| GET | `/api/v1/me/logs` | 320 | 调用日志 |
| GET | `/api/v1/me/billing/current` | 372 | 当月账单 |
| GET | `/api/v1/me/billing/current/daily` | 397 | 当月每日明细 |
| GET | `/api/v1/me/billing/history` | 413 | 历史账单列表 |
| GET | `/api/v1/me/billing/history/:month` | 436 | 指定月账单 |
| GET/POST | `/api/v1/me/real-name` | 472/514 | 实名认证查询/提交 |
| GET | `/api/v1/me/billing/history/:month/download` | 605 | 月账单下载 |
| GET | `/api/v1/me/notifications` | 646 | 通知列表 |
| POST | `/api/v1/me/notifications/:id/read` | 700 | 标记已读 |
| POST | `/api/v1/me/notifications/read-all` | 712 | 全部已读 |
| GET | `/api/v1/me/notification-settings` | 722 | 通知设置 |
| GET | `/api/v1/me/group` | 728 | 用户分组信息 |
| GET | `/api/v1/me/group/models` | 752 | 分组可见模型 |
| POST/PUT | `/api/v1/me/change-password` | 808/809 | 修改密码 |
| POST | `/api/v1/me/change-email` | 813 | 更换邮箱 |
| GET | `/api/v1/me/invoices/quota` | 841 | 可开票额度 |
| POST | `/api/v1/me/invoices` | 878 | 申请发票 |
| GET | `/api/v1/me/invoices` | 946 | 我的发票列表 |
| GET | `/api/v1/me/invoices/:id/download` | 991 | 下载发票 |
| GET | `/api/v1/me/tickets` | 1026 | 我的工单 |
| POST | `/api/v1/me/tickets` | 1064 | 提交工单 |
| POST | `/api/v1/me/tickets/:id/reply` | 1100 | 回复工单 |
| POST | `/api/v1/me/tickets/:id/resolve` | 1138 | 关闭工单 |
| POST | `/api/v1/me/api-keys/revoke-all` | 1153 | 吊销全部 API Key（P1-1） |
| GET/PUT | `/api/v1/me/settings` | 1172/1194 | 通用设置读写 |

### A.5 个人中心补缺口（`me-gap.ts`，31KB，2026-08 后补全）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/announcements` | 213 | 公告列表（含 is_read） |
| GET | `/api/v1/me/announcements/unread-count` | 252 | 未读数 |
| POST | `/api/v1/me/announcements/:id/read` | 272 | 标记已读 |
| POST | `/api/v1/me/announcements/read-all` | 288 | 全部已读 |
| GET | `/api/v1/me/devices` | 311 | 活跃会话列表 |
| POST | `/api/v1/me/devices/:id/logout` | 345 | 远程下线指定会话 |
| GET | `/api/v1/me/chat/history` | 366 | 会话历史 |
| GET | `/api/v1/me/login-history` | 408 | 登录历史 |
| GET | `/api/v1/me/knowledge-base` | 453 | 知识库文章列表 |
| GET | `/api/v1/me/knowledge-base/categories` | 514 | 知识库分类 |
| POST | `/api/v1/me/knowledge-base/:id/feedback` | 532 | 知识库反馈 |
| POST | `/api/v1/me/notification-settings/:type/email` | 556 | 邮件通知偏好 |
| GET/PUT/POST | `/api/v1/me/preferences/notifications` | 582/593/605 | 通知偏好读写/重置 |
| PATCH | `/api/v1/me/webhooks/:id` | 618 | 启/禁 Webhook |
| GET | `/api/v1/me/consent/status` | 688 | 合规同意状态 |
| POST | `/api/v1/me/consent/privacy` | 723 | 隐私政策同意 |
| POST | `/api/v1/me/consent/terms` | 730 | 服务条款同意 |

### A.6 Onboarding（`me-onboarding.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/onboarding/status` | 112 | 引导状态（5 步） |
| POST | `/api/v1/me/onboarding/step` | 119 | 保存已完成步骤 |
| POST | `/api/v1/me/onboarding/skip` | 139 | 跳过引导 |
| POST | `/api/v1/me/onboarding/complete` | 151 | 完成引导 |

### A.7 API Key（`apikeys.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET/POST | `/api/v1/me/api-keys` | 164/165 | Key 列表 / 创建 |
| PATCH | `/api/v1/me/api-keys/:id` | 166 | 修改 Key |
| DELETE | `/api/v1/me/api-keys/:id` | 167 | 删除 Key |
| GET/POST/DELETE | `/api/v1/customers/me/keys(/:id)` | 170-172 | 兼容别名 |

### A.8 充值 / 兑换（`recharge.ts`，39KB）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/balance` | 143 | 余额 |
| POST | `/api/v1/me/recharge` | 149 | 发起充值 |
| GET | `/api/v1/me/recharge-orders` | 269 | 充值订单列表 |
| GET | `/api/v1/me/promotions` | 304 | 当前活动 |
| POST | `/api/v1/me/redemption/redeem` | 318 | 兑换码核销 |
| GET | `/api/v1/me/recharge/records` | 406 | 充值记录 |
| GET | `/api/v1/me/redemption/history` | 472 | 兑换历史 |
| GET | `/api/v1/admin/recharge-orders` | 510 | 管理端充值订单 |
| POST | `/api/v1/admin/recharge-orders/:id/audit` | 630 | 财务审核（2FA） |
| POST | `/api/v1/admin/recharge-orders/:id/reject` | 805 | 财务驳回（2FA） |

### A.9 账号注销（`deletion.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/deletion/checks` | 135 | 注销前检查（余额/工单/合同/代理身份） |
| POST | `/api/v1/me/deletion/request` | 210 | 提交注销申请 |
| GET | `/api/v1/me/deletion/status` | 242 | 注销进度查询 |
| POST | `/api/v1/me/deletion/cancel` | 261 | 撤回申请（冷静期内） |
| GET | `/api/v1/admin/deletion-requests` | 313 | 管理端列表 |
| POST | `/api/v1/admin/deletion-requests/:id/approve` | 363 | 审核通过（+7 天冷静期） |
| POST | `/api/v1/admin/deletion-requests/:id/reject` | 403 | 审核驳回 |
| POST | `/api/v1/admin/deletion-requests/:id/execute` | 432 | 执行物理删除 |

### A.10 数据导出（`data-requests.ts` + `data-export-grants.ts`）

| 方法 | 路径 | 文件:行 | 功能 |
|---|---|---|---|
| POST | `/api/v1/me/data-export/request` | data-requests:149 | 用户发起导出申请 |
| GET | `/api/v1/me/data-export/requests` | data-requests:186 | 我的申请列表 |
| GET | `/api/v1/me/data-export/:id` | data-requests:218 | 详情 |
| POST | `/api/v1/me/data-export/:id/cancel` | data-requests:237 | 撤回 |
| GET | `/api/v1/me/data-export/:id/download` | data-requests:267 | 下载导出包 |
| GET | `/api/v1/admin/data-requests` | data-requests:309 | 管理端列表 |
| POST | `/api/v1/admin/data-requests/:id/approve` | data-requests:361 | 审核通过 |
| POST | `/api/v1/admin/data-requests/:id/reject` | data-requests:388 | 审核驳回 |
| POST | `/api/v1/admin/data-requests/:id/export` | data-requests:418 | 执行导出 |
| GET | `/api/v1/me/data-export/grant-status` | data-export-grants:131 | 用户导出权限状态 |
| GET/POST | `/api/v1/admin/data-export-grants` | data-export-grants:150/216 | 授权记录列表/新建 |
| PUT/DELETE | `/api/v1/admin/data-export-grants/:userId` | data-export-grants:254/288 | 更新/删除授权 |

### A.11 Webhook（`webhooks.ts`）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/webhooks` | 119 | 我的 Webhook 列表 |
| POST | `/api/v1/me/webhooks` | 129 | 创建 |
| PUT | `/api/v1/me/webhooks/:id` | 158 | 更新 |
| DELETE | `/api/v1/me/webhooks/:id` | 180 | 删除 |
| POST | `/api/v1/me/webhooks/:id/regenerate-secret` | 194 | 重签 secret |
| POST | `/api/v1/me/webhooks/:id/test` | 213 | 测试推送 |

### A.12 销售侧（`me-sales.ts`，49KB，销售身份专属）

| 方法 | 路径 | 行号 | 功能 |
|---|---|---|---|
| GET | `/api/v1/me/customer-tags` | 204 | 客户标签字典 |
| GET | `/api/v1/me/customers` | 216 | 名下客户列表 |
| POST | `/api/v1/me/customers/:id/assign` | 404 | 认领客户 |
| GET | `/api/v1/me/customers/:id` | 454 | 客户详情 |
| POST | `/api/v1/me/customers/:id/contacts` | 584 | 客户联系人 |
| PUT | `/api/v1/me/customers/:id/status` | 618 | 客户阶段状态 |
| PUT | `/api/v1/me/customers/:id/tags` | 651 | 客户打标签 |
| GET | `/api/v1/me/customers/:id/consumption` | 691 | 客户消费 |
| GET | `/api/v1/me/customers/:id/recharges` | 779 | 客户充值记录 |
| GET/POST | `/api/v1/me/follow-reminders` | 821/876 | 跟进提醒列表/新建 |
| POST | `/api/v1/me/follow-reminders/:id/complete` | 912 | 完成提醒 |
| POST | `/api/v1/me/follow-reminders/:id/ignore` | 929 | 忽略提醒 |
| GET | `/api/v1/me/sales-performance` | 956 | 销售业绩 |

---

## B. 前端用户端页面清单（`web-console/src/App.tsx`）

| 页面文件 | 路由路径 | 功能 |
|---|---|---|
| LoginPage.tsx | `/login` | 登录 |
| RegisterPage.tsx | `/register` | 注册 |
| ForgotPasswordPage.tsx | `/forgot-password` | 忘记密码 |
| OAuthPage.tsx | `/oauth` | OAuth 回调落地 |
| DashboardPage.tsx | `/` (ConsoleLayout) | 控制台首页/仪表盘 |
| StatisticsPage.tsx | `/statistics` | 用量统计 |
| ApiKeysPage.tsx | `/api-keys`（两处：未登录 + 已登录） | Key 管理 |
| LogsPage.tsx | `/logs` | 调用日志 |
| RechargePage.tsx | `/recharge` | 充值 |
| TopupRecordsPage.tsx | `/topup-records` | 充值记录 |
| BillingPage.tsx | `/billing` | 账单 |
| InvoicesPage.tsx | `/invoices` | 发票 |
| RedemptionPage.tsx | `/redemption` | 兑换码 |
| AnnouncementsPage.tsx | `/announcements` | 公告 |
| RealNamePage.tsx | `/real-name` | 实名认证 |
| NotificationPage.tsx | `/notification` | 通知 |
| NotificationSettingsPage.tsx | `/settings/notifications` | 通知偏好 |
| PlaygroundPage.tsx | `/playground` | API 在线调试 |
| MjSunoTasksPage.tsx | `/mj-tasks` | Midjourney/Suno 任务 |
| UserWebhooksPage.tsx | `/webhooks` | Webhook 配置 |
| SecurityPage.tsx | `/security` | 安全中心（2FA/设备/登录历史） |
| TicketsPage.tsx | `/tickets` | 我的工单 |
| UserChatPage.tsx | `/chat` | 在线客服 |
| ConsentPage.tsx | `/data-export` | 合规同意 + 数据导出申请 |
| HelpCenterPage.tsx | `/help` | 帮助中心/知识库 |
| DeletionPage.tsx | `/account-deletion` | 账号注销 |
| UserGroupsPage.tsx | `/user-groups` | 用户分组 |
| SalesCustomersPage.tsx | `/sales/customers` | 销售客户列表 |
| SalesCustomerDetailPage.tsx | `/sales/customers/:userId` | 客户详情 |
| SalesRemindersPage.tsx | `/sales/reminders` | 跟进提醒 |
| SalesPerformancePage.tsx | `/sales/performance` | 销售业绩 |

**未见对应代码的页面/路由（SPEC 期望但前端未实现）：**
- `/console/budget` 预算设置（SPEC §20.1）
- `/console/security/devices` 独立设备管理页（SPEC §20.3，当前合并在 SecurityPage 内）
- `/console/security/login-history` 独立登录历史增强页（SPEC §20.5）
- `/console/settings` 统一设置中心聚合页（SPEC §2.12，当前无独立入口）
- `/console/models` 独立模型中心（SPEC §2.3）——目前只在 Dashboard/Playground 内嵌
- `/console/transactions` 交易明细页（SPEC §2.8）——合并到 BillingPage

---

## C. 功能点差距矩阵

### C.1 §2 用户体系

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 2.0 | 用户端仪表盘 16 区 | DashboardPage.tsx | SPEC-§2 §2.0/§2.2 | 🟡 | 已有基础欢迎卡/指标卡/快捷入口；但缺：区域11 成本预测卡片（P1）、区域12 异常告警卡片、区域13 账单周期概览、区域14 实时活动流（P2）、区域15 模型推荐/成本优化建议（P2）、区域16 技术文档入口 |
| 2.1 | 角色与权限体系（9 等级/10 资源/7 操作） | middleware/auth.ts + requirePerm | ref-2.1-roles-permissions.md | ✅ | 后端 bitset 权限已落地；管理后台 admin-roles/admin-permissions 页面已有 |
| 2.1 | 登录异地检测（>500km 标红） | me-gap.ts:408 `/me/login-history` | SPEC-§2 §2.1 登录安全 | 🟡 | 登录记录已落地，但风险等级、距离 KM、风控规则展示未前端化（SPEC §20.5 增强版尚未做） |
| 2.3 | 模型中心 `/console/models` | me.ts:150 `/me/models` + me.ts:230 `/me/models/:id/price` | ref-2.2.2-model-center.md | 🟡 | 后端模型列表+单价 OK；前端无独立模型中心页，仅 Playground/Dashboard 内嵌选择器；缺按渠道/价格筛选、状态标签、详情抽屉 |
| 2.4 | API Key CRUD | apikeys.ts:164-167 | ref-2.2.3-api-keys.md | ✅ | 列表/创建/编辑/删除齐全；创建一次性展示完整 Key |
| 2.4 | Key 白/黑名单模型范围 | ❌（代码无 `model_permissions` 字段读写端点） | SPEC §2.4 "Key 权限控制" | ❌ | 后端网关层未实现；SPEC §20.4 详细定义了该能力但代码尚未实现 |
| 2.4 | Key 过期时间/续期 | ❌ | SPEC §2.4 "Key 过期时间管理（P2）" | ❌ | 无 `expires_at` 字段读写 |
| 2.4 | Key 闲置检测（未使用/闲置/沉睡） | ❌ | SPEC §2.4 | ❌ | 前端列表未打标签 |
| 2.4 | 批量启用/禁用/删除 Key | me.ts:1153 `/me/api-keys/revoke-all` | SPEC §2.4 | 🟡 | 仅实现"吊销全部"，缺批量勾选子集操作 |
| 2.5 | 调用日志 | me.ts:320 `/me/logs` | ref-2.2.4-call-logs.md | 🟡 | 列表/筛选 OK；缺 CSV 导出按钮、详情抽屉完整请求/响应回放、错误码参考弹层 |
| 2.6 | 用量统计 | StatisticsPage.tsx + me.ts:85 `/me/stats` | SPEC §2.6 | 🟡 | 已有日/周/月趋势、模型分布饼图；缺环比对比、Top 模型列表独立卡片 |
| 2.7 | 充值 | recharge.ts:149/269/406 + RechargePage.tsx | ref-2.2.6-recharge.md | ✅ | 充值发起、订单列表、记录齐全；大额充值审核见 admin-recharge-orders |
| 2.7 | 充值送额度活动 | recharge.ts:304 `/me/promotions` | SPEC §2.7 | 🟡 | 活动列表已读；具体满赠规则配置在 admin-marketing-missing（campaigns） |
| 2.8 | 交易明细 | me.ts:413-436 `/me/billing/history*` | SPEC §2.8 | 🟡 | 已合并到 BillingPage；缺独立交易流（消费/充值/退款/调整 4 类时间线）、JSON 导出 |
| 2.9 | 兑换码 | recharge.ts:318/472 + RedemptionPage.tsx | ref-2.2.8-redemption-invoices.md | ✅ | 兑换 + 历史已实现 |
| 2.10 | 发票申请 | me.ts:841/878/946/991 + InvoicesPage.tsx | ref-2.2.8-redemption-invoices.md | ✅ | 配额、申请、列表、下载齐全 |
| 2.11 | 账号注销 | deletion.ts:135/210/242/261 + DeletionPage.tsx + admin 端 approve/reject/execute | SPEC §2.11 | ✅ | 全生命周期（前置检查→申请→撤回→管理员审→7 天冷静期→物理删除）已落地；API 路径与文档不同（代码是 `/me/deletion/*`，SPEC 写的是 `/account/deletion-request`） |
| 2.12 | 设置中心聚合 | me.ts:1172/1194 + me-gap.ts:582-618 + SecurityPage.tsx | SPEC §2.12 | 🟡 | 各子项（密码/邮箱/通知偏好/2FA/设备）都在；缺统一左侧导航设置中心壳页面 |

### C.2 §18 用户端体验增强

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 18.1 | API 在线调试 Playground | PlaygroundPage.tsx | SPEC §18.1 | ✅ | 已实现模型选择/参数/调用/结果展示 |
| 18.1 | Playground 调用历史 | ❌（未见历史持久化表/接口） | SPEC §18.1 | ❌ | 调试历史未持久化到后端 |
| 18.2 | 用量预算控制 | ❌（无 `/me/budget/*` 端点，schema 无 `user_budget_settings`） | SPEC §18.2 | ❌ | **完全缺失**——SPEC §20.1 详细定义但代码 0 实现 |
| 18.3 | 用户引导 Onboarding | me-onboarding.ts + me-onboarding-tags.test.ts | SPEC §18.3 | ✅ | 状态/步骤/跳过/完成端点齐全；前端 OnboardingWizard 5 步已上线 |
| 18.4 | 账单与消费分析 | BillingPage.tsx + me.ts:372/397/413/436/605 | SPEC §18.4 | 🟡 | 月度账单+每日趋势+PDF 下载 OK；缺成本优化建议卡片、本月 vs 上月对比图 |
| 18.5 | 通知偏好管理 | me-gap.ts:556/582/593/605 + NotificationSettingsPage.tsx | SPEC §18.5 | 🟡 | 分类开关+邮件渠道 OK；缺强制开启安全告警的差异化约束逻辑 |
| 18.6 | 账号安全中心 | me.ts:808 改密 + me-gap.ts:311/408 设备/登录 + 2fa.ts | SPEC §18.6 | ✅ | 密码/登录记录/设备/2FA 均已落地（在 SecurityPage.tsx 聚合） |
| 18.7 | 公开 API 状态页 | ❌（无公开 status 页面路由） | SPEC §18.7 | ❌ | Portal 层未见 status 子站 |
| 18.8 | 官方 SDK（5 语言） | ❌（无 SDK 仓库 / pip / npm 包） | SPEC §18.8 | ❌ | 仅 API 兼容 OpenAI/Anthropic，无官方 SDK |

### C.3 §20 用户端安全与预算增强

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 20.1 | 用户月/日预算设置 | ❌ | SPEC §20.1 | ❌ | **P0 缺失**——无 `user_budget_settings` 表、无 `/me/budget/*` 端点、无网关熔断中间件、无 Redis Lua 原子计数器 |
| 20.1 | 管理员预算列表/熔断历史/默认预算 | ❌ | SPEC §20.1 管理员端 | ❌ | 无 `/admin/budgets*` 端点 |
| 20.2 | TOTP 2FA 完整流程 | 2fa.ts:164/183/243/307/402 | SPEC §20.2 | 🟡 | setup/enable/disable/verify/status 已有；缺：①独立 `/auth/2fa/login`（代码用 `/auth/2fa/verify` + tempToken 替代）；②`/auth/2fa/recovery-codes` 重新生成恢复码端点；③管理员 `/admin/2fa/policy` 策略配置；④`/admin/2fa/reset/:userId` 强制重置；⑤`/admin/2fa/logs`；⑥信任设备 `session_trusted_devices` 表 |
| 20.2 | 操作级二次 2FA | 2fa.ts:428 `/auth/2fa/operation-verify` | SPEC §20.2 末尾"2FA 认证与二次确认分层" | ✅ | 财务操作已接 `requireOperation2fa`（充值审核/退款审核） |
| 20.3 | 设备管理（列表/登出单台） | me-gap.ts:311/345 | SPEC §20.3 | 🟡 | 列表+单台登出 OK；缺：①`/me/devices/logout-all` 一键登出所有；②`/me/devices/:id/trust` 标记可信；③设备 riskLevel/riskRule 字段；④管理员 `/admin/devices/:id/force-logout`；⑤UA 解析出 deviceType/os/browser |
| 20.4 | Key 权限（模型白/黑名单、IP、Referer、日 Token、RPM/TPM） | ❌（无 `/me/api-keys/:id/permissions` 端点） | SPEC §20.4 | ❌ | **P1 缺失**——`api_keys` 表未扩列，网关中间件未拦截 MODEL_NOT_ALLOWED / IP_NOT_ALLOWED / REFERER_NOT_ALLOWED |
| 20.5 | 登录异常前端展示（风险色标/确认本人/这不是我） | me-gap.ts:408 `/me/login-history` | SPEC §20.5 | 🟡 | 后端有原始记录；缺：①`POST /me/login-history/:id/confirm`；②`POST /me/login-history/:id/report`；③`GET /me/security/summary`；④前端 LoginHistoryEnhanced 组件的🟢🟡🔴风险标签与"确认本人/这不是我"按钮 |

### C.4 §22 用户端体验增强（第二批）

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 22.1 | 注册引导 Onboarding（5 步） | me-onboarding.ts | SPEC §22.1 | ✅ | 与 §18.3 同一套实现 |
| 22.2.1 | 成本预测卡片 CostForecastCard | ❌ | SPEC §22.2.1 | ❌ | 仪表盘区域 11 未做 |
| 22.2.2 | 异常告警卡片 AlertCenter | ❌ | SPEC §22.2.2 | ❌ | 仪表盘区域 12 未做 |
| 22.2.3 | 账单周期卡片 BillingCycleCard | me.ts:372 `/me/billing/current` | SPEC §22.2.3 | 🟡 | 后端当月账单 OK；前端未做卡片化周期概览 |
| 22.2.4 | 实时活动流 LiveActivityFeed | ❌ | SPEC §22.2.4 | ❌ | WebSocket 推送实时事件未接前端 |
| 22.2.5 | 数据导出 | data-requests.ts 全套 | SPEC §22.2.5 | ✅ | 与 §合规数据导出共用 |
| 22.3 | 用户端 Playground | PlaygroundPage.tsx | SPEC §22.3 | ✅ | 同 §18.1 |
| 22.4 | Webhook 配置 | webhooks.ts 全套 + me-gap.ts:618 PATCH + UserWebhooksPage.tsx | SPEC §22.4 | ✅ | CRUD+测试+重签 secret+启停已实现 |
| 22.5 | 第三方 OAuth 登录 | oauth.ts（仅 GitHub） | SPEC §22.5 | 🟡 | 仅 GitHub；缺微信/钉钉/企业微信；OAuth state 一次性校验已做 |
| 22.6 | 通知偏好细分 | me-gap.ts:556/582-605 + NotificationSettingsPage.tsx | SPEC §22.6 | ✅ | 分类+邮件渠道 OK |
| 22.7 | API Key 操作日志 | ❌（无 `key_permission_changes` 表 / 无 `/me/api-keys/:id/logs` 端点） | SPEC §22.7 | ❌ | Key 权限变更历史未记录 |
| 22.8 | 用户邀请奖励 | agent-console.ts / AgentInvitePage.tsx（代理商侧邀请） | SPEC §22.8 | 🟡 | 代理商邀请已落地；普通用户"邀请好友得额度"未做 |
| 22.9 | 用量对比分析 | StatisticsPage.tsx | SPEC §22.9 | 🟡 | 有趋势图；缺多用户/多 Key 维度对比 |
| 22.10 | 错误码自助排障 | ❌ | SPEC §22.10 | ❌ | 无错误码检索页 |
| 22.11 | 批量操作 | me.ts:1153 revoke-all | SPEC §22.11 | 🟡 | 仅批量吊销 Key；其他批量动作未做 |
| 22.12 | 统一数据导出 | data-requests.ts + data-export-grants.ts + ConsentPage.tsx | SPEC §22.12 | ✅ | 与 §2/P2-4 合规数据导出共用 |

### C.5 §9.5 退款自动化

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 9.5-1 | 退款发起（人工） | admin-finance-stats.ts:560 `/admin/refunds/:id/review` | ref-9.5 §1/§7 | 🟡 | 管理端审核通过即退款；缺独立的 `POST /admin/refunds` 发起端点（当前入口是从用户充值订单触发） |
| 9.5-2 | 退款审核流程（初审+复审+双审） | admin-finance-stats.ts:560 review + 662 execute | ref-9.5 §2 | 🟡 | 当前仅单审（review approve/reject）+ execute；缺按金额分级（≤500/≤10000/>10000）的多级审批流转 |
| 9.5-3 | 退款执行（余额冻结+网关调用+审计） | admin-finance-stats.ts:662 execute | ref-9.5 §3 | 🟡 | 余额扣减+2FA+审计 OK；缺支付网关实际退款 API 对接（当前仅内部调账） |
| 9.5-4 | 佣金扣回 | ❌（未在 refund 流程中看到 commission 扣回逻辑） | ref-9.5 §4 | ❌ | 涉及代理佣金的退款未自动扣回 |
| 9.5-5 | 退款记录列表 | admin-finance-stats.ts:486 `/admin/refunds` | ref-9.5 §5 | ✅ | 列表/状态筛选/分页已实现 |
| 9.5-6 | 退款统计 | ❌（无 `/admin/refunds/summary` 端点） | ref-9.5 §7 | ❌ | 日/周/月汇总未做 |
| 9.5-7 | 退款重试 | admin-finance-stats.ts:662 execute（含重试状态机） | ref-9.5 §7 `:id/retry` | 🟡 | 状态机有 failed→重试；缺独立 `:id/retry` 端点暴露 |

### C.6 §9.6 税票统计看板

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 9.6-1 | 本月开票总览 | admin-invoices.ts:307 `/admin/invoice-stats/summary` | ref-9.6 §1 | ✅ | 开票数/金额/专票/普票齐全 |
| 9.6-2 | 近 N 月开票趋势 | admin-invoices.ts:337 `/admin/invoice-stats/trend?months=12` | ref-9.6 §1 | ✅ | 趋势图数据接口已就绪 |
| 9.6-3 | 开票明细列表 | admin-invoices.ts（已有 invoices 表 CRUD） | ref-9.6 §2 | 🟡 | 明细数据存在；缺独立 `/invoice-stats/detail` 分页聚合端点 |
| 9.6-4 | 未开票预估 | admin-invoices.ts:368 `/admin/invoice-stats/uninvoiced` | ref-9.6 §3 | ✅ | 已实现（paid 充值 − 已开票） |
| 9.6-5 | 未开票客户 Top N | ❌（无 `/admin/invoice-stats/uninvoiced/customers` 端点） | ref-9.6 §3 | ❌ | 客户维度排名未做 |
| 9.6-6 | 导出 CSV/Excel/PDF | ❌ | ref-9.6 §4 | ❌ | 无 `/admin/invoice-stats/export` 端点 |

---

## D. 关键发现

### D.1 已成熟落地（可直接进 PRD 反向重写）
1. **认证闭环**（注册/登录/刷新/登出/忘记密码/邮箱验证码/GitHub OAuth/2FA setup-enable-disable-verify-operation-verify）——全链路 14 个端点可跑。
2. **个人中心主体**（me.ts 54KB + me-gap.ts 31KB）——涵盖统计/Key/模型/日志/账单/发票/工单/通知/设置/实名/改密/改邮箱/分组，功能密度远超大多数 New API 重写版。
3. **合规三件套**（账号注销、数据导出、数据导出授权）——用户申请→管理员审核→执行→下载/物理删除全生命周期已闭环，且 `deletion.ts` 与 `data-requests.ts` 有完整测试（`deletion.test`、`data-requests.test`、`me-consent.test`、`me-gap-endpoints.test`、`me-recharge-endpoints.test`、`admin-recharge-audit.test` 等）。
4. **销售侧 CRM**（me-sales.ts 49KB）——客户认领/打标签/跟进提醒/业绩查询，本不在原分片但代码已超规格完成。
5. **Webhook 配置 + Onboarding + 兑换码 + 充值审核**——都是 P1 优先级但代码已落地。

### D.2 最大缺口（需在第 4 步"补欠缺功能"中优先补）

| 缺口 | 严重度 | 影响面 |
|---|---|---|
| **§20.1 用户消费预算/熔断** | 🔴 P0 | 企业客户刚需；后端 0 实现（无表/无端点/无网关中间件/无 Redis Lua 原子计数） |
| **§20.4 Key 细粒度权限**（模型白/黑名单、IP、Referer、日 Token、RPM/TPM） | 🔴 P1 | api_keys 表未扩列；网关层未拦截；`MODEL_NOT_ALLOWED`/`IP_NOT_ALLOWED` 等错误码未定义 |
| **§18.7/§18.8 公开状态页 + 官方 SDK** | 🟡 P2 | 完全未动，属于品牌和开发者生态建设 |
| **§20.2 2FA 管理员侧策略 + 恢复码重生成 + 信任设备** | 🟡 P1 | 用户侧 2FA 已跑，但管理员策略配置、`/admin/2fa/*`、`session_trusted_devices` 表、`recovery-codes` 重生成端点缺失 |
| **§20.3 设备风险等级 + 一键登出所有 + 标记可信** | 🟡 P1 | 基础设备列表+单台登出 OK，风险标签与批量操作缺 |
| **§20.5 登录异常前端增强**（确认本人/这不是我） | 🟡 P1 | 后端原始登录记录有；前端交互与 `confirm/report` 端点缺 |
| **§22.7 Key 操作日志**、**§22.10 错误码自助排障**、**§22.11 批量操作** | 🟢 P2 | 影响面小 |
| **§9.5 佣金扣回 + 多级审批 + 统计 + 网关退款对接** | 🟡 P1 | 退款主链路已跑，佣金联动与金额分级未做 |
| **§9.6 未开票客户排名 + 导出** | 🟢 P2 | 总览/趋势/未开票预估已有，仅缺明细聚合和导出 |

### D.3 文档与代码的路径偏差（重写 PRD 时需对齐）
1. SPEC §2.11 写的注销路径是 `/api/v1/account/deletion-request*`，代码实际是 `/api/v1/me/deletion/*` + `/api/v1/admin/deletion-requests/*`——**以代码为准**。
2. SPEC §20.2 写的登录二次验证端点是 `/api/v1/auth/2fa/login`，代码实际是 `/api/v1/auth/2fa/verify`（同一 tempToken 机制，仅命名不同）——**以代码为准**。
3. SPEC §2.11 里"代理身份用户需先清理解除代理关系"、"进行中工单/合同前置检查"等边界，代码 `deletion.ts:135` `/me/deletion/checks` 已实现；SPEC 中的"余额 > 0 弹窗提示"、"7 天冷静期"均已落地。
4. me-gap.ts / me-onboarding.ts / me-sales.ts 都是历史"补缺口"痕迹（见文件头注释），说明这些端点是 2026-08 后才补的；SPEC 文档早于代码，重写时需将"待开发"状态改为"已实现"。
5. 前端 `App.tsx` 中已有 `data-export → ConsentPage`（命名混淆：ConsentPage 实际承载合规同意+数据导出申请两个职责），重写 PRD 时应拆分为两个页面入口。

### D.4 测试覆盖信号
以下路由已有配套测试文件（说明这些路径可信、可跑）：
- `2fa-operation.test.ts`（2FA 操作级）
- `me-consent.test.ts`、`me-gap-endpoints.test.ts`、`me-gap-knowledge-base.test.ts`
- `me-onboarding-tags.test.ts`、`me-recharge-endpoints.test.ts`
- `admin-recharge-audit.test.ts`、`admin-recharge-orders.test.ts`
- `admin-risk-finance.test.ts`（退款 review/execute）
- `LogsPage.test.tsx`、`AdminDataExportGrantPage.test.tsx`

无测试覆盖的高风险缺口：`user_budget_settings`、`key_permission`、`recovery-codes`、`session_trusted_devices`——在第 4 步补全时必须同步补测试（遵循 AGENTS.md 派发协议 Gate 条件）。

---

> 本矩阵为分片 B 独立产出；汇总由 OrganizeAgent 合并至 `docs/gap/matrix-summary.md`。
> 下一步（第 4 步）建议按 D.2 严重度从上往下补：先 §20.1 预算熔断 + §20.4 Key 权限 + §20.2 管理员策略，再 §9.5 佣金扣回与多级审批，最后 §22.7/§22.10/§22.11 小功能。
