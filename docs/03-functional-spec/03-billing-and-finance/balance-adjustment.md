# 核心资金 SPEC：调账

- 文档 ID：SPEC-BILLING-003
- 状态：review
- 生效版本：v1.0.0
- 对应 PRD：`../../../../02-requirements/03-billing-and-finance/balance-adjustment.md`
- 上游 ADR：ADR-0001、ADR-0002、ADR-0003、ADR-0004、ADR-0008、ADR-0009、ADR-0011、ADR-0013、ADR-0021、ADR-0022
- 实现依据：`docs/ARCH-整改R5-R7-资金风控.md`（接口契约、存储裁决、错误码以 ARCH 为准）

> **P1 合规**：本 SPEC 含页面级 `[?] 页面帮助` 与定制的 `[?] 页面帮助与按钮级帮助对照表`，满足 `PRODUCT-DESIGN-PRINCIPLES` P1（不可降级）。

## 1. 页面与路由

| 模块 | 页面 | 路由 | 说明 |
|------|------|------|------|
| 手动调账 | 发起调账 / 待我审批 / 调账台账（三页签） | `/admin/finance/manual-topup` 下财务调账页签（R5 §3.1.4 三页签：发起调账 / 待我审批 / 调账台账） | 适用 admin / super_admin（持 `finance.adjust`）；finance 不可见 |
| 风控规则配置 | 大额规则 / 限额 / 2FA 策略 | `/admin/finance/risk-config`（pageKey `finance-risk-config`，ARCH §1.3 `AdminFinanceRiskConfigPage.tsx`） | 大额/限额 admin+super_admin，2FA 策略仅 super_admin（B17） |

> 页面最终路由以 ARCH `§1.3 改造文件清单` 与 frontend-agent 实现为准；此处标注 `【待人工裁决】` 若与页面审计核验结果不一致时以实际为准。

## 2. 角色与权限

权限点模型引用 ADR-0004（后端按权限点鉴权，角色只作权限聚合，无权限 403 `PERMISSION_DENIED`）与 ADR-0024（角色枚举，grant/deny 优先级，显式 deny 优先、默认拒绝）。

| 操作 | super_admin | admin | finance | 权限点 | R5 职责分离 | R7 操作级 2FA |
|------|:-----------:|:-----:|:-------:|--------|------------|:---:|
| 查看调账台账 / 待我审批 | ✅ | ✅ | ❌ | `finance.adjust` | —（只读） | 否 |
| 发起调账（调增/调减） | ✅ | ✅ | ❌ | `finance.adjust` | 申请人 ≠ 审批人 | ✅ |
| 审批调账（一级 approve / 二级 review / 驳回） | ✅ | ✅ | ❌ | `finance.adjust` | ≠ 申请人、一级 ≠ 二级 | ✅ |
| 红冲（发起 / 审批） | ✅ | ✅ | ❌ | `finance.adjust` | 红冲发起 ≠ 红冲审批 | ✅ |
| super_admin 终审（>¥100,000 档） | ✅ | ❌ | ❌ | super_admin 专属 | ≠ 创建人、≠ 一二级 | ✅ |
| 配置文件规则/限额（R6） | ✅ | ✅（建议） | ❌ | `sys.config` 或 `finance.rule_config`（B17 待裁决） | — | ✅ |
| 配置操作级 2FA 策略 | ✅ | ❌ | ❌ | `sys.config`（仅 super_admin） | — | ✅ |

> 数据范围与操作权限分离（ADR-0004）；越权 403。调账终审强制 `operator.role === 'super_admin'`（ARCH §2.2.3），且 ≠ requestedBy/approvedBy/reviewedBy，否则 400/403。

## 3. 字段与校验

### 3.1 调账单字段

