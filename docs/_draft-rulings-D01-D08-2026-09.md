# open-issues #11–20 人工裁决草案（D-01 … D-08）

- 编制日期：2026-09
- 性质：**草案，供 BOSS / product / arch 联合评审确认**。未确认前不得据本文档改读为已批准正文。
- 依据：`00-index/open-issues.md`、ADR-0004/0011/0015/0024/0026、`05-api/{errors,README}.md`、
  `api/src/lib/{permissions,errors}.ts`、`06-data-and-architecture/permissions-and-authorization.md`、
  `00-index/document-inventory.md`、`docs/_recovered/*`、`docs/supplement/*`。
- 每条结构：现状与证据 → 建议选项 → **推荐** → 落地动作 → 关闭判据。

---

## D-01 — `INSUFFICIENT_BALANCE` 402 vs 422 双语义（open-issues #15）

### 现状与证据
- `api/src/lib/errors.ts` `InsufficientBalanceError`：HTTP **402**、code `INSUFFICIENT_BALANCE`，仅被
  模型消费/网关兼容表面使用：`chat.ts`、`anthropic.ts`、`openai-compat.ts`、`messages.ts`、`responses.ts`、
  `rerank.ts`、`task-relay.ts`、`ws-relay.ts` 全部 `send*(…, 402, …insufficient_balance…)`。
- 正式资金契约 `05-api/errors.md` §2.2：资金操作 `INSUFFICIENT_BALANCE` → **422**（禁负，ADR-0020）。
- `conventions.md` §1：`/v1/*`、`/anthropic/v1/*` 属**兼容表面**（OpenAI/Anthropic 原生 `{error:{...}}`），
  与平台业务 `{code,message,details,request_id}` 是**两套表面**，本就分开定义。
- → 实为「兼容表面(402 消费)」与「平台表面(422 资金)」两套表面各自使用同一 code 名，非同一响应面内冲突。

### 建议选项
- **方案 A（推荐）**：平台表面拆 code——资金操作用 `INSUFFICIENT_BALANCE`=422；新增 `INSUFFICIENT_BALANCE_QUOTA`（或复用现有 `PRE_CONSUME_FAILED`）=402 用于兼容表面模型消费。两表面 code 不再混用。
- **方案 B**：统一资金操作为 402。→ 违背 ADR-0020「422=禁负校验失败」与 errors.md §2.2 已 approved 口径，不推荐。
- **方案 C**：兼容表面改 422。→ 破坏 OpenAI/Anthropic 原生语义与客户端兼容（兼容表面禁止改），不推荐。

### 推荐：方案 A
- 平台表面保留 `INSUFFICIENT_BALANCE`→422（资金禁负）；兼容表面消费缺额沿用 402 语义但 code 用 `PAYMENT_REQUIRED`（原生 `insufficient_balance` 透给客户端时的 `error.code` 可保留，仅平台日志/trace 用新 code）。
- 落地：`errors.ts` 增加 `PaymentRequiredError`(402, `PAYMENT_REQUIRED`)；兼容路由 trace/日志从 `INSUFFICIENT_BALANCE` 改用 `PAYMENT_REQUIRED`；`errors.md` §4 登记行由「待裁决」改为「已裁决 A」，删除 `INSUFFICIENT_BALANCE` 的 402 用法。
- 关闭判据：`errors.ts` 不再对 `INSUFFICIENT_BALANCE` 发 402；errors.md §4 DOC_CODE_GAP 关闭；open-issues #15 关闭。

---

## D-02 — 分页字段差异（open-issues #16）

### 现状与证据
- ADR-0011 已定列表统一为 `items/page/page_size/total`；`errors.md` §4 登记差异为
  `部分历史端点返回 pagination:{page,pageSize}/list`，与契约不符。
- 代码实测：既有路由参数混用 `page_size`（`admin-agents.ts:59`、`admin-invoices.ts:87`、`admin-permissions.ts:80`）
  与 `pageSize`（`admin-customers.ts:51`、`admin-groups.ts:48`、`admin-price-changes.ts:45`）；响应
  `admin-announcements.ts:122`、`admin-email.ts:72`、`admin-finance.ts:436` 返回 `list:`。

### 建议选项
- **方案 A（推荐）**：以 ADR-0011 为准绳，统一**响应**为 `items/page/page_size/total`；**请求参数**统一为 `page`/`page_size`（与主流管理路由一致），`pageSize` 作为 deprecated 输入别名在 v1.x 兼容、v2.0 移除。收敛清单登记 `DOC_CODE_GAP`。
- **方案 B**：保留 `list/pagination` 为现状。→ 违反 ADR-0011，前后端/契约测试无法对齐，不推荐。

