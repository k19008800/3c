# 3cloud 文档统一目录与表达规范（提案）

> 状态：confirmed
> 本文件是已确认的文档重组规范，不修改现有 `docs/` 正文，不改变任何业务规则。
> 目标：让需求可阅读、可追溯、可裁决、可开发、可测试、可部署。

## 1. 文档治理原则

1. 一个主题只保留一个权威正文；其他文件只能引用，不得重复定义。
2. PRD 只描述业务目标、业务规则和验收结果，不写实现代码。
3. SPEC 只描述功能契约、页面、字段、状态、权限和接口边界。
4. ARCH 只描述技术方案、数据结构、事务、并发、缓存和迁移方案。
5. API 文档只描述已冻结的接口契约；规划接口必须单独标记 `planned`。
6. 测试报告只记录实际运行证据，不反向充当需求正文。
7. 部署文档只描述可执行的环境、迁移、启动、回滚和验收步骤。
8. 历史稿、评审稿、决策记录与当前生效规范必须分层存放。
9. 同一规则若发生版本变化，必须记录生效版本、废止版本和迁移说明。
10. 未裁决内容统一标记 `TBD`，不得使用“建议值”冒充正式规则。

## 2. 推荐顶层目录

```text
docs/
├── 00-index/                         # 文档入口、阅读顺序、术语和版本
│   ├── README.md
│   ├── document-map.md                # 主题→权威文档映射
│   ├── reading-guide.md               # 按角色阅读路径
│   ├── glossary.md                    # 唯一术语表
│   ├── decision-register.md           # 已裁决事项索引
│   ├── open-issues.md                 # 未裁决事项索引
│   └── changelog.md
│
├── 01-product/                       # 产品总览与边界
│   ├── product-overview.md
│   ├── business-model.md
│   ├── actor-and-role-model.md
│   ├── domain-map.md
│   ├── lifecycle-and-release-scope.md
│   └── compliance-baseline.md
│
├── 02-requirements/                  # PRD：按业务域拆分，每章独立文件
│   ├── 01-core-engine/
│   │   ├── overview.md
│   │   ├── model-routing.md
│   │   ├── rate-limit-and-circuit-breaker.md
│   │   ├── token-metering.md
│   │   └── request-lifecycle.md
│   ├── 02-identity-and-users/
│   │   ├── user-lifecycle.md
│   │   ├── authentication-and-session.md
│   │   ├── api-key.md
│   │   ├── security-and-2fa.md
│   │   └── account-deletion.md
│   ├── 03-billing-and-finance/
│   │   ├── finance-overview.md
│   │   ├── recharge.md
│   │   ├── manual-topup.md
│   │   ├── balance-adjustment.md
│   │   ├── refund-and-reversal.md
│   │   ├── settlement-and-reconciliation.md
│   │   ├── invoice.md
│   │   └── profit-and-cost.md
│   ├── 04-agent-and-sales/
│   │   ├── agent-lifecycle.md
│   │   ├── commission.md
│   │   ├── withdrawal.md
│   │   ├── customer-reporting.md
│   │   ├── sales-lead.md
│   │   ├── quotation-and-contract.md
│   │   └── customer-handover.md
│   ├── 05-vendor-and-channel/
│   │   ├── vendor-lifecycle.md
│   │   ├── channel-model.md
│   │   ├── pricing.md
│   │   ├── routing-selection.md
│   │   └── vendor-settlement.md
│   ├── 06-operations-and-support/
│   │   ├── admin-console.md
│   │   ├── customer-service-and-ticket.md
│   │   ├── campaign-and-growth.md
│   │   ├── notification.md
│   │   ├── announcement.md
│   │   └── conversation-record.md
│   └── 07-compliance-and-integrations/
│       ├── permissions.md
│       ├── sso-and-oauth.md
│       ├── webhook.md
│       ├── legal-and-compliance.md
│       └── data-export-and-retention.md
│
├── 03-functional-spec/                # SPEC：功能契约，和 PRD 一一对应
│   ├── 01-core-engine/
│   ├── 02-identity-and-users/
│   ├── 03-billing-and-finance/
│   ├── 04-agent-and-sales/
│   ├── 05-vendor-and-channel/
│   ├── 06-operations-and-support/
│   └── 07-compliance-and-integrations/
│
├── 04-ui-and-prototypes/              # 页面、组件、原型
│   ├── route-catalog.md
│   ├── page-catalog.md
│   ├── console/
│   │   ├── layout.md
│   │   ├── finance/
│   │   ├── users/
│   │   ├── vendors/
│   │   └── operations/
│   ├── portal/
│   ├── agent/
│   ├── component-library.md
│   ├── help-and-feedback.md
│   └── prototypes/                    # 原型只存链接/索引；源文件单独归档
│
├── 05-api/                            # API 契约唯一入口
│   ├── api-overview.md
│   ├── conventions.md                 # base URL、版本、认证、错误包络
│   ├── public/
│   │   ├── openai-compatible.md
│   │   ├── anthropic-compatible.md
│   │   └── embeddings-and-rerank.md
│   ├── user/
│   ├── agent/
│   ├── admin/
│   │   ├── finance.md
│   │   ├── permissions.md
│   │   ├── vendors.md
│   │   └── operations.md
│   ├── errors.md
│   ├── idempotency.md
│   └── changelog.md
│
├── 06-data-and-architecture/           # 数据、状态机、架构
│   ├── architecture-overview.md
│   ├── domain-model.md
│   ├── data-dictionary.md
│   ├── state-machines/
│   │   ├── recharge-order.md
│   │   ├── manual-topup.md
│   │   ├── adjustment.md
│   │   ├── refund.md
│   │   ├── api-key.md
│   │   └── user-account.md
│   ├── billing-and-money-precision.md
│   ├── permissions-and-authorization.md
│   ├── event-and-notification.md
│   ├── cache-and-consistency.md
│   ├── transaction-and-concurrency.md
│   └── migration-design.md
│
├── 07-quality-and-acceptance/           # 测试规范与验收
│   ├── test-strategy.md
│   ├── acceptance-criteria.md
│   ├── e2e-scenarios.md
│   ├── security-tests.md
│   ├── performance-and-sla.md
│   ├── reconciliation-tests.md
│   └── release-gate.md
│
├── 08-operations-and-deployment/       # 运维、发布、恢复
│   ├── environment-matrix.md
│   ├── deployment-guide.md
│   ├── migration-runbook.md
│   ├── backup-and-restore.md
│   ├── rollback.md
│   ├── process-and-port.md
│   ├── monitoring-and-alerting.md
│   ├── incident-response.md
│   └── deployment-checklist.md
│
├── 09-decisions/                       # ADR / 裁决，不嵌入需求正文
│   ├── ADR-0001-document-authority.md
│   ├── ADR-0002-money-precision.md
│   ├── ADR-0003-recharge-state-machine.md
│   ├── ADR-0004-permission-model.md
│   ├── ADR-0005-api-versioning.md
│   └── template.md
│
├── 90-audits/                          # 审计产物
│   ├── baseline/
│   ├── requirements/
│   ├── pages/
│   ├── logic/
│   ├── api/
│   ├── database/
│   ├── permissions/
│   ├── tests/
│   └── reports/
│
└── 99-archive/                         # 历史版本，只读
    ├── drafts/
    ├── superseded/
    ├── legacy-audits/
    └── migration-notes/
```

