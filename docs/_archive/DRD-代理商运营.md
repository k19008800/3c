# 3cloud（3C）AI Token 聚合平台 — 代理商与运营模块技术实现规格说明书 (DRD)

> **版本**：V1.0 | **日期**：2026-07-27
> **文档定位**：技术实现层面字段级规格、接口定义、业务逻辑算法、数据一致性要求
> **关联文档**：`PRD-运营级.md`（第3章 代理商体系 / 第4章 营销与运营工具）

---

## 一、代理商层级与权益

### 数据层

#### 1. agents（代理商主表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| user_id | INTEGER | — | ✅ | UNIQUE | 关联 `users.id`，一人一代理商记录 |
| level | VARCHAR(32) | 'preparatory' | ✅ | ✅ | enum: preparatory / level1 / senior / sub_agent |
| parent_agent_id | INTEGER | NULL | ❌ | ✅ | 关联 `agents.id`，子代理指向其上级 |
| status | VARCHAR(20) | 'active' | ✅ | ✅ | enum: active / frozen / disabled |
| total_clients | INTEGER | 0 | ✅ | — | 名下用户总数（冗余，定时任务更新）|
| monthly_consumption | DECIMAL(18,6) | 0 | ✅ | — | 当月名下用户消费总额（冗余）|
| commission_rate | DECIMAL(5,2) | NULL | ❌ | — | 自定义佣金率（覆盖全局阶梯），范围 3.00~30.00% |
| commission_rule_type | VARCHAR(20) | 'tiered' | ✅ | — | enum: fixed_rate / tiered / fixed_amount / hybrid |
| withdrawable_balance | DECIMAL(18,6) | 0 | ✅ | — | 可提现余额（冗余字段，由结算定时任务更新）|
| total_earned_commission | DECIMAL(18,6) | 0 | ✅ | — | 累计获得佣金总额 |
| total_withdrawn | DECIMAL(18,6) | 0 | ✅ | — | 累计已提现总额 |
| frozen_commission | DECIMAL(18,6) | 0 | ✅ | — | 冻结中佣金（冻结期内不可提现）|
| level_promoted_at | TIMESTAMP | NULL | ❌ | — | 最近一次升级时间 |
| onboarding_completed | BOOLEAN | false | ✅ | — | 引导流程是否完成 |
| created_at | TIMESTAMP | NOW() | ✅ | ✅ | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | 自动更新 |

#### 2. agent_commission_configs（佣金规则配置表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id`，NULL 表示全局规则 |
| rule_type | VARCHAR(20) | 'tiered' | ✅ | ✅ | fixed_rate / tiered / fixed_amount / hybrid |
| tier_min_amount | DECIMAL(18,6) | NULL | ❌ | — | 阶梯下限（阶梯规则）|
| tier_max_amount | DECIMAL(18,6) | NULL | ❌ | — | 阶梯上限（阶梯规则），NULL 表示无上限 |
| rate | DECIMAL(5,2) | — | ✅ | — | 佣金百分比（固定比例/阶梯档位），范围 0.00~30.00 |
| fixed_amount_per_token | DECIMAL(18,10) | NULL | ❌ | — | 每 Token 固定金额（固定金额规则）|
| model_id | INTEGER | NULL | ❌ | ✅ | 关联 `models.id`，NULL 表示所有模型（混合规则）|
| effective_from | TIMESTAMP | — | ✅ | — | 生效开始时间 |
| effective_until | TIMESTAMP | NULL | ❌ | — | 生效结束时间，NULL 表示永久 |
| is_active | BOOLEAN | true | ✅ | — | 是否启用 |
| created_by | INTEGER | — | ✅ | — | 操作人 user_id |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

#### 3. agent_commission_logs（佣金流水表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id` |
| source_user_id | INTEGER | — | ✅ | ✅ | 关联 `users.id`，产生佣金的用户 |
| call_log_id | BIGINT | — | ✅ | — | 关联 `call_logs.id` |
| consumption_amount | DECIMAL(18,6) | — | ✅ | — | 用户本次消费金额 |
| commission_rate | DECIMAL(5,2) | — | ✅ | — | 实际使用的佣金率 |
| commission_amount | DECIMAL(18,6) | — | ✅ | — | 本次产生的佣金金额 |
| commission_type | VARCHAR(20) | 'tiered' | ✅ | — | fixed_rate / tiered / fixed_amount / hybrid |
| settlement_status | VARCHAR(20) | 'pending' | ✅ | ✅ | pending / settled / cancelled |
| settlement_period | VARCHAR(7) | — | ❌ | ✅ | 结算周期，如 '2026-07' |
| frozen_until | TIMESTAMP | — | ✅ | — | 冻结到期时间（冻结期过后才可提现）|
| created_at | TIMESTAMP | NOW() | ✅ | ✅ | — |

#### 4. agent_customer_relations（代理-客户关系表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id` |
| user_id | INTEGER | — | ✅ | UNIQUE | 关联 `users.id`，一个用户只能归属于一个代理 |
| bound_at | TIMESTAMP | NOW() | ✅ | — | 绑定时间 |
| unbound_at | TIMESTAMP | NULL | ❌ | — | 解绑时间 |
| status | VARCHAR(20) | 'active' | ✅ | ✅ | active / unbund |

#### 5. agent_withdraws（提现申请表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id` |
| withdraw_no | VARCHAR(64) | — | ✅ | UNIQUE | 提现单号，格式 `WD-YYYYMMDD-XXXX` |
| amount | DECIMAL(18,6) | — | ✅ | — | 提现金额 |
| bank_card_no | VARCHAR(64) | — | ✅ | — | 银行卡号 |
| bank_name | VARCHAR(128) | — | ✅ | — | 开户银行 |
| bank_voucher_url | TEXT | NULL | ❌ | — | 打款回单图片 URL |
| status | VARCHAR(20) | 'pending' | ✅ | ✅ | pending / first_approved / second_approved / rejected / paid / cancelled |
| first_reviewer_id | INTEGER | NULL | ❌ | — | 初审人 user_id（finance 角色）|
| first_reviewed_at | TIMESTAMP | NULL | ❌ | — | 初审时间 |
| second_reviewer_id | INTEGER | NULL | ❌ | — | 复核人 user_id（admin/super_admin）|
| second_reviewed_at | TIMESTAMP | NULL | ❌ | — | 复核时间 |
| reject_reason | TEXT | NULL | ❌ | — | 驳回原因 |
| reject_step | VARCHAR(10) | NULL | ❌ | — | first / second |
| paid_at | TIMESTAMP | NULL | ❌ | — | 打款完成时间 |
| paid_by | INTEGER | NULL | ❌ | — | 打款操作人 user_id |
| remark | TEXT | NULL | ❌ | — | 备注 |
| created_at | TIMESTAMP | NOW() | ✅ | ✅ | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

#### 6. agent_level_history（等级变更历史）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id` |
| from_level | VARCHAR(32) | — | ✅ | — | 变更前等级 |
| to_level | VARCHAR(32) | — | ✅ | — | 变更后等级 |
| reason | TEXT | — | ✅ | — | 变更原因 |
| operator_id | INTEGER | — | ✅ | — | 操作人 user_id |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |

**数据一致性要求**：
- `agent_commission_logs.commission_amount` 必须等于 `consumption_amount × commission_rate / 100`，由触发器中计算，禁止应用层赋值
- `agents.withdrawable_balance`、`agents.frozen_commission`、`agents.total_earned_commission` 由定时任务从 `agent_commission_logs` 聚合更新，允许分钟级延迟
- `agent_customer_relations` 中每个 `user_id` 唯一，确保一个用户只能属于一个代理商
- 当有消费退款时，需同步扣减对应的佣金记录（软删除 + refund 标记）

---

### 接口层

#### 代理商管理（admin）

**API 1：创建代理商**
- `POST /admin/agents`
- Request: `{ "userId": number, "initialSaleRate?": number }`
- Response 201: `{ "id": number, "userId": number, "level": "preparatory", "status": "active" }`

**API 2：审核代理商升级**
- `POST /admin/agents/:id/review`
- Request: `{ "action": "approve" | "reject", "level": "level1" | "senior", "rejectReason?": string }`
- Response 200: `{ "id": number, "level": string, "status": "active" }`

**API 3：代理商列表**
- `GET /admin/agents?page=1&pageSize=20&level=&status=&search=`
- Response: `{ "data": Agent[], "total": number, "page": number, "pageSize": number }`

**API 4：代理商详情**
- `GET /admin/agents/:id`
- Response: `{ "agent": AgentDetail }`（含名下用户列表、统计数据）

**API 5：绑定客户到代理商**
- `POST /admin/agents/:id/bind-client`
- Request: `{ "clientUserId": number }`
- Response 200: `{ "agentId": number, "userId": number, "boundAt": string }`

**API 6：创建子代理**
- `POST /admin/agents/:id/create-sub`
- Request: `{ "userId": number, "commissionRate?": number }`
- Response 201: Agent 对象（level 自动设为 `sub_agent`）

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `user_already_agent` | 用户已是代理商 |
| 400 | `user_not_eligible` | 用户不满足升级条件 |
| 400 | `parent_not_level1` | 只有一级代理才能创建子代理 |
| 404 | `agent_not_found` | 代理商不存在 |
| 400 | `invalid_level_transition` | 不允许的等级变更路径 |

