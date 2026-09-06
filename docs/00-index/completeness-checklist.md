# 需求文档完整性核对规范（可复用）

- 文档 ID：INDEX-CHECKLIST-001
- 状态：approved（本规范自身即开发准入判定的执行依据）
- 生效版本：v1.0.0
- 建立日期：2026-08-30
- 用途：**任何模块进入开发前，先跑本核对**，确认需求文档完整、可作开发/验收依据。是"确保可以拿到需求文档开发出系统"的同一把尺子。

> 权威依据：`docs/00-index/README.md`（唯一准入入口）、`document-inventory.md`、`document-map.md`、ADR-0015（文档生命周期）、ADR-0016（第一批范围）、ADR-0019（命名/版本/状态）、ADR-0018（文档集）。
> 自动化：运行 `node scripts/req-completeness-check.cjs <模块目录>` 可自动执行下面大部分检查；本规范是人工复核的补充清单。

---

## 国红线（违反即不得进入开发）

1. **准入状态**：模块相关文档（PRD/SPEC/API/数据/测试/OPS）必须为 `approved`，ADR 为 `accepted`。任一关键文档为 `draft/review/superseded` → **不通过**。
2. **强制性 `[?]` 帮助**：每个功能页标题旁与每个操作按钮旁都必须有 `[?]` 帮助说明（AGENTS.md 不可降级原则）。SPEC 底部必须有**定制化**的 `[?] 页面帮助与按钮级帮助对照表`，不得是通用占位符。
3. **事实来源**：正文必须来自真实来源/ADR，不得编造。来源缺失处必须显式标注 `【待人工裁决】`，不得靠"待补充"蒙混。
4. **无空壳/占位**：不得残留 `待补充/待迁移/TBD/待建立真实/待从…拆分` 等空壳标记作为正文实质性内容（可存在"待建立真实测试映射"之类的到期项，但必须登记后续可执行）。

## 可追溯链（一条都不能断）

> 依据 ADR-0016：必须打通 `PRD → SPEC → 状态机 → 权限 → API → 数据库 → TEST → OPS`。

对每个主题（如充值/人工上账/调账/退款红冲/结算对账），必须有并可点击跳转：

| 环节 | 典型文件 | 存在 | approved | 与上一环节引用正确 |
|---|---|---|---|---|
| PRD | `02-requirements/…/<主题>.md` | ☐ | ☐ | ☐ |
| SPEC | `03-functional-spec/…/<主题>.md` | ☐ | ☐ | PRD 生效版本匹配 ☐ |
| 状态机 | `06-data-and-architecture/state-machines/<主题>.md` | ☐ | ☐ | 被 SPEC §状态机 引用 ☐ |
| 权限 | 对应权限专章 或 ADR-0004 | ☐ | ☐ | 被 PRD/SPEC §权限 引用 ☐ |
| API | `05-api/…/*.md` | ☐ | ☐ | endpoint 被 SPEC §API 引用 ☐ |
| 数据库/数据 | `06-data-and-architecture/*` 数据字典/事务 | ☐ | ☐ | schema 与状态机/金额精度一致 ☐ |
| 测试 | `07-quality-and-acceptance/*` | ☐ | ☐ | 有真实测试用例/验收映射 ☐ |
| OPS | `08-operations-and-deployment/*` | ☐ | ☐ | 迁移/部署/回滚 ☐ |

## 一致性核对（跨文档）

- [ ] 金额上限、精度、单位、枚举（错误码/状态）在 PRD/SPEC/API/数据字典四处一致；否则标 `DOC_CODE_GAP`。
- [ ] 引用路径为相对链接且可解析（无 `../../../../` 越级断链）。
- [ ] 未决事项引用 `00-index/open-issues.md` 中**状态为已解决**的项；未解决项不得靠代码现状镇化。
- [ ] 语义化版本：`vMAJOR.MINOR.PATCH`；`approved` 时 ≥ `v1.0.0`。
- [ ] 新增/删除文档已在 `document-inventory.md` 登记。

## 运行方式

```bash
cd C:\Users\ZH\.openclaw\workspace\3cloud
node scripts/req-completeness-check.cjs docs/02-requirements/03-billing-and-finance
node scripts/req-completeness-check.cjs docs/03-functional-spec/03-billing-and-finance
node scripts/req-completeness-check.cjs docs/06-data-and-architecture
node scripts/req-completeness-check.cjs docs/05-api
```

脚本返回 `GRADE`（A/B/C/F）与逐项 `PASS/FAIL` 明细。**有任一 FAIL → 不满足"可开发"准入。**

## 通过判据

- 自动化脚本无 `FAIL`（或仅剩已登记待办）。
- 人工复核四国红线全部勾选。
- 可追溯链 8 环节逐项全勾。

满足 → 该模块需求文档"完整、可获得、可开发"。不满足 → 按 `open-issues.md` 与 `document-inventory.md` 登记缺口并逐个关闭后复核。