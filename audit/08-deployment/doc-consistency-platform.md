# 文档逻辑一致性审计：部署与平台能力

> 范围：指定 PRD/SPEC 与 `deploy/` 检查清单、Runbook、脚本、PM2 配置。仅做只读审计；未修改业务源码和需求文档。
>
> 严重度：P0=阻断上线/高概率安全或数据事故；P1=关键流程不可执行或验收失真；P2=一般一致性/可维护性问题。

## 发现项

### DC-001 — 可用性文档声称 cluster，实际部署为单实例 fork
- **文件:行号**：`docs/SPEC-§7-非功能需求.md:44`；`deploy/ecosystem.config.js:3,10-11`；`deploy/deployment-checklist.md:45`
- **原文摘录 A**："可用性：单机部署，PM2 cluster 自动重启，渠道故障自动熔断切换"。
- **原文摘录 B**："无需独立 worker 进程 → 单实例部署避免 OOM"；`instances: 1`、`exec_mode: 'fork'`；清单写"API + Portal 单实例"。
- **矛盾说明**：PM2 cluster 与单实例 fork 是不同的并发/故障隔离模型。当前配置没有 cluster 多进程；"自动重启"只能覆盖进程退出，不能提供 cluster 故障冗余。NFR 的可用性能力和实际验收/配置不一致。
- **严重度**：P1
- **建议裁决**：以当前 1.7G 主机的单实例 fork 为准，NFR 改成"单机、PM2 fork 自动重启；无进程级冗余"，并明确可用性目标、维护窗口和故障切换边界；若要保留 cluster，必须先给出内存预算和可执行的实例数、压测与验收标准。

### DC-002 — 测试基线及闸门内容互相过期
- **文件:行号**：`deploy/deployment-checklist.md:5,60`；`deploy/deployment-runbook.md:4,24`
- **原文摘录 A**："全量单测通过（1159/1159，77 文件——2026-08-29 最新基线）"、"基线已更新（2026-08-29）至 1159/1159"。
- **原文摘录 B**："单测 1132（2026-08 ... 最新基线，原 808）"；闸门内容仍为 `vitest-808`。
- **矛盾说明**：同一部署闸门同时要求/记录 1159、1132、808 三个基线，没有唯一可验证的通过条件；Runbook 的 `.deploy-gate-approved` 示例即使按其文字执行，也不能证明清单要求已满足。
- **严重度**：P0
- **建议裁决**：由发布负责人确定一个带日期、提交 SHA、命令和测试总数的单一基线；同步清单、Runbook 闸门示例和实际标记校验，禁止脚本只检查一个无内容/无 SHA 的标记文件。

### DC-003 — Runbook 先执行部署脚本，后配置 `.env`，但脚本要求 `.env` 才能继续
- **文件:行号**：`deploy/deployment-runbook.md:61-73`；`deploy/deploy.sh:24-39,51-57`
- **原文摘录 A**：阶段 2："一键部署（安装→构建→备份→迁移→PM2）"，执行 `bash deploy/deploy.sh main`；阶段 3 才"生成生产密钥...复制到 api/.env"。
- **原文摘录 B**：脚本在安装/构建前检查 `if [ ! -f "$API_DIR/.env" ]; then ... exit 1`，随后 source `.env`，再执行 `pg_dump` 和迁移。
- **矛盾说明**：按 Runbook 从空白主机执行必然在阶段 2 因缺少 `api/.env` 退出，无法到达阶段 3；即使已有空文件，也可能因 DATABASE_URL/REDIS_URL 等占位符导致备份或迁移失败。
- **严重度**：P0
- **建议裁决**：将生产密钥/连接信息配置、权限校验放在 deploy.sh 之前；或让脚本接收已生成配置并明确 preflight 检查。Runbook 必须先完成 `.env`、建库、Redis 密码和连通性验证，再调用脚本。

