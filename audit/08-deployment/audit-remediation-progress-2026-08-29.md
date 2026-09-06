# 审计产物处理进度报告

- 日期：2026-08-29
- 时间：23:40
- 性质：只读审计产物整理；未修改业务代码、部署配置或 Git 历史。

## 已处理

### user-agent 原子清单

- 文件：`audit/01-requirements/user-agent-atomic.csv`
- 原始条数：104
- `req_id` 重复：0
- 字段格式：统一字段保持不变
- `? Phase 2` 占位：104 → 0
- `expected_evidence=MISSING`：104

说明：将无法确认的证据要求明确改为 `MISSING`，没有伪造实现证据。因此该清单完成“占位清理”，但证据门禁仍未通过，后续必须补充真实文件/行号/测试证据。

### API reference 路径同步

- 文件：`docs/api-reference.md`
- 已按 ADR-0005/0023 修正已核实的 OpenAI、用户、API Key、充值、通知和 2FA 路径；
- OpenAI canonical 路径统一为 `/v1/models`、`/v1/chat/completions`、`/v1/embeddings`；
- 用户/Key/充值/通知/2FA 路径按当前已核实路由更新；API Key 更新方法修正为 `PATCH`；
- 余额流水和调用记录仍明确标记“待路由核验”，未猜测为正式接口；
- 文档增加 `review` 状态、`v1.0.0` 版本和 alias 生命周期说明；
- 本项文档修订完成，仍需 API 契约测试及剩余路径逐项核验。

### 迁移、备份与发布门禁文档同步

- `deploy/deployment-checklist.md` 与 `deploy/deployment-runbook.md` 已统一引用唯一 `release-baseline.md`，历史 1159/1132/808 不再作为正式基线。
- 清单、Runbook 和迁移 SPEC 已统一手写迁移入口为 `api/` 下 `pnpm run db:migrate:manual`；未确认 runner 标记为禁止使用。
- Runbook 已明确生产 `.env`、权限和连通性检查必须先于 `deploy.sh`；custom dump 恢复统一使用 `pg_restore`。
- 迁移 SPEC 已取消未裁决固定批大小和未经验证自动回滚表述。
- 实际 `deploy.sh` 的 preflight、备份轮转、异地副本、恢复演练和真实发布基线仍为 DOC_CODE_GAP；本轮未修改脚本或运维环境。

### 角色与权限文档同步

- `docs/data-dictionary.md` 已同步 canonical 角色枚举；历史/规划角色明确不属于当前数据库枚举。
- `docs/SPEC-§30-权限管理.md` 与 `docs/ref-2.1-roles-permissions.md` 已将未核验权限覆写接口标记为 `planned`，并统一 GET/PUT/DELETE 资源语义。
- 权限优先级已统一为显式 deny → 管理员强制策略 → 显式 grant → 角色权限并集 → 默认最小权限。
- `finance` 运行时角色样本仍是 DOC_CODE_GAP，本轮不修改源码。

### ADR / 索引闭环

- ADR：`ADR-0001` 至 `ADR-0029`，连续存在；
- `decision-register.md`：29 条，均有对应 ADR；
- `open-issues.md`：10 项均已解决并关联 ADR-0020 至 ADR-0029；
- ADR 元数据门禁：通过；
- 新正式文档链接检查：通过（新增范围内无缺链）。

## 尚未处理

- 全仓旧文档链接扫描仍发现 46 个历史/模板/乱码链接问题；本轮已处理 API reference 中已核实的路径，剩余历史/模板/乱码引用不做猜测性修复；
- 15 份逻辑审计仍有模板化断言、`unconfirmed` 证据和 source_quote 不匹配；
- 首批页面审计仍缺少真实源码、API、数据库、权限、测试和运行态证据；
- 旧正文尚未完成 ADR 逐条同步和 `superseded` 标记；`docs/api-reference.md` 已完成本轮已核实 API 路径同步，仍需契约测试和剩余路径逐项核验；
- `release-baseline.md` 仍为 `not_ready`，未生成真实发布基线。

## 结论

本轮“可安全处理的审计产物清理”已完成；不能仅凭占位清理宣布审计通过。下一步应重做逻辑审计证据，或在 BOSS 明确授权后开展旧正文逐条迁移；业务代码、部署、提交和推送继续禁止。