**缓存策略**：代理商数据变更不频繁，对 `GET /admin/agents/:id` 启用 30 秒 Redis 缓存。

---

### 业务逻辑

**代理商等级晋升规则（伪代码）：**

```
FUNCTION promote_agent(agent_id):
    agent = SELECT * FROM agents WHERE id = agent_id
    IF agent.level == 'preparatory':
        // 预备→一级：需实名 + agent_mgr 审核
        // 由人工审核接口触发
    ELSE IF agent.level == 'level1':
        // 一级→高级：月调用 > 100万 Token → 自动触发审核
        monthly_tokens = SUM(call_logs.total_tokens)
            WHERE call_logs.user_id IN (
                SELECT user_id FROM agent_customer_relations WHERE agent_id = agent_id
            )
            AND call_logs.created_at >= date_trunc('month', NOW())
        IF monthly_tokens > 1_000_000:
            // 自动创建待审核升级任务
            INSERT INTO agent_level_history(...)
            // 通知 super_admin 审批（升级为高级代理需 super_admin 审批）
    ELSE IF agent.level == 'senior':
        // 高级代理仅能降级（由管理员操作）
    RETURN agent
```

**子代理创建规则：**
```
子代理只能由一级代理创建
子代理的佣金率不能超过上级代理的佣金率
子代理创建时自动绑定到上级代理名下（parent_agent_id）
子代理不能再次创建下级代理（层级深度 = 2）
```

**边界条件：**
- 零值场景：当月消费为零时 commission_logs 无记录，仪表盘展示 0 值
- 空值场景：`parent_agent_id = NULL` 表示顶级代理
- 并发场景：提现申请使用 `SELECT ... FOR UPDATE` 锁定余额行，防止重复扣减
- 解绑场景：解绑客户后，之前的佣金流水不受影响，仅后续消费不再计算佣金

---

### 状态流转

**代理商等级迁移表：**

| 当前等级 | 目标等级 | 触发条件 | 审核人 | 备注 |
|---------|---------|---------|-------|------|
| 无 | preparatory | 注册 + 实名认证 | 自动 | 用户注册并实名后自动成为预备代理 |
| preparatory | level1 | 实名 + 资质审核通过 | agent_mgr | 人工审核 |
| level1 | senior | 月调用 > 100万 Token | super_admin | 系统自动发起审核 |
| senior | level1 | 连续 3 月未达标的主动降级 | super_admin | 管理员操作 |
| level1/senior | frozen | 违规/投诉 | admin | 冻结后不可提现但名下消费继续产生佣金 |
| frozen | active | 申诉通过 | admin | 解冻后恢复正常 |

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `agent.default_commission_rate` | decimal(5,2) | 10.00 | 新建代理默认佣金率 |
| `agent.min_commission_rate` | decimal(5,2) | 3.00 | 最低佣金率限制 |
| `agent.max_commission_rate` | decimal(5,2) | 30.00 | 最高佣金率限制 |
| `agent.senior_threshold_tokens` | bigint | 1000000 | 高级代理月调用 Token 阈值 |
| `agent.max_sub_agent_per_level1` | int | 50 | 一级代理可创建的最大子代理数 |
| `agent.commission_calc_base` | text | 'consumption_amount' | 佣金计算基准（消费金额/收入金额）|

---

## 二、代理佣金规则（全局 + 代理级）

### 数据层

使用 `agent_commission_configs` 表（同上表定义），补充：

**全局规则约定**：`agent_commission_configs` 中 `agent_id = NULL` 的记录为全局规则

| 规则类型 | 存储方式 |
|---------|---------|
| 固定比例 | 单条记录，agent_id=NULL, rule_type='fixed_rate', rate=10.00 |
| 阶梯比例 | 多条记录，agent_id=NULL, rule_type='tiered', 每档一条，用 tier_min_amount / tier_max_amount 界定 |
| 固定金额 | 多条记录，agent_id=NULL, rule_type='fixed_amount', fixed_amount_per_token=¥0.0001 |
| 混合 | 多条记录，agent_id=NULL, rule_type='hybrid', model_id 对应不同模型 |

---

### 接口层

**API 1：获取全局佣金规则**
- `GET /admin/finance/commissions/rules`
- Response 200: `{ "data": CommissionRule[], "defaultRate": "10.00" }`

**API 2：设置/更新佣金规则**
- `POST /admin/finance/commissions/rules`
- Request: `{ "ruleType": "tiered", "tiers": [{ "minAmount": "0", "maxAmount": "1000", "rate": "5.00" }, ...], "effectiveFrom": "2026-07-01T00:00:00Z", "retroactive": false }`
- Response 200: `{ "affectedRuleIds": number[] }`
- 说明：`retroactive=true` 时追朔到本月 1 日，触发重新计算当月所有待结算佣金

**API 3：设置代理级覆盖**
- `PUT /admin/agents/:id/commission`
- Request: `{ "commissionRate?": "12.00", "ruleType?": "fixed_rate", "tiers?": [...] }`
- Response 200: `{ "agentId": number, "rate": "12.00" }`

**API 4：佣金变更审计日志**
- `GET /admin/finance/commissions/audit-logs?agentId=&startDate=&endDate=`
- Response: `{ "data": AuditLog[] }`
- 日志字段：id, agent_id, before_value, after_value, operator_id, changed_at

**API 5：佣金流水查询**
- `GET /admin/finance/commissions/flow?agentId=&userId=&status=&settlementPeriod=&page=&pageSize=`
- Response: `{ "data": CommissionLog[], "total": number, "summary": { "totalCommissionAmount": "¥X" } }`

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `rate_out_of_range` | 佣金率超出 [3%, 30%] 范围 |
| 400 | `tier_overlap` | 阶梯档位区间重叠 |
| 400 | `retroactive_in_progress` | 已有追溯计算任务运行中 |

**缓存策略**：佣金规则缓存 5 分钟（Redis），因为变更频率低。佣金流水不缓存。

---

### 业务逻辑

**佣金计算引擎（伪代码）：**

```
FUNCTION calculate_commission(agent_id, source_user_id, consumption_amount, model_id, call_time):
    // 1. 查询代理的佣金规则
    agent_rules = SELECT * FROM agent_commission_configs 
                  WHERE agent_id = agent_id AND is_active = true
                  AND effective_from <= call_time 
                  AND (effective_until IS NULL OR effective_until >= call_time)
    
    // 2. 如果有代理级规则，优先使用
    IF agent_rules.length > 0:
        return apply_rules(agent_rules, consumption_amount, model_id)
    
    // 3. 回退到全局规则
    global_rules = SELECT * FROM agent_commission_configs
                   WHERE agent_id IS NULL AND is_active = true
                   AND effective_from <= call_time
                   AND (effective_until IS NULL OR effective_until >= call_time)
    return apply_rules(global_rules, consumption_amount, model_id)

FUNCTION apply_rules(rules, consumption_amount, model_id):
    primary_rule = rules.find(r => r.rule_type != 'hybrid')
    
    SWITCH primary_rule.rule_type:
        CASE 'fixed_rate':
            return consumption_amount × primary_rule.rate / 100
        
        CASE 'tiered':
            monthly_total = SUM(agent_commission_logs.consumption_amount)
                WHERE agent_id = agent_id AND created_at >= date_trunc('month', NOW())
            cumulative = monthly_total + consumption_amount // 含本次
            matching_tier = rules.find(r => r.rule_type == 'tiered' 
                AND cumulative >= r.tier_min_amount 
                AND (r.tier_max_amount IS NULL OR cumulative <= r.tier_max_amount))
            IF matching_tier:
                return consumption_amount × matching_tier.rate / 100
            ELSE:
                return consumption_amount × 0 // 无匹配档位说明系统配置有误
        
        CASE 'fixed_amount':
            // 需上游返回的实际 Token 数，由 call_logs 提供
            actual_tokens = call_log.total_tokens
            return actual_tokens × primary_rule.fixed_amount_per_token
        
        CASE 'hybrid':
            model_rule = rules.find(r => r.rule_type == 'hybrid' AND r.model_id == model_id)
            IF model_rule:
                return consumption_amount × model_rule.rate / 100
            ELSE:
                // 未匹配到模型级的回退到固定比例规则（hybrid 配置中应有 fallback）
                fallback = rules.find(r => r.rule_type == 'hybrid' AND r.model_id IS NULL)
                return consumption_amount × (fallback?.rate ?? DEFAULT_RATE) / 100
```

**佣金规则变更追溯逻辑：**

```
IF upsert_commission_rules.retroactive == true:
    // 异步任务执行
    ASYNC JOB recalculate_month_commissions(agent_id, yearMonth)
    // 锁定本月所有待结算佣金记录
    UPDATE agent_commission_logs SET settlement_status = 'cancelled'
        WHERE settlement_period = yearMonth AND settlement_status = 'pending'
    // 重新计算 commission_amount
    FOR each cancelled log:
        new_amount = calculate_commission(log.agent_id, log.source_user_id, log.consumption_amount, log.model_id, log.created_at)
        UPDATE agent_commission_logs SET commission_amount = new_amount, settlement_status = 'pending'
```