### DC-004 — 手写迁移命令名称不一致，且迁移规范要求与部署实现未闭环
- **文件:行号**：`deploy/deployment-checklist.md:25`；`deploy/deployment-runbook.md:61`；`deploy/deploy.sh:55-57`；`docs/SPEC-§13-数据迁移方案.md:47-57`
- **原文摘录 A**：清单要求 `node api/run-manual-migrations.cjs`（0017-0032）；Runbook称一键部署包含迁移。
- **原文摘录 B**：脚本实际执行 `(cd "$API_DIR" && pnpm run db:migrate:manual)`。
- **矛盾说明**：同一流程的手写迁移入口不同，无法确认哪个文件/包脚本是真实入口；SPEC 还要求每次迁移有回滚脚本、版本写入 `migration_versions`，部署步骤没有验证这些条件。清单命令若文件不存在会直接阻断，若存在则可能与 pnpm script 走不同逻辑。
- **严重度**：P1
- **建议裁决**：选定一个唯一入口并在三处统一；在迁移前后明确锁/单执行者、版本表、前置备份、校验和回滚脚本验证；将实际命令加入 CI/部署闸门。

### DC-005 — 迁移批大小定义不一致，且“自动回滚”与“保留部分批次”缺少裁决
- **文件:行号**：`docs/SPEC-§13-数据迁移方案.md:47-49,115-126`
- **原文摘录 A**："大表分批迁移（每批 1000 条）"。
- **原文摘录 B**：MIG-011："单次迁移记录数超过 100 万条...每批 10000 条"；MIG-003：超窗口"保留已完成批次...下一个维护窗口继续"；MIG-002：校验失败"自动回滚已迁移数据"。
- **矛盾说明**：同一 SPEC 未定义 1000/10000 的优先级、阈值是否含边界、断点状态与回滚范围。超时后的部分数据若下一窗口续传，而校验失败自动回滚，状态机和已提交批次处理没有定义，无法安全实现幂等续传。
- **严重度**：P1
- **建议裁决**：明确批大小参数化规则及优先级；定义状态机（paused/partial/validated/rollback_pending 等）、批次提交边界、校验失败是整任务回滚还是仅差异修复，并规定源快照/增量追平期间的写入策略。

### DC-006 — 错误码引用了未定义码，且统一响应无法定位 retry_after
- **文件:行号**：`docs/SPEC-§14-错误码规范.md:29-64,113-117`；`docs/SPEC-§30-权限管理.md:544`；`docs/SPEC-§32-第三方集成与SSO.md:363-366`
- **原文摘录 A**：§14“完整错误码列表”列出 `invalid_api_key` 至 `internal_error` 共 11 项，并称错误码定义在统一枚举中。
- **原文摘录 B**：权限规范要求返回 `ROLE_DEPTH_EXCEEDED`；SSO 规范要求返回 `redirect_uri_mismatch`；错误聚合还规定 `UNKNOWN` 类别，但三者均不在完整列表中。
- **矛盾说明**：实现者无法判断这些是正式公共码、内部码还是示例码；客户端也无法按“完整列表”覆盖处理。另 §14.1要求限流错误附 `retry_after`，JSON 示例只定义 `error.code/message/details`，未规定字段位于 `error.retry_after`、`details.retry_after` 还是顶层。
- **严重度**：P1
- **建议裁决**：建立唯一错误码登记表，补齐上述公共码并定义来源/HTTP 状态/可重试性；固定响应 schema（推荐 `error.retry_after`）并为 OpenAI/Anthropic 兼容层分别规定错误映射。

### DC-007 — 权限角色命名/标签及模块适用角色不一致
- **文件:行号**：`docs/SPEC-§30-权限管理.md:14,64-70,430-446`
- **原文摘录 A**：角色列表显示 `admin` 标签“超级管理员”，且为“系统内置”；模块适用角色是“管理员（super_admin）”。
- **原文摘录 B**：预设角色表写 `super_admin`=“全部权限、最高权限、不可编辑”，`admin`=“全部权限（不含角色管理）”；默认数组同时创建 `super_admin` 和 `admin`。
- **矛盾说明**：UI 示例把 admin 当超级管理员，但权限模型又把 super_admin 当最高权限；管理员能否进入本模块、能否执行各 API 也未按具体权限位统一，可能造成错误授权或无法运维。
- **严重度**：P0
- **建议裁决**：固定 canonical role key/label：`super_admin` 仅最高权限，`admin` 为不含 ROLE_MANAGE 的管理员；修正 UI、适用角色、API 鉴权矩阵，并补充“最后一个 super_admin 不可删除/降权”等保护规则。

