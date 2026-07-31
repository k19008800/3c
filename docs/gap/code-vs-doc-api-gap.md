# 3cloud 代码 vs 文档 API 差距分析报告

> **审计日期**：2026-07-31
> **审计方法**：自动化扫描 + 人工核实
> - 代码侧：`api/src/routes/**` 全量路由提取（Fastify `app.method('path')` 模式），共 **828 条**
> - 文档侧：`docs/**/*.md` 全量 API 定义提取（`METHOD /api/v1/...` 模式，排除 `_archive/`、`sprint-1/` 归档），共 **834 条**
> - 归一化：`:param` → `{param}` 后双向匹配
> - 对疑似缺口逐项抽查代码目录确认

---

## 总体结论

| 维度 | 数量 | 说明 |
|------|------|------|
| 文档有、代码未实现（真缺口） | ~**90 项**（有效） | 315 项原始差异中排除路径写法差异、规划未排期模块后 |
| 代码有、文档未定义 | **684 项** | 大量为文档未覆盖的 CRUD 细节（DELETE/PATCH/GET 单条等） |
| 双向匹配 | 大量 | 核心模块（用户/代理/充值/计费/工单/公告等）匹配良好 |

**核心发现**：代码实现**远超**文档覆盖——大部分"代码有文档无"是文档只写了主接口、未写辅助接口；真正的**产品功能缺口**集中在 11 个模块，其中 6 个模块（§21/§22/§23/§28/§31/§32）代码侧整体或大部分未落地。

---

## 一、文档有、代码未实现（真缺口，按模块归类）

### 1. §21 Portal 门户增强 —— 整体未实现 ⚠️ 最大缺口

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET/POST /api/v1/admin/blog` + `PUT/DELETE /api/v1/admin/blog/:id` + `publish/unpublish` | Blog/Changelog 管理 | ❌ 无 |
| `GET /api/v1/public/blog` + `/:slug` + `/rss` | 公开博客 | ❌ 无 |
| `GET/POST /api/v1/admin/help` + `/:id` + `categories` + `stats` | 帮助中心管理 | ❌ 无 |
| `GET /api/v1/public/help` + `/articles` + `/:slug` + `feedback` | 公开帮助中心 | ❌ 无 |
| `GET/POST /api/v1/admin/contact` + `/:id` + `note/status` + `export` | 销售线索管理 | ❌ 无 |
| `POST /api/v1/public/contact` | 联系表单提交 | ❌ 无 |
| `GET /api/v1/public/pricing` / `GET /api/v1/public/models` | 公开定价/模型目录 | ❌ 无（有 `site-config/public` 但非专用接口） |
| `POST /api/v1/admin/notifications/broadcast` | 产品更新通知 | ❌ 无（仅 `announcement` 变体） |

> **注**：SPEC-§21 状态标注"不进入开发队列"，此缺口为**规划内未开发**，非遗漏。建议明确排期或降级。

### 2. §22 用户端体验增强（第二批）—— 大部分未实现

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET/POST /api/v1/me/webhooks` + `/:id` + `logs` + `regenerate-secret` + `test` | 用户端 Webhook 配置 | ❌ 无（§32.1 管理端 Webhook 有） |
| `GET /api/v1/me/onboarding/status` + `POST complete/reset/skip/step` | Onboarding 向导 | ❌ 无 |
| `GET /api/v1/me/api-keys/:id/logs` + `POST batch-delete/disable/enable` | Key 操作日志/批量操作 | ❌ 无（有 `api-keys/:id/usage` 等） |
| `POST /api/v1/me/logs/batch-export` + `GET /api/v1/me/logs/recent` | 批量导出/最近日志 | ❌ 无 |
| `GET /api/v1/me/referral/info` + `/history` + `POST claim` | 用户邀请机制 | ❌ 无 |
| `GET /api/v1/me/preferences/notifications` + `PUT` + `POST reset` | 通知偏好增强 | ⚠️ 有 `notifications/preferences` 旧接口，路径不同 |
| `POST /api/v1/me/stats/export` + `GET /api/v1/me/stats/export/:taskId/status` | 用量导出任务 | ⚠️ 有 `GET /api/v1/me/stats/export`（非任务式） |
| `GET /api/v1/auth/oauth/:provider/url` + `callback` + `github/url` + `wechat/qrcode` | 第三方 OAuth 登录 | ⚠️ 有微信登录（`auth/wechat/*`），缺 GitHub 等通用 OAuth |
| `GET /api/v1/me/oauth/connections` + `POST bind` + `DELETE unbind` | OAuth 绑定管理 | ❌ 无 |