**边界条件：**
- 阶梯档位无上限（`tier_max_amount IS NULL`）：最后一条阶梯记录必须无上限，否则超出部分无佣金
- 零值消费：`consumption_amount = 0` 或 `total_tokens = 0` 不产生佣金
- 并发追溯：追溯任务使用 Redis 分布式锁，防止同一代理同一月份重复计算

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `commission.default_rate` | decimal(5,2) | 10.00 | 全局默认佣金比例 |
| `commission.min_rate` | decimal(5,2) | 3.00 | 最低佣金率 |
| `commission.max_rate` | decimal(5,2) | 30.00 | 最高佣金率 |
| `commission.freeze_days` | int | 7 | 佣金产生后冻结天数 |
| `commission.settlement_period` | text | 'monthly' | 结算周期（月结/周结）|

---

## 三、代理端仪表盘

### 数据层

使用 `agents`、`agent_commission_logs`、`agent_customer_relations`、`call_logs` 表聚合。

**仪表盘数据不单独建表**，由 API 实时计算聚合结果。

**数据一致性要求**：仪表盘指标允许分钟级延迟，不要求实时强一致。

---

### 接口层

**API 1：仪表盘核心指标**
- `GET /agent/console/dashboard/summary`
- Response:
```json
{
  "totalClients": 45,
  "newClientsThisMonth": 5,
  "monthlyConsumption": "12345.67",
  "monthlyCommissionIncome": "1234.56",
  "pendingSettlementAmount": "890.00",
  "withdrawableBalance": "3456.78",
  "totalConsumption": "56789.00",
  "totalCommission": "5678.90"
}
```

**API 2：仪表盘趋势图数据**
- `GET /agent/console/dashboard/trends?period=7d`
- Query params: `period` = `7d` | `30d`
- Response:
```json
{
  "consumptionTrend": [
    { "date": "2026-07-21", "amount": "1234.50" },
    ...
  ],
  "commissionTrend": [
    { "date": "2026-07-21", "amount": "123.45" },
    ...
  ],
  "clientGrowth": [
    { "date": "2026-07-21", "totalClients": 40, "newClients": 1 },
    ...
  ]
}
```

**API 3：客户消费列表**
- `GET /agent/console/clients/consumption?page=1&pageSize=20&sortBy=total_amount&sortOrder=desc`
- Response:
```json
{
  "data": [
    {
      "user": { "id": 1001, "nickname": "张三", "email": "z**@example.com" },
      "totalAmount": "5000.00",
      "monthAmount": "1200.00",
      "commissionAmount": "120.00",
      "lastOrderAt": "2026-07-26 11:30:00"
    }
  ],
  "total": 45,
  "page": 1,
  "pageSize": 20
}
```

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 403 | `not_agent` | 当前用户不是代理商 |
| 403 | `agent_frozen` | 代理商已被冻结 |

**缓存策略**：仪表盘核心指标缓存 30 秒（Redis）。趋势图数据缓存 5 分钟。

---

### 业务逻辑

**核心指标计算逻辑：**

```
总客户数 = COUNT(agent_customer_relations WHERE agent_id = agent_id AND status = 'active')
本月新增客户 = COUNT(agent_customer_relations WHERE agent_id = agent_id AND bound_at >= date_trunc('month', NOW()))
本月总消费 = SUM(consumption_logs.cost) 
    WHERE user_id IN (SELECT user_id FROM agent_customer_relations WHERE agent_id = agent_id)
    AND consumption_logs.created_at >= date_trunc('month', NOW())
本月佣金收入 = SUM(agent_commission_logs.commission_amount)
    WHERE agent_id = agent_id AND created_at >= date_trunc('month', NOW())
待结算金额 = SUM(agent_commission_logs.commission_amount)
    WHERE agent_id = agent_id AND settlement_status = 'pending'
可提现余额 = agents.withdrawable_balance（冗余字段）
```

**趋势图聚合（按天）：**

```
SELECT DATE(created_at) as day, SUM(commission_amount) as amount
FROM agent_commission_logs
WHERE agent_id = ? AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day
```

**边界条件：**
- 新代理商无客户时：所有指标返回 0 或空数组
- 新代理商注册不足 7 天：趋势图只展示已有天数的数据（不补 0）
- 代理商被冻结：仪表盘页面正常展示但置顶显示"账户已被冻结，暂不可提现"

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `agent.dashboard_cache_ttl` | int | 30 | 仪表盘缓存秒数 |
| `agent.dashboard_trend_days` | int | 30 | 默认趋势图天数 |

---

## 四、提现管理

### 数据层

使用 `agent_withdraws` 表（已定义于第一章）。

**补充表：agent_settlement（结算周期表）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| agent_id | INTEGER | — | ✅ | ✅ | 关联 `agents.id` |
| period | VARCHAR(7) | — | ✅ | ✅ | 结算周期，如 '2026-07' |
| total_commission | DECIMAL(18,6) | 0 | ✅ | — | 该周期总佣金 |
| settled_amount | DECIMAL(18,6) | 0 | ✅ | — | 已结算金额 |
| status | VARCHAR(20) | 'pending' | ✅ | ✅ | pending / settled |
| settled_at | TIMESTAMP | NULL | ❌ | — | 结算完成时间 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |

---

### 接口层

**API 1：发起提现（代理商端）**
- `POST /agent/console/withdraw`
- Request: `{ "amount": "500.00", "bankCardNo": "6222****5678", "bankName": "中国银行" }`
- Response 201: `{ "withdrawNo": "WD-20260727-0001", "status": "pending", "amount": "500.00" }`

**API 2：提现列表（代理商端）**
- `GET /agent/console/withdraws?page=1&pageSize=20`
- Response: `{ "data": WithdrawRecord[], "total": number }`

**API 3：提现初审（admin - finance 角色）**
- `POST /admin/withdraws/:id/first-review`
- Request: `{ "action": "approve" | "reject", "rejectReason?": string }`
- Response: `{ "id": number, "status": "first_approved" | "rejected" }`

**API 4：提现复核（admin - 运营/管理岗）**
- `POST /admin/withdraws/:id/second-review`
- Request: `{ "action": "approve" | "reject", "rejectReason?": string, "bankVoucherUrl?": string }`
- Response: `{ "id": number, "status": "second_approved" | "rejected" }`

**API 5：确认打款（admin - finance 角色）**
- `POST /admin/withdraws/:id/mark-paid`
- Request: `{ "bankVoucherUrl?": string }`
- Response: `{ "id": number, "status": "paid", "paidAt": string }`

**API 6：提现审核列表（admin）**
- `GET /admin/withdraws?status=pending&page=1&pageSize=20`
- Response: `{ "data": WithdrawDetail[], "total": number, "totalAmount": "¥X" }`

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `insufficient_balance` | 可提现余额不足 |
| 400 | `below_min_amount` | 低于最低提现金额 ¥10 |
| 400 | `above_max_amount` | 超过可提现余额 |
| 400 | `withdraw_frequency_limit` | 24 小时内已发起过提现 |
| 400 | `commission_in_frozen` | 佣金仍在冻结期 |
| 400 | `agent_frozen` | 代理商被冻结不可提现 |
| 400 | `already_reviewed` | 该提现申请已被审核 |

**缓存策略**：提现状态变更后清除缓存；列表查询不缓存。

---

### 业务逻辑

**提现发起校验（伪代码）：**

```
FUNCTION validate_withdraw(agent_id, amount):
    agent = SELECT * FROM agents WHERE id = agent_id FOR UPDATE
    
    // 1. 代理商状态检查
    IF agent.status != 'active':
        RAISE 'agent_frozen'
    
    // 2. 预备代理不可提现
    IF agent.level == 'preparatory':
        RAISE 'preparatory_cannot_withdraw'
    
    // 3. 最低提现金额
    min_amount = GET_CONFIG('agent.min_withdraw_amount')
    IF amount < min_amount:
        RAISE 'below_min_amount'
    
    // 4. 不超过可提现余额
    IF amount > agent.withdrawable_balance:
        RAISE 'above_max_amount'
    
    // 5. 提现频率限制
    last_withdraw = SELECT MAX(created_at) FROM agent_withdraws 
                    WHERE agent_id = agent_id AND status IN ('paid', 'pending', 'first_approved', 'second_approved')
    IF last_withdraw AND NOW() - last_withdraw < INTERVAL '24 hours':
        RAISE 'withdraw_frequency_limit'
    
    // 6. 冻结期检查：确保所有待结算佣金已过冻结期
    frozen_exists = SELECT COUNT(*) FROM agent_commission_logs
                    WHERE agent_id = agent_id AND frozen_until > NOW() AND settlement_status = 'pending'
    IF frozen_exists > 0:
        RAISE 'commission_in_frozen'
    
    RETURN true
```

**双审流程状态机：**

```
pending → first_approved（财务初审通过）
pending → rejected（财务初审拒绝）
first_approved → second_approved（运营复核通过）
first_approved → rejected（运营复核驳回）
second_approved → paid（财务确认打款）
second_approved → rejected（异常情况下管理员驳回打款）
```