| 字段 | 业务含义 | 必填 | 类型 | 精度/长度 | 校验规则 |
|------|---------|------|------|-----------|---------|
| `user_id` | 目标用户 ID | ✅ | integer | — | 用户必须存在且状态正常；不存在返回友好错误（R2 基线：无余额行将自动建户，不等同于拒绝） |
| `direction` | 方向 | ✅ | enum | `increase`/`decrease` | 调增/调减 |
| `amount` | 金额 | ✅ | numeric | 18,2 | >0；≤¥50,000；最多 2 位小数（ADR-0001/0002） |
| `subject` | 会计科目 | ✅ | varchar | ≤50 | 白名单免审判定依据（`{赠送,补偿,纠错}`）；本期自由文本（R11 字典切换前） |
| `reason` | 调账原因 | ✅ | varchar | ≤500 | trim 后非空 |
| `adjustment_level` | 审批级别（系统生成） | 系统 | enum | `level1`/`level2`/`level3` | `calcApprovalTier` 计算；含限额升级后 `max(金额档, 2)` |
| `status` | 状态 | 系统 | enum | 见 §4 | `pending`/`pending_level2`/`pending_super`/`approved`/`rejected`/`failed`/`reversed`（ADR-0003 + R5 扩展 `pending_super`） |
| `approvedBy` / `reviewedBy` / `superReviewedBy` | 一级/二级/终审审批人 | 系统 | integer | — | 职责分离校验后落库 |
| `limitEscalated` | 是否因限额升级 | 系统 | boolean | — | true 表示本笔因 24h 累计超限升级 |
| `escalationReason` | 升级/降级代审原因 | 条件 | varchar | ≤255 | 降级代审（B4）必填 |

### 3.2 校验规则

| # | 校验项 | 规则 | 失败反馈 |
|---|--------|------|---------|
| V1 | 金额下限/上限 | `amount > 0` 且 `amount ≤ 50,000` | "金额必须 >0 且不超过 ¥50,000" |
| V2 | 金额精度 | 最多 2 位小数 | "金额最多保留 2 位小数" |
| V3 | 用户存在性 | `users` 存在且 active | "用户不存在，请重新选择" |
| V4 | 原因必填 | `reason` trim 非空且 ≤500 | "请填写调账原因" |
| V5 | 免审校验 | `isReviewExempt(subject, direction, amount)`：开关开 且 direction=increase 且 subject ∈ `{赠送,补偿,纠错}` 且 amount ≤ 1000 | 不命中则按金额档审批 |
| V6 | 限额预检 | 操作人/被入账用户双维度（ADR-0013/0022），含本笔 | 超限按 `exceed_action`：`reject` → 429 `DAILY_LIMIT_EXCEEDED`；`escalate` → 升级标记 |
| V7 | 职责分离 | 申请人 ≠ 任一审批环节；一级 ≠ 二级；终审 ≠ 前两级 | 400（E3/E4/E5） |
| V8 | 终态守卫 | 仅当前环节可流转；终态不可再审批 | 409 `ORDER_ALREADY_PROCESSED`（E6/E7） |

### 3.3 输出去重与配置键（ADR-0022 / B17）

对外限额配置键冻结为 `limits.operator_24h`、`limits.recipient_24h`、`limits.exceed_action`（不提供 `soft_limit`/`hard_limit` 对外键）。兑现项遵循 ADR-0022 优先级：`invalid input → hard business limit → 24h operator/recipient → approval threshold → normal processing`。

## 4. 状态机

调账状态机详见 [调账状态机](../../06-data-and-architecture/state-machines/adjustment.md)，与 ADR-0003 及 R5 tier3 对齐，以下为其触发器展开：

| 当前状态 | 触发器 | 守卫/条件 | 下一状态 | 副作用 |
|---------|--------|-----------|---------|--------|
| (创建) | `create` | 金额+限额定级；白名单命中可直达 approved | `pending`（单审）/ `pending`（双人一审待审）/ `pending`（终审一级待审）/ `approved`（免审） | 预占 24h 累计（调增）；写审计 |
| `pending` | `approve`（一级） | 审批人 ≠ 申请人（E3）；单审档 → approved；双人档 → pending_level2 | `approved` / `pending_level2` | 单审档生效即入账+流水+通知+审计；双人档记 `approvedBy` 不触余额 |
| `pending` | `reject` | 驳回原因必填（V4） | `rejected` | 记驳回原因；不改余额；不回退累计（B19） |
| `pending_level2` | `review`（二级） | 二维 ≠ 一级（E4）；双人档 → approved；终审档 → pending_super | `approved` / `pending_super` | 双人档生效即入账；终审档记 `reviewedBy` 不触余额 |
| `pending_level2` | `reject` | 原因必填 | `rejected` | 同上 |
| `pending_super` | `review`（super 终审） | 角色=super_admin 且 ≠ 前两级（E5） | `approved` | 终审生效即入账 + 流水 + 通知 + 审计 |
| `pending_super` | `reject` | 原因必填 | `rejected` | 同上 |
| `approved` | `reverse`（红冲） | 红冲发起 ≠ 审批；独立反向记录；加钱方向预占限额（B9） | `reversed` | 创建反向记录并单独按规则定级；反向记录生效后原单转 `reversed`（ADR-0003） |

