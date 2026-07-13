# 3cloud 功能完整性审计 & 整顿方案

> 审计日期：2026-07-11
> 审计范围：用户体系、代理商体系、系统后台、全模块功能完整性
> 方法：DB Schema (schema.ts) + API Routes + Web Pages + Sidebar 导航 + PRD-完整版.md 交叉比对

---

## 一、模块全景矩阵

### 1.1 角色 / 用户类型定义

| 层级 | 角色 | 当前定义 | 说明 |
|------|------|----------|------|
| **平台级** | super_admin | `user_role` enum | 系统最高权限(~0n) |
| 平台级 | admin | `user_role` enum | 日常运营，不碰钱和配置(已扩展到含财务大部分权限) |
| 平台级 | finance_ops | `user_role` enum | 财务专员 |
| 平台级 | ops | `user_role` enum | 运维工程师 |
| 平台级 | support | `user_role` enum | 客服/审核 |
| 平台级 | auditor | `user_role` enum | 审计员 |
| 平台级 | agent | `user_role` enum | 代理商角色 |
| 平台级 | user | `user_role` enum | 普通用户 |
| **团队级** | team_owner | 业务层逻辑 | 通过 team_members 表维护 |
| 团队级 | team_admin | 业务层逻辑 | 同上 |
| 团队级 | team_member | 业务层逻辑 | 同上 |
| **用户类型** | personal | `user_type` enum | 个人用户 |
| 用户类型 | enterprise | `user_type` enum | 企业用户 |

### 1.2 数据库表清单 (共 57 张)

| # | 表名 | 模块 | PRD 定义 | 实际 |
|---|------|------|----------|------|
| 1 | users | 用户 | ✅ | ✅ |
| 2 | adminAccounts | 管理员 | — | ✅ (扩展) |
| 3 | apiKeys | API Key | ✅ | ✅ |
| 4 | teamMembers | 团队 | ✅ | ✅ |
| 5 | userRoleHistory | 角色历史 | ✅ | ✅ |
| 6 | vendorApiKeys | 厂商 Key | — | ✅ (扩展) |
| 7 | userOauthBindings | OAuth | ❌ 未提及 | ✅ |
| 8 | userLoginHistory | 登录历史 | — | ✅ (扩展) |
| 9 | userNotes | 用户备注 | — | ✅ (扩展) |
| 10 | userIpWhitelist | IP 白名单 | — | ✅ (扩展) |
| 11 | userNotifications | 通知 | ✅ | ✅ |
| 12 | userRealNameReviews | 实名 | ✅ | ✅ |
| 13 | vendors | 供应商 | ✅ | ✅ |
| 14 | models | 模型 | ✅ | ✅ |
| 15 | vendorModels | 供应商-模型 | ✅ | ✅ |
| 16 | callLogs | 调用日志 | ✅ | ✅ |
| 17 | rechargeOrders | 充值订单 | ✅ | ✅ |
| 18 | balanceLogs | 余额流水 | ✅ | ✅ |
| 19 | userDiscounts | 用户折扣 | ✅ | ✅ |
| 20 | agents | 代理商信息 | ✅ | ✅ |
| 21 | agentClients | 代理商-客户 | ✅ | ✅ |
| 22 | commissionLogs | 佣金流水 | ✅ | ✅ |
| 23 | agentCustomerConsumption | 客户消费 | — | ✅ (扩展) |
| 24 | commissionRules | 分佣规则 | — | ✅ (扩展) |
| 25 | commissionDailyRollup | 佣金日聚合 | — | ✅ (扩展) |
| 26 | withdrawOrders | 提现订单 | ✅ | ✅ |
| 27 | auditLogs | 审计日志 | ✅ | ✅ |
| 28 | systemConfigs | 系统配置 | ✅ | ✅ |
| 29 | emailTemplates | 邮件模板 | ✅ | ✅ |
| 30 | pageContents | 内容管理 | ✅ | ✅ |
| 31 | userPreferences | 用户偏好 | ✅ | ✅ |
| 32 | loginSecurityConfigs | 登录安全 | — | ✅ (扩展) |
| 33 | securityEvents | 安全事件 | ✅ | ✅ |
| 34 | userLoginSessions | 登录会话 | — | ✅ (扩展) |
| 35 | redemptionBatches | 兑换批次 | — | ✅ (扩展) |
| 36 | redemptionCodes | 兑换码 | — | ✅ (扩展) |
| 37 | redemptionLogs | 兑换日志 | — | ✅ (扩展) |
| 38 | campaigns | 营销活动 | — | ✅ (扩展) |
| 39 | campaignCodes | 活动码 | — | ✅ (扩展) |
| 40 | adminApiKeys | 管理 API Key | — | ✅ (扩展) |
| 41 | adminKeyUsageLogs | 管理 Key 使用 | — | ✅ (扩展) |
| 42 | dailyReconSummary | 日对账摘要 | — | ✅ (扩展) |
| 43 | userQuotas | 用户额度 | — | ✅ (扩展) |
| 44 | keyQuotas | Key 额度 | — | ✅ (扩展) |
| 45 | announcements | 全站公告 | — | ✅ (扩展) |
| 46 | circuitHistory | 熔断历史 | — | ✅ (扩展) |
| 47 | adminRoles | 动态角色(权限) | — | ✅ (扩展) |
| 48 | userRoleAssignments | 用户角色分配 | — | ✅ (扩展) |
| 49 | userPermissionOverrides | 用户权限微调 | — | ✅ (扩展) |
| 50 | financeCostRecords | 财务成本记录 | — | ✅ (扩展) |
| 51 | agentBalanceLedger | 代理商余额账本 | — | ✅ (扩展) |
| 52 | financeProfitRecords | 利润记录 | — | ✅ (扩展) |
| 53 | priceChangeHistory | 价格变动历史 | — | ✅ (扩展) |
| 54 | invoiceRequests | 发票申请 | — | ✅ (扩展) |
| 55 | refundRequests | 退款申请 | — | ✅ (扩展) |
| 56 | userDiscounts | 用户折扣 | ✅ | ✅ |
| 57 | vendorApiKeys | 厂商 Key | — | ✅ |