**打款完成后处理：**

```
FUNCTION mark_withdraw_paid(withdraw_id):
    withdraw = SELECT * FROM agent_withdraws WHERE id = withdraw_id
    // 扣减可提现余额
    UPDATE agents SET 
        withdrawable_balance = withdrawable_balance - withdraw.amount,
        total_withdrawn = total_withdrawn + withdraw.amount
    WHERE id = withdraw.agent_id
    // 标记佣金流水为已结算
    UPDATE agent_commission_logs SET settlement_status = 'settled'
    WHERE agent_id = withdraw.agent_id AND settlement_status = 'pending'
    // 更新结算周期表
    UPDATE agent_settlement SET settled_amount = settled_amount + withdraw.amount
    WHERE agent_id = withdraw.agent_id AND period = TO_CHAR(NOW(), 'YYYY-MM')
    // 发送通知
    SEND_NOTIFICATION(agent.user_id, '提现完成', '您的 ¥X 提现已到账')
```

**边界条件：**
- 提现被驳回后，可提现余额自动恢复，无需人工操作
- 提现成功后发现有消费退款导致佣金扣回的情况：从待结算佣金中扣减，不足时记负
- 打款确认由人工操作，系统不自动执行打款

---

### 状态流转

**提现状态迁移表：**

| 当前状态 | 下一状态 | 触发操作 | 操作人 | 条件 |
|---------|---------|---------|-------|------|
| pending | first_approved | 初审通过 | finance 角色 | — |
| pending | rejected | 初审拒绝 | finance 角色 | 需填写拒绝原因 |
| first_approved | second_approved | 复核通过 | admin/super_admin | — |
| first_approved | rejected | 复核驳回 | admin/super_admin | 需填写拒绝原因 |
| second_approved | paid | 确认打款 | finance 角色 | 上传打款凭证 |
| second_approved | rejected | 打款取消 | super_admin | 异常情况 |
| rejected | pending | 重新发起 | 代理端 | 需重新提交申请 |

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `agent.min_withdraw_amount` | decimal(10,2) | 10.00 | 最低提现金额 |
| `agent.withdraw_frequency_hours` | int | 24 | 提现频率限制（小时）|
| `agent.commission_freeze_days` | int | 7 | 佣金冻结天数 |
| `agent.auto_settlement_day` | int | 5 | 自动结算日（次月 5 日）|

---

## 五、活动管理

### 数据层

#### 1. campaigns（活动主表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| name | VARCHAR(128) | — | ✅ | — | 活动名称 |
| type | VARCHAR(32) | — | ✅ | ✅ | recharge_gift / cashback / first_charge / redemption / invite_reward / time_discount |
| status | VARCHAR(20) | 'draft' | ✅ | ✅ | draft / pending_review / active / paused / ended |
| start_time | TIMESTAMP | — | ✅ | ✅ | 活动开始时间 |
| end_time | TIMESTAMP | — | ✅ | ✅ | 活动结束时间 |
| trigger_condition | JSONB | — | ✅ | — | 触发条件配置 |
| reward_definition | JSONB | — | ✅ | — | 奖励定义 |
| budget_limit | DECIMAL(18,6) | NULL | ❌ | — | 总预算上限，NULL 表示无限制 |
| budget_used | DECIMAL(18,6) | 0 | ✅ | — | 已使用预算 |
| per_user_limit | DECIMAL(18,6) | NULL | ❌ | — | 单人奖励上限 |
| per_user_count_limit | INT | NULL | ❌ | — | 每人限领次数 |
| applicable_users | VARCHAR(20) | 'all' | ✅ | — | all / new_user / specified |
| applicable_payment | VARCHAR(64) | NULL | ❌ | — | 适用支付方式 |
| created_by | INTEGER | — | ✅ | — | 操作人 user_id |
| reviewed_by | INTEGER | NULL | ❌ | — | 审核人 user_id |
| reviewed_at | TIMESTAMP | NULL | ❌ | — | 审核时间 |
| auto_stop_on_budget | BOOLEAN | true | ✅ | — | 预算耗尽时自动暂停 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

**trigger_condition JSONB 结构示例：**
```json
// 充值满赠
{ "minRechargeAmount": "500.00" }
// 消费返利
{ "minConsumptionAmount": "1000.00" }
// 新客立减
{ "firstRechargeDiscount": 0.9 }
// 兑换码活动
{ "redemptionCodePool": "SUMMER-2026", "maxUsage": 1000 }
// 邀请奖励
{ "inviterAmount": "20.00", "inviteeAmount": "10.00" }
// 时段特惠
{ "timeRange": { "start": "22:00", "end": "06:00" }, "models": ["deepseek-chat"], "discountRate": 0.8 }
```

**reward_definition JSONB 结构示例：**
```json
// 充值满赠
{ "type": "balance", "amount": "50.00" }
// 消费返利
{ "type": "balance", "amount": "30.00", "asPercentOfConsumption": false }
// 新客立减
{ "type": "discount", "rate": 0.9 }
// 兑换码活动
{ "type": "balance", "amount": "20.00" }
// 邀请奖励
{ "type": "balance", "amount": {
  "inviter": "20.00",
  "invitee": "10.00"
}}
// 时段特惠
{ "type": "discount", "rate": 0.8, "scope": "model_specific" }
```

#### 2. campaign_participations（活动参与记录表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| campaign_id | INTEGER | — | ✅ | ✅ | 关联 `campaigns.id` |
| user_id | INTEGER | — | ✅ | ✅ | 关联 `users.id` |
| trigger_event | VARCHAR(64) | — | ✅ | — | 触发事件描述 |
| trigger_amount | DECIMAL(18,6) | — | ✅ | — | 触发时的金额 |
| reward_amount | DECIMAL(18,6) | — | ✅ | — | 发放的奖励金额 |
| reward_type | VARCHAR(32) | — | ✅ | — | balance / discount / token_quota |
| used_amount | DECIMAL(18,6) | 0 | ✅ | — | 已消费的奖励金额 |
| status | VARCHAR(20) | 'granted' | ✅ | ✅ | granted / partially_used / fully_used / expired |
| expired_at | TIMESTAMP | NULL | ❌ | — | 奖励过期时间 |
| created_at | TIMESTAMP | NOW() | ✅ | ✅ | — |

#### 3. redemption_codes（兑换码表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| code | VARCHAR(64) | — | ✅ | UNIQUE | 兑换码 |
| campaign_id | INTEGER | NULL | ❌ | ✅ | 关联活动（可选）|
| type | VARCHAR(20) | — | ✅ | — | balance / trial / discount / hybrid |
| balance_amount | DECIMAL(18,6) | NULL | ❌ | — | 余额码金额 |
| trial_config | JSONB | NULL | ❌ | — | 体验码配置（天数/次数/Token）|
| discount_rate | DECIMAL(5,2) | NULL | ❌ | — | 折扣率（折扣码）|
| total_quantity | INT | 0 | ✅ | — | 总数量，0=不限量 |
| used_count | INT | 0 | ✅ | — | 已使用次数 |
| max_uses_per_user | INT | 1 | ✅ | — | 每用户最大使用次数 |
| valid_from | TIMESTAMP | — | ✅ | ✅ | 有效期开始 |
| valid_until | TIMESTAMP | — | ✅ | ✅ | 有效期结束 |
| is_active | BOOLEAN | true | ✅ | ✅ | 是否启用 |
| created_by | INTEGER | — | ✅ | — | 操作人 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |

#### 4. redemption_logs（兑换记录表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| code_id | INTEGER | — | ✅ | ✅ | 关联 `redemption_codes.id` |
| user_id | INTEGER | — | ✅ | ✅ | 关联 `users.id` |
| reward_type | VARCHAR(20) | — | ✅ | — | 兑换内容类型 |
| reward_value | TEXT | — | ✅ | — | 兑换的具体值 |
| status | VARCHAR(20) | 'success' | ✅ | — | success / failed |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |

**数据一致性要求：**
- `campaigns.budget_used` 由 `campaign_participations` 聚合计算，预算耗尽时活动自动暂停
- 每次发放奖励需在事务中同时更新 `campaigns.budget_used`（加锁）和 `users.balance`
- 兑换码使用计数需用 `UPDATE ... SET used_count = used_count + 1 WHERE used_count < total_quantity` 原子操作防止超发

---

### 接口层

**API 1：创建活动**
- `POST /admin/campaigns`
- Request:
```json
{
  "name": "七月充值满赠",
  "type": "recharge_gift",
  "startTime": "2026-07-01T00:00:00Z",
  "endTime": "2026-07-31T23:59:59Z",
  "triggerCondition": { "minRechargeAmount": "500.00" },
  "rewardDefinition": { "type": "balance", "amount": "50.00" },
  "budgetLimit": "10000.00",
  "perUserLimit": "150.00",
  "perUserCountLimit": 3,
  "applicableUsers": "all",
  "applicablePayment": "all",
  "autoStopOnBudget": true
}
```