> 存储裁决（ARCH §2.2.3）：调账 `adjustment_records` 在 DB 枚举追加 `'pending_super'`，并新增列 `super_reviewed_by`/`limit_escalated`/`escalation_reason`（migration 0030）；与充值/人工上账用 `metadata.approval.phase` 承载不同（ADR-0021 分层表达主要面向充值/人工上账的 `status + approval_phase` 拆分，调账因其域内私有枚举保持枚举扩展）。
> 唯一状态守卫：`WHERE id=? AND status=<当前环节>`，0 行 → 409 回滚；仅最终批准事务内调 `creditBalance`（阶段推进不触余额，防并发重复入账/扣减）。

## 5. 操作与反馈

### 5.1 资金写操作两步弹窗（R7/ARCH §4.7）

1. 点击调账资金操作按钮（发起/审核/复核/终审/驳回/红冲）→ 弹出"身份验证"弹窗第一步：TOTP 6 位 / 备用码输入（`allow_backup_code` 时提供"无法使用认证器？使用备用码"切换）。
2. 未启用 2FA（`mandatory_admin`）→ 弹窗提示 + [前往启用]（跳转安全设置）。
3. 锁定 → 弹窗倒计时（15:00），输入框禁用。
4. 验证通过 → 同窗切换第二步：操作摘要（用户/金额/到账后余额/审批级别/限额升级提示）+ [确认执行]/[返回修改]。
5. 成功 → toast + 列表刷新；失败 → 明确错误（令牌过期/验证码错误/锁定）。

### 5.2 幂等与状态反馈（ADR-0009）

- 创建 `POST /admin/adjust` 强制 `Idempotency-Key`；审批/红冲纳入幂等并状态条件更新同生效。
- 并发重复/终态再操作 → 409 `ORDER_ALREADY_PROCESSED`；`Idempotency-Key` 摘要冲突 → 409 `IDEMPOTENCY_CONFLICT`；幂等基础设施不可用 → 503 `IDEMPOTENCY_UNAVAILABLE`。

### 5.3 固定错误码（ARCH §2.3.2 / ADR-0011）

| HTTP | code | 场景 |
|:---:|------|------|
| 400 | `VALIDATION_ERROR` | 审批人=申请人（E3）、二维=一级（E4）、终审=前两级（E5）、降级代审缺原因、阶段不匹配 |
| 403 | `FORBIDDEN` | 终审非 super_admin 角色；无权限点（沿用） |
| 409 | `ORDER_ALREADY_PROCESSED` | 并发重复审批/终态再审批（E6/E7，沿用） |
| 429 | `DAILY_LIMIT_EXCEEDED` | 创建预检超硬限且 `exceed_action=reject`（E20） |
| 403 | `OPERATION_2FA_REQUIRED` / `OPERATION_2FA_INVALID` / `OPERATION_2FA_EXPIRED` / `OPERATION_2FA_NOT_ENABLED` | R7 中间件（**不用 401** 防前端登出） |
| 403 | `OPERATION_CONFIRM_REQUIRED` | 缺二次确认标记（E30） |
| 429 | `OPERATION_2FA_LOCKED` | 锁定中（E23/E31） |
| 409 | `IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_UNAVAILABLE`(503) | ADR-0009 幂等 |

> 错误响应遵循 ADR-0011：`{ code, message, details, request_id }`，不返回业务 `data`；`request_id` 写入日志、审计和响应。

