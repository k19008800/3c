# API / DB 文档一致性只读审计

- 审计范围：`docs/**/*.md` 中 PRD、SPEC、ref、ARCH、API 及相关补充文档；事实基线为 `api/src/routes/**`、`api/src/db/schema/**`、`api/src/db/migrations/**`。
- 审计日期：2026-08-29
- 约定：**文档内部矛盾**表示两个文档/同一文档的契约互相冲突；**文档与当前代码不一致**表示文档与当前路由、Schema 或迁移事实不同。未将“规划中的未实现功能”自动判为代码缺陷。
- 行号以 UTF-8 文本当前工作树为准。

## 摘要

发现 11 条可复核问题：

- 文档与当前代码不一致：9 条（其中 P0 2 条、P1 6 条、P2 1 条）。
- 文档内部矛盾：2 条（P1 2 条）。
- 另有文档引用不存在的 `SPEC-§25-渠道增强.md`（`PRD-README.md:53`、`ref-25-vendor-enhance.md:3`、`ref-31-drill-multi-env.md:3`），以及若干把 URL/模板变量误识别为相对链接的文本，不计入本表；前述 SPEC 文件缺失本身计入 F-01。

## 逐条发现

### F-01：权限文档引用不存在的 §25 SPEC

- 类型：文档与仓库事实不一致（引用不存在文件）
- 证据：`docs/PRD-README.md:53` 原文链接 `SPEC-§25-渠道增强.md`；`docs/ref-25-vendor-enhance.md:3` 同样链接该文件。仓库 `docs/` 实际存在 `SPEC-§25-供应商增强.md`，不存在 `SPEC-§25-渠道增强.md`。
- 冲突对象：文档链接 vs `docs/SPEC-§25-供应商增强.md`
- 严重度：P1（评审/实现人员会打开 404 文档，且“渠道/供应商”命名含义不同）
- 建议：统一使用实际文件名，或明确建立兼容别名；同步修复所有引用并做链接检查。

### F-02：公开 API 参考把模型/对话/向量端点写成 `/api/v1/*`

- 类型：文档与当前代码不一致
- 证据：`docs/api-reference.md:91` 原文 `GET /api/v1/models`，`:114` 原文 `POST /api/v1/chat/completions`，`:166` 原文 `POST /api/v1/embeddings`。当前事实分别为 `api/src/routes/openai-compat.ts:552,554` 的 `POST /v1/embeddings` 与别名 `/api/v1/v1/embeddings`，`api/src/routes/chat.ts:656,658` 的 `POST /v1/chat/completions` 与 `/api/v1/v1/chat/completions`，以及 `api/src/routes/openai-compat.ts:865` 的 `GET /v1/models`；没有文档所写的三个单 `/api/v1/*` 路径。
- 冲突对象：API 参考 vs 路由注册
- 严重度：P0（集成请求直接 404 或命中错误路径）
- 建议：将 API reference 的 OpenAI 兼容路径改为 `/v1/*`；若需后台代理路径，明确写 `/api/v1/v1/*`，不要省略第二个 `v1`。

### F-03：API reference 的用户/Key/2FA 路径与当前路由不符

- 类型：文档与当前代码不一致
- 证据：`docs/api-reference.md:188,200,230,236,267,273,283,300,322,340,397,403,420,436,446` 分别写 `PUT /api/v1/me`、`POST /api/v1/me/password`、`/api/v1/api-keys`、`/api/v1/recharge`、`/api/v1/me/balance-logs`、`/api/v1/me/call-logs`、`/api/v1/notifications*`、`/api/v1/me/2fa/*`。当前路由事实包括 `api/src/routes/auth.ts:230` 仅有 `GET /api/v1/me`，`api/src/routes/me.ts:649` 为 `POST /api/v1/me/change-password`，`api/src/routes/apikeys.ts:164-167` 为 `/api/v1/me/api-keys`，`api/src/routes/recharge.ts:109` 为 `/api/v1/me/recharge`，通知为 `api/src/routes/me.ts:522,576,588` 的 `/api/v1/me/notifications*`，2FA 为 `api/src/routes/2fa.ts:163,182,242,306` 的 `/api/v1/auth/2fa/*`。余额/调用日志也未以 reference 所写的独立路径注册。
- 冲突对象：API reference vs `auth.ts`、`me.ts`、`recharge.ts`、`apikeys.ts`、`2fa.ts`
- 严重度：P0（多个核心管理/认证调用会失败）
- 建议：以代码实际路由生成 API reference；对旧兼容路径单独标注“deprecated/alias”，不要把未注册路径列为现行 API。

### F-04：数据字典角色枚举与数据库枚举不一致

- 类型：文档与当前代码/DB Schema 不一致
- 证据：`docs/data-dictionary.md:32-41` 列出 `super_admin, admin, finance_ops, ops, support, auditor, agent, user` 8 个角色；`api/src/db/schema/users.ts:3-9` 的 `user_role` 实际仅为 `customer, agent, sales, admin, super_admin`。
- 冲突对象：数据字典 §1.3 vs `users.role` PostgreSQL enum
- 严重度：P1（权限判断、种子数据和接口字段会产生不可写入/不可解析的角色值）
- 建议：确定单一角色模型；若未来角色是规划项，移出“当前枚举”并标记迁移前置条件，禁止把 `finance_ops` 等写成当前可用值。