**API 2：提交审核 / 审核活动**
- `POST /admin/campaigns/:id/review`
- Request: `{ "action": "approve" | "reject", "comment?": string }`

**API 3：活动列表**
- `GET /admin/campaigns?status=&type=&page=&pageSize=`
- Response: `{ "data": Campaign[], "total": number }`

**API 4：活动详情 + 数据追踪**
- `GET /admin/campaigns/:id`
- Response:
```json
{
  "campaign": { ... },
  "stats": {
    "participants": 234,
    "totalRewardGiven": "3450.00",
    "usedRewardAmount": "2100.00",
    "incrementalConsumption": "12300.00",
    "roi": 2.56,
    "dailyTrend": [ { "date": "...", "participants": 10, "rewardAmount": "100.00" } ]
  }
}
```

**API 5：创建兑换码（admin）**
- `POST /admin/redemption-codes`
- Request: `{ "code": "SUMMER-2026", "type": "balance", "balanceAmount": "20.00", "totalQuantity": 1000, "validFrom": "...", "validUntil": "..." }`
- Response: 兑换码对象

**API 6：批量生成兑换码**
- `POST /admin/redemption-codes/batch`
- Request: `{ "prefix": "3C-SUMMER", "count": 500, "type": "balance", "balanceAmount": "10.00", ... }`
- Response: `{ "codes": ["3C-SUMMER-001", ...], "count": 500 }`

**API 7：用户端兑换兑换码**
- `POST /api/redemption/redeem`
- Request: `{ "code": "3C-SUMMER-2026" }`
- Response:
```json
{ "success": true, "rewardType": "balance", "rewardValue": "20.00", "message": "兑换成功！¥20.00 已到账" }
```

**API 8：手动结束活动**
- `POST /admin/campaigns/:id/end`
- Response: `{ "id": number, "status": "ended" }`

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `budget_exceeded` | 预算已耗尽 |
| 400 | `user_limit_reached` | 已达到单人领取上限 |
| 400 | `code_invalid` | 兑换码无效 |
| 400 | `code_expired` | 兑换码已过期 |
| 400 | `code_fully_used` | 兑换码已用完 |
| 400 | `already_redeemed` | 该兑换码已被该用户使用 |
| 400 | `campaign_not_active` | 活动不在进行中 |
| 400 | `not_eligible` | 用户不满足活动条件 |

**缓存策略**：
- 活动配置缓存 60 秒
- 兑换码信息缓存 10 秒（每次核销后失效）
- 活动数据追踪不缓存

---

### 业务逻辑

**活动触发与奖励发放（伪代码）：**

```
FUNCTION trigger_campaign(user_id, event_type, event_amount, metadata):
    // 查找所有处于 active 状态的匹配活动
    active_campaigns = SELECT * FROM campaigns 
                       WHERE status = 'active' 
                       AND start_time <= NOW() AND end_time >= NOW()
                       AND (budget_limit IS NULL OR budget_used < budget_limit)
    
    FOR each campaign IN active_campaigns:
        IF NOT is_user_eligible(campaign, user_id):
            CONTINUE
        
        SWITCH campaign.type:
            CASE 'recharge_gift':
                IF event_type == 'recharge' AND event_amount >= campaign.trigger_condition.minRechargeAmount:
                    IF check_user_count_limit(campaign, user_id):
                        grant_reward(campaign, user_id, event_amount)
            
            CASE 'cashback':
                IF event_type == 'consumption' AND event_amount >= campaign.trigger_condition.minConsumptionAmount:
                    grant_reward(campaign, user_id, event_amount)
            
            CASE 'first_charge':
                IF event_type == 'first_recharge':
                    grant_reward(campaign, user_id, event_amount)
            
            CASE 'invite_reward':
                IF event_type == 'invitee_first_consumption':
                    // 双方发放奖励
                    grant_reward_to(campaign, metadata.inviter_id, campaign.reward_definition.amount.inviter)
                    grant_reward_to(campaign, metadata.invitee_id, campaign.reward_definition.amount.invitee)
            
            CASE 'time_discount':
                IF event_type == 'consumption' AND is_in_time_range(campaign):
                    // 折扣在计费时应用，此处不发放奖励
                    // 价格调整由计费引擎通过价格层级 L5 活动价处理
                    CONTINUE
    
    RETURN

FUNCTION grant_reward(campaign, user_id, trigger_amount):
    reward_amt = parse_reward_amount(campaign.reward_definition, trigger_amount)
    
    // 预算检查（带锁）
    BEGIN TRANSACTION:
        campaign = SELECT * FROM campaigns WHERE id = campaign.id FOR UPDATE
        IF campaign.budget_limit IS NOT NULL AND campaign.budget_used + reward_amt > campaign.budget_limit:
            ROLLBACK
            RAISE 'budget_exceeded'
        
        // 单人限额检查
        IF campaign.per_user_limit IS NOT NULL:
            user_total = SELECT SUM(reward_amount) FROM campaign_participations 
                         WHERE campaign_id = campaign.id AND user_id = user_id
            IF user_total + reward_amt > campaign.per_user_limit:
                ROLLBACK
                RAISE 'user_limit_reached'
        
        // 发放奖励
        UPDATE users SET balance = balance + reward_amt WHERE id = user_id
        
        // 记录参与
        INSERT INTO campaign_participations(campaign_id, user_id, trigger_event, trigger_amount, reward_amount, reward_type)
        
        // 更新预算
        UPDATE campaigns SET budget_used = budget_used + reward_amt WHERE id = campaign.id
        
        // 预算耗尽检查
        IF campaign.budget_limit IS NOT NULL AND campaign.budget_used >= campaign.budget_limit:
            UPDATE campaigns SET status = 'paused' WHERE id = campaign.id
            SEND_NOTIFICATION(admin, '活动预算耗尽', "活动「{name}」预算已耗尽，已自动暂停")
    
    COMMIT
    SEND_NOTIFICATION(user_id, '活动奖励', "恭喜！在活动「{name}」中获得 ¥{reward_amt} 奖励")
```

**兑换码核销逻辑：**

```
FUNCTION redeem_code(user_id, code):
    code_record = SELECT * FROM redemption_codes WHERE code = code AND is_active = true
    IF NOT code_record: RETURN {error: 'code_invalid'}
    
    // 有效期检查
    IF NOW() < code_record.valid_from OR NOW() > code_record.valid_until:
        RETURN {error: 'code_expired'}
    
    // 限量检查（原子操作防止超发）
    IF code_record.total_quantity > 0:
        updated = UPDATE redemption_codes 
                  SET used_count = used_count + 1 
                  WHERE id = code_record.id AND used_count < total_quantity
        IF updated.rowCount == 0:
            RETURN {error: 'code_fully_used'}
    
    // 每人限领检查
    user_uses = SELECT COUNT(*) FROM redemption_logs WHERE code_id = code_record.id AND user_id = user_id
    IF user_uses >= code_record.max_uses_per_user:
        RETURN {error: 'already_redeemed'}
    
    // 根据兑换码类型发放奖励
    SWITCH code_record.type:
        CASE 'balance': UPDATE users SET balance = balance + code_record.balance_amount WHERE id = user_id
        CASE 'trial':   INSERT INTO user_quotas(user_id, trial_config, expires_at)
        CASE 'discount': INSERT INTO user_discounts(user_id, discount_rate, ...)
    
    INSERT INTO redemption_logs(code_id, user_id, reward_type, reward_value, status='success')
    
    RETURN {success: true, rewardType: code_record.type, rewardValue: ...}
```

**活动自动结束定时任务：**

```
CRON JOB（每分钟执行）：
    // 到达结束时间的活动
    UPDATE campaigns SET status = 'ended' 
    WHERE status = 'active' AND end_time <= NOW()
    
    // 预算耗尽的活动
    UPDATE campaigns SET status = 'paused'
    WHERE status = 'active' AND budget_limit IS NOT NULL AND budget_used >= budget_limit
```

**边界条件：**
- 活动预算为 0 时：`budget_limit IS NULL` 表示无限制，不自动暂停
- 活动正在运行中修改规则：先暂停活动 → 修改规则 → 重新激活
- 时间跨时区：所有时间存储为 UTC+0，前端转换显示为 UTC+8

---

### 状态流转

**活动状态迁移表：**

| 当前状态 | 下一状态 | 触发操作 | 说明 |
|---------|---------|---------|------|
| draft | pending_review | 提交审核 | 运营提交活动等待审核 |
| pending_review | active | 审核通过 | 审核通过后自动激活 |
| pending_review | draft | 审核驳回 | 驳回后可继续修改 |
| active | paused | 预算耗尽/手动暂停 | 自动（预算耗尽）或手动 |
| active | ended | 到达结束时间/手动结束 | 自动或手动结束 |
| paused | active | 手动恢复 | 补充预算后重新激活 |
| paused | ended | 手动结束 | 确认不再恢复 |

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `campaign.max_active_count` | int | 10 | 同时进行中的活动数上限 |
| `campaign.budget_warning_threshold` | decimal(5,2) | 80.00 | 预算使用率达到该百分比时预警 |

---

## 六、公告管理

### 数据层