---

## 二、功能完整性审计

### 2.1 用户端 (普通用户/个人/企业) — 共 14 页

| 页面 | 路由 | PRD | 实际状态 | 差距 |
|------|------|-----|----------|------|
| 仪表盘 | `/` | ✅ 3 卡片+趋势+最近调用 | ✅ | — |
| 模型列表 | `/models` | ✅ API 文档含可用模型 | ✅ | — |
| API 密钥 | `/api-keys` | ✅ CRUD | ✅ | — |
| 调用日志 | `/logs` | ✅ 筛选+CSV | ✅ | — |
| 充值 | `/recharge` | ✅ 在线+线下 | ✅ | — |
| 实名认证 | `/real-name` | ✅ 个人/企业 | ✅ | — |
| 团队管理 | `/team` | ✅ | ✅ | — |
| API 文档 | `/docs` | ✅ Markdown 编辑 | ✅ | — |
| 全站公告 | `/announcements` | ✅ | ✅ | — |
| 通知中心 | `/notifications` | — | ✅ (超 PRD) | — |
| 账号安全 | `/security` | — | ✅ (超 PRD) | — |
| 个人设置 | `/settings` | ✅ 资料+密码 | ✅ | — |
| 用量统计 | `/stats` | — | ✅ (超 PRD) | — |
| 兑换码 | `/redemption` | — | ✅ (超 PRD) | — |

### 2.2 代理商端 — 共 7 页

| 页面 | 路由 | PRD | 实际状态 | 差距 |
|------|------|-----|----------|------|
| 代理商面板 | `/agent/dashboard` | ✅ 4 卡片 | ✅ | — |
| 我的客户 | `/agent/clients` | ✅ | ✅ | — |
| 佣金历史 | `/agent/commissions` | ✅ | ✅ | — |
| 提现 | `/agent/withdraw` | ✅ | ✅ | — |
| 兑换码管理 | `/agent/redemption` | — | ✅ (超 PRD) | — |
| 财务对账 | `/agent/reconciliation` | — | ✅ (超 PRD) | — |
| 消息通知 | `/agent/notifications` | — | ✅ (超 PRD) | — |

### 2.3 后台管理 — 共 52 页