## 3. 章节拆分规则

### 3.1 单文件边界

一个文件只回答一个主题，满足以下任一条件就必须拆文件：

- 有独立业务目标；
- 有独立角色或权限边界；
- 有独立状态机；
- 有独立 API 资源集合；
- 有独立数据库聚合或迁移；
- 有独立验收清单；
- 正文超过约 300 行且无法按目录快速定位。

### 3.2 不允许的混合

- PRD 中不得出现 `CREATE TABLE`、TypeScript 实现代码、SQL 迁移命令；
- API 文档不得定义未裁决的业务规则；
- ref 文档不得与当前生效 SPEC 并列作为权威契约；
- ARCH 不得把“建议值”写成默认正式值；
- 测试报告不得只写“通过”，必须有命令、范围、时间和结果；
- 部署 Runbook 不得包含与代码实际入口不一致的迁移命令。

## 4. 每类文档统一模板

### 4.1 PRD 模板

```markdown
# [业务域]：[章节名称]

- 文档 ID：PRD-[DOMAIN]-[NNN]
- 状态：draft | review | approved | superseded
- 生效版本：vX.Y
- 生效日期：YYYY-MM-DD
- 负责人：
- 上游决策：ADR-XXXX
- 关联 SPEC：
- 关联页面：
- 关联 API：

## 1. 目标与非目标
## 2. 角色与业务场景
## 3. 业务规则
## 4. 状态与结果
## 5. 异常与边界
## 6. 权限与安全
## 7. 通知、审计与合规
## 8. 页面与交互要求
## 9. 验收标准
## 10. 未决事项
```