#### 1. announcements（公告主表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| title | VARCHAR(256) | — | ✅ | — | 公告标题 |
| type | VARCHAR(32) | 'notice' | ✅ | ✅ | notice / maintenance / update / event / alert |
| content | TEXT | — | ✅ | — | HTML 富文本内容 |
| status | VARCHAR(20) | 'draft' | ✅ | ✅ | draft / published / archived |
| is_pinned | BOOLEAN | false | ✅ | — | 是否置顶 |
| target_users | VARCHAR(20) | 'all' | ✅ | — | all / agent / user / specified |
| scheduled_at | TIMESTAMP | NULL | ❌ | — | 定时发布时间，NULL=立即发布 |
| published_at | TIMESTAMP | NULL | ❌ | — | 实际发布时间 |
| push_count | INT | 0 | ✅ | — | 推送人数 |
| read_count | INT | 0 | ✅ | — | 已读人数 |
| created_by | INTEGER | — | ✅ | — | 操作人 user_id |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

#### 2. announcement_read_logs（公告已读记录表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| announcement_id | INTEGER | — | ✅ | ✅ | 关联 `announcements.id` |
| user_id | INTEGER | — | ✅ | ✅ | 关联 `users.id` |
| read_at | TIMESTAMP | NOW() | ✅ | — | 阅读时间 |
| UNIQUE (announcement_id, user_id) | — | — | ✅ | — | 同一条公告对同一用户只记录一次 |

**数据一致性要求：**
- `announcements.read_count` 从 `announcement_read_logs` 聚合计算
- 已读统计不要求实时强一致，允许分钟级延迟

---

### 接口层

**API 1：创建/编辑公告（admin）**
- `POST /admin/announcements`
- Request:
```json
{
  "title": "7 月系统维护通知",
  "type": "maintenance",
  "content": "<h2>维护通知</h2><p>内容...</p>",
  "scheduledAt": "2026-07-30T23:00:00Z",
  "targetUsers": "all",
  "isPinned": false
}
```

**API 2：公告列表（admin）**
- `GET /admin/announcements?status=&type=&page=&pageSize=`
- Response: Announcement[]

**API 3：发布公告（admin）**
- `POST /admin/announcements/:id/publish`
- Response: `{ "status": "published", "publishedAt": string }`

**API 4：已读统计详情（admin）**
- `GET /admin/announcements/:id/read-stats`
- Response:
```json
{
  "announcementId": 1,
  "pushCount": 12345,
  "readCount": 8901,
  "readRate": 72.1,
  "unreadUsers": [
    { "userId": 1002, "nickname": "李四", "email": "l**@example.com" }
  ],
  "totalUnread": 3444,
  "page": 1,
  "pageSize": 20
}
```

**API 5：向未读用户再次推送（admin）**
- `POST /admin/announcements/:id/re-push`
- Response: `{ "pushedCount": 3444 }`

**API 6：用户端获取公告列表**
- `GET /api/announcements?page=&pageSize=`
- Response: `{ "data": AnnouncementSummary[], "unreadCount": number }`

**API 7：标记已读（用户端）**
- `POST /api/announcements/:id/read`
- Response: `{ "success": true }`

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `already_published` | 公告已发布，不可重复发布 |
| 400 | `scheduled_in_past` | 定时时间不能早于当前时间 |
| 404 | `announcement_not_found` | 公告不存在 |

**缓存策略**：
- 用户端公告列表缓存 30 秒（Redis）
- 已读状态不缓存

---

### 业务逻辑

**定时发布定时任务：**

```
CRON JOB（每分钟执行）：
    announcements_to_publish = SELECT * FROM announcements 
                               WHERE status = 'draft' 
                               AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
    
    FOR each announcement IN announcements_to_publish:
        UPDATE announcements SET status = 'published', published_at = NOW() WHERE id = announcement.id
        // 创建推送任务
        INSERT INTO notification_tasks(target_type='announcement', target_id=announcement.id, ...)
```

**已读统计：**

```
当用户阅读公告时：
    INSERT INTO announcement_read_logs(announcement_id, user_id) 
    ON CONFLICT (announcement_id, user_id) DO NOTHING
    
    // 异步更新 read_count（由定时任务批量聚合）
    ASYNC: UPDATE announcements SET read_count = (
        SELECT COUNT(*) FROM announcement_read_logs WHERE announcement_id = id
    ) WHERE id = announcement_id
```

**边界条件：**
- 已读统计中的 `push_count` 初始值为目标用户总数（定时脚本统计）
- 已删除用户不计入已读统计
- 管理员发布的公告自动标记为已读
- 向未读用户再次推送：通过站内通知 + WebSocket 推送实现

---

### 状态流转

**公告状态迁移表：**

| 当前状态 | 下一状态 | 触发操作 | 说明 |
|---------|---------|---------|------|
| draft | published | 手动发布 / 定时到达 | 立即发布或定时发布 |
| published | draft | 撤回 | 发布后撤回修正 |
| published | archived | 归档 | 超过 30 天自动归档 |

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `announcement.archive_days` | int | 30 | 自动归档天数 |

---

## 七、敏感词库

### 数据层

#### 1. sensitive_words（敏感词表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| word | VARCHAR(128) | — | ✅ | ✅ | 敏感词内容 |
| category | VARCHAR(32) | 'custom' | ✅ | ✅ | porn / political / violence / ad / custom |
| severity | VARCHAR(10) | 'high' | ✅ | ✅ | high / medium / low |
| hit_action | VARCHAR(32) | 'block_request' | ✅ | — | block_request / block_and_disable_key / block_and_notify / log_only |
| is_active | BOOLEAN | true | ✅ | ✅ | 是否启用 |
| created_by | INTEGER | — | ✅ | — | 操作人 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

#### 2. sensitive_word_hit_logs（命中记录表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | 自增主键 |
| word_id | INTEGER | — | ✅ | ✅ | 关联 `sensitive_words.id` |
| user_id | INTEGER | — | ✅ | ✅ | 触发的用户 |
| api_key_id | INTEGER | NULL | ❌ | — | 关联 `api_keys.id` |
| request_content | TEXT | — | ✅ | — | 触发内容片段 |
| hit_position | VARCHAR(64) | — | ❌ | — | 命中位置描述 |
| action_taken | VARCHAR(32) | — | ✅ | — | 实际执行的动作 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |

**数据一致性要求：**
- 敏感词库变更后，已在运行中的请求仍使用旧词库，新请求使用新词库
- 命中日志为 append-only，不删除

---

### 接口层

**API 1：添加敏感词**
- `POST /admin/sensitive-words`
- Request: `{ "word": "敏感词", "category": "porn", "severity": "high", "hitAction": "block_request" }`
- Response 201: SensitiveWord

**API 2：批量导入**
- `POST /admin/sensitive-words/import`
- Request: multipart/form-data 上传 TXT/CSV 文件
- Response: `{ "imported": 200, "skipped": 5, "errors": ["第 3 行格式错误: ..."] }`

**API 3：敏感词列表 + 搜索**
- `GET /admin/sensitive-words?category=&severity=&search=&page=&pageSize=`
- Response: `{ "data": SensitiveWord[], "total": number }`

**API 4：编辑敏感词**
- `PUT /admin/sensitive-words/:id`
- Request: `{ "word?": "...", "category?": "...", "hitAction?": "..." }`

**API 5：删除敏感词**
- `DELETE /admin/sensitive-words/:id`

**API 6：测试功能**
- `POST /admin/sensitive-words/test`
- Request: `{ "text": "要测试的文本内容" }`
- Response:
```json
{
  "hits": [
    { "word": "敏感词1", "category": "政治", "severity": "high", "position": "第 15-18 字" },
    { "word": "敏感词2", "category": "色情", "severity": "high", "position": "第 34-37 字" }
  ],
  "totalHits": 2
}
```

**API 7：命中记录查询**
- `GET /admin/sensitive-words/hit-logs?wordId=&userId=&startDate=&endDate=&page=&pageSize=`
- Response: `{ "data": HitLog[], "total": number }`

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `word_exists` | 敏感词已存在 |
| 400 | `import_format_error` | 导入文件格式错误 |

**缓存策略**：
- 敏感词库全量加载到 Redis Set，每分钟轮询检查变更版本号重新加载
- 命中后的动作执行由风控中间件同步处理

---

### 业务逻辑

**敏感词检查（在 API 请求中间件中执行）：**

```
FUNCTION check_sensitive_content(text, user_id, api_key_id):
    // 从 Redis 加载活跃敏感词库
    active_words = REDIS.SMEMBERS('sensitive_words:active')
    // 版本号检查
    current_version = REDIS.GET('sensitive_words:version')
    IF NOT current_version OR current_version != local_version:
        active_words = RELOAD_FROM_DB()
        REDIS.SADD('sensitive_words:active', active_words)
        REDIS.SET('sensitive_words:version', version)
    
    // 逐词匹配（使用 Aho-Corasick 自动机算法提高性能）
    hits = AC_SEARCH(text, active_words)
    
    IF hits.length > 0:
        FOR each hit IN hits:
            word_config = GET_WORD_CONFIG(hit.word_id)
            
            // 记录命中日志
            INSERT INTO sensitive_word_hit_logs(...)
            
            // 执行命中动作
            SWITCH word_config.hit_action:
                CASE 'block_request':
                    RETURN {block: true, reason: "内容命中敏感词筛选规则"}
                
                CASE 'block_and_disable_key':
                    UPDATE api_keys SET status = 'disabled' WHERE id = api_key_id
                    SEND_NOTIFICATION(admin, "Key 因命中敏感词被禁用", ...)
                    RETURN {block: true, reason: "内容命中敏感词筛选规则"}
                
                CASE 'block_and_notify':
                    SEND_NOTIFICATION(admin, "敏感词命中告警", ...)
                    RETURN {block: true, reason: "内容命中敏感词筛选规则"}
                
                CASE 'log_only':
                    // 仅记录，不拦截
                    CONTINUE
    
    RETURN {block: false}
```