### 3. §23 系统级能力增强 —— 全局搜索未实现

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET /api/v1/admin/search` | 全局搜索（Cmd+K） | ❌ 无 |
| `GET /api/v1/me/operation-logs` | 用户操作日志 | ✅ 已有（匹配正常） |
| `GET /api/v1/admin/audit-logs` + `/:id` + `export` | 审计日志 | ✅ 已有 |

### 4. §24 代理商增强 —— 部分未实现

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET/PUT /api/v1/admin/agent-ranking-config` | 排行榜配置 | ❌ 无 |
| `GET /api/v1/agent/ranking` | 代理排行榜 | ❌ 无 |
| `GET /api/v1/agent/materials` + `POST /api/v1/admin/materials` | 素材库 | ❌ 无 |
| `GET /api/v1/agent/alerts/clients` | 客户预警（客户端列表） | ⚠️ 有 `agent/alerts`，缺 `clients` 子路由 |
| `PUT /api/v1/agent/alerts/:id/dismiss` | 预警处理 | ✅ 已有 |

### 5. §25 供应商增强 —— 路径写法差异为主 ⚠️ 需对齐

| 文档定义 | 代码实际 | 结论 |
|---------|---------|------|
| `GET /api/v1/vendor/settlement/current` / `history` / `requests` / `:id/detail` / `:id/export` | `GET /api/v1/vendor/settlements` + `/:id` + `confirm` | ⚠️ **路径不一致**：文档用单数 `settlement`，代码用复数 `settlements` |
| `POST /api/v1/vendor/settlement/request` | `POST /api/v1/vendor/self-settlement/apply` | ⚠️ 路径不一致 |
| `GET /api/v1/vendor/notifications` + `/:id` + `PUT :id/read` | `GET /api/v1/vendor/announcements` + `POST :id/read` | ⚠️ 概念差异：文档叫 notifications，代码叫 announcements |
| `GET /api/v1/admin/vendor/settlement/requests` + `POST :id/approve` + `reject` | 无管理端结算审核接口 | ❌ 缺管理端审核 |

### 6. §27 在线客服 —— 小缺口

| API | 说明 | 代码状态 |
|-----|------|---------|
| `POST /api/v1/admin/chat/sessions/:id/transfer` | 会话转派 | ❌ 无（有 accept/close，缺 transfer） |
| `GET /api/v1/admin/support/audit-logs/:id` | 审计详情 | ❌ 无（有列表，缺详情） |

### 7. §28 智能客服与测试工具 —— 整体未实现 ⚠️

| API | 说明 | 代码状态 |
|-----|------|---------|
| `POST /api/v1/admin/support/simulate-call` | 模拟调用 | ❌ 无 |
| `POST /api/v1/admin/support/test-key` + `GET test-keys` + `POST :id/revoke` | 临时测试 Key | ❌ 无 |
| `POST /api/v1/admin/support/user-perspective/enter` + `exit` | 用户视角查看 | ❌ 无 |
| `GET /api/v1/admin/support/assist/diagnose/:userId` + `POST intent` | AI 诊断/意图识别 | ✅ 已有（support-assist） |

### 8. §29 资金与对账 —— 已全部实现 ✅（2026-07-31）

> 2026-07-31 完成全部缺口实现，详见下方更新记录。

