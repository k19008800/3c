# SPEC — 代理商体系接入「后台主导版」（报备划拨制）

> 来源需求：[`PRD-代理商体系-后台主导版.md`](PRD-代理商体系-后台主导版.md)（v1.0 已定稿）
> 版本：v1.0 ｜ 日期：2026-08-01
> 当前代码基线：`api/src/routes/me-agent.ts`、`api/src/routes/admin-agent.ts`、`api/src/db/schema/agent-profiles.ts`、`api/src/db/schema/agent-commissions.ts`；migration 最新至 `0018_chat_ops.sql`

---

## 一、目标与非目标

### 目标
把代理商体系从「用户自助」改造为「后台主导·报备划拨·单级·无裂变」，落地 PRD v1.0 全部决策（D1–D8）。

### 非目标（本次不做）
- 不改动提现模块（`agent_withdrawals`、`me-agent-withdraw`、`admin-agent-withdraw` 双审流程保留）。
- 不改动佣金入账/结算逻辑（`agent_commissions` 保留，仅归属来源改变）。
- 不做客户自助绑定、不接受多级分销。

---

## 二、核心改动总览

| 维度 | 现状 | 目标 |
|------|------|------|
| 代理档案创建 | `getOrCreateProfile` 任何用户访问即自动建 `prepare` 档案 | 仅后台 `设为代理商` 创建；用户端只读 |
| 升级入口 | `POST /me/agent/upgrade-request` 自服务 | **移除** |
| 裂变/邀请码 | `GET /me/agent/referral` + `users.agent_id` | **移除裂变**；`users.agent_id` 改为只读归属展示或废弃 |
| 多级 | `agent_profiles.parent_user_id` | **移除**，单级 |
| 客户归属来源 | 裂变绑定（用户自助） | **报备划拨（唯一来源）** |
| 后台操作 | 已有审核/等级调整 | 新增：设为代理商、报备审核队列、客户归属管理、归属审计日志 |

---

## 三、数据模型（Migration `0019_agent_backend_driven.sql`）

### 3.1 新增表

**`agent_customer_bindings` — 客户归属绑定**

```sql
CREATE TABLE IF NOT EXISTS "agent_customer_bindings" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_user_id" integer NOT NULL REFERENCES "users"("id"),
  "customer_user_id" integer NOT NULL REFERENCES "users"("id"),
  "status" varchar(20) NOT NULL DEFAULT 'active',   -- active / inactive
  "bound_at" timestamp with time zone NOT NULL DEFAULT now(),
  "unbound_at" timestamp with time zone,
  "operator_id" integer REFERENCES "users"("id"),   -- 后台操作人
  "reason" varchar(500),
  CONSTRAINT "acb_customer_unique_active" UNIQUE ("customer_user_id", "status")
);
CREATE INDEX IF NOT EXISTS "idx_acb_agent" ON "agent_customer_bindings" ("agent_user_id");
CREATE INDEX IF NOT EXISTS "idx_acb_customer" ON "agent_customer_bindings" ("customer_user_id");
```

> 归属唯一性：`UNIQUE(customer_user_id, status)` 确保同一客户同一时刻只有一条 `active` 归属记录。转移时先将旧记录置 `inactive`，再插入新 `active` 记录（事务内完成）。

**`agent_report_requests` — 报备审核队列**

```sql
CREATE TABLE IF NOT EXISTS "agent_report_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_user_id" integer NOT NULL REFERENCES "users"("id"),
  "target_phone" varchar(32),
  "target_email" varchar(255),
  "target_user_id" integer REFERENCES "users"("id"),
  "note" varchar(500),
  "status" varchar(20) NOT NULL DEFAULT 'pending', -- pending / passed / rejected
  "audit_operator_id" integer REFERENCES "users"("id"),
  "audit_at" timestamp with time zone,
  "reject_reason" varchar(500),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "arr_target_check" CHECK (
    (target_phone IS NOT NULL) OR (target_email IS NOT NULL) OR (target_user_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "idx_arr_status" ON "agent_report_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_arr_agent" ON "agent_report_requests" ("agent_user_id");
```

