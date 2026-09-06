# 需求文档「足以支撑项目开发完毕」— 待办关闭清单

- 编制日期：2026-09（基于 2026-08-30/31 审计复核 + 自动化核对实测）
- 口径：以 `00-index/README.md`（唯一准入入口）+ ADR-0015/0016 为判定标准；
  只有 `accepted` ADR 与 `approved` 正式文档可作为开发与验收依据。
- 说明：本清单只列「需关闭的缺口」，不重复已 approved 的内容（资金批次 PRD/SPEC/ARCH/API 已 GRADE=A）。

---

## 缺口总览

| 缺口域 | 当前状态 | 条目 |
|---|---|---|
| 1. TEST（验收/发布基线） | 全部 draft，release-baseline `not_ready` | T-01 … T-04 |
| 2. OPS（部署/迁移/运维） | 全部 draft，runner 未加固 | O-01 … O-03 |
| 3. 用户体系需求完整性 | 610 行 NEEDS-MANUAL-RECOVERY 未恢复 | U-01 |
| 4. open-issues 待裁决 | #11–20 未关闭（多项【待人工裁决】） | D-01 … D-10 |

---

## 一、TEST 层（07-quality-and-acceptance/）

> 目标：把 `release-baseline.md` 从 `draft`/`not_ready` 推到真实 `ready`，并把五个资金主题的
> `需要测试用例→真实证据` 追溯链补齐。**禁止以历史 808/1159/1132 数字冒充真实候选基线。**

### T-01 建立「主题→测试用例→真实证据」映射
- 文档 ID：`TEST-BILLING-003`（新建）
- 责任：test-agent + backend-agent
- 内容：对充值 / 人工上账 / 调账 / 退款红冲 / 结算对账五个主题，各建一张
  验收条目 → 测试用例 ID → 自动化命令/文件 → 运行结果(通过数) → 失败日志引用 的映射表。
- 必须覆盖（照抄 `acceptance-criteria.md` 门禁）：金额边界/精度/舍入、状态机转移、
  重复/并发/失败补偿、权限/职责分离/操作 2FA/幂等、事务边界、API 契约(canonical+alias/错误码)、
  迁移顺序/checksum/备份恢复/失败即停。
- 验收：`GRADE` 无 FAIL；`release-baseline` 引用 T-01 的映射。

### T-02 补齐充值主题已知差额（open-issues #14）
- 责任：backend-agent + test-agent
- 内容：补充《用户自助充值回调幂等 / 渠道熔断 / 审批三级逐级边界 / 终态不可二次审核 /
  `approval_phase` 序列化》测试用例，并回填 `state-machines/recharge-order.md §7` 与充值 PRD/SPEC §验收标准。
- 验收：open-issues #14 关闭；recharge-order §7 映射完整。

### T-03 契约测试落库
- 责任：backend-agent
- 内容：对 `05-api/admin/*`、`05-api/user/recharge.md` 每个 endpoint 使用 `05-api/conventions.md`
  （响应 envelope、认证、幂等、金额序列化）与 `errors.md` 的错误码建立契约测试；
  消除 errors.md 已登记的 `DOC_CODE_GAP`（见 D-01、D-02）。
- 验收：契约测试通过，`INSUFFICIENT_BALANCE` 语义裁定后错误码不冲突。

### T-04 发布基线真实化
- 责任：ops-agent + review-agent
- 内容：对**同一 commit SHA + 锁文件 + 环境快照**，全量跑 lint / typecheck / build / unit / API /
  migration / security / E2E / verify，把真实数字回填 `release-baseline.md` 全部 TBD 字段；
  任一必选失败则整体 `failed` 并单列说明，不得剔 flaky。
- 验收：`release-baseline.md` 状态由 `not_ready` → `ready`，release-gate 结论由「未通过」→「通过候选」。

---

## 二、OPS 层（08-operations-and-deployment/）

> 目标：把 7 份 draft 文档按 ADR-0026/0028 闭环，允许进入候选发布准入。**禁止无恢复证据的生产发布。**

### O-01 迁移 runner 加固
- 文档 ID：`OPS-BILLING-002`（migration-runbook.md）
- 责任：backend-agent
- 内容：把 `api/run-manual-migrations.cjs` 从 `(name, applied_at)` 升级为记录
  checksum / 状态 / 错误 / 耗时 + **单执行者锁** + checksum 报警（对应 ADR-0007/0026）；
  修正 runbook「执行顺序」与「当前未决」矛盾（步骤 2 要求可恢复备份但未决项说待核验）。