### F-05：§30 声称已有动态角色/覆写数据模型，但当前 Schema/路由并未提供该模型

- 类型：文档与当前代码不一致
- 证据：`docs/SPEC-§30-权限管理.md:31-35` 原文称已有 `admin_roles + userRoleAssignments + userPermissionOverrides`，并在 `:171-179` 列出现有/新增的 `PATCH /admin/roles/:id`、`DELETE /admin/roles/:id`、`GET /admin/roles/users/:roleId`、`GET /admin/roles/stats`；`api/src/db/schema/` 无 `admin_roles`、`user_role_assignments`、`user_permission_overrides` 表文件，`api/src/routes/admin-permissions.ts:178-185` 仅注册 `GET /admin/roles` 与 `GET /admin/roles/permissions/list`，没有上述四个端点。
- 冲突对象：SPEC §30 vs Schema 目录与 `admin-permissions.ts`
- 严重度：P1（开发者会按不存在的表/接口实现或误以为功能可用）
- 建议：将 §30 明确改为“规划/待实现”，或补齐独立迁移、Schema、路由后再宣称“已有”。

### F-06：ref-2.1 宣称的权限覆写端点不存在

- 类型：文档与当前代码不一致
- 证据：`docs/ref-2.1-roles-permissions.md:71-75` 列出 `POST /api/v1/admin/users/:id/permissions`；当前 `api/src/routes/admin-permissions.ts:116-133` 只有 `GET /api/v1/admin/users/:id/permissions/detail`，`:136-176` 是角色 assign/remove，没有该 POST 覆写端点。
- 冲突对象：ref-2.1 API 表 vs `admin-permissions.ts`
- 严重度：P1（权限管理客户端调用会得到 404）
- 建议：删除“已实现”语气并标为 planned，或实现后补测试；同时与 SPEC §30 的 PUT/DELETE 覆写方案统一。

### F-07：SPEC §30 与 ref-2.1 对同一权限覆写接口的 HTTP 方法/路径不统一

- 类型：**文档内部矛盾**
- 证据：`docs/SPEC-§30-权限管理.md:283-285` 写 `GET/PUT/DELETE /api/v1/admin/users/:id/permissions`；`docs/ref-2.1-roles-permissions.md:73-75` 写 `GET /api/v1/admin/roles`、`POST /api/v1/admin/users/:id/permissions`（POST 覆写），且未定义同一 GET/PUT/DELETE 契约。
- 冲突对象：SPEC §30 vs ref-2.1
- 严重度：P1（客户端和后端无法确定幂等语义与请求格式）
- 建议：选择一种资源语义（推荐 `PUT` 全量覆写、`DELETE` 清除、`GET` 查询），在 API contract、SPEC、ref 和测试中统一。

### F-08：迁移 SPEC 指向不存在的迁移目录、版本表和执行端点

- 类型：文档与当前代码/迁移事实不一致
- 证据：`docs/SPEC-§13-数据迁移方案.md:51-57` 原文规定脚本放 `api/src/migrations/`、执行后写 `migration_versions`；实际迁移目录为 `api/src/db/migrations/`，当前文件为 `0000` 至 `0032`，且未见 `migration_versions` 表迁移。`docs/SPEC-§13:69-72` 列出 `POST /api/v1/admin/migrations/run`、`rollback`、`GET .../status`、`GET .../validate`；当前 `api/src/routes/admin-ops.ts:441` 仅有 `GET /api/v1/admin/sys/migrations`，没有这些端点。
- 冲突对象：SPEC §13 vs `api/src/db/migrations/**`、`admin-ops.ts`
- 严重度：P1（上线/回滚操作手册会引导到不存在的脚本与 API）
- 建议：区分“应用启动/Drizzle 迁移机制”和“未来迁移管理后台”；文档应引用 `api/src/db/migrations/`、实际 runner/journal，并明确当前没有 run/rollback API。

### F-09：迁移版本登记规则与实际 0031/0032 迁移事实冲突

- 类型：文档与当前代码/迁移事实不一致
- 证据：`docs/SPEC-§13-数据迁移方案.md:56-57` 要求每次迁移有回滚脚本并记录到 `migration_versions`；`api/src/db/migrations/0031_cache_pricing_explicit.sql:9-10` 和 `0032_user_language_i18n.sql:4-5` 明确写“不登记 `meta/_journal.json`”，由 `run-migration-0031.cjs`/`run-migration-0032.cjs` 手工执行；目录中也未见对应 `.cjs` runner（当前工作树仅列出 SQL 和 meta 文件）。
- 冲突对象：SPEC §13 vs 0031/0032 SQL 注释、迁移目录
- 严重度：P1（版本状态不可追踪，且文档宣称的回滚/runner不存在）
- 建议：把实际手工迁移流程写入迁移规范，补充 runner/回滚证据，或按统一 journal 机制重做；不要同时宣称“每次登记版本”和“不登记 journal”。