#### 总览看板 (4 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 管理仪表盘 | `/admin` | ✅ |
| 企业数据分析 | `/admin/enterprise-analysis` | ✅ |
| 聚合统计 | `/admin/stats` | ✅ |
| 熔断看板 | `/admin/circuit-breakers` | ✅ |

#### 用户运营 (5 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 用户管理 | `/admin/users` | ✅ |
| 实名审核 | `/admin/real-name-review` | ✅ |
| 额度管理 | `/admin/quotas` | ✅ |
| 管理 API Key | `/admin/admin-api-keys` | ✅ |
| 角色权限 | `/admin/roles` | ✅ |

#### 资源管理 (4 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 模型管理 | `/admin/models` | ✅ |
| 供应商管理 | `/admin/vendors` | ✅ |
| 模型映射 | `/admin/vendor-models` | ✅ |
| 代理商管理 | `/admin/agents` | ✅ |

#### 财务结算 (13 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 财务工作台 | `/admin/finance/dashboard` | ✅ |
| 佣金流水 | `/admin/finance/commissions` | ✅ |
| 对账报表 | `/admin/finance/reconciliation` | ✅ |
| 成本看板 | `/admin/finance/code-cost` | ✅ |
| Agent 成本 | `/admin/finance/agent-cost` | ✅ |
| Admin 成本 | `/admin/finance/admin-cost` | ✅ |
| 结算对账 | `/admin/finance/settlement` | ✅ |
| 利润分析 | `/admin/finance/profit-analysis` | ✅ |
| 价格管理 | `/admin/finance/prices` | ✅ |
| 发票审核 | `/admin/finance/invoices` | ✅(超 PRD) |
| 退款审核 | `/admin/finance/refunds` | ✅(超 PRD) |
| 提现管理 | `/admin/withdraws` | ✅ |
| 充值订单 | `/admin/recharge-orders` | ✅ |

#### 安全风控 (5 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 安全总览 | `/admin/security` | ✅ |
| 安全事件 | `/admin/security/events` | ✅ |
| 安全配置 | `/admin/security/config` | ✅ |
| 封禁管理 | `/admin/security/bans` | ✅ |
| 告警通知 | `/admin/security/alerts` | ✅ |

#### 运维配置 (3 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 系统配置 | `/admin/configs` | ✅ |
| 限流管理 | `/admin/rate-limits` | ✅ |
| 邮件模板 | `/admin/email-templates` | ✅ |

#### 审计合规 (4 页)
| 页面 | 路由 | 状态 |
|------|------|------|
| 审计日志 | `/admin/audit-logs` | ✅ |
| 调用日志 | `/admin/logs` | ✅ |
| 全站公告 | `/admin/announcements` | ✅ |
| 营销活动 | `/admin/campaigns` | ✅ |

#### 侧边栏未挂载但 App.tsx 有路由的页面 (14 页，Sidebar 遗漏项)
| 页面 | 路由 | Sidebar 分组 | 原因 |
|------|------|------------|------|
| 代理商客户详情 | `/admin/agents/:id/clients` | — | 代理商管理->进入详情时跳转 |
| 代理商详情 | `/admin/agents/:id/detail` | — | 同上 |
| 营销活动详情 | `/admin/campaigns/:id` | — | 同上 |
| 内容管理 | `/admin/page-contents` | ⚠️ Sidebar 遗漏 | 内容管理未挂在 Sidebar |
| 发票管理(用户) | `/invoices` | 财务与消费 | ✅ |
| 退款申请(用户) | `/refunds` | 财务与消费 | ✅ |
| 兑换码管理 | `/admin/redemption-codes` | 财务结算 | ✅ |
| 系统健康面板 | `SystemHealthPanel.tsx` | ⚠️ 有文件无路由 | 单独存在 |

---

## 三、问题发现与整顿方案

### 🔴 P0 — 严重问题 (需立即修复)

#### P0-1. 角色权限定义与实际侧边栏不一致

**现状：** RBAC 枚举 8 个角色，但 Sidebar 导航组只用了 4 个(super_admin/admin/finance_ops/ops/support/auditor)。代理商的 sidebar 组是独立渲染的。admin 角色的硬编码权限和侧边栏可见性不一致。