## 6. API 契约

调账端点契约详见 [API：管理端核心资金](../../05-api/admin/finance.md) §调账端点。核心：

| 方法 | 路径 | 权限点 | 2FA+确认 | 说明 |
|------|------|--------|:---:|------|
| POST | `/api/v1/admin/adjust` | `finance.adjust` | ✅ | 发起（含免审生效）；响应含 `approval_level`(1\|2\|3)、`limit_escalated`、`message` |
| POST | `/api/v1/admin/adjust/:id/approve` | `finance.adjust` | ✅ | 一级审批（单审档生效） |
| POST | `/api/v1/admin/adjust/:id/review` | `finance.adjust` | ✅ | 二级 / super 终审（扩展 `pending_super`；终审强制 super_admin） |
| POST | `/api/v1/admin/adjust/:id/reject` | `finance.adjust` | ✅ | 驳回（原因必填） |
| POST | `/api/v1/admin/adjust/:id/reverse` | `finance.adjust` | ✅ | 红冲（加钱方向预占限额；R12 前保持直接生效但不建审批链） |
| GET | `/api/v1/admin/adjust/pending?level=1\|2\|3` | `finance.adjust` | 否 | 待我审批（含 level=3 pending_super） |
| GET | `/api/v1/admin/adjust/ledger` | `finance.adjust` | 否 | 台账（含审批链/`limit_escalated`/`stalled` 字段） |

> 路径前缀 `api/v1` 与现状 `/api/v1/admin/...` 对齐（ADR-0023 别名兼容窗口见 `docs/05-api`）；具体响应字段以 ARCH §2.3 表为准。红冲端点本期不做审批链（R12 范围），但挂 2FA + 二次确认 + 加钱方向限额预占。

## 7. 异常、并发与事务

### 7.1 异常与边界