**`agent_binding_logs` — 归属变更审计日志**

```sql
CREATE TABLE IF NOT EXISTS "agent_binding_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_user_id" integer NOT NULL REFERENCES "users"("id"),
  "from_agent_user_id" integer REFERENCES "users"("id"),
  "to_agent_user_id" integer REFERENCES "users"("id"),
  "action" varchar(20) NOT NULL,   -- bind / transfer / unbind / migrate
  "operator_id" integer REFERENCES "users"("id"),
  "reason" varchar(500),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_abl_customer" ON "agent_binding_logs" ("customer_user_id");
CREATE INDEX IF NOT EXISTS "idx_abl_created" ON "agent_binding_logs" ("created_at");
```

### 3.2 改动现有表

**`users`**（`users.agent_id` 原语义=裂变上级）

| 动作 | 说明 |
|------|------|
| 保留字段 | 字段保留，但从「裂变绑定来源」改为「只读展示当前归属代理」；不再由此字段产生新归属 |

**`agent_profiles`**

| 动作 | 说明 |
|------|------|
| 移除 `parent_user_id` | 单级化（D1）；注意：迁移后删除列，先确认无业务依赖 |
| 新增 `created_by_admin_id` | 记录后台创建操作人 |
| `referral_code` | 保留字段但不再用于裂变；新档案可留空或由后台生成，仅作标识 |

---

## 四、后端接口设计

### 4.1 移除 / 收敛（me/agent，用户端）

| 现状接口 | 动作 |
|----------|------|
| `GET /me/agent/profile` 的 `getOrCreateProfile` | 改为**只读**：`agent_profiles` 无该用户记录 → 返回 `{is_agent:false}`；有则返回档案。**禁止自动创建** |
| `PUT /me/agent/withdraw-settings` | 保留，但去掉 `getOrCreateProfile` 自动创建逻辑（非代理调用返回 403） |
| `GET/PUT /me/agent/notif-prefs` | 同上，去掉自动创建 |
| `GET /me/agent/commission-rules` | 保留展示；去掉自动创建（非代理仅显示规则，不入库） |
| `POST /me/agent/upgrade-request` | **删除**（D：无升级入口） |
| `GET /me/agent/referral` | **删除**（D2：无裂变） |

**新约束**：`/me/agent/*` 所有接口需先校验该用户是代理商（`agent_profiles` 存在），非代理商统一返回 `403 { error: "NOT_AGENT" }`。

**新增（代理端）**

| 接口 | 说明 |
|------|------|
| `POST /api/v1/agent/reports` | 代理商提交客户报备（body: target_phone/target_email/target_user_id 三选一 + note）|
| `GET /api/v1/agent/reports` | 代理商查看自己的报备记录（含状态）|

### 4.2 admin（后台）

**新增**

| 接口 | 说明 |
|------|------|
| `POST /api/v1/admin/agents/assign` | 设为代理商（body: userId, level, commissionRate?）—— 插入 `agent_profiles`，`created_by_admin_id`=操作人；通知用户 |
| `GET /api/v1/admin/agent-reports` | 报备审核队列（分页 + status 筛选）|
| `POST /api/v1/admin/agent-reports/:id/audit` | 审核（body: action=pass/reject, reason?）；**pass → 自动划拨**（D3）|
| `GET /api/v1/admin/agent-customers` | 客户归属列表（agent_user_id 筛选 / 客户关键词）|
| `GET /api/v1/admin/agent-customers/:id/logs` | 单个客户的归属变更审计日志 |
| `POST /api/v1/admin/agent-customers/:id/unbind` | 解除归属（body: reason）|
| `POST /api/v1/admin/agent-customers/:id/transfer` | 手动转移归属（body: to_agent_user_id, reason）—— 备用能力，实现自动划拨时复用同一事务逻辑 |