**问题：**
- Sidebar 中 `adminItems` 的 `roles` 数组和 `ROLE_PERMISSIONS` 的权限位不匹配
- admin 角色拥有 FINANCE_VIEW/WITHDRAW/RECHARGE 权限(代码 236-248 行)但 Sidebar 财务结算栏很多页面限制为 super_admin/finance_ops
- 存在两套权限机制互不同步：Sidebar 用 role name 字符串过滤 + middleware 用 Perm bitset

**整顿方案：**
1. Sidebar 改为基于 Perm bitset 判断可见性，而非硬编码 roles 数组
2. 或者至少确保 Sidebar roles 白名单与 ROLE_PERMISSIONS 权限定义对齐
3. 优先对 admin/finance_ops/ops/support/auditor 做一次侧边栏-权限交叉验证

#### P0-2. 内容管理页面 (/admin/page-contents) 未挂载到侧边栏

**现状：** App.tsx 定义了路由 `/admin/page-contents` → `AdminPageContents` 组件，但 Sidebar.tsx 的 `adminItems` 中完全没有此入口。

**影响：** 管理员无法从导航发现此页面，只能手动输入 URL。

**整顿方案：**
- Sidebar 运维配置组新增 `{ to: '/admin/page-contents', icon: FileText, label: '内容管理', roles: ['super_admin', 'admin', 'ops'] }`

#### P0-3. 系统健康面板有文件无路由

**现状：** `SystemHealthPanel.tsx` 存在于 `pages/admin/`，但 App.tsx 和 Sidebar 中无对应路由。

**整顿方案：**
- 增加路由 `/admin/system-health`，挂载到运维配置组

### 🟡 P1 — 功能缺失 (影响业务完整)

#### P1-1. 供应商自助注册模块功能不完整

**现状：** `vendor-self.ts` 路由已定义，DB 有 `vendorApiKeys` 表，但前端无对应的供应商自助页面。

**问题：** 供应商自助是一个独立角色体系，目前只有后端路由，缺少：
- 供应商注册页面
- 供应商自助控制台(Dashboard / 模型管理 / 调用日志 / API Key)
- 供应商审核机制(admin 后台审核供应商注册)

**整顿方案：**
1. 如果供应商自助是 V1 核心功能 → 排期补全前后端
2. 如果 V1 不做 → 将 `vendor-self.ts` 标为 V2 占位，避免产生半成品路由被误用

#### P1-2. 财务模块 PRD 定义 vs 实际实现差距

**PRD 要求（4.11 节）：**
- 财务管理：交易流水 / 线下入账审核 / 对账导出 CSV
- 7 页管理后台，财务管理 1 页

**实际实现：** 13 个财务相关页面远超 PRD 定义，包括成本看板、利润分析、发票管理、退款管理、结算对账等。

**问题：** 大量功能没有对应业务文档，不清楚哪些已经过 BOSS 认可。这些页面是后续补充的需求还是一拍脑袋加上的？

**整顿方案：**
1. 确认 BOSS 是否知情并认可这些扩展功能
2. 如果是正式功能 → 更新 PRD 文档
3. 如果是实验性的 → 决定保留或下掉

#### P1-3. 代理商端缺少团队协作功能

**现状：** 代理商面板有 Dashboard/Clients/Commissions/Withdraw/Redemption/Reconciliation，但：
- 代理商是否可以创建子账号？(PRD 未定义)
- 代理商是否可以设置团队？
- 代理商和普通用户的边界在哪里？(一个账号同时是 agent 又是 user 时的体验)

**整顿方案：**
- 明确代理商账号和普通账号的关系(独立账号 vs 角色切换)
- 确认是否需要代理商子账号体系

### 🟢 P2 — 优化建议 (非阻塞)

#### P2-1. 前端用户端页面权限隔离不完整

**现状：** Sidebar 用 `roles` 数组过滤 navItems，但组件内部没做角色判断。例如 agent 角色登录后，用户端的 Dashboard/Models/Keys 等页面应该正确展示还是应该重定向到 agent dashboard？

**问题：** agent 登录后会看到 `仪表盘`(用户版)和 `代理商面板` 两个 dashboard，体验割裂。