每条规则使用：`BR-[DOMAIN]-NNN`；每条验收使用：`AC-[DOMAIN]-NNN`。

### 4.2 SPEC 模板

```markdown
# SPEC：[业务域]：[章节名称]

- 文档 ID：SPEC-[DOMAIN]-[NNN]
- 对应 PRD：PRD-[DOMAIN]-[NNN]
- 状态/版本/生效日期：

## 1. 页面与路由
## 2. 字段与校验
## 3. 操作与反馈
## 4. 状态机
## 5. API 契约引用
## 6. 权限矩阵
## 7. 数据持久化引用
## 8. 错误与重试
## 9. 测试映射
## 10. N/A 与未决事项
```

### 4.3 API 模板

每个端点必须独立一节：

```markdown
### METHOD /api/v1/...

- API ID：API-[DOMAIN]-NNN
- 状态：implemented | planned | deprecated
- 权限：public | authenticated | permission:key
- 幂等：required | optional | not-applicable

#### Request
#### Validation
#### Success Response
#### Error Responses
#### State Transition
#### Transaction / Side Effects
#### Audit / Notification
#### Tests
#### Source of truth
```

### 4.4 状态机模板

```markdown
# [对象]状态机

- 状态机 ID：SM-[DOMAIN]-NNN
- 对应 PRD：
- 对应数据表：
- 当前生效版本：

## 状态定义
| 状态 | 含义 | 是否终态 | 用户可见文案 |

## 转移矩阵
| 当前状态 | 事件 | 操作者/权限 | 前置条件 | 下一状态 | 数据变化 | 失败结果 |

## 并发与幂等
## 回滚与补偿
## 审计与通知
## 测试映射
```

### 4.5 ADR 模板

```markdown
# ADR-[NNNN]：[决策标题]

- 状态：proposed | accepted | rejected | superseded
- 决策日期：
- 决策人：
- 影响范围：

## 背景
## 候选方案
## 决策
## 影响与迁移
## 被废止的口径
## 关联文档与代码
```

## 5. 统一表达口径

### 5.1 版本与权威级别

```text
L0 决策：ADR / decision-register
L1 业务要求：PRD
L2 功能契约：SPEC
L3 技术实现：ARCH
L4 接口契约：API
L5 验收证据：TEST / release-gate
L6 操作执行：OPS / Runbook
L7 历史资料：ARCHIVE（不可作为当前依据）
```

同一主题发生冲突时，必须按以下顺序处理：

1. 检查是否存在明确的后续 ADR；
2. 有 ADR 时，更新受影响的 PRD/SPEC/API/ARCH/OPS；
3. 无 ADR 时，标记 `CONFLICT`，不得自行选择一方；
4. 历史文件移动至 `99-archive/` 后，正文保留替代链接。

### 5.2 金额表达

统一使用：

```text
币种：CNY / 人民币 / 元
内部金额：decimal string
金额精度：统一由 ADR 冻结
边界：使用 ≤、<、≥、>，禁止只写“超过”
阈值：必须写数值、单位、是否含边界
```

禁止在不同文件分别出现未经 ADR 解释的 `50,000`、`100,000`、`1,000,000` 三套上限。

### 5.3 状态表达

- 数据库存储状态、审批阶段、展示文案分三列表达；
- 不得把 `status`、`metadata.approval.phase`、前端 label 混为同一概念；
- 每一个状态必须有进入条件、允许事件、退出条件和终态说明；
- 所有终态必须明确是否允许重试、退款、红冲或人工补偿。

### 5.4 权限表达

统一写成：

```text
角色：super_admin / admin / finance / ...
权限点：finance.topup
资源：recharge_order
动作：create / read / approve / reject / reverse
数据范围：self / team / all
拒绝结果：HTTP 403 + 固定错误码
```