**保留（微调）**

| 现状接口 | 动作 |
|----------|------|
| `GET /admin/agents` | 保留；`customer_count` 改为统计 `agent_customer_bindings` active 数（不再用 `users.agent_id`）|
| `GET /admin/agents/:userId` | 保留；同理 customer 列表改查 `agent_customer_bindings` |
| `PUT /admin/agents/:userId/level` | 保留（等级由后台调，D 无自助升级）|
| `POST /admin/agents/:userId/audit` | **废弃**（原升级申请审核），改由「设为代理商」替代 |
| `GET /admin/agents/pending` | 更新为报备 pending 队列，或由新 `/admin/agent-reports` 替代（建议后者，删旧）|

### 4.3 划拨核心事务逻辑（transfer，自动划拨复用）

```
function transferCustomer({ customerUserId, toAgentUserId, operatorId, reason }):
  BEGIN TRANSACTION
  1. 取 customer 当前 active 归属记录（agent_customer_bindings WHERE customer_user_id=X AND status='active'）
     - 若存在 fromAgent → 将其置 status='inactive', unbound_at=now()
  2. 插入新 active 记录 (agent_user_id=toAgent, customer_user_id, status='active', bound_at=now(), operator_id)
  3. 插入 agent_binding_logs (action = 原存在 ? 'transfer' : 'bind', from, to, operator, reason)
  4. COMMIT  → 生效时间点 = COMMIT 时刻（D7：以划拨执行时刻为界，佣金切分基于此）
```

> ⚠️ 佣金切分：`agent_commissions` 的入账需以「消费发生时刻」对照「该时刻客户归属的 active 记录」判定归属代理。落地方式：佣金入账时查询 `agent_customer_bindings` 中 `bound_at <= 消费时刻 < unbound_at`（或 status=active 仍未解绑）的记录取归属代理。需要为 `agent_commissions` 的入账逻辑增加一次归属解析（见 §五 待实现依赖）。

---

## 五、与佣金结算的衔接（归属解析）

现状：佣金在计费时按 `users.agent_id`（裂变上级）记入 `agent_commissions`。

改造后：计费时按**消费时刻的归属绑定**解析：

```sql
SELECT agent_user_id FROM agent_customer_bindings
WHERE customer_user_id = $1 AND status = 'active'
  AND bound_at <= $2              -- $2 = 消费发生时刻
  AND (unbound_at IS NULL OR unbound_at > $2)
LIMIT 1;
```

- 命中 → 记入该代理的 `agent_commissions`（沿用现有结算逻辑）。
- 未命中 → 该消费不计佣金（客户无归属代理）。
- `agent_commissions` 增加 `binding_id`（可选，关联归属记录，便于追溯），可加 nullable 列。

---

## 六、前端改动（web-console）

### 6.1 用户端（代理设置页）

| 改动 | 说明 |
|------|------|
| 移除「申请成为代理」入口 | 删 upgrade-request 相关 UI |
| 移除「邀请裂变/邀请码」区块 | 删 referral UI |
| 非代理商访问代理设置 | 显示"无代理权限"，不自动建档 |
| 保留 | 代理本人查看档案、佣金、提现、佣金规则 |
| 新增 | 「报备目标客户」入口 + 报备记录查询 |

### 6.2 管理端（AdminAgentsPage）

| 改动 | 说明 |
|------|------|
| 新增「设为代理商」 | 在用户列表/代理页提供入口（选等级+佣金档位）|
| 新增「报备审核队列」页 | 列表 + 审核（通过→自动划拨 / 驳回原因）|
| 新增「客户归属管理」页 | 查看各代理客户、转移、解绑 |
| 新增「归属审计日志」页 | 按客户/代理查日志 |
| 适配 customer_count | 改用绑定表统计 |

### 6.3 帮助说明（`[?]` 必带）