**整顿方案：**
- agent 角色登录后默认跳转 `/agent/dashboard`
- 用户端侧边栏项对 agent 保持可见(查看模型、密钥等)
- 或者完全隔离：agent 只看到 agentItems，用户只看到 navGroups

#### P2-2. 统计分析维度增加

**现状：** `/admin/stats` (聚合统计) + `/admin/enterprise-analysis` (企业分析) 两个页面，但 Stats 缺少以下维度：
- 按模型维度统计(消耗排行)
- 按供应商维度统计(成本 vs 收入)
- 按时段统计(峰谷分析)

**整顿方案：**
- 在 stats 页面增加模型 Top N 和供应商成本占比图表
- 考虑合并 stats + enterprise-analysis 到一个统一的分析平台

#### P2-3. 缺少用户操作回退机制

**现状：** 余额变更、角色变更、状态变更都是即时的，无软删除/撤销窗口。

**整顿方案：**
- 关键操作(禁用用户、角色变更、余额大额操作)增加二次确认
- 考虑增加操作延迟窗口(如 5 分钟内可撤销)
- 完善 audit_logs 的变更前后值对比功能(技术上已存入 JSON，前端未展示差异对比)

#### P2-4. 数据归档策略检查

**现状：** call_logs 按月分区，90 天后 DROP。但其他高增长表(call_logs 不受限，但 audit_logs/balance_logs/commission_logs/securityEvents)没有明确归档策略。

**整顿方案：**
- 评估这些大表的长期增长率
- 定义 1 年以上数据的归档/清理策略
- 对 audit_logs 可考虑压缩归档保留(不删除，但迁移到归档表)

---

## 四、PRD vs 实际功能矩阵

| PRD 章节 | PRD 要求 | 实际状态 | 差距 |
|----------|----------|----------|------|
| 4.1 用户体系 | 注册/登录/实名/注销 | ✅ 完成 | + OAuth + IP 白名单 + 登录历史(超 PRD) |
| 4.2 API Key | CRUD + SHA-256 存储 | ✅ 完成 | + 管理 API Key 体系(超 PRD) |
| 4.3 团队 & 子账号 | Owner/Admin/Member | ✅ 完成 | — |
| 4.4 RBAC 7 角色 | 7 角色 | ✅ 完成，实际 8 角色 | + 动态角色引擎(超 PRD) |
| 4.5 模型/厂商管理 | 后台 CRUD | ✅ 完成 | + 熔断器 + 健康面板(超 PRD) |
| 4.6 智能路由 | 自动最低价/加权/故障切换 | ✅ 完成 | + 多 Key 分摊(超 PRD) |
| 4.7 计费系统 | 充值/扣费/告警 | ✅ 完成 | + 发票 + 退款(超 PRD) |
| 4.8 代理商体系 | 分佣/提现/双审 | ✅ 完成 | + 兑换码 + 对账(超 PRD) |
| 4.9 日志监控 | call_logs 按月分区 | ✅ 完成 | — |
| 4.10 邮件服务 | 4 套模板 | ✅ 完成 | — |
| 4.11 管理后台 7 页 | 7 页 | ✅ 完成，实际 52 页 | **严重膨胀，远超 PRD 定义** |

---

## 五、模块定义重整建议

### 5.1 用户模块 (Users)

**当前范围：**
- 用户 CRUD、角色管理、实名审核、API Key
- 额度管理(quotas)、余额管理、折扣管理
- IP 白名单、登录历史、OAuth 绑定、用户备注
- 团队管理

**建议划分：**
```
Users 模块
├── 用户生命周期：注册/登录/禁用/启用/注销
├── 实名认证：个人/企业材料审核
├── API Key 管理：用户 Key + 管理 Key
├── 余额与折扣：充值/扣费/折扣配置
├── 额度管理：用户/Key 级别配额
├── 团队管理：创建/邀请/成员/子账号
└── 安全相关：IP 白名单、登录历史、OAuth
```

### 5.2 代理商模块 (Agents)

**当前范围：**
- 代理商 CRUD、客户分配、佣金流水、提现审核
- 代理商余额账本、消费统计、日聚合
- 兑换码管理、财务对账