调账相关 E1–E30 边界枚举见 [PRD §5](../../02-requirements/03-billing-and-finance/balance-adjustment.md#5-异常与边界)（金额档、职责分离、限额、2FA、终态守卫）。补充约定：

- **余额不足扣减**（ADR-0020）：调减/扣减在余额不足时返回受控业务错误，不得写负余额；不引入垫付账户与下次充值优先抵扣机制。
- **并发重复审批**（E6/E7）：atomic 状态守卫 + 0 行 409 回滚，不重复入账/扣减。

### 7.2 真实事务边界（ARCH §3.2 / §2.2.3）

资金写操作（发起/最终批准/红冲生效）在同一数据库事务内完成：**原子余额更新 + 流水 + 调账单状态更新 + 限额计数插行 + 审计事件**，任一失败整体回滚。阶段推进（pending → pending_level2/pending_super）只更新状态与审批人，**不触余额**；仅最终批准事务内调 `creditBalance`。

参照 ARCH 的 `credit_limit_events` 写入事务：

```sql
-- ① 同维度串行化（op/user 两把锁，粒度 = 用户）
SELECT pg_advisory_xact_lock(hashtext('lim:' || $scope || ':' || $user_id));
-- ② 滚动汇总（24h）；③ 超限判定（exceed_action=reject → 429 回滚）；
-- ④ 插行（op + user 各一行，UNIQUE(scope,ref_type,ref_id) 幂等）
```

- **TOCTOU 消除**：advisory lock 串行化同维度并发（E16 先到先得）；UNIQUE 防同单重复计数。
- **Redis 降级**：Redis 不可用 → 限额预检回退 PG 查询（PG 权威），ZADD 失败静默跳过（下次回填自愈）；幂等 Redis 不可用 → 503（不得静默绕过，ADR-0009）。

### 7.3 失败补偿

- **驳回/红冲不回退累计**（B19）：已预占的 24h 累计不因驳回/红冲回退（防"提交-撤销-再提交"）。红冲加钱方向本身另计新累计。
- **入账失败**：最终批准事务失败 → 整单回滚，单据保持原环节待审（不产生部分入账/扣减）。

## 8. [?] 页面帮助与按钮级帮助对照表

> 数据源：以下内容作为各页面 `PageHelp` 弹窗与各按钮 `ButtonHelp` Tooltip 内容（pageKey：`finance-adjust`、`finance-risk-config`；`finance-manual-topup` 等见对应文档；最终由 frontend-agent 按首页帮助组件约定落地）。

### [?] 页面帮助

**财务 → 手动调账**（`finance-adjust`）

**适用角色**：管理员（admin / super_admin），持 `finance.adjust` 权限点（finance 角色不可见）

**功能定位**：为指定用户调增/调减余额（平台赠送、补偿、纠错、扣减），按金额分级审批，防拆分，全程审计，错误调账可红冲。

**核心操作**：
1. 发起调账：选择用户 → 方向（调增/调减）→ 金额 → 会计科目 → 原因 → 提交
2. 金额 ≤¥10,000 单审；>¥10,000 双人复核；>¥100,000 追加 super_admin 终审
3. 待我审批：一级/二级/终审队列，排除自己申请的单据
4. 调账生效后错误可「红字冲销」生成反向记录

**注意事项**：
- 调增免审批已取消（除非开启白名单科目免审：仅赠送/补偿/纠错且 ≤¥1,000，计入 24h 累计）
- 申请人 ≠ 审批人；一级 ≠ 二级；红冲需独立审批
- 操作人/被入账用户 24h 累计调增+上账超过 ¥50,000 → 后续笔升级双人审批
- 资金写操作需操作级 2FA + 二次确认
- 错误调账不删除不编辑，通过红字冲销纠正

**常见问题**：
Q: 调增 ¥500 也要审批吗？A: 默认是的（免审批已取消）；若运营开启白名单免审（赠送/补偿/纠错科目且 ≤¥1,000），符合条件的调增可提交即生效。
Q: 为什么"待我审批"看不到某些单据？A: 该队列已排除您自己申请的单据（职责分离）。
Q: 调减如何审批？A: 调减按金额分级：≤¥10,000 单审、>¥10,000 双人复核（恰为 ¥10,000 亦双人，保留更严语义），与调增同档统一。

**设置 → 风控规则配置**（`finance-risk-config`，B17）

**适用角色**：super_admin（2FA 策略）；admin / super_admin（大额规则与限额，权限归属 B17 待裁决）

**功能定位**：配置统一大额审批规则、24h 累计限额与操作级 2FA 策略，全局即时生效（新提交单据按新规则定级）。

**核心操作**：1. 大额规则（单审上限、双人阈值、终审线、白名单免审开关）；2. 限额（操作人/被入账用户 24h 累计 ¥50,000、超限行为、豁免角色）；3. 2FA 策略（mandatory_admin/disabled、令牌有效期、锁定阈值）。

**注意事项**：配置变更即时生效，存量单据按提交时点固化；保存为敏感写需 2FA + 二次确认并写审计。

**常见问题**：Q: 修改阈值后存量待审单据会怎样？A: 存量单据沿用提交时确定的审批级别，不受新配置影响。Q: 为什么 2FA 策略只有 super_admin 能改？A: 2FA 策略属最高安全策略，仅超级管理员可调整。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 发起调账 [?] | 为指定用户调增/调减余额（赠送/补偿/纠错/扣减），需填写会计科目与原因；提交后按金额与 24h 累计限额定级审批 |
| 审核通过（一级）[?] | 一级审批：单审档通过即生效；双人/终审档通过后进入下一环节（待双人复核/待终审），不会立即生效 |
| 复核通过（二级）[?] | 二级复核：双人档在此环节通过后生效；审批人不能与一级审批人相同 |
| 终审通过（super_admin）[?] | 终审档（>¥100,000）的最终确认，通过后生效；终审人不能是前两级审批人或创建人 |
| 驳回 [?] | 拒绝该单据，必须填写驳回原因；单据变为已驳回，不改变用户余额 |
| 红字冲销 [?] | 对已生效的错误调账生成反向记录进行冲正，需独立审批，不删除原记录；反向记录按自身金额重新定级 |
| 2FA 验证输入 [?] | 资金写操作前的身份验证：输入认证器 6 位动态码或备用码，验证结果 5 分钟内有效；连续 5 次错误将锁定 15 分钟 |
| 确认执行 [?] | 二次确认：核对操作摘要（用户/金额/到账后余额/审批级别）后确认提交，与 2FA 验证共同构成资金操作放行的两个必要条件 |
| 前往启用 2FA [?] | 未启用双因素认证时跳转安全设置页完成启用；启用前无法执行资金写操作 |
| 使用备用码 [?] | 无法使用认证器时切换为备用码输入（格式 XXXX-XXXX-XXXX），备用码一次性，用后作废 |
| 限额升级提示 [?] | 说明本笔因 24h 累计超限（¥50,000）被升级为双人审批的原因与累计金额 |
| 待我审批（筛选）[?] | 按审批环节筛选待办：单审 / 待双人复核 / 待终审；队列已排除您自己申请的单据 |
| 保存风控配置 [?] | 保存大额规则/限额/2FA 策略修改；配置即时生效（存量单据按提交时点固化），保存需 2FA + 二次确认 |

> 本对照表为定制内容（非占位符），数据源 = PRD §8；预期结合前端首页帮助组件逐按钮落地，构成 P1 验收项。

## 9. 验收标准

验收依据：`PRD-整改R5-R7-资金风控.md` §6 + `ARCH-整改R5-R7` §6 测试清单（真实接受口径）。

- [ ] 调账 tier 计算边界：恰 ¥10,000→level1（调增）、10,000.01→level2、恰 ¥100,000→level2、100,000.01→level3、**调减恰 ¥10,000→level2（B1 特例）**（`finance-rules.test.ts`）
- [ ] 免审判定：开关关→不命中；开：`{赠送,补偿,纠错}` 且 ≤¥1,000 且调增→命中；调减/超额/非白名单→不命中（E9）（`isReviewExempt`）
- [ ] 调增 ≤1 万默认 pending 待审（B2）；>10 万 → pending→pending_level2→pending_super→approved；pending_super 非 super_admin → 403；白名单开启免审直接生效+计入累计；调减恰 1 万双人（`admin-adjust.test.ts`）
- [ ] 职责分离 + 降级代审：创建≠一审、一审≠二审、super≠前两级、创建≠驳回；super_admin 自建自审无原因 400，带 `escalation_reason` → 通过 + 审计 `degraded:true`（E3/E4/E5/E8/B4）
- [ ] 审批人不足 → 单据滞留 + notifications 出现 `approval_stalled`（super_admin 收件）+ 审计（E8/B4）
- [ ] 限额拆分升级（E13）：9×¥9,999 第 1–5 笔单审，第 6 笔起 `limit_escalated=true` + approval_level≥2（`credit-limit.test.ts` + admin-*.test.ts）
- [ ] 双维度超限（E14）；滚动窗口跨日（E15）；并发先到先得（E16）；驳回/红冲不回退（B19/E17）；调减/充值审核/兑换码不计入（B9/B10）
- [ ] exceed_action 切换（E20/B7）：escalate→升级；配置 reject → 429 `DAILY_LIMIT_EXCEEDED`
- [ ] 操作级 2FA：无令牌/无确认 403（E30）；未启用→403 `OPERATION_2FA_NOT_ENABLED`；错误码断言非 401（防登出）
- [ ] 共享锁定（B14/E23/E31）：登录 verify 与 operation-verify 共享 `2fa:fail:{userId}`，第 5 次后两链路 429；过期/伪造/绕过 → `OPERATION_2FA_EXPIRED`/`INVALID`（E26/E22）
- [ ] 2FA 重置/禁用失效（E27）：disable 后递增 revoked seq → 旧 op_token 403；重新启用后新令牌可用
- [ ] 调账红冲：reverse 挂 2FA + 加钱方向限额预占；反向记录重新定级；原单转 `reversed`（ADR-0003 §红冲）
- [ ] 阶段一回归更新：`admin-adjust.test.ts` 原"调增免审批生效"用例改为"调增 ≤1 万 → pending 待审"（B2 语义变更必改，否则阶段一用例失败）
- [ ] P1 合规：调账页/风控配置页标题旁 `[?]` 页面帮助 + 涉及按钮均有 `[?]` 帮助，内容与本 SPEC §8 对照表一致