**边界条件：**
- 敏感词匹配对用户端的 `chat/completions` 请求的 `messages[].content` 每个文本字段进行检查
- 空文本不检查
- 大量命中（同一请求命中 50+ 词）时只记录前 10 条命中日志，避免日志膨胀
- Aho-Corasick 自动机在词库变更后重建，重建期间使用旧自动机

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `sensitive_word.enabled` | boolean | true | 是否开启敏感词检查 |
| `sensitive_word.max_hit_logs_per_request` | int | 10 | 单次请求最大记录条数 |
| `sensitive_word.cache_refresh_seconds` | int | 60 | 词库缓存刷新间隔 |

---

## 八、邮件模板

### 数据层

#### 1. email_templates（邮件模板表）

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | SERIAL | — | ✅ | PK | 自增主键 |
| name | VARCHAR(128) | — | ✅ | — | 模板名称 |
| scene | VARCHAR(64) | — | ✅ | ✅ | recharge_success / balance_low / key_expiring / realname_pass / realname_reject / invoice_ready / withdraw_complete / security_alert / verification_code |
| subject | VARCHAR(256) | — | ✅ | — | 邮件标题，含变量占位符 |
| body_html | TEXT | — | ✅ | — | HTML 正文，含变量占位符 |
| variables | JSONB | — | ✅ | — | 变量定义列表 |
| is_active | BOOLEAN | true | ✅ | — | 是否启用 |
| updated_by | INTEGER | — | ✅ | — | 最后修改人 |
| created_at | TIMESTAMP | NOW() | ✅ | — | — |
| updated_at | TIMESTAMP | NOW() | ✅ | — | — |

**variables JSONB 结构：**
```json
[
  { "key": "username", "label": "用户昵称", "example": "张三" },
  { "key": "amount", "label": "充值金额", "example": "100.00" },
  { "key": "time", "label": "充值时间", "example": "2026-07-26 11:35" },
  { "key": "balance", "label": "充值后余额", "example": "234.50" }
]
```

**数据一致性要求：**
- 每个 `scene` 只能有一个激活的模板
- 变量替换使用字符串模板引擎（Nunjucks/Mustache），不涉及 SQL

---

### 接口层

**API 1：创建/编辑邮件模板（admin）**
- `POST /admin/email-templates`
- Request:
```json
{
  "name": "充值成功通知",
  "scene": "recharge_success",
  "subject": "充值成功 - {{amount}} 已到账",
  "bodyHtml": "<p>尊敬的 {{username}}，您好！</p><p>您在 {{time}} 充值 ¥{{amount}} 已成功到账。</p><p>当前余额：¥{{balance}}</p>",
  "variables": [
    { "key": "username", "label": "用户昵称", "example": "张三" },
    { "key": "amount", "label": "充值金额", "example": "100.00" }
  ],
  "isActive": true
}
```

**API 2：模板列表（admin）**
- `GET /admin/email-templates?scene=&page=&pageSize=`
- Response: EmailTemplate[]

**API 3：模板预览（admin）**
- `POST /admin/email-templates-preview`
- Request: `{ "templateId": 1, "testVariables": { "username": "张三", "amount": "100.00", "time": "2026-07-26 11:35", "balance": "234.50" } }`
- Response:
```json
{
  "subject": "充值成功 - ¥100.00 已到账",
  "bodyHtml": "<p>尊敬的 张三，您好！</p><p>您在 2026-07-26 11:35 充值 ¥100.00 已成功到账。</p><p>当前余额：¥234.50</p>"
}
```

**API 4：发送测试邮件**
- `POST /admin/email-templates/:id/test-send`
- Request: `{ "to": "admin@3cloud.ai", "testVariables": { "username": "张三", "amount": "100.00" } }`
- Response: `{ "sent": true }`