### F-10：API contract 的实现状态与同一文档的路线清单自相矛盾

- 类型：**文档内部矛盾**
- 证据：`docs/api-contract.md:138-139` 先把渠道/模型大组标为 `⬜`，又称 `/admin/suppliers` 后端已有并“按 `/admin/vendors` 对齐 ✅→（迁移后）”；`docs/api-contract.md:148` 把 `/admin/i18n/entries`、`/admin/webhooks`、`/admin/roles` 标为“待实现”，但当前 `api/src/routes/admin-i18n.ts:129,168,222,280`、`admin-webhooks.ts:76,82,107,149`、`admin-permissions.ts:178` 已注册相应路由。
- 冲突对象：api-contract 的状态清单内部（并与代码事实交叉验证）
- 严重度：P1（验收人员无法判断端点是已实现、别名迁移中还是待开发）
- 建议：状态表增加“现行路径/别名/规划”三态，按路由扫描结果更新；`/admin/vendors` 与 `/admin/suppliers` 的命名迁移单独列兼容期。

### F-11：系统配置参考文档仍以复数表名描述已被替换的 Schema

- 类型：文档与当前代码/DB Schema 不一致
- 证据：`docs/ref-4.8-system-config.md:6` 已明确注记“当前实际实现：`system_config` 单表（`api/src/db/schema/system-config.ts`）”，但同文件 `:29,57,169,333,430,448,479,534,545,560` 仍把物理表写成 `system_configs`，并保留 `export const systemConfigs = pgTable("system_configs", ...)` 的旧示例。当前 `api/src/db/schema/system-config.ts:3-7` 明确表名为单数 `system_config`，列为 `key/value`。
- 冲突对象：`ref-4.8-system-config.md` 自身的“已过时注记”与后续 Schema/API 示例；并与当前 `system-config.ts` 冲突
- 严重度：P2（直接 SQL、迁移和运维查询可能打错表；读者难以判断哪些章节仍可执行）
- 建议：将旧章节整体移入 archive 或逐段改为当前表名；保留历史示例时显式标注“不可执行旧设计”，避免同一文件同时作为现行参考。

## 未计入缺陷但需注意

1. `docs/api-contract.md:50-64` 的 OpenAI/Anthropic 兼容路径与当前路由大体一致（包括 `/api/v1/v1/*` 别名）；不要用 `api-reference.md` 的旧 `/api/v1/chat/*` 反向覆盖它。
2. `docs/data-dictionary.md:437-461` 对 `conversation_context_records` 的主要字段与 `api/src/db/schema/conversation-context.ts:29-68` 基本相符；但字典写 `supplier_key_fp` “sha256 前 32 位”，Schema 注释/长度为 64，建议后续明确截断长度，当前不足以单独判定实现错误。
3. 当前 `users` Schema 已有 `language`（`users.ts:20-21`），与迁移 `0032_user_language_i18n.sql:6` 一致；该条不应再作为迁移缺口。

## 本轮处理记录（2026-08-29 23:45）

- F-02 已处理：`docs/api-reference.md` 的 OpenAI 兼容模型、对话和 Embedding 路径已改为 canonical `/v1/*`，并补充 ADR-0005/0023 的 alias 生命周期说明。
- F-03 已处理其中已核实项：密码、API Key、充值、通知和 2FA 路径已按当前路由更新；余额流水和调用日志仍保留 `待路由核验`，未猜测为正式路径。
- `api-reference.md` 已补充 `review` 状态和 `v1.0.0` 版本；旧错误路径不再作为现行 API。
- F-02：文档侧修订完成，仍需 API 契约测试和运行态验证；F-03：部分修订完成，余额/调用日志待核验。

## 本轮角色与权限文档同步记录（2026-08-29 23:55）

- F-04：`docs/data-dictionary.md` 已按 ADR-0024 修正当前角色枚举；历史/规划角色已明确不属于当前数据库枚举。
- F-05/F-06/F-07：`SPEC-§30-权限管理.md` 与 `ref-2.1-roles-permissions.md` 已将未核验权限覆写接口标记为 `planned`，统一为 GET/PUT/DELETE 资源语义；ref 中 grant/deny 优先级已改为显式 deny 优先。
- `docs/06-data-and-architecture/permissions-and-authorization.md` 与 `docs/00-index/glossary.md` 已同步 canonical 角色和权限计算顺序。
- 当前路由事实仍存在 `admin-permissions.ts` 中的 `finance` 运行时角色样本，且未提供权限覆写接口；该差异保留为 `DOC_CODE_GAP`，本轮不修改源码。
- 文档同步不等于代码实现通过；`finance` 样本、权限覆写缺失和角色管理端点状态仍需后续代码/测试阶段处理。

## 建议修复顺序

1. P0：先修 `api-reference.md` 的 OpenAI 端点与核心用户/Key/2FA 路径，避免外部集成直接 404。
2. P1：冻结角色模型与权限覆写 API 的单一契约；随后修正 §13 迁移目录/版本登记/runner 描述。
3. P1/P2：统一渠道命名和 `system_config` 表名，并加入自动链接检查、文档端点扫描和 Schema/迁移字段校验。