- 验收：全新库演练通过；迁移记录含 checksum 与失败即停；open-issues #17 关闭。

### O-02 备份 / 恢复 / 回滚证据
- 责任：ops-agent
- 内容：`backup-and-restore.md`、`process-and-port.md` 补全备份定时、保留(本机 7 天/异地 30 天)、
  月度独立恢复演练的真实记录与最近一次演练证据（ADR-0028）；`migration-runbook` 回滚命令落实。
- 验收：恢复演练证据入库；与 release-baseline 备份恢复字段双向链接。

### O-03 部署检查清单闭环
- 文档 ID：`OPS-RELEASE-001`（deployment-checklist.md）
- 责任：ops-agent + backend-agent
- 内容：逐项打勾并附证据（环境变量/连接性、发布包与 checksum、真实备份与恢复验证、
  Drizzle 0000–0016 + 手写 0017–0032、结构校验、build、健康检查、集成测试、发布后验收）。
- 验收：清单全勾且每项有证据；`deployment-guide.md` / `environment-matrix.md` / `ops-guide.md` 引用的入口一致。

---

## 三、用户体系需求完整性（_recovered/）

### U-01 用户体系 PRD 人工恢复裁决
- 文档 ID：`_recovered/PRD-用户体系-recovered-draft.md`（+notes.md）
- 责任：product-agent + arch-agent（联合人工裁决）
- 现状：原 1326 行中 **610 行 `NEEDS-MANUAL-RECOVERY`** 无法自动逆转（GB18030→UTF-8 乱码）。
  该目录明确非 canonical 需求源；恢复前不得据此生成验收结论。
- 动作：
  1. 派 product/arch 对 610 行逐一人工裁定：恢复正文 / 改用现役 `PRD-用户体系.md` / 明确废弃；
  2. 建立「恢复行清单」登记每行处理结果；
  3. 恢复完成后升为正式 PRD（02-requirements/…），或按 ADR 移入 `_archive/`；
  4. 同步更新 `document-inventory.md` / `document-map.md` / `open-issues.md #12`。
- 验收：`_recovered/` 无 NEEDS-MANUAL-RECOVERY；用户体系 PRD 无内容断层；open-issues #12 关闭。

---

## 四、open-issues #11–20 待裁决（D 系列）