### 推荐：方案 A
- 落地：渐变收敛历史端点（优先资金与管理高频端点）；建立收敛清单（端点→现状→目标）；契约测试断言响应 shape。
- 关闭判据：ADR-0011 分页口径在全量端点通过契约测试；`pageSize` 别名按 ADR-0023 兼容窗口处理；errors.md 差异登记关闭。

---

## D-03 — 迁移 runner 加固（open-issues #17）

### 现状与证据
- ADR-0007/0026 要求：`_3cloud_manual_migrations` 记录 checksum/状态/错误/耗时、**单执行者锁**、checksum 报警。
- 现状 `api/run-manual-migrations.cjs` 表结构仅为 `(name, applied_at)`，未实现锁与 checksum（open-issues #17）；
  `migration-runbook.md` §当前未决 自证「runner、回滚、checksum、全新库演练仍待核验」，与其执行顺序步骤矛盾。

### 建议选项
- **方案 A（推荐）**：按 ADR-0026 加固 `run-manual-migrations.cjs`——表加 `checksum/status/error/elapsed_ms/applied_by/applied_at`；迁移前取 Redis/DB 单执行者锁，互斥并发；每条记录 checksum 校验失败即停并告警；补全新库 `0000–0016 + 0017–0032` 演练证据。
- **方案 B**：换用现成迁移器（如 node-pg-migrate）。→ 需重写 16 份手写迁移脚本与既有 `_3cloud_manual_migrations` 兼容，返工大，不推荐。

### 推荐：方案 A
- 落地：扩展表结构 migration、加固 runner、回滚命令、全新库演练 + 真实验证报告回填 `migration-runbook.md` 与 `release-baseline.md`（禁编造；对应 O-01）。
- 关闭判据：全新库演练通过；迁移记录含 checksum 且失败即停；runbook「当前未决」清空；open-issues #17 关闭。

---

## D-04 — API 文档 ID 冲突（open-issues #18）

### 现状与证据
- `05-api/README.md` §三及 `user/recharge.md`、`admin/manual-topup.md` 均登记 **`API-BILLING-002`**。
- 二者语义不同：用户自助充值（`user/recharge.md`）、管理端人工上账（`admin/manual-topup.md`），本就分开裁决（BOSS 确认人工上账上限 ¥50,000 vs 自助 ¥1,000,000）。

### 建议选项
- **方案 A（推荐）**：拆为唯一 ID——`user/recharge.md`→`API-BILLING-USER-RECHARGE`；`admin/manual-topup.md`→`API-BILLING-MANUAL-TOPUP`；同步 `document-inventory.md` §2.3、`document-map.md`。README §三与 inventory 冲突登记关闭。
- **方案 B**：合并为同一文档。→ 已各自 approved、主题独立，合并丢信息，不推荐。

### 推荐：方案 A
- 落地：改两文件 header 文档 ID + inventory/map 同步；全局检索 `API-BILLING-002` 引用并更新。
- 关闭判据：无两文件共用同一 ID；inventory/README 登记一致；open-issues #18 关闭。

---

## D-05 — 结算/对账权限点绑定（open-issues #19）

### 现状与证据
- `permissions-and-authorization.md` §3/§8 已登记为 `【待人工裁决】`：`FINANCE_RECON_APPROVE`（对账报告 close/平账）是否独立；结算查看挂 `RECONCILIATION_VIEW` 还是 `settlement.*`；`sys.config` vs `finance.rule_config`。
- 现存权限点（`permissions.ts` PER_GROUPS/ROLE_PERMS、权限矩阵）：`finance.reconciliation`（对账报表）、`RECONCILIATION_VIEW`（对账查看）、`FINANCE_COMMISSION`（对账差异处理 resolve/auto_fix/ignore）、`settlement.adjust`（结算调整）、`sys.config`（系统配置）。
- 现行为：人工上账/调账/退款挂 `finance.topup/adjust/refund`；对账/结算挂 `RECONCILIATION_VIEW`/`FINANCE_COMMISSION`/`settlement.adjust`；风控配置挂 `sys.config`。

### 建议选项（对各项分别裁定）
1. **`FINANCE_RECON_APPROVE` 是否独立**：
   - **A（推荐）**：独立。理由：close/平账是对账周期终态写操作，与查看/差异处理风险等级不同，应单独授予（体现 SoD）。
   - B：并入 `FINANCE_COMMISSION`。理由：同一工作台。→ 弱化 close 审计隔离，不推荐。