所有新增页面/按钮按 `PRODUCT-DESIGN-PRINCIPLES.md` 要求配 `[?]` 帮助：
- 设为代理商 `[?]`：说明"由平台后台授权的代理商准入方式"
- 报备审核 `[?]`：说明流程与自动划拨规则
- 客户归属管理 `[?]`：说明归属唯一性 + 变更留痕

---

## 七、旧数据迁移（D8）

迁移脚本（建议 `scripts/migrate_agent_legacy.mjs`，node 验证避免编码问题）：

| 步骤 | 动作 |
|------|------|
| 1 | 遍历 `users` 中 `agent_id IS NOT NULL` 的记录（旧裂变绑定），为目标构造 `agent_customer_bindings`（status=active, bound_at=旧记录写入时间或预估）|
| 2 | 保守策略：仅迁移「目标用户确实存在 且 上级用户已具备 agent_profiles」的关系 |
| 3 | 每条迁移写 `agent_binding_logs`（action='migrate'，reason='迁移自旧裂变数据'）|
| 4 | 归属唯一性检查：若同一客户存在多条旧裂变记录，保留最新一条，其余丢弃并记异常 |
| 5 | 多级 `parent_user_id`：扁平化（仅保留最底层实际归属客代理为归属人，丢弃上级链）|
| 6 | 清理：迁完确认后，可将 `users.agent_id` 置 NULL（或保留作为只读展示）|
| 7 | 迁移脚本输出核对报告（迁移条数 / 冲突 / 异常堆），由后台复核 |

---

## 八、验收标准（对应 PRD §五）

- [ ] 用户端任何页面不出现"申请/升级/裂变/邀请码"入口
- [ ] 后台可任意用户「设为代理商」（含等级/佣金档位）
- [ ] 代理商仅通过报备目标客户，报备进审核队列
- [ ] 后台审核通过后客户**自动**划拨到该代理商名下
- [ ] 一个客户同一时刻仅一条 active 归属
- [ ] 归属转移/解绑/迁移全程留审计日志
- [ ] 无多级分销（`parent_user_id` 移除），佣金单级
- [ ] 用户成为代理后保留普通功能、无裂变
- [ ] 个人/企业同一套流程
- [ ] 所有新增页面/按钮带 `[?]` 帮助

---

## 九、实施步骤建议（顺序）

1. **Migration 0019**：新增 3 表 + `agent_profiles` 移除 `parent_user_id` + 加 `created_by_admin_id`（先跑 `tsc --noEmit` + 本地 migrate 验证）
2. **归属解析工具函数**：`resolveAgentByCustomerAt(customerUserId, at)` 供计费复用
3. **admin 新增接口**：assign / reports / audit / customers / logs / unbind / transfer + 划拨事务
4. **me/agent 收敛**：去自动创建、删 upgrade-request、删 referral、加 /agent/reports
5. **佣金入账衔接**：计费时改用归属解析
6. **前端**：用户端收敛 + 管理端 4 个新模块 + `[?]`
7. **旧数据迁移脚本** + 核对报告
8. **回归**：E2E + 44 测试 + typecheck + lint + build 全绿

---

## 十、风险与注意

| 风险 | 说明 | 对策 |
|------|------|------|
| 归属唯一约束 | `UNIQUE(customer, status)` 在并发划拨下需事务包裹 | 划拨一律走事务内转移函数 |
| 佣金切分边界 | 消费发生时刻与归属生效时刻的先后 | 以 `bound_at <= 消费时刻` 为准；测试覆盖边界 |
| 旧的 `getOrCreateProfile` 副作用 | 当前任何访问自动建档案，需全局排查 `/me/agent/*` 调用点 | 每个接口审计后改只读 |
| 前端残留入口 | 裂变/邀请码区块可能散落多页 | 全站搜索 `referral`/`upgrade`/`invite` 清理 |
| 编码坑 | PowerShell Set-Content 会破坏中文 | 所有含中文文件用 edit/write 工具写；迁移/脚本用 node 跑 |