**已完成实现：**
- `GET /api/v1/admin/finance/ledger` + `/:serialNo` + `/summary` + `/export` + `POST /adjust`（§29.1 资金流水）
- `GET /api/v1/admin/finance/accounts` + `/trend`（§29.2 资金账户）
- `GET /api/v1/admin/finance/close/status` + `POST /execute` + `GET /history` + `POST /:period/unlock`（§29.4 财务锁账）
- `POST /api/v1/admin/finance/reports/generate` + `GET /schedules` + `POST /schedule`（§29.5 资金报表）
- `GET /api/v1/admin/finance/overdue/list` + `/stats` + `POST /:id/waive` + `/:id/suspend` + `/notify` + `/refresh`（§29.6 逾期管理）
- 新增数据表：`finance_close_records`、`credit_accounts`、`overdue_records`
- 新增服务：`finance-ledger.ts`、`finance-accounts.ts`、`finance-close.ts`、`finance-reports.ts`、`finance-overdue.ts`
- §29.3 对账差异已有 `reconciliation` 系列接口；§29.7 汇率已有

**遗留：** §29.6 授信账户（credit_accounts）目前为空白业务，需前端页面配合录入授信额度后生效；报表定时推送的 cron 触发执行器待接入调度器。

### 9. §30 权限管理 —— 小缺口

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET /api/v1/admin/roles/stats` | 角色统计 | ❌ 无 |
| `GET /api/v1/admin/users/:id/permissions/detail` | 权限详情 | ❌ 无（有 permissions 主接口） |
| `GET /api/v1/me/permissions` + `/check` | 用户权限一览 | ❌ 无（有 admin 侧） |

### 10. §31 供应商故障演练与多环境 —— 大部分未实现 ⚠️

| API | 说明 | 代码状态 |
|-----|------|---------|
| `POST /api/v1/admin/drills/vendor-failure/start` + `stop` + `GET status` + `history` + `report/:id` | 故障演练 | ⚠️ 有 `/admin/drills/start` 等（缺 `vendor-failure` 中间段），路径需对齐 |
| `GET /api/v1/admin/environments` + `/:name/config` + `POST compare` + `import` + `export` + `sandbox/preview` | 多环境配置 | ⚠️ 有 `environments` 主接口 + `diff` + `sync`，缺 `:name/config`、`compare`、`sandbox/preview`、`import/export` |

### 11. §32 第三方集成与 SSO —— SSO 登录链路未实现 ⚠️

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET /api/v1/auth/sso/:provider` + `/:provider/callback` | SSO 登录跳转 | ❌ 无（仅有管理端 `admin/settings/sso` 配置） |
| `GET/POST/PUT/DELETE /api/v1/admin/webhooks` + `/:id` + `logs` + `test` | 全局 Webhook | ✅ 已有 |
| `GET/PUT /api/v1/admin/settings/sso` + `POST test` | SSO 配置 | ✅ 已有 |
| `GET/PUT /api/v1/admin/settings/corp-login/:provider` | 企业通讯录登录配置 | ✅ 已有 |

### 12. §33 合规法务 —— 基本已实现 ✅

| API | 说明 | 代码状态 |
|-----|------|---------|
| `GET/POST /api/v1/admin/settings/privacy-policy/versions` + `PUT :id` + `POST :id/publish` | 隐私政策 | ✅ 已有 |
| `GET/POST /api/v1/admin/settings/terms-of-service/versions` + `PUT :id` + `POST :id/publish` | 服务条款 | ✅ 已有 |
| `POST /api/v1/me/data-export/request` + `GET requests` + `GET :id/download` | 用户数据导出 | ✅ 已有 |
| `POST /api/v1/admin/data-export/:id/process` + `reject` + `GET requests` + `GET :id/download` | 管理端审核 | ✅ 已有 |
| `GET /api/v1/admin/finance/vendor-cost-analysis` | 供应商成本分析 | ✅ 已有 |

### 13. 其他零散缺口