2. **结算查看挂哪个**：
   - **A（推荐）**：查看类统一挂 `RECONCILIATION_VIEW`（对账 run/reports/export/差异查看/结算单查询），`settlement.adjust` 仅用于结算调整写操作。理由：与权限矩阵现有列一致、避免 `settlement.*` 子命名扩散。
   - B：另建 `settlement.view`。→ 命名分散，不推荐。
3. **`sys.config` vs `finance.rule_config`**：
   - **A（推荐）**：风控类配置（关账/平账/结算规则）归独立 `finance.rule_config` 权限点，不放 `sys.config`；`sys.config` 保留为系统级配置。理由：资金规则与系统配置责任隔离，便于审计。
   - B：共用 `sys.config`。→ 资金规则被系统配置点覆盖，越权面大，不推荐。

### 推荐：三项均取 A
- 落地：`permissions.ts` PER_GROUPS 财务组新增 `finance.rule_config`；权限树/矩阵回填 `FINANCE_RECON_APPROVE`；路由 `settlement` 查看→`RECONCILIATION_VIEW`、close/平账→`FINANCE_RECON_APPROVE`、调整→`settlement.adjust`；`permissions-and-authorization.md` §3/§8 未决项改写为已裁决并回填矩阵。
- 关闭判据：权限矩阵与代码 ROLE_PERMS/中间件一致；对账写操作无 `RECONCILIATION_VIEW` 即可 close（SoD）；open-issues #19 关闭。

---

## D-06 — `finance` 角色聚合态 vs 角色枚举（open-issues #20）

### 现状与证据
- ADR-0024（accepted）：正式角色仅 `customer/agent/sales/admin/super_admin`；`finance_ops/ops/support/auditor` **非 canonical**，未来启用须另 ADR+迁移。
- 但代码 `permissions.ts` ROLE_PERMS 仍含 **`finance`** 键（`['finance.refund','finance.topup','finance.invoice','finance.reconciliation','customer.view','supplier.pricing']`），注释「D-5 定稿（ARCH 联合评审）」；`users.role` 单一主角色。→ 与 ADR-0024 相矛盾。

### 建议选项
- **方案 A（推荐）**：**保留 `finance` 作为「权限模板/聚合」，但不作为数据库角色枚举**。实现改为：`finance.*` 权限点可直接授予任意 canonical 角色的用户（表驱动/权限记录），`finance` 从 ROLE_PERMS 移除或降级为「预设权限包」供 UI 一键授予；数据库 `users.role` 仍只用 5 个 canonical 值。理由：契合 ADR-0024（角色枚举冻结）+ 保留财务最小权限集合的实用配置；无迁移，返工最小。
- **方案 B**：新建 `finance` canonical 角色。→ 违背 ADR-0024「正式角色仅 5 个、另设须新 ADR+迁移」，且其余权限文档/枚举/前端标签多处要改，不推荐。
- **方案 C**：把 `finance` 权限并给 `admin`。→ admin 已有除部分外权限；`finance` 本是最小财务组合，直接并入 admin 扩大 admin 权限面，不推荐。

### 推荐：方案 A
- 落地：声明 `finance` 为非角色枚举、是授予权限点组合的便捷载体；`permissions.ts` 把 `finance` 改注为「权限包」（可从 ROLE_PERMS 移出，改由权限记录/数组承载并新增 `PERM_PACKAGES.finance`）；`users.role` 校验加白名单（5 值）；权限矩阵/glossary/ADR-0024 关联注记同步。
- 关闭判据：`users.role` 仅 5 个 canonical 值可写；`finance` 权限可通过权限记录授予任意 canonical 用户；无代码再以 `role==='finance'` 做鉴权；open-issues #20 关闭。

---

## D-07 — supplement/02-09 逐份评审升格（open-issues #11）