### DC-008 — 权限合并的“并集”与拒绝覆写/最小权限规则冲突
- **文件:行号**：`docs/SPEC-§30-权限管理.md:31,267-275,378-398,540-547`
- **原文摘录 A**：覆写界面同时提供“授予权限/拒绝权限”。
- **原文摘录 B**：PERM-004规定多个模板“取并集”；“取差集时遵循最小权限原则”，而30.4又说管理员强制覆盖与用户侧配置冲突时取更严格一方。
- **矛盾说明**：未定义 grant/deny 的优先级、角色授予与显式拒绝谁优先、模板并集如何与“更严格”计算。不同服务可能得出不同 effective 权限，尤其会影响高风险资金/备份操作。
- **严重度**：P0
- **建议裁决**：明确确定性公式（建议显式 deny > grant，强制管理员策略 > 用户策略，最终按 deny 优先），在 DB/API/缓存/前端展示同一结果，并增加组合矩阵测试。

### DC-009 — SSO 回调域名不在部署域名/反向代理范围内，且认证载体与 NFR 不一致
- **文件:行号**：`docs/SPEC-§32-第三方集成与SSO.md:182-185,216,236-241`；`deploy/deployment-checklist.md:37-41`；`docs/SPEC-§7-非功能需求.md:46`
- **原文摘录 A**：SSO Redirect URI 为 `https://admin.unmisa.com/auth/sso/callback`，成功后“返回 JWT token”。
- **原文摘录 B**：部署只配置 `api.unmisa.com` 与 `unmisa.com` 的 DNS/vhost；NFR 安全要求“HTTP Only Cookie 鉴权”。
- **矛盾说明**：`admin.unmisa.com` 没有对应 DNS/vhost/SSL/PM2 路由，回调无法按部署方案到达；JWT 直接返回也与 HTTP-only Cookie 鉴权目标冲突，存在 token 暴露/前端存储歧义。
- **严重度**：P0
- **建议裁决**：统一 SSO 回调为已部署的 API/Portal 域名并补齐 exact redirect 配置；明确只通过 Secure/HttpOnly/SameSite Cookie 或一次性 code 换取会话，禁止把长期 JWT 放 URL/页面正文。

### DC-010 — Webhook 失败语义把出站投递与入站签名校验混为一谈
- **文件:行号**：`docs/SPEC-§32-第三方集成与SSO.md:43-49,137-151,336-343`
- **原文摘录 A**：模块定义“全局 Webhook 出站”，平台向外部 URL 推送，并规定失败 3 次、连续 10 次暂停。
- **原文摘录 B**：SSO-005写“Webhook 回调请求签名验证失败”，连续 5 次锁定“Webhook 目标 URL”。
- **矛盾说明**：出站 Webhook 是平台验证自身发送签名/接收 HTTP 响应，不存在平台接收目标方回调签名这一入站场景；5 次锁定与出站连续 10 次暂停也冲突。验收无法判断应测试哪条链路。
- **严重度**：P1
- **建议裁决**：拆分 outbound delivery 与 inbound webhook 两个能力；出站只定义签名生成、超时、HTTP 状态、重试/暂停和死信；若确需入站，另定义 endpoint、签名头、重放保护和锁定规则。

### DC-011 — 备份保留策略未被部署脚本实现
- **文件:行号**：`deploy/deployment-checklist.md:27`；`deploy/deploy.sh:47-52`
- **原文摘录 A**：清单要求“每日 04:00，7 天”保留策略。
- **原文摘录 B**：脚本仅 `mkdir -p` 后生成一次带时间戳的 `pg_dump --format=custom`，没有定时任务、轮转或删除逻辑。
- **矛盾说明**：清单验收要求的备份策略不会因执行 deploy.sh 自动成立；没有说明由宝塔/cron/systemd 哪一方负责，且未验证备份可恢复性。
- **严重度**：P1
- **建议裁决**：明确唯一责任组件，增加既有定时任务检查/安装、7 天轮转、远端/异地副本和定期恢复演练；部署闸门应验证最近备份时间、大小及可恢复性。