**建议划分：**
```
Agents 模块
├── 代理商管理：创建/编辑/禁用/客户分配
├── 分佣体系：规则配置/佣金计算/日聚合/佣金流水
├── 提现管理：申请/审核/打款/记录
├── 代理商财务：余额账本/对账报表/消费统计
└── 兑换码：生成/兑换/统计(代理商专属)
```

### 5.3 财务管理 (Finance)

**当前范围（严重膨胀）：**
- 财务工作台、佣金流水、对账报表
- 成本看板(3 个子看板: Code/Agent/Admin)
- 利润分析、价格管理
- 发票审核、退款审核
- 提现管理、充值订单
- 兑换码管理

**建议划分（如果确实需要全部）：**
```
Finance 模块
├── 财务工作台：综合看板/快速入口
├── 交易管理：充值/消费/佣金/提现流水
├── 对账模块：日对账/月对账/差异分析
├── 成本分析：按供应商/代理/模型维度
├── 利润分析：毛利/净利/趋势
├── 价格管理：模型定价/倍率/折扣配置
├── 发票管理：申请/审核/开具
└── 退款管理：申请/审核/执行
```

### 5.4 安全风控 (Security)

**当前范围：**
- 安全总览、事件列表、配置管理
- 封禁/解封、告警通知
- 登录安全、IP 检测

**建议划分：**
```
Security 模块
├── 事件监控：安全事件分类/检测/告警
├── 风控引擎：封禁/解封/自动熔断/频率限制
├── 登录安全：暴力破解防护/异常登录检测/会话管理
└── 安全配置：规则阈值/告警策略/IP 黑白名单
```

### 5.5 运维配置 (Operations)

**当前范围：**
- 系统配置(限流/告警/定价/支付/邮件)
- 限流管理
- 邮件模板
- 内容管理(缺失 Sidebar 入口)
- 全站公告
- 营销活动
- 熔断器管理

**建议划分：**
```
Operations 模块
├── 系统配置：全局参数/支付/邮件/安全阈值
├── 内容管理：API 文档/法律条款/页面内容
├── 通知体系：公告/营销活动/邮件模板/站内通知
└── 运维工具：限流管理/熔断看板/健康面板
```

### 5.6 审计与日志 (Audit & Logs)

**当前范围：**
- 审计日志(管理员操作记录)
- 调用日志(全量 API 调用)
- 角色历史

**建议划分：**
```
Audit 模块
├── 审计日志：全量管理员操作/变更前后对比/不可删除
├── 调用日志：用户/Key/模型/供应商维度
└── 角色变更历史：user_role_history 轨迹
```

---

## 六、整顿执行排期

### Phase 1 — 紧急修复 (1-2 天)

| # | 任务 | P | 说明 |
|---|------|---|-----|
| 1 | P0-1: Sidebar 权限同步 | P0 | 确保 Sidebar 可见性与 RBAC 权限位对齐 |
| 2 | P0-2: 内容管理入口 | P0 | Sidebar 增加 page-contents 链接 |
| 3 | P0-3: 健康面板路由 | P0 | 增加 system-health 路由和入口 |

### Phase 2 — 业务对齐 (3-5 天)

| # | 任务 | P | 说明 |
|---|------|---|-----|
| 4 | P1-1: 供应商自助模块决策 | P1 | BOSS 确认范围后实施或标记占位 |
| 5 | P1-2: 财务模块范围确认 | P1 | 与 BOSS 确认 13 个财务页面是否全要 |
| 6 | P1-3: 代理商子账号体系 | P1 | 确认并实施或标记 V2 |
| 7 | PRD 文档更新 | — | 与实际代码对齐，标注扩展和删除项 |

### Phase 3 — 体验优化 (后续)

| # | 任务 | P | 说明 |
|---|------|---|-----|
| 8 | P2-1: agent 登录跳转逻辑 | P2 | agent 登录默认 dashboard 路径 |
| 9 | P2-2: 统计维度增强 | P2 | 模型 TopN / 厂商成本占比 |
| 10 | P2-3: 操作回退机制 | P2 | 关键操作二次确认 + 撤销 |
| 11 | P2-4: 数据归档策略 | P2 | 高增长表归档方案 |