| 项 | 未决内容 | 责任 | 期望裁定 |
|---|---|---|---|
| D-01 (#15) | `INSUFFICIENT_BALANCE` 402 vs 422 双语义 | backend-agent + arch-agent | 拆分 code（如 `PAYMENT_REQUIRED` 402 用于消费）或统一资金操作 HTTP；消除 errors.md `DOC_CODE_GAP` |
| D-02 (#16) | 分页字段 `pagination:{page,pageSize}` vs `items/page/page_size/total` | backend-agent | 收敛为 ADR-0011 契约口径，登记收敛项列表 |
| D-03 (#17) | 迁移 runner 单执行者锁 + checksum 未实现 | backend-agent | 见 O-01 加固 |
| D-04 (#18) | `API-BILLING-002` 文档 ID 冲突 | backend-agent | 统一为唯一 ID，同步 document-inventory |
| D-05 (#19) | 结算/对账权限点 `FINANCE_RECON_APPROVE` 是否独立、查看类挂 `RECONCILIATION_VIEW` 还是 `settlement.*`、`sys.config` 是否加 `finance.rule_config` | arch-agent + backend-agent | 定死权限点与承载，回填 permissions-and-authorization §3/§8 矩阵 |
| D-06 (#20) | `finance` 聚合态 vs canonical 角色枚举 | arch-agent | 明确 `finance` 的正式承载（角色内或权限点语义） |
| D-07 (#11) | supplement/01–09 逐份评审升格 | product-agent + arch-agent | 每份合并到对应正式 SPEC 章节或标 `superseded`；`09-遗漏补丁` A/B/C/D 归属登记到 01/04/05/07 目标文档 |
| D-08 (#12) | 用户体系 610 行恢复 | product-agent + arch-agent | 见 U-01 |
| D-09 (#14) | 充值主题真实测试映射差额 | test-agent + backend-agent | 见 T-02 |
| D-10 (遗留) | `supplement/07-Schema重设计建议` 与现役 schema 的对齐 | arch-agent + backend-agent | 若采纳则出正式 DDL 评审；否则登记 superseded |

---

## 落地进展记录（增量，2026-09）

> 本清单 D 系列为「待办」；下述为已实际落地/已提出裁决的增量。所有涉及行为的裁决标 `【待 BOSS 确认生效】`，
> 未确认前不视为已批准正文，不据此放行生产。

| 项 | 状态 | 落地内容 |
|---|---|---|
| **D-04** | ✅ 已落地（纯文档） | `user/recharge.md`→`API-BILLING-USER-RECHARGE`、`admin/manual-topup.md`→`API-BILLING-MANUAL-TOPUP`；`document-inventory.md` §2.3 补登记；`05-api/README.md` §三标已裁决；`open-issues #18` 关闭 |
| **D-01** | 已提出裁定（待 BOSS 确认） | `errors.md` §4 记录：兼容表面消费新增 `PAYMENT_REQUIRED`=402，平台资金 `INSUFFICIENT_BALANCE`=422；代码 `PaymentRequiredError` 落地待确认（当前 `errors.ts` 未改行为） |
| **D-02** | 已提出裁定（待 BOSS 确认） | `errors.md` §4 记录：响应统一 `items/page/page_size/total`，请求参数 `page/page_size`（`pageSize` v1.x 别名） |
| **D-03** | 已提出裁定（待 BOSS 确认） | `open-issues #17` 改写；runner 加固（O-01）待排期 |
| **D-05** | 已提出裁定（待 BOSS 确认） | `permissions-and-authorization.md` §3/§8 未决项改写为草案结论：`FINANCE_RECON_APPROVE` 独立、查看挂 `RECONCILIATION_VIEW`、风控归 `finance.rule_config` |
| **D-06** | 已提出裁定 + 低风险代码落地（待 BOSS 确认） | `api/src/lib/permissions.ts` 新增 `PERM_PACKAGES.finance`，`ROLE_PERMS.finance` 降为兼容层（行为不变）；API 单测 10/10 通过、api tsc 0 错；`open-issues #20` 改写 |

> **验证**：`scripts/req-completeness-check.cjs` 对 `05-api`、`06-data-and-architecture`、`02-requirements/03-billing-and-finance`、`00-index` 均 `GRADE=A`、0 FAIL；`api/src/lib` typecheck 通过；`require-perm.test.ts` 10/10。

---

## 关闭顺序建议（依赖关系）

```
第 0 步（先裁定，避免返工）: D-01,D-02,D-05,D-06,D-08 五个人工裁决 → 冻结规则
第 1 步（数据/迁移地基）  : D-03/O-01 → 迁移 runner 加固 + 全新库演练
第 2 步（测试层）          : T-01 → T-02 → T-03（依赖 D-01/D-02 错误码与分页裁定）
第 3 步（OPS 闭环）        : O-02 → O-03
第 4 步（发布基线）        : T-04 → release-baseline 置 ready + release-gate 通过
第 5 步（用户体系）        : U-01 人工恢复（可与 0–4 并行）
第 6 步（收尾）            : D-07 supplement 升格 / D-10 schema 对齐 → 全部 open-issue 清零、document-inventory 全绿
```

## 退出验收标准（照抄需求文档完整性审计「复审退出标准」）

1. 文档入口唯一，每份现役需求有 ID、owner、版本、状态、权威来源与替代关系；
2. 五个第一批主题存在无冲突、非占位、`approved` 的 PRD、SPEC、API、状态机、权限/数据、【测试】、【OPS】；
3. PRD→SPEC→状态机→权限→API→数据→【TEST】→【OPS】链接全可解析，每项验收标准映射到实际测试证据；
4. 所有页面/操作入口 SPEC 有定制化 `[?]` 帮助并通过 UI 验收（PRD-refund/settlement 缺的按钮级对照表补上）；
5. 发布基线含真实候选版本、测试结果、最近备份恢复演练记录，整体门禁通过；
6. supplement/sprint-1/_recovered 全部纳入权威清单，无「未被引用的可开发级规格」；
7. 用户体系 PRD 的 NEEDS-MANUAL-RECOVERY 全部经人工仲裁恢复，无内容缺失。