| API | 来源 | 代码状态 |
|-----|------|---------|
| `GET /api/v1/admin/anomalies` + `POST :id/resolve` + `create-ticket` | SPEC-§4 管理后台 | ❌ 无 |
| `GET /api/v1/admin/sessions` + `POST :id/revoke` | SPEC-§4 会话管理 | ❌ 无 |
| `GET/PUT /api/v1/admin/settings/session-policy` | SPEC-§4 | ❌ 无 |
| `GET/PUT /api/v1/admin/settings/ip-whitelist` + `POST test` | SPEC-§4 | ⚠️ 有 `users/:id/ip-whitelist`（用户级），缺全局设置 |
| `GET /api/v1/admin/system/backups` + `POST backup` + `GET :id/download` | SPEC-§4 备份 | ❌ 无 |
| `GET /api/v1/admin/system/data-lifecycle/*` | SPEC-§4 数据生命周期 | ❌ 无 |
| `GET /api/v1/admin/system/version` + `tasks` + `tasks/counts` + `POST upgrade-check` | SPEC-§4 | ❌ 无 |
| `POST /api/v1/admin/batch/export` + `import` + `notify` + `recharge` | SPEC-§4 批量操作 | ⚠️ 有 `users/batch/*`、`keys/batch/*`，缺通用 batch 系列 |
| `PUT /api/v1/admin/2fa/policy` + `POST 2fa/reset/:userId` | SPEC-§20 2FA 管理 | ❌ 无（用户侧 2FA 有，管理侧策略缺） |
| `PUT /api/v1/me/budget/settings` + `POST me/budget/unblock` | SPEC-§20 预算 | ⚠️ 有 `user-quota` 相关，路径需核对 |
| `POST /api/v1/me/devices/:id/logout` + `logout-all` | SPEC-§20 设备管理 | ⚠️ 有 `auth/security/sessions` + `logout-session`，概念重叠 |
| `POST /api/v1/auth/2fa/login` + `recovery-codes` + `disable` | SPEC-§20 2FA | ⚠️ 有 `me/2fa/*`，登录链路需核对 |
| `GET /api/v1/me/login-history/:id/confirm` | SPEC-§20 | ❌ 无 |
| `PATCH /api/v1/admin/substitutability` | SPEC-§5.5 可替代性 | ❌ 无 |
| `GET /api/v1/public/error-codes` + `/:code` | SPEC-§22 错误码自助排查 | ⚠️ 有 `public/error-codes/categories`，缺列表/详情 |
| `POST /api/v1/admin/agents/batch-audit` | gap 报告提及 | ❌ 无 |

---

## 二、代码有、文档未定义（684 项，重点归纳）

全量 684 项中绝大多数是文档只写了主接口、未覆盖的 CRUD/辅助接口。按文件归类的高密度区：

| 路由文件 | 未文档化接口数（估） | 说明 |
|---------|-------------------|------|
| `admin/users/**`（detail/actions/batch/role） | ~40 | 用户详情子接口（activity/balance/notes/ip-whitelist/role-history）文档缺失 |
| `admin/finance/**`（codes/commissions/export/reconciliation） | ~45 | 财务子接口大量未写入文档 |
| `admin/redemption-enhanced/**` + `redemption/*` | ~30 | 兑换码增强接口文档缺失 |
| `admin/config*/**`（versions/snapshots/change-requests/enhanced） | ~20 | 配置版本控制接口未文档化 |
| `admin/support*/**`（assist/enhance/templates/sla/schedules） | ~25 | 客服支撑接口未文档化 |
| `admin/security/**`（bans/events/auto-rules/circuits） | ~20 | 安全风控接口未文档化 |
| `admin/request-records/**`、`risk-control/**`、`threat-intel/**` | ~20 | 新模块未写文档 |
| `me/**`（2fa/sessions/stats/legal/data-export/notifications） | ~30 | 用户端新接口未文档化 |
| `agent/**`（settlements/finance/redemption/referral/client-pricing） | ~30 | 代理端接口未文档化 |
| `vendor/**` + `vendor-self/**` | ~20 | 供应商接口未文档化 |
| `auth/**`（wechat/realname/security） | ~15 | 认证子接口未文档化 |
| `api-keys/**`、`redemption/**`、`knowledge/**`、`tickets/**`、`chat/**` | ~40 | 各模块辅助接口 |

> 这些多为"实现先行、文档滞后"，不影响功能，但影响开发联调与后续维护。建议按模块分批补齐文档（优先 §29/§30/§4 相关新接口）。