**API 5：根据场景获取模板（内部 Service）**
- `GET /internal/email-templates/:scene`
- Response: EmailTemplate（含编译后的 subject 和 body）

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `scene_has_active` | 该场景已有激活模板 |
| 400 | `invalid_variable` | 模板中使用未定义的变量 |
| 400 | `unclosed_variable` | 模板变量语法错误（未闭合的 {{）|

**缓存策略**：邮件模板按场景缓存 10 分钟（Redis）。

---

### 业务逻辑

**模板渲染逻辑：**

```
FUNCTION render_email_template(scene, context):
    template = REDIS.GET(`email_template:${scene}`)
    IF NOT template:
        template = SELECT * FROM email_templates WHERE scene = scene AND is_active = true
        REDIS.SET(`email_template:${scene}`, JSON.stringify(template), 'EX', 600)
    
    // 变量替换
    rendered_subject = template.subject
    rendered_body = template.body_html
    FOR each var IN template.variables:
        value = context[var.key] ?? var.example  // 无实际值时用示例值（预览模式）
        rendered_subject = rendered_subject.replace(`{{${var.key}}}`, value)
        rendered_body = rendered_body.replace(`{{${var.key}}}`, value)
    
    RETURN { subject: rendered_subject, bodyHtml: rendered_body }
```

**邮件发送频率控制：**

```
FUNCTION can_send_email(user_id, scene):
    // 每日邮件上限
    daily_limit = GET_CONFIG('notification.daily_email_limit')
    today_count = SELECT COUNT(*) FROM email_send_logs 
                  WHERE user_id = user_id AND created_at >= date_trunc('day', NOW())
    IF today_count >= daily_limit:
        RETURN false
    
    // 场景级频率
    SWITCH scene:
        CASE 'verification_code':  // 每 60 秒 1 次
            last_sent = SELECT MAX(created_at) FROM email_send_logs 
                        WHERE user_id = user_id AND scene = 'verification_code'
            IF last_sent AND NOW() - last_sent < INTERVAL '60 seconds':
                RETURN false
        CASE 'balance_low':  // 每日最多 1 次
            today_sent = SELECT COUNT(*) FROM email_send_logs 
                         WHERE user_id = user_id AND scene = 'balance_low' 
                         AND created_at >= date_trunc('day', NOW())
            IF today_sent > 0:
                RETURN false
    
    RETURN true
```

**边界条件：**
- 变量不匹配：如果模板中使用了未在 `variables` 中定义的占位符，替换时保留原样（不替换）
- HTML 安全性：`body_html` 不进行转义（允许富文本），但 XSS 过滤应在 Admin 前端编辑器层面处理
- 模板中变量名大小写敏感，统一使用小写字母 + 下划线

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `notification.daily_email_limit` | int | 5 | 每用户每天邮件上限 |
| `email.smtp_host` | encrypted | — | SMTP 主机 |
| `email.smtp_port` | int | 465 | SMTP 端口 |
| `email.from_address` | text | "support@3cloud.ai" | 发件人地址 |

---

## 九、佣金管理（admin 端）

### 数据层

本章对全局佣金规则的管理复用 `agent_commission_configs` 表（agent_id = NULL 表示全局规则），以及对 `agent_commission_logs` 的查询。

**数据一致性要求：**
- 修改全局规则后，正在结算中的周期不受影响（除非勾选追溯）
- 删除阶梯档位时检查该档位是否已有已结算佣金记录，如有则禁止删除（仅允许停用）

---

### 接口层

**API 1：获取全局默认佣金规则**
- `GET /admin/finance/commissions/default`
- Response:
```json
{
  "defaultRate": "10.00",
  "minRate": "3.00",
  "maxRate": "30.00",
  "calcBase": "consumption_amount",
  "tiers": [
    { "minAmount": "0", "maxAmount": "1000", "rate": "5.00" },
    { "minAmount": "1000", "maxAmount": "5000", "rate": "8.00" },
    { "minAmount": "5000", "maxAmount": "20000", "rate": "12.00" },
    { "minAmount": "20000", "maxAmount": null, "rate": "15.00" }
  ],
  "exclusions": [
    { "agentId": 1, "agentName": "TechAgent", "rate": "12.00", "ruleType": "fixed_rate" }
  ]
}
```

**API 2：更新全局佣金阶梯**
- `PUT /admin/finance/commissions/default/tiers`
- Request:
```json
{
  "tiers": [
    { "minAmount": "0", "maxAmount": "1000", "rate": "5.00" },
    { "minAmount": "1000", "maxAmount": "5000", "rate": "8.00" },
    { "minAmount": "5000", "maxAmount": "20000", "rate": "12.00" },
    { "minAmount": "20000", "maxAmount": null, "rate": "15.00" }
  ],
  "effectiveFrom": "2026-08-01T00:00:00Z",
  "retroactive": false
}
```

**API 3：更新全局默认佣金比例**
- `PUT /admin/finance/commissions/default/rate`
- Request: `{ "defaultRate": "12.00" }`
- Response: `{ "defaultRate": "12.00" }`

**API 4：佣金流水查询**
- `GET /admin/finance/commissions/flow?agentId=&userId=&status=&settlementPeriod=&startDate=&endDate=&page=&pageSize=`
- Response:
```json
{
  "data": [
    {
      "id": 1,
      "time": "2026-07-26 11:35",
      "agentName": "TechAgent",
      "sourceUser": { "id": 12345, "nickname": "张三" },
      "consumptionAmount": "100.00",
      "commissionRate": "10.00",
      "commissionAmount": "10.00",
      "settlementStatus": "pending",
      "settlementPeriod": "2026-07"
    }
  ],
  "total": 234,
  "summary": {
    "totalConsumptionAmount": "23400.00",
    "totalCommissionAmount": "2340.00"
  }
}
```

**API 5：佣金规则变更审计日志**
- `GET /admin/finance/commissions/audit-log`
- Response:
```json
{
  "data": [
    {
      "id": 1,
      "operatorId": 1001,
      "operatorName": "admin@3cloud.ai",
      "changedAt": "2026-07-26 11:30",
      "changes": [
        { "field": "default_rate", "before": "10.00", "after": "15.00" },
        { "field": "tier_2_rate", "before": "8.00", "after": "12.00" }
      ],
      "reason": "供应商降价，同步调整佣金策略"
    }
  ]
}
```

**错误码**：

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `tier_gap_or_overlap` | 阶梯存在缺口或重叠 |
| 400 | `no_unbounded_top_tier` | 最后档位必须无上限 |
| 400 | `rate_exceeds_config_limit` | 佣金率超出系统配置限制 |

**缓存策略**：全局佣金规则缓存 5 分钟。佣金流水不缓存。

---

### 业务逻辑

**全局阶梯与代理级覆盖的优先级规则：**

```
佣金规则优先级：
1. 代理级自定义规则（agent_commission_configs.agent_id = 指定ID）
   ├── 固定比例（覆盖其他所有规则）
   ├── 自定义阶梯（替换全局阶梯）
   └── 混合规则（按模型差异化）
2. 全局规则（agent_commission_configs.agent_id IS NULL）
   ├── 全局阶梯
   └── 全局默认比例（代理未配置任何规则时才使用）
```

**变更审计记录逻辑：**

```
FUNCTION log_commission_change(agent_id, before_config, after_config, operator_id, reason):
    changes = []
    FOR each field IN ['default_rate', 'tiers', 'min_rate', 'max_rate']:
        IF before_config[field] != after_config[field]:
            changes.push({
                field: field,
                before: before_config[field],
                after: after_config[field]
            })
    
    INSERT INTO audit_logs(
        operator_id, operator_name, action: 'commission.rule.change',
        target_type: 'agent_commission_configs',
        target_id: agent_id ?? 'global',
        before_value: JSON.stringify(before_config),
        after_value: JSON.stringify(after_config),
        reason: reason,
        result: 'success'
    )
```

**边界条件：**
- 空数据：全局默认规则不存在时，佣金计算返回 0
- 阶梯档位重叠：后端校验各档位 `minAmount < maxAmount`，且前后档位不重叠
- 并发修改：加表级锁（建议使用 Redis 分布式锁 + 乐观锁版本号）

---

### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|-------|------|-------|------|
| `commission.default_rate` | decimal(5,2) | 10.00 | 默认佣金比例 |
| `commission.min_rate` | decimal(5,2) | 3.00 | 最低佣金率 |
| `commission.max_rate` | decimal(5,2) | 30.00 | 最高佣金率 |
| `commission.calc_base` | text | 'consumption_amount' | 计算基准 |

---

## 附录 A：数据库新增表汇总

| 序号 | 表名 | 说明 | 归属模块 |
|------|------|------|---------|
| 1 | `agents` | 代理商主表 | 代理商体系 |
| 2 | `agent_commission_configs` | 佣金规则配置 | 佣金管理 |
| 3 | `agent_commission_logs` | 佣金流水 | 佣金管理 |
| 4 | `agent_customer_relations` | 代理-客户关系 | 代理商体系 |
| 5 | `agent_withdraws` | 提现申请 | 提现管理 |
| 6 | `agent_level_history` | 等级变更历史 | 代理商体系 |
| 7 | `agent_settlement` | 结算周期 | 提现管理 |
| 8 | `campaigns` | 活动管理 | 营销运营 |
| 9 | `campaign_participations` | 活动参与记录 | 营销运营 |
| 10 | `redemption_codes` | 兑换码 | 营销运营 |
| 11 | `redemption_logs` | 兑换记录 | 营销运营 |
| 12 | `announcements` | 公告 | 公告管理 |
| 13 | `announcement_read_logs` | 公告已读记录 | 公告管理 |
| 14 | `sensitive_words` | 敏感词 | 敏感词库 |
| 15 | `sensitive_word_hit_logs` | 敏感词命中记录 | 敏感词库 |
| 16 | `email_templates` | 邮件模板 | 邮件模板 |

## 附录 B：分布式事件/任务清单

| 事件名称 | 触发时机 | 消费者 |
|---------|---------|-------|
| `campaign.budget.exhausted` | 活动预算耗尽 | 暂停活动 + 通知运营 |
| `campaign.time.ended` | 活动到达结束时间 | 自动关闭活动 |
| `campaign.reward.granted` | 奖励发放成功 | 通知用户 |
| `agent.commission.earned` | 佣金产生 | 更新代理余额聚合 |
| `agent.withdraw.status_changed` | 提现状态变更 | 通知代理/审核人 |
| `agent.withdraw.paid` | 打款确认 | 扣减余额 + 通知 + 更新结算 |
| `announcement.published` | 公告发布/定时到达 | 推送通知 |
| `announcement.read.updated` | 用户标记已读 | 更新已读计数 |
| `email.template.changed` | 邮件模板变更 | 失效 CDN/缓存 |
| `commission.rule.changed` | 佣金规则变更 | 失效缓存 + 追溯任务（如有）|
| `agent.level.promoted` | 代理等级变更 | 通知代理 + 更新权益 |

## 附录 C：涉及 site_configs 配置项完整清单

| 配置项 | 类型 | 默认值 | 功能模块 |
|-------|------|-------|---------|
| `agent.default_commission_rate` | decimal(5,2) | 10.00 | 代理商体系 |
| `agent.min_commission_rate` | decimal(5,2) | 3.00 | 代理商体系 |
| `agent.max_commission_rate` | decimal(5,2) | 30.00 | 代理商体系 |
| `agent.senior_threshold_tokens` | bigint | 1000000 | 代理商体系 |
| `agent.max_sub_agent_per_level1` | int | 50 | 代理商体系 |
| `agent.commission_calc_base` | text | 'consumption_amount' | 代理商体系 |
| `agent.dashboard_cache_ttl` | int | 30 | 代理商体系 |
| `agent.dashboard_trend_days` | int | 30 | 代理商体系 |
| `agent.min_withdraw_amount` | decimal(10,2) | 10.00 | 提现管理 |
| `agent.withdraw_frequency_hours` | int | 24 | 提现管理 |
| `agent.commission_freeze_days` | int | 7 | 提现管理 |
| `agent.auto_settlement_day` | int | 5 | 提现管理 |
| `commission.default_rate` | decimal(5,2) | 10.00 | 佣金管理 |
| `commission.min_rate` | decimal(5,2) | 3.00 | 佣金管理 |
| `commission.max_rate` | decimal(5,2) | 30.00 | 佣金管理 |
| `commission.freeze_days` | int | 7 | 佣金管理 |
| `commission.settlement_period` | text | 'monthly' | 佣金管理 |
| `campaign.max_active_count` | int | 10 | 活动管理 |
| `campaign.budget_warning_threshold` | decimal(5,2) | 80.00 | 活动管理 |
| `announcement.archive_days` | int | 30 | 公告管理 |
| `sensitive_word.enabled` | boolean | true | 敏感词库 |
| `sensitive_word.max_hit_logs_per_request` | int | 10 | 敏感词库 |
| `sensitive_word.cache_refresh_seconds` | int | 60 | 敏感词库 |
| `notification.daily_email_limit` | int | 5 | 邮件模板 |
| `email.smtp_host` | encrypted | — | 邮件模板 |
| `email.smtp_port` | int | 465 | 邮件模板 |
| `email.from_address` | text | "support@3cloud.ai" | 邮件模板 |
| `settlement.default_markup_rate` | decimal(5,2) | 10.00 | 结算（佣金管理关联）|
| `settlement.default_commission_rate` | decimal(5,2) | 10.00 | 结算（佣金管理关联）|

---

*本文档为 DRD 技术规格说明书版本 V1.0，依据 PRD-运营级.md 生成。所有字段定义、接口设计、业务逻辑均以 PRD 实际定义为准。*