角色枚举只能由 `00-index/glossary.md` 和权限专章定义，其他文档引用，不重复维护。

### 5.5 API 路径表达

- 正式公共路径、内部前端路径、兼容别名必须分栏；
- 每个路径必须标注 `canonical` 或 `alias`；
- `/v1/*` 与 `/api/v1/*` 不得混写；
- `api/v1/v1/*` 若保留，必须在 API 版本文档中明确“兼容别名”，不得继续称为正式路径。

## 6. 当前文档迁移映射

| 当前资料类型 | 目标目录 | 处理方式 |
|---|---|---|
| `PRD-*.md` | `02-requirements/` | 按业务域和章节拆分，保留 PRD ID |
| `SPEC-*.md` | `03-functional-spec/` | 每个业务域独立文件，建立 PRD 对应关系 |
| `ref-*.md` | `03-functional-spec/` 或 `99-archive/` | 有效规则提炼进 SPEC；纯历史/实现参考归档 |
| `ARCH-*.md` | `06-data-and-architecture/` | 按状态机、数据、事务、权限、迁移拆分 |
| `api-reference.md` | `05-api/` | 按公开 API、用户 API、管理 API 拆分 |
| `api-contract.md` | `05-api/api-overview.md` | 只保留入口和版本规则，具体端点下沉 |
| `data-dictionary.md` | `06-data-and-architecture/data-dictionary.md` | 删除旧表名和重复角色定义 |
| `*测试报告*.md` | `07-quality-and-acceptance/` | 只保留真实运行证据和结论 |
| `deployment-checklist.md` | `08-operations-and-deployment/` | 与 Runbook、脚本逐项对齐 |
| `deployment-runbook.md` | `08-operations-and-deployment/` | 只写可执行流程 |
| `原型实现对照审计*.md` | `90-audits/reports/` | 标记审计日期和源码基线 |
| `boundary-*` / `supplement-*` | `02-requirements/` 或 `90-audits/` | 先判断是正式要求还是审计补充，禁止继续混用 |
| 任务分配单/开发任务书 | `99-archive/` 或项目管理区 | 不作为正式需求权威来源 |

## 7. 必须先裁决的文档问题

在文档迁移完成前，以下问题必须有 ADR，不能靠编辑人员自行猜测：

1. 人工上账、用户充值、调账的单笔上限分别是多少；
2. `>10,000`、`>100,000` 的审批边界是否适用于三类单据；
3. 资金写操作 2FA 的生效阶段；
4. 哪些端点本期必须接入 `Idempotency-Key`；
5. 充值订单、人工上账、调账、退款的唯一状态机；
6. 退款是“审核即执行”还是“审核后另行执行”；
7. 计费余额唯一账本是 `users.balance` 还是 `customer_balances`；
8. 计费和余额金额精度是 6 位、8 位还是分级精度；
9. `finance_ops` 等角色是否存在，还是统一使用当前数据库枚举；
10. `/v1/*`、`/api/v1/*`、`/api/v1/v1/*` 的正式与兼容关系；
11. `system_config` 与 `system_configs` 的唯一正式表名；
12. 迁移是 Drizzle journal、手写迁移，还是两者明确串联。

## 8. 迁移执行顺序

```text
1. 冻结当前文档快照
2. 建立 document-map 与 glossary
3. 为冲突项建立 ADR / open-issues
4. 拆分 PRD / SPEC / ARCH / API / OPS 正文
5. 清理重复规则，所有引用改为内部链接
6. 运行链接检查、API 路径检查、状态机检查、角色/表名检查
7. 由 product + architecture + backend + test + review 联合复核
8. 标记 approved 版本
9. 将旧文件移入 99-archive，不直接删除
10. 文档稳定后再恢复代码需求差距审计
```

## 9. 完成门禁

文档重组不得以“文件已拆分”作为完成标准，必须同时满足：

- 每个正式主题有唯一权威文件；
- 每个章节有文档 ID、版本、状态、负责人；
- 所有冲突均有 ADR 或明确 `CONFLICT`；
- 所有内部链接有效；
- API 路径、角色、表名、状态、金额精度可交叉追踪；
- PRD→SPEC→ARCH→API→TEST→OPS 链路完整；
- 历史文件不可被误当作当前规范；
- 文档内容通过 product、arch、backend、test、review 联合门禁。