### DC-012 — 回滚命令与备份格式不兼容
- **文件:行号**：`deploy/deploy.sh:50-51`；`deploy/deployment-runbook.md:147-154`
- **原文摘录 A**：脚本以 `pg_dump --format=custom` 生成 `.dump`。
- **原文摘录 B**：回滚预案写“迁移失败：`psql -f` 恢复，或重建库”。
- **矛盾说明**：`psql -f` 不能直接恢复 PostgreSQL custom archive；按预案操作会失败。并且“迁移失败”发生在应用已构建但 PM2 尚未 reload 的窗口，数据库恢复与应用版本回退的先后关系也未规定。
- **严重度**：P0
- **建议裁决**：custom dump 使用 `pg_restore`（必要时先建库/清理对象），并记录精确命令、权限与目标库；定义迁移失败、应用失败、数据校验失败三类回滚顺序，包含停止写入/版本兼容检查和恢复后验证。

## 本轮文档同步记录（2026-08-30 00:10）

- DC-002：`deploy/deployment-checklist.md` 与 `deploy/deployment-runbook.md` 已改为引用唯一 `release-baseline.md`，历史 1159/1132/808 不再作为正式基线。
- DC-003：Runbook 已调整为生产 `.env`、权限和连通性检查先于 `deploy.sh`；`deploy.sh` 本身仍保留现状，差异记录为 DOC_CODE_GAP，不修改脚本。
- DC-004：清单、Runbook 和 SPEC 已统一手写迁移入口为 `api/` 下 `pnpm run db:migrate:manual`；未确认命令标记为禁止使用。
- DC-005：SPEC 已取消未裁决的固定 1000/10000 批大小和未经验证自动回滚表述，改为任务显式登记、批次边界和失败即停。
- DC-012：Runbook 已将 custom dump 恢复工具统一为 `pg_restore`；`deploy.sh` 仍由后续代码/运维阶段单独处理，当前不修改。
- DC-011：备份定时、保留、异地副本和恢复演练已写入现行文档，但实际任务与演练证据尚不存在，仍为 DOC_CODE_GAP。

## 本轮文档同步记录（2026-08-30 00:10）

- DC-002：`deploy/deployment-checklist.md` 与 `deploy/deployment-runbook.md` 已改为引用唯一 `release-baseline.md`，历史 1159/1132/808 不再作为正式基线。
- DC-003：Runbook 已调整为生产 `.env`、权限和连通性检查先于 `deploy.sh`；`deploy.sh` 本身仍保留现状，差异记录为 DOC_CODE_GAP，本轮不修改脚本。
- DC-004：清单、Runbook 和 SPEC 已统一手写迁移入口为 `api/` 下 `pnpm run db:migrate:manual`；未确认命令标记为禁止使用。
- DC-005：SPEC 已取消未裁决的固定 1000/10000 批大小和未经验证自动回滚表述，改为任务显式登记、批次边界和失败即停。
- DC-012：Runbook 已将 custom dump 恢复工具统一为 `pg_restore`；`deploy.sh` 仍由后续代码/运维阶段单独处理，当前不修改。
- DC-011：备份定时、保留、异地副本和恢复演练已写入现行文档，但实际任务与演练证据尚不存在，仍为 DOC_CODE_GAP。

## 总体裁决建议

上线前至少阻断修复 DC-002、DC-003、DC-006、DC-007、DC-008、DC-009、DC-012；DC-001、DC-004、DC-005、DC-010、DC-011 在部署闸门前完成统一口径。当前文档不能直接支持一次可重复、可验证的生产部署：尤其是 Runbook 的配置顺序会在空白主机上必然失败，测试闸门也无法确定唯一基线。