---

## 三、需人工确认的路径/命名差异（高优先级）

> **✅ 已于 2026-07-31 全部完成文档侧统一**：文档路径已全部改为代码实际路径，并在各 SPEC 文档中标注了路径说明。详见下表。

| 差异 | 文档现值 | 代码 | 处理结果 |
|------|------|------|------|
| 供应商结算路径单复数 | `vendor/settlement/*`（§25） | `vendor/settlements/*` | ✅ 文档已统一为复数；自助结算用 `vendor/self-settlement/*` |
| 供应商通知 vs 公告 | `vendor/notifications`（§25） | `vendor/announcements` | ✅ 文档已统一为 announcements（含 PRD-管理后台、ref-4.10 引用） |
| 对账差异视图 | `reconciliation/differences/*`（§29） | `reconciliation/mismatches/:id/resolve` | ✅ 文档已统一为 mismatches/reports/run/export/:id |
| 故障演练路径 | `drills/vendor-failure/*`（§31） | `drills/*` | ✅ 文档已统一去掉 vendor-failure 段 |
| 环境配置对比 | `environments/compare` + `:name/config`（§31） | `environments/diff` + `sync` | ✅ 文档已统一为 diff/sync/health-check |
| 用户端通知偏好 | `me/preferences/notifications`（§22） | `me/notifications/preferences` | ✅ 文档已统一 |

---

## 四、建议行动清单（按优先级）

### P0 — 影响合规/资金/核心体验（建议立即对齐）
1. **§29 资金与对账**：资金流水 ledger、资金账户、财务锁账、逾期违约金、对账差异视图、报表中心 —— 6 组接口未实现，财务核心能力缺失
2. **§32 SSO 登录链路**：`auth/sso/:provider` + callback 未实现，企业 SSO 只有配置没有登录
3. **§25 供应商结算**：管理端结算审核接口缺失（`admin/vendor/settlement/requests` + approve/reject）
4. **§30 权限**：`me/permissions` + `/check`、`roles/stats`、`users/:id/permissions/detail` 未实现，权限工具链不完整

### P1 — 影响体验/运营（建议下一迭代）
5. **§22 用户端体验**：Webhook 配置、Onboarding、OAuth 绑定、邀请机制、批量操作 —— 5 组接口未实现
6. **§28 智能客服工具**：模拟调用、测试 Key、用户视角 —— 3 组接口未实现
7. **§31 多环境管理**：sandbox 预览、环境对比/导入导出 —— 4 组接口未实现
8. **§4 管理后台**：会话管理、IP 白名单、备份、数据生命周期、系统版本 —— 5 组接口未实现
9. **§24 代理排行**：排行榜配置/展示、素材库 —— 3 组接口未实现

### P2 — 规划内未开发（明确排期或降级）
10. **§21 Portal 增强**（Blog/帮助中心/联系表单/公开定价）—— SPEC 标注"不进入开发队列"，建议明确状态
11. **§23 全局搜索**（`admin/search`）—— 单接口，工作量小

### P3 — 文档补齐（实现先行、文档滞后）
12. 按 `二、代码有文档未定义` 清单，分模块补齐文档（优先 admin/finance、admin/users、me/**、agent/**）

---

## 附录：统计口径说明

- **828 条代码路由**：来自 `api/src/routes/**` 所有 `.ts` 文件的 `app.get/post/put/patch/delete(...)` 调用，去重后计数
- **834 条文档 API**：来自 `docs/` 下非归档 md 文件的 `METHOD /api/...` 行，含 SPEC/PRD/ref/supplement
- **315 项"文档有代码无"原始差异**：排除 `_archive` 来源、`{resource}` 模板路径、重复记录后，有效缺口约 90 项（本报告第一节）
- **684 项"代码有文档无"**：绝大多数为文档未覆盖的辅助接口，未逐条列出（体量过大），按路由文件归纳（第二节）
- 匹配为**路径级**匹配，未校验请求/响应字段级差异；字段级差异需接口联调时进一步核对