### 现状与证据
- `document-inventory.md` §三：supplement 01–09 均 `draft`，已登记补充对象；`09-遗漏补丁.md` 含补丁 A/B/C/D 需归属到 01/04/05/07。
| 编号 | 补充对象 | 建议升格归属 |
|---|---|---|
| 01 计费引擎状态机 | ref-5.2-billing | 并入计费/核心引擎正式 SPEC |
| 02 对账差异处理定量规则 | SPEC-§29.3 | 并入对账正式 SPEC |
| 03 充值退款状态机 | ref-2.2.6、ref-9.5 | 并入充值/退款正式 SPEC（sprint-1/SPEC-充值中心已引用） |
| 04 代理佣金与结算 | ref-3-agent-system | 并入代理商体系正式 SPEC |
| 05 路由熔断恢复梯度 | ref-5.1-routing | 并入路由正式 SPEC |
| 06 全链路一致性契约 | 各模块一致性 | 并入全局一致性正式章节 |
| 07 Schema 重设计建议 | 01–06 派生 | 评审后采纳出正式 DDL；否则 superseded（见 D-07b） |
| 08 系统状态机总图 | 全局状态机 | 并入全局状态机正式章节 |
| 09 遗漏补丁 | A→01, B→04, C→05, D→07 | 逐条归属并合并后删除本文件 |

### 建议选项
- **方案 A（推荐）**：逐份按上表「评审→合并到对应正式 SPEC 或标注 superseded」，在 inventory 登记状态与替代关系；评审大会通过后升为正式章节。补丁 A/B/C/D 先各自并入 01/04/05/07 再行评审。
- **方案 B**：全部一次性整体 approve。→ 无评审、无法暴露冲突，违背 ADR-0015/0017，不推荐。

### 推荐：方案 A（分模块评审，非一次性）
- 落地：建 supplement 评审清单（编号→补充对象→目标文档→状态→评审结论）；`09-遗漏补丁` A/B/C/D 逐条并入并删源；`document-inventory.md`/`document-map.md` 同步；评审通过后才作为开发依据。
- 关闭判据：无 `draft` 的 supplement 文件游离于权威链之外；每份有 approved 归宿或 `superseded` 标注；open-issues #11 关闭。

---

## D-08 — 用户体系 PRD 610 行人工恢复（open-issues #12）

### 现状与证据
- `_recovered/PRD-用户体系-recovered-draft.md`（1326 行）：严格逆转候选 25、保留原文 691、**NEEDS-MANUAL-RECOVERY 610**（GB18030→UTF-8 乱码不可自动逆转）。
- `_recovered/*.notes.md` 自证「非 canonical 需求源，禁止据此生成验收结论」。
- 与现役 `docs/PRD-用户体系.md`（66047 B）同时存在；该现役 PRD 已覆盖 §2.1-2.12+（注册/登录/RBAC/仪表盘/模型/Key/调用日志/充值/对账等，见业务功能归总 §2）。

### 建议选项
- **方案 A（推荐）**：**以现役 `PRD-用户体系.md` 为主权威，逐 module 与 recovered-draft 比对**；610 行中凡现役 PRD 已覆盖的，标「已由现役覆盖、无需恢复」；仅现役缺失且有价值者人工重写补入现役 PRD；`_recovered/` 处理后移入 `_archive/`。即「恢复 = 差异对比 + 补缺」，而非无条件重转 610 行。
- **方案 B**：无条件人工重转全部 610 行。→ 大量内容现役 PRD 已覆盖，重复劳动且可能引入不一致，不推荐。
- **方案 C**：废弃 recovered-draft、完全以现役 PRD 为准。→ 需先确认现役 PRD 无内容断层，可作兜底但需登记放弃理由，风险较高，不推荐直接采用。

### 推荐：方案 A
- 落地：product+arch 联合逐模块比对（角色/权限/平台交互等），产出「610 行差异裁决表」（行号→处置：现役已覆盖/需补写/废弃）；补写内容合并进 `PRD-用户体系.md` 并经评审 approved；`_recovered/` 移入 `_archive/`；`document-inventory.md`/`open-issues #12` 同步。
- 关闭判据：用户体系 PRD 无内容断层且 approved；`_recovered/` 无 NEEDS-MANUAL-RECOVERY 残留；open-issues #12 关闭。

---

## 附：D-09 / D-10（同批登记项，简报）
- **D-09（#14 充值真实测试映射差额）**：非裁决型，随 T-02 测试补建关闭。
- **D-10（#? supplement-07 Schema 与现役 schema 对齐）**：归入 D-07 表「07」行，采纳则出正式 DDL 评审、否则 superseded。

## 裁决优先级建议
先冻结 **D-01（错误码）、D-02（分页）、D-05（权限）、D-06（角色）**——这四项影响 API 契约与鉴权实现，是测试/前后端对齐的前置；再走 **D-04**（文档登记）、**D-08**（用户体系内容）、**D-07**（supplement 升格）、**D-03**（迁移器，可并行）。