# 3cloud（3C）AI Token 聚合平台 — 核心引擎技术实现规格说明书（DRD）

> **文档版本**：V1.0 | **对应 PRD**：V4.0-运营级 第 5 章 + 第 1 章
> **覆盖模块**：智能路由系统 | 计费与结算精化 | 限流引擎 | 通知与告警精化
> **文档定位**：字段级数据层定义、接口层契约、业务逻辑伪代码、状态流转表、配置项清单
> **关联文档**：`PRD-运营级.md` / `DRD-用户体系.md` / `DRD-代理商体系.md` / `DRD-管理后台.md`

---

## 目录

1. [智能路由系统](#1-智能路由系统)
   - 1.1 鉴权引擎
   - 1.2 路由决策与负载均衡
   - 1.3 熔断器
   - 1.4 健康检查
2. [计费与结算精化](#2-计费与结算精化)
   - 2.1 价格层级与优先级
   - 2.2 实时计费执行
   - 2.3 账单周期与账单生成
   - 2.4 自动对账
3. [限流引擎](#3-限流引擎)
   - 3.1 四级限流
   - 3.2 限流命中响应
   - 3.3 限流统计与可视化
4. [通知与告警精化](#4-通知与告警精化)
   - 4.1 通知推送架构
   - 4.2 告警规则配置
   - 4.3 告警推送执行
5. [核心商业指标与运营数据](#5-核心商业指标与运营数据)
   - 5.1 运营 KPI 数据层
   - 5.2 用户分层运营数据

---

## 1. 智能路由系统

### 1.1 鉴权引擎

#### 数据层

**涉及表：`api_keys`（新增/修改字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `uuid` | `gen_random_uuid()` | ✅ | PK | 主键 |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | 关联 `users.id` |
| `alias` | `varchar(50)` | — | ✅ | — | 用户自定义别名 |
| `key_prefix` | `varchar(16)` | — | ✅ | UNIQUE INDEX | Key 前缀（明文前 8 位） |
| `key_hash` | `varchar(64)` | — | ✅ | UNIQUE INDEX | SHA-256 哈希值 |
| `key_last8` | `varchar(8)` | — | ✅ | — | Key 末尾 8 位（用于脱敏展示） |
| `status` | `varchar(16)` | `'active'` | ✅ | INDEX | `active` / `disabled` / `expired` |
| `expires_at` | `timestamptz` | `NULL` | ❌ | — | NULL 表示永不过期 |
| `ip_whitelist` | `jsonb` | `'[]'` | ❌ | — | IP/CIDR 数组，空数组不限制 |
| `model_scope` | `jsonb` | `'["*"]'` | ❌ | — | `["*"]` 表示全部模型；否则为模型 ID 数组 |
| `permission_level` | `varchar(16)` | `'readwrite'` | ✅ | — | `readwrite` / `readonly` / `custom` |
| `allowed_endpoints` | `jsonb` | `'["*"]'` | ❌ | — | permission_level=custom 时的端点白名单 |
| `qps_limit` | `int` | `50` | ✅ | — | Key 级别 QPS 上限 |
| `tpm_limit` | `int` | `300000` | ✅ | — | Key 级别 TPM 上限 |
| `daily_call_limit` | `int` | `0` | ✅ | — | 0 表示不限 |
| `last_used_at` | `timestamptz` | `NULL` | ❌ | INDEX | 最后使用时间 |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |
| `updated_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`ip_blacklist`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `serial` | — | ✅ | PK | — |
| `ip_or_cidr` | `varchar(45)` | — | ✅ | UNIQUE INDEX | 支持 IPv4/IPv6/CIDR |
| `reason` | `varchar(200)` | — | ❌ | — | 封禁原因 |
| `created_by` | `varchar(32)` | — | ✅ | — | 操作人用户 ID |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |
| `expires_at` | `timestamptz` | `NULL` | ❌ | — | NULL 表示永久封禁 |

**涉及表：`geo_block_rules`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `serial` | — | ✅ | PK | — |
| `country_code` | `varchar(4)` | — | ✅ | UNIQUE INDEX | ISO 3166-1 alpha-2 |
| `block_action` | `varchar(16)` | `'all'` | ✅ | — | `login_only` / `api_only` / `all` |
| `exempt_user_ids` | `jsonb` | `'[]'` | ❌ | — | 不受限制的用户 ID 数组 |
| `enabled` | `boolean` | `true` | ✅ | — | — |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**数据一致性要求**
- `api_keys.key_hash` 由创建时的明文 Key 经 SHA-256 哈希后持久化，后端不存储明文
- `api_keys.status` 变更（active↔disabled）需记录操作日志
- `api_keys.expires_at < now()` 时自动视同 `expired`，但物理状态由定时任务更新

#### 接口层

**鉴权校验（内部中间件/Guard，非独立 API）**

```
Middleware: authMiddleware

Request: 从 Header Authorization 提取 Bearer Token
  格式: "Authorization: Bearer <key>"
  
处理流程:
  ① 对 Key 取 SHA-256 得到 hash
  ② SELECT * FROM api_keys WHERE key_hash = hash LIMIT 1
     └── 0 行 → 返回 401 invalid_api_key
  ③ IF status = 'disabled' → 返回 403 key_disabled
  ④ IF expires_at IS NOT NULL AND expires_at < now() → 返回 403 key_expired
  ⑤ IF ip_whitelist IS NOT EMPTY:
     当前请求 IP NOT IN ip_whitelist → 返回 403 ip_not_allowed
  ⑥ 将 api_key 对象注入 request context
```

**错误码定义（鉴权类）**

| 错误码 | HTTP 状态 | message | 触发条件 |
|--------|----------|---------|---------|
| `invalid_api_key` | 401 | "API Key 不存在" | Key 哈希无匹配 |
| `key_disabled` | 403 | "API Key 已被禁用" | status=disabled |
| `key_expired` | 403 | "API Key 已过期，请在控制台续期" | expires_at < now() |
| `ip_not_allowed` | 403 | "IP 不在白名单" | IP 不在 ip_whitelist |

**缓存策略**
- `api_keys` 记录按 key_hash 缓存在 Redis（TTL: 60s），减少重复 DB 查询
- 当发生 status/expires_at/ip_whitelist 修改时，主动失效缓存

#### 业务逻辑

**鉴权决策表**

```
Key 是否存在?
  ├── 否 → 401 invalid_api_key
  └── 是 → Key 是否启用 (status=active)?
      ├── 否 → 403 key_disabled
      └── 是 → Key 是否过期?
          ├── 是 → 403 key_expired
          └── 否 → IP 是否在白名单?
              ├── 命中 → 通过
              └── 未命中且白名单非空 → 403 ip_not_allowed
```

**优先级规则**
- IP 白名单为空数组表示不限制 IP，直接跳过检查

**边界条件**
- Key 哈希碰撞概率极低（SHA-256），无需处理
- 同一 Key 的并发鉴权请求由 Redis 锁/事务保证一致性

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| API 超时时间 | `site_configs.api_timeout_ms` | 30000 | 毫秒 |

---

### 1.2 路由决策与负载均衡

#### 数据层

**涉及表：`vendor_models`（已有，需补充/确认字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `uuid` | — | ✅ | PK | — |
| `model_id` | `uuid` | — | ✅ | INDEX | 关联 `models.id` |
| `vendor_id` | `uuid` | — | ✅ | INDEX | 关联 `vendors.id` |
| `upstream_model_name` | `varchar(100)` | — | ✅ | — | 供应商侧模型名 |
| `input_price` | `decimal(12,6)` | — | ✅ | — | 供应商原始输入价（¥/1K tokens） |
| `output_price` | `decimal(12,6)` | — | ✅ | — | 供应商原始输出价（¥/1K tokens） |
| `weight` | `int` | `10` | ✅ | — | 流量权重 1-100 |
| `priority` | `int` | `1` | ✅ | — | 数字越小越优先 |
| `max_concurrency` | `int` | `0` | ❌ | — | 0=不限制 |
| `status` | `varchar(16)` | `'active'` | ✅ | INDEX | `active` / `disabled` / `circuit_open` |
| `circuit_state` | `varchar(16)` | `'closed'` | ✅ | — | `closed` / `half_open` / `open` |
| `circuit_fail_count` | `int` | `0` | ✅ | — | 熔断器连续失败次数 |
| `circuit_opened_at` | `timestamptz` | `NULL` | ❌ | — | — |
| `rate_limit_qps` | `int` | `2000` | ✅ | — | 模型级 QPS 上限 |
| `rate_limit_user_qps` | `int` | `50` | ✅ | — | 每用户对该模型的 QPS |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`vendor_key_groups`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `uuid` | `gen_random_uuid()` | ✅ | PK | — |
| `vendor_id` | `uuid` | — | ✅ | INDEX | 关联 `vendors.id` |
| `group_name` | `varchar(50)` | — | ✅ | — | 如 "高优先级组" |
| `weight` | `int` | `10` | ✅ | — | 分组流量权重 |
| `unit_price_input` | `decimal(12,6)` | `NULL` | ❌ | — | 分组独立定价（覆盖全局） |
| `unit_price_output` | `decimal(12,6)` | `NULL` | ❌ | — | 分组独立定价（覆盖全局） |
| `status` | `varchar(16)` | `'active'` | ✅ | — | `active` / `disabled` |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`vendor_key_group_members`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `id` | `uuid` | `gen_random_uuid()` | ✅ | PK | — |
| `group_id` | `uuid` | — | ✅ | INDEX | 关联 `vendor_key_groups.id` |
| `vendor_api_key` | `text` | — | ✅ | — | 上游供应商 API Key（加密存储） |
| `vendor_api_key_hash` | `varchar(64)` | — | ✅ | UNIQUE INDEX | 供应商 Key 的 SHA-256 |
| `weight` | `int` | `5` | ✅ | — | 分组内 Key 的权重 |
| `status` | `varchar(16)` | `'active'` | ✅ | — | `active` / `disabled` / `circuit_open` |
| `circuit_state` | `varchar(16)` | `'closed'` | ✅ | — | 熔断状态 |
| `circuit_fail_count` | `int` | `0` | ✅ | — | — |
| `last_used_at` | `timestamptz` | `NULL` | ❌ | — | — |

**数据一致性要求**
- `vendor_key_group_members.vendor_api_key` 使用 AES-256 加密存储，解密密钥取自环境变量 `VENDOR_KEY_ENCRYPT_KEY`
- `circuit_state` 与 `vendor_models.circuit_state` 共用熔断逻辑，但作用粒度不同

#### 接口层

**路由决策（内部路由引擎，非独立 API）**

```
Function: selectVendorRoute(modelId, userId, apiKeyId)
  Input: 模型 ID, 用户 ID, API Key ID
  Output: { vendor, vendorModel, vendorKey, group }

伪代码:
  ① LOAD vendor_models WHERE model_id = modelId AND status = 'active'
     按 priority ASC 排序, weight DESC 为同优先级内的权重
  ② FILTER: circuit_state ≠ 'open' 的供应商映射
  ③ IF 列表为空 → 返回 503 model_unavailable
  ④ 同 priority 的映射按权重比例选择（加权轮询算法）
  ⑤ 选定 vendor_model 后查询其所属供应商的 Key 资源池
     读取 vendor_key_groups WHERE vendor_id = vendor.vendor_id AND status = 'active'
  ⑥ 按分组权重比例选择分组
  ⑦ 在分组内按 vendor_key_group_members 权重选择具体 Key
     排除 circuit_state = 'open' 或 status ≠ 'active' 的 Key
  ⑧ 返回路由结果
```

**模型名映射 API**

| 项目 | 值 |
|------|-----|
| **API** | 内部函数 `mapModelName(platformModelName, vendorId)` |
| **Request** | `platformModelName: string`, `vendorId: uuid` |
| **Response** | `upstreamModelName: string` |
| **逻辑** | 查询 `vendor_models` 中 model 关联的 `upstream_model_name` |

**错误码定义（路由类）**

| 错误码 | HTTP 状态 | message | 触发条件 |
|--------|----------|---------|---------|
| `model_not_found` | 404 | "模型不存在" | 请求 model 字段未匹配任何 models 记录 |
| `model_unavailable` | 503 | "模型暂时不可用" | 所有供应商映射均熔断或不可用 |

**缓存策略**
- 路由决策结果不缓存（每次请求独立选择）
- 供应商/映射/Key 的元数据（vendor_models, vendor_key_groups）缓存 Redis TTL: 30s
- 熔断状态变更实时写 DB，通过 Redis Pub/Sub 广播失效

#### 业务逻辑

**加权轮询算法（伪代码）**

```
class WeightedRoundRobinPicker {
  items: Array<{ id, weight, circuit_state }>
  totalWeight: int
  currentIndex: int = 0

  function pick(): item | null {
    if items 全部熔断 return null
    
    // 跳过熔断项，重新计算有效权重
    activeItems = items.filter(i => i.circuit_state !== 'open')
    activeTotal = SUM(activeItems.weight)
    
    // 一轮轮询
    offset = this.currentIndex % activeTotal
    for item in activeItems {
      offset -= item.weight
      if offset < 0 {
        this.currentIndex++
        return item
      }
    }
    
    // fallback
    this.currentIndex = 0
    return activeItems[0]
  }
}
```

**最少连接优先算法（备用）**

```
class LeastConnectionsPicker {
  items: Map<id, { weight, activeConnections }>

  function pick(): item {
    // 选择 (activeConnections / weight) 最小的项（跳过熔断项）
    return items
      .filter(i => i.circuit_state !== 'open')
      .sortBy(i => i.activeConnections / i.weight)[0]
  }
}
```

**优先级规则**
- `priority` 数字越小越优先，同优先级按权重比例分配
- 熔断供应商/Key 自动从候选列表移除，剩余项重新按比例分配
- Key 级熔断 → 仅该 Key 移除；供应商级熔断 → 该供应商所有映射不可用

**边界条件**
- 所有供应商映射均熔断 → 返回 `503 model_unavailable`
- 所有 Key 均熔断 → 等价于供应商级熔断
- 同一供应商有多个 Key 且均可用时，按加权轮询分配

#### 状态流转

**供应商映射状态**

| 当前状态 | 触发条件 | 下一状态 | 附带操作 |
|---------|---------|---------|---------|
| `active` | 上游连续 N 次失败 | `circuit_open` | 从路由池移除，记录熔断事件 |
| `circuit_open` | 熔断超时 T 秒到期 | `half_open` | 恢复一个探测请求 |
| `half_open` | 探测成功 M 次 | `active` | 重新加入路由池 |
| `half_open` | 探测失败 1 次 | `circuit_open` | 重置熔断计时 |
| `active/circuit_open/half_open` | admin 手动禁用 | `disabled` | 移除路由池 |
| `disabled` | admin 手动启用 | `active` | 加入路由池 |

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 路由算法选择 | `site_configs.routing_algorithm` | `'weighted_round_robin'` | `weighted_round_robin` / `least_connections` |
| 健康检查间隔 | `site_configs.health_check_interval_sec` | 30 | 秒 |
| 熔断失败阈值 | `site_configs.circuit_breaker_fail_threshold` | 5 | 连续失败次数 |
| 熔断超时 | `site_configs.circuit_breaker_timeout_sec` | 30 | 全开→半开等待时间 |
| 探针成功恢复数 | `site_configs.circuit_breaker_probe_success_count` | 3 | 半开→恢复所需成功次数 |
| 探针间隔 | `site_configs.circuit_breaker_probe_interval_sec` | 10 | 半开放行请求间隔 |

---

### 1.3 熔断器

#### 数据层

**涉及表：`vendor_models`（复用已有字段）**

| 字段 | 说明 |
|------|------|
| `circuit_state` | 当前熔断状态 |
| `circuit_fail_count` | 连续失败计数 |
| `circuit_opened_at` | 熔断时间戳 |

**涉及表：`vendor_key_group_members`（复用已有字段）**

| 字段 | 说明 |
|------|------|
| `circuit_state` | Key 级熔断状态 |
| `circuit_fail_count` | Key 连续失败计数 |
| `circuit_opened_at` | — |

**涉及表：`circuit_breaker_events`（新增，审计用）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `target_type` | `varchar(16)` | — | ✅ | INDEX | `vendor` / `model` / `key` |
| `target_id` | `uuid` | — | ✅ | INDEX | 关联对象 ID |
| `from_state` | `varchar(16)` | — | ✅ | — | — |
| `to_state` | `varchar(16)` | — | ✅ | — | — |
| `fail_count` | `int` | — | ✅ | — | 触发时的失败计数 |
| `reason` | `varchar(200)` | — | ❌ | — | 失败原因摘要 |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**数据一致性要求**
- `circuit_fail_count` 在成功调用后重置为 0
- 熔断事件必须写入 `circuit_breaker_events` 以备审计追溯

#### 接口层

**熔断器（内部组件，无独立 API）**

```
Component: CircuitBreaker

Method: recordFailure(targetType, targetId, reason)
  → 递增目标对象的 circuit_fail_count
  → IF circuit_fail_count >= fail_threshold:
     → 切换状态 closed → half_open（或直接 open）
     注意：PRD 定义 连续失败 N 次 → 半开，半开失败 → 全开
     → 写入 circuit_breaker_events
     → 广播熔断事件到 Redis Pub/Sub

Method: recordSuccess(targetType, targetId)
  → 重置 circuit_fail_count = 0
  → IF 当前状态 = half_open:
     → 递增探针成功计数
     → IF 探针成功 >= probe_success_count:
        → 切换 half_open → closed
        → 写入 circuit_breaker_events

Method: isOpen(targetType, targetId): boolean
  → IF circuit_state = 'open' → return true
  → IF circuit_state = 'half_open':
     → 检查距上次探针是否超过 probe_interval_sec
     → 未超过 → 拒绝（仍返回 open）
     → 超过 → 放行（探针请求）
  → ELSE return false
```

#### 业务逻辑

**熔断器三态状态机**

```
状态: closed (正常)
  触发: 连续失败 N 次 (fail_threshold)
  行为: 切换至 half_open，记录事件，广播通知
  附带: circuit_fail_count++

状态: half_open (半开)
  触发: 探针成功 M 次 (probe_success_count)
  行为: 切换至 closed，重置计数，记录事件
  触发: 探针失败 1 次
  行为: 切换至 open，重置计时器，记录事件

状态: open (全开)
  触发: 等待 T 秒 (circuit_breaker_timeout_sec)
  行为: 自动切换至 half_open，记录事件
```

**熔断级别**

| 级别 | 熔断对象 | 影响范围 | fail_threshold 来源 |
|------|---------|---------|-------------------|
| Key 级 | 单个供应商 API Key | 该 Key 被移出轮询 | `vendor_key_group_members` 独立计数 |
| 供应商级 | 整个供应商 | 所有该供应商映射不可用 | 汇总该供应商所有 Key 的失败 |
| 模型级 | 特定模型的所有供应商映射 | 返回 503 model_unavailable | 模型下全部供应商均熔断 |

**边界条件**
- 同一请求失败同时影响 Key 级和供应商级计数器
- 熔断恢复后需立即重置 `circuit_fail_count`
- 熔断事件写入需保证 at-least-once 语义

#### 状态流转

见 [1.2](#12-路由决策与负载均衡) 的"供应商映射状态"迁移表。

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 熔断失败阈值 | `site_configs.circuit_breaker_fail_threshold` | 5 | 同上，全局默认 |
| 熔断超时 | `site_configs.circuit_breaker_timeout_sec` | 30 | 同上，全局默认 |
| 探针成功恢复数 | `site_configs.circuit_breaker_probe_success_count` | 3 | 同上，全局默认 |
| 探针间隔 | `site_configs.circuit_breaker_probe_interval_sec` | 10 | 同上，全局默认 |

---

### 1.4 健康检查

#### 数据层

**涉及表：`vendors`（新增/修改字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|---------|
| `health_check_endpoint` | `varchar(200)` | `/health` | ❌ | — | 供应商健康检查 URL |
| `health_check_method` | `varchar(8)` | `'GET'` | ❌ | — | GET / POST |
| `health_check_expected_status` | `int` | `200` | ❌ | — | 期望 HTTP 状态码 |
| `health_check_expected_body` | `varchar(200)` | `NULL` | ❌ | — | 期望响应体包含的字符串（NULL 不检查）|
| `health_score` | `decimal(5,2)` | `100.00` | ❌ | — | 最近 24 小时健康评分 |
| `availability_24h` | `decimal(5,2)` | `100.00` | ❌ | — | 最近 24 小时可用率（%）|

**涉及表：`health_check_logs`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `bigserial` | — | ✅ | PK | — |
| `vendor_id` | `uuid` | — | ✅ | INDEX | — |
| `target_type` | `varchar(16)` | `'vendor'` | ✅ | INDEX | `vendor` / `key` |
| `target_key_hash` | `varchar(64)` | `NULL` | ❌ | — | Key 健康检查时记录 |
| `success` | `boolean` | — | ✅ | — | — |
| `response_time_ms` | `int` | — | ✅ | — | — |
| `status_code` | `int` | `NULL` | ❌ | — | — |
| `error_message` | `varchar(500)` | `NULL` | ❌ | — | — |
| `checked_at` | `timestamptz` | `now()` | ✅ | INDEX | — |

**数据一致性要求**
- `health_check_logs` 保留最近 7 天数据，由定时清理任务删除过期记录
- `vendors.availability_24h` 每轮健康检查后从 `health_check_logs` 重新计算

#### 接口层

**健康检查（内部定时任务，非外部 API）**

```
Cron Job: healthCheckWorker
  Schedule: 每 30 秒（由 site_configs.health_check_interval_sec 控制）

Job 逻辑:
  FOR each vendor WHERE status ≠ 'offline':
    构造检查请求:
      URL: vendor.base_url + vendor.health_check_endpoint
      Method: vendor.health_check_method
      Timeout: site_configs.health_check_timeout_ms (默认 5000ms)
    
    发送请求:
      成功 → status_code = 200 (或期望状态码) 
              AND expected_body 匹配 (如有配置)
              → log: success=true, response_time_ms
              → 调用 CircuitBreaker.recordSuccess('vendor', vendorId)
      
      失败 → log: success=false, error_message
              → 调用 CircuitBreaker.recordFailure('vendor', vendorId, error)
    
    更新 vendors.availability_24h:
      SELECT COUNT(*), SUM(CASE WHEN success THEN 1 ELSE 0 END)
      FROM health_check_logs
      WHERE vendor_id = vendorId
        AND checked_at > now() - INTERVAL '24 hours'
      → 可用率 = 成功数 / 总数 × 100
```

**健康度计算公式**

```
健康评分 = 可用率 × 70 + (1 - 平均响应时间 / 基准响应时间) × 30

其中:
  可用率 = 最近 24 小时内成功检查次数 / 总检查次数 × 100%
  平均响应时间 = 最近 24 小时内所有成功检查的平均响应时间
  基准响应时间 = 200ms
  如果平均响应时间 > 基准响应时间，则 (1 - 平均/基准) 部分可能为负数，
  此时下限为 0（即评分最低 = 可用率×70）
```

#### 业务逻辑

**健康检查执行流程**

```
定时器触发
  → 遍历所有在线供应商 (vendors.status ≠ 'offline')
  → 对每个供应商发送健康检查请求
  → 记录 health_check_logs
  → 更新熔断器状态
  → 更新 vendors.availability_24h / health_score
```

**边界条件**
- 供应商返回非 200 状态码 → 视同失败
- 供应商超时（> timeout）→ 视同失败，response_time_ms = timeout
- 供应商连续失败触发熔断器阈值 → 自动标记为熔断状态
- 健康检查请求不计入用户调用量或限流计数

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 健康检查间隔 | `site_configs.health_check_interval_sec` | 30 | 秒 |
| 健康检查超时 | `site_configs.health_check_timeout_ms` | 5000 | 毫秒 |
| 健康检查失败阈值 | `site_configs.health_check_fail_threshold` | 3 | 连续失败触发告警 |

---

## 2. 计费与结算精化

### 2.1 价格层级与优先级

#### 数据层

**涉及表：`vendor_models`（已有）**

| 字段 | 说明 | PRD 层级 |
|------|------|---------|
| `input_price` | 供应商原始输入价格 | L0 供应商成本价 |
| `output_price` | 供应商原始输出价格 | L0 供应商成本价 |

**涉及表：`models`（新增/修改字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `override_price_input` | `decimal(12,6)` | `NULL` | ❌ | — | L2 模型覆盖价（输入）|
| `override_price_output` | `decimal(12,6)` | `NULL` | ❌ | — | L2 模型覆盖价（输出）|
| `standard_price_input` | `decimal(12,6)` | — | ✅ | — | L1 平台标准价（输入，自动计算或手动设定）|
| `standard_price_output` | `decimal(12,6)` | — | ✅ | — | L1 平台标准价（输出）|

**涉及表：`vendor_key_groups`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 说明 |
|--------|------|--------|----------|------|
| `unit_price_input` | `decimal(12,6)` | `NULL` | ❌ | L4 分组定价输入价 |
| `unit_price_output` | `decimal(12,6)` | `NULL` | ❌ | L4 分组定价输出价 |

**涉及表：`campaign_prices`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `campaign_id` | `uuid` | — | ✅ | INDEX | 关联活动 |
| `model_id` | `uuid` | — | ✅ | INDEX | 适用模型 |
| `discount_rate` | `decimal(5,2)` | — | ✅ | — | 折扣率（如 0.80 = 8折）|
| `fixed_price_input` | `decimal(12,6)` | `NULL` | ❌ | — | 固定价输入（替代折扣率）|
| `fixed_price_output` | `decimal(12,6)` | `NULL` | ❌ | — | 固定价输出（替代折扣率）|
| `applicable_users` | `jsonb` | `'["*"]'` | ❌ | — | 适用用户 ID 数组，["*"]=全部 |
| `start_at` | `timestamptz` | — | ✅ | INDEX | — |
| `end_at` | `timestamptz` | — | ✅ | INDEX | — |
| `budget_total` | `decimal(12,2)` | `NULL` | ❌ | — | 活动总预算上限 |
| `budget_used` | `decimal(12,2)` | `0.00` | ✅ | — | 已消耗预算 |

**涉及表：`user_pricing_overrides`（新增，代理折扣 L3）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | 关联用户 |
| `model_id` | `uuid` | — | ✅ | INDEX | — |
| `discount_rate` | `decimal(5,2)` | — | ✅ | — | 折扣率 0.01-1.00 |
| `effective_start` | `timestamptz` | — | ✅ | — | — |
| `effective_end` | `timestamptz` | `NULL` | ❌ | — | NULL=永久 |
| `created_by` | `varchar(32)` | — | ✅ | — | 代理商 ID 或 admin |

**数据一致性要求**
- 价格层级查询需在实时计费路径中以最高优先级返回（毫秒级）
- 活动结束或预算耗尽后自动禁用 `campaign_prices` 记录

#### 接口层

**定价查询（内部函数）**

```
Function: resolvePricing(keyId, modelId, userId, vendorModelId)
  Output: { inputPrice, outputPrice, priceSource }

伪代码:
  // 按优先级 L5 > L4 > L3 > L2 > L1 > L0
  // L5: 活动价
  activeCampaign = SELECT cp.* FROM campaign_prices cp
    JOIN campaigns c ON c.id = cp.campaign_id
    WHERE cp.model_id = modelId
      AND cp.applicable_users @> ('["*"]' OR CONTAINS userId)
      AND cp.start_at <= now() AND cp.end_at >= now()
      AND c.status = 'running'
      AND (cp.budget_total IS NULL OR cp.budget_used < cp.budget_total)
    ORDER BY cp.fixed_price_input ASC NULLS LAST
    LIMIT 1
  
  IF activeCampaign EXISTS:
    IF activeCampaign.fixed_price_input IS NOT NULL:
      RETURN { activeCampaign.fixed_price_input, activeCampaign.fixed_price_output, 'L5_campaign' }
    ELSE:
      → 在 L1 标准价上 × discount_rate

  // L4: 分组定价
  keyGroup = SELECT kpg.* FROM vendor_key_groups kpg
    JOIN vendor_key_group_members kpgm ON kpgm.group_id = kpg.id
    WHERE kpgm.vendor_api_key_hash = (SELECT key_hash FROM api_keys WHERE id = keyId)
      AND kpg.unit_price_input IS NOT NULL
    LIMIT 1
  IF keyGroup EXISTS:
    RETURN { keyGroup.unit_price_input, keyGroup.unit_price_output, 'L4_group' }

  // L3: 代理折扣价
  userOverride = SELECT * FROM user_pricing_overrides
    WHERE user_id = userId AND model_id = modelId
      AND effective_start <= now()
      AND (effective_end IS NULL OR effective_end >= now())
    LIMIT 1
  IF userOverride EXISTS:
    basePrice = getBasePrice(modelId) // L1 标准价
    RETURN { basePrice.input * userOverride.discount_rate,
             basePrice.output * userOverride.discount_rate, 'L3_agent' }

  // L2: 模型覆盖价
  modelOverride = SELECT override_price_input, override_price_output FROM models WHERE id = modelId
  IF modelOverride.override_price_input IS NOT NULL:
    RETURN { modelOverride.override_price_input, modelOverride.override_price_output, 'L2_model' }

  // L1: 平台标准价（默认）
  RETURN { models.standard_price_input, models.standard_price_output, 'L1_standard' }
```

**缓存策略**
- 定价查询结果按 `keyId_modelId` 缓存 Redis TTL: 10s
- 活动价格变动时主动失效相关缓存
- 代理折扣价变动时按 `userId` 前缀批量失效

#### 业务逻辑

**定价优先级规则**

```
L5 活动价 > L4 分组定价 > L3 代理折扣价 > L2 模型覆盖价 > L1 标准价

查询顺序（短路）:
  ① 当前用户+当前模型是否有生效的活动价（L5）?
     有 → 使用活动价
     无 → 下一步
  ② 当前 Key 所属的分组是否有独立定价（L4）?
     有 → 使用分组定价
     无 → 下一步
  ③ 当前用户是否有代理折扣价覆盖（L3）?
     有 → 按折扣率计算
     无 → 下一步
  ④ 当前模型是否有覆盖价（L2）?
     有 → 使用覆盖价
     无 → 下一步
  ⑤ 使用平台标准价（L1）
```

**边界条件**
- 无任何定价配置时需走 L1 标准价（必须有兜底）
- 活动预算耗尽时自动降级到下一优先级
- 多个活动同时生效时取折扣最低（最优惠）的一个

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 全局默认加价率 | `site_configs.default_markup_rate` | 10.00 | %，用于 L0→L1 的自动计算 |

---

### 2.2 实时计费执行

#### 数据层

**涉及表：`consumption_logs`（新增/修改）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | — |
| `api_key_id` | `uuid` | — | ✅ | INDEX | — |
| `model_id` | `uuid` | — | ✅ | INDEX | — |
| `vendor_model_id` | `uuid` | — | ✅ | — | 实际使用的供应商映射 |
| `request_id` | `varchar(64)` | — | ✅ | UNIQUE INDEX | 全链路追踪 ID |
| `input_tokens` | `int` | `0` | ✅ | — | — |
| `output_tokens` | `int` | `0` | ✅ | — | — |
| `input_price` | `decimal(12,6)` | — | ✅ | — | 实际计价的输入单价 |
| `output_price` | `decimal(12,6)` | — | ✅ | — | 实际计价的输出单价 |
| `cost` | `decimal(12,6)` | — | ✅ | — | 实际费用（用户侧）|
| `vendor_cost` | `decimal(12,6)` | `NULL` | ❌ | — | 供应商成本（采购侧）|
| `price_source` | `varchar(16)` | `'L1_standard'` | ✅ | — | 同 resolvePricing 输出 |
| `pre_hold_amount` | `decimal(12,6)` | — | ✅ | — | 预扣金额 |
| `status` | `varchar(16)` | `'completed'` | ✅ | INDEX | `completed` / `refunded` / `pending` |
| `hold_id` | `varchar(64)` | — | ❌ | — | 预扣事务 ID |
| `consumed_at` | `timestamptz` | `now()` | ✅ | INDEX | — |

**涉及表：`balance_holds`（新增，预扣事务）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `varchar(64)` | — | ✅ | PK | hold_id |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | — |
| `amount` | `decimal(12,6)` | — | ✅ | — | 预扣金额 |
| `status` | `varchar(16)` | `'held'` | ✅ | INDEX | `held` / `settled` / `released` |
| `expires_at` | `timestamptz` | — | ✅ | INDEX | 超时自动释放 |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |
| `settled_at` | `timestamptz` | `NULL` | ❌ | — | — |

**数据一致性要求**
- 预扣 + 实际扣费必须在一个数据库事务中完成（余额操作 + consumption_logs + balance_holds）
- 预扣超时（expires_at）后自动释放余额，释放操作需记录日志
- 预扣金额与实际费用差异（多退少补）需保证原子性

#### 接口层

**计费执行（内部中间件，非独立 API）**

```
Middleware: billingMiddleware

执行位置: 鉴权、风控、限流通过后, 路由选择前

流程:
  ① 解析请求获取 model、max_tokens 参数
  ② resolvePricing(keyId, modelId, userId) 获取用户定价
  ③ 估算最大费用:
     estimatedMaxTokens = max_tokens ?? 4096 (默认)
     estimatedCost = estimatedMaxTokens / 1000 × (inputPrice + outputPrice)
     holdAmount = MAX(estimatedCost, 0.01)
  ④ 检查余额:
     SELECT balance FROM users WHERE id = userId
     IF balance < holdAmount → 返回 402 insufficient_balance
  ⑤ 创建预扣:
     INSERT INTO balance_holds (id, user_id, amount, status, expires_at)
     VALUES (holdId, userId, holdAmount, 'held', now() + INTERVAL '5 min')
     UPDATE users SET balance = balance - holdAmount WHERE id = userId
     注意：余额不允许为负数，check 约束 balance >= 0
  ⑥ 将 holdId、pricing 注入 request context，继续路由

响应处理（成功）:
  ① 从供应商响应中获取实际 input_tokens, output_tokens
  ② 实际费用 = input_tokens/1000 × inputPrice + output_tokens/1000 × outputPrice
  ③ BEGIN TRANSACTION:
     UPDATE users SET balance = balance + (holdAmount - actualCost) WHERE id = userId
     UPDATE balance_holds SET status='settled', settled_at=now() WHERE id=holdId
     INSERT INTO consumption_logs (...)
     COMMIT
  ④ 返回标准 OpenAI 格式响应

响应处理（失败/超时）:
  ① 释放预扣: UPDATE users SET balance = balance + holdAmount
     UPDATE balance_holds SET status='released'
  ② 记录失败的 consumption_logs (status='refunded')
  ③ 返回上游原始错误

重试场景:
  切换到备用供应商重试时, 使用同一 holdId, 不重复预扣
  最终按实际使用的那次响应计费, 其余释放
```

**错误码定义（计费类）**

| 错误码 | HTTP 状态 | message | 触发条件 |
|--------|----------|---------|---------|
| `insufficient_balance` | 402 | "余额不足，请充值后重试" | 余额 < 预估费用 |

#### 业务逻辑

**实时计费决策表**

```
max_tokens 是否存在?
  ├── 是 → 预估费用 = (max_tokens / 1000) × (inputPrice + outputPrice)
  └── 否 → 预估费用 = (4096 / 1000) × (inputPrice + outputPrice) // 默认预测

holdAmount = MAX(预估费用, 0.01) // 防止零元订单

余额 ≥ holdAmount?
  ├── 是 → 预扣 holdAmount，继续
  └── 否 → 返回 402
```

**多退少补逻辑**

```
实际费用 = input_tokens/1000 × inputPrice + output_tokens/1000 × outputPrice

差额 = holdAmount - 实际费用

差额 > 0 → 退还差额到余额: balance += 差额
差额 < 0 → 从余额补扣: balance -= |差额|（理论上不应发生，因 holdAmount ≥ 预估最大费用）
差额 = 0 → 不变
```

**边界条件**
- 请求 body 无 `max_tokens` 字段 → 使用默认值 4096 估算
- 供应商返回的 Token 数未包含在响应中 → 按 `usage.total_tokens` 为准，如果完全缺失则按输入字符串长度估算
- 预扣超时（`balance_holds.expires_at`）→ 定时任务自动释放，记录日志
- 余额刚好等于 holdAmount 时，预扣后余额为 0 → 正常处理

#### 状态流转

**预扣事务状态迁移**

| 当前状态 | 触发条件 | 下一状态 | 附带操作 |
|---------|---------|---------|---------|
| `held` | 请求成功，实际计费完成 | `settled` | 余额多退少补，写入 consumption_logs |
| `held` | 请求失败/超时 | `released` | 退还全部预扣金额 |
| `held` | expires_at 到期未处理 | `released` | 定时任务释放，记录异常日志 |

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 默认 max_tokens 估算值 | `site_configs.default_max_tokens_estimate` | 4096 | 请求无 max_tokens 时使用 |
| 预扣超时时间 | `site_configs.hold_expire_seconds` | 300 | 5 分钟 |
| 最低预扣金额 | `site_configs.min_hold_amount` | 0.01 | 防止零元订单 |

---

### 2.3 账单周期与账单生成

#### 数据层

**涉及表：`billing_cycles`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | — |
| `cycle_start` | `date` | — | ✅ | INDEX | 每月 1 日 |
| `cycle_end` | `date` | — | ✅ | — | 月底 |
| `total_cost` | `decimal(12,2)` | `0.00` | ✅ | — | 周期总消费 |
| `total_calls` | `int` | `0` | ✅ | — | — |
| `total_tokens` | `bigint` | `0` | ✅ | — | — |
| `status` | `varchar(16)` | `'pending'` | ✅ | INDEX | `pending` / `generated` / `settled` |
| `generated_at` | `timestamptz` | `NULL` | ❌ | — | 账单生成时间 |
| `pdf_path` | `varchar(500)` | `NULL` | ❌ | — | PDF 文件存储路径 |
| `csv_path` | `varchar(500)` | `NULL` | ❌ | — | CSV 文件存储路径 |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`billing_cycle_details`（新增，按模型汇总明细）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `billing_cycle_id` | `uuid` | — | ✅ | INDEX | — |
| `model_id` | `uuid` | — | ✅ | — | — |
| `total_calls` | `int` | `0` | ✅ | — | — |
| `total_tokens` | `bigint` | `0` | ✅ | — | — |
| `total_cost` | `decimal(12,2)` | `0.00` | ✅ | — | — |

**涉及表：`billing_cycle_daily`（新增，按日汇总）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `billing_cycle_id` | `uuid` | — | ✅ | INDEX | — |
| `day` | `date` | — | ✅ | INDEX | 消费日期 |
| `total_calls` | `int` | `0` | ✅ | — | — |
| `total_tokens` | `bigint` | `0` | ✅ | — | — |
| `total_cost` | `decimal(12,2)` | `0.00` | ✅ | — | — |

**数据一致性要求**
- 账单数据由每月的定时任务从 `consumption_logs` 聚合生成，确保只读快照一致性
- 账单生成后不允许修改历史消费数据（退款例外，需另外标注）

#### 接口层

**账单生成（定时任务）**

```
Cron Job: billingCycleGenerator
  Schedule: 次月 5 日 00:00:00 (UTC+8)
  Scope: 所有上周期 status='pending' 的 billing_cycles

处理流程:
  FOR each user:
    ① 计算周期聚合:
      SELECT COUNT(*), SUM(input_tokens + output_tokens), SUM(cost)
      INTO totalCalls, totalTokens, totalCost
      FROM consumption_logs
      WHERE user_id = userId
        AND consumed_at >= cycleStart AND consumed_at < cycleEnd
        AND status = 'completed'

    ② 写入或更新 billing_cycles:
      UPDATE billing_cycles SET
        total_cost = totalCost,
        total_calls = totalCalls,
        total_tokens = totalTokens,
        status = 'generated',
        generated_at = now()
      WHERE user_id = userId AND cycle_start = cycleStart AND cycle_end = cycleEnd

    ③ 写入按模型汇总:
      INSERT INTO billing_cycle_details (billing_cycle_id, model_id, ...)
      SELECT ... GROUP BY model_id

    ④ 写入按日汇总:
      INSERT INTO billing_cycle_daily (billing_cycle_id, day, ...)
      SELECT ... GROUP BY DATE(consumed_at)

    ⑤ 生成 PDF:
      调用 PDFGenerator 服务, 生成 PDF 文件, 存储路径写入 pdf_path

    ⑥ 生成 CSV:
      生成包含逐笔消费明细的 CSV 文件, 路径写入 csv_path

    ⑦ 发送通知:
      创建站内通知 + 邮件（附带 PDF 附件）
```

**账单下载 API**

| 项目 | 值 |
|------|-----|
| **API** | `GET /api/v1/billing/download` |
| **Request** | `cycleId: uuid`, `format: 'pdf' | 'csv'` |
| **Response** | 文件流（Content-Disposition: attachment） |
| **缓存策略** | 生成的 PDF/CSV 静态存储，设置 CDN 缓存 TTL 7 天 |

#### 业务逻辑

**账单 PDF 内容结构**

```
封面:
  3cloud 账单
  账单周期: YYYY-MM-DD ~ YYYY-MM-DD
  用户: {昵称} ({用户ID})
  生成时间: YYYY-MM-DD

汇总页:
  总消费: ¥X.XX
  总调用: X 次
  总 Token: X

按模型汇总（表格）:
  模型名 | 调用次数 | Token 消耗 | 费用 | 占比%

按日汇总（表格）:
  日期 | 调用次数 | Token 消耗 | 费用

明细页（CSV 完整; PDF 可选展示前 N 条）:
  时间 | 模型 | Key | Token 输入/输出 | 费用 | 请求 ID
```

**边界条件**
- 周期内无消费 → 不生成账单（billing_cycles 状态设为 `skipped`）
- 用户已注销 → 仍需生成最终账单归档
- PDF 生成失败 → 重试 3 次，仍失败则发送错误通知给 admin

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 账单生成日 | `site_configs.billing_generation_day` | 5 | 次月第几日 |
| 结算延迟天数 | `site_configs.billing_settle_delay_days` | 3 | 账单生成到结算的延迟 |

---

### 2.4 自动对账

#### 数据层

**涉及表：`reconciliation_records`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `vendor_id` | `uuid` | — | ✅ | INDEX | 对账的供应商 |
| `reconciliation_date` | `date` | — | ✅ | INDEX | 对账日期 |
| `platform_total_cost` | `decimal(12,2)` | `0.00` | ✅ | — | 平台侧总支出 |
| `vendor_total_cost` | `decimal(12,2)` | `0.00` | ✅ | — | 供应商账单总金额 |
| `matched_count` | `int` | `0` | ✅ | — | 匹配成功笔数 |
| `platform_only_count` | `int` | `0` | ✅ | — | 平台有/供应商无 |
| `vendor_only_count` | `int` | `0` | ✅ | — | 供应商有/平台无 |
| `amount_mismatch_count` | `int` | `0` | ✅ | — | 金额不一致笔数 |
| `status` | `varchar(16)` | `'pending'` | ✅ | INDEX | `pending` / `completed` / `discrepant` |
| `ran_at` | `timestamptz` | — | ✅ | — | 执行时间 |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`reconciliation_discrepancies`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `reconciliation_id` | `uuid` | — | ✅ | INDEX | — |
| `type` | `varchar(16)` | — | ✅ | — | `platform_only` / `vendor_only` / `amount_mismatch` |
| `platform_request_id` | `varchar(64)` | `NULL` | ❌ | — | — |
| `vendor_request_id` | `varchar(64)` | `NULL` | ❌ | — | — |
| `platform_cost` | `decimal(12,6)` | `NULL` | ❌ | — | — |
| `vendor_cost` | `decimal(12,6)` | `NULL` | ❌ | — | — |
| `model_name` | `varchar(100)` | `NULL` | ❌ | — | — |
| `consumed_at` | `timestamptz` | `NULL` | ❌ | — | — |
| `status` | `varchar(16)` | `'open'` | ✅ | — | `open` / `resolved` |
| `resolution_note` | `text` | `NULL` | ❌ | — | — |
| `resolved_at` | `timestamptz` | `NULL` | ❌ | — | — |

**数据一致性要求**
- 对账以平台侧 `consumption_logs.vendor_cost` 与供应商侧账单凭据进行比较
- 差异项需持久化到 `reconciliation_discrepancies`，人工处理后标记 `resolved`
- 对账记录只读，不允许修改

#### 接口层

**自动对账（定时任务）**

```
Cron Job: reconciliationWorker
  Schedule: 每日 02:00 (UTC+8)

Job 逻辑:
  FOR each vendor:
    ① 获取平台侧前一日消费:
      SELECT request_id, SUM(vendor_cost) as cost, model_id, consumed_at
      FROM consumption_logs
      WHERE vendor_model_id IN (SELECT id FROM vendor_models WHERE vendor_id = vendorId)
        AND consumed_at >= yesterday 00:00 AND consumed_at < yesterday 24:00
        AND status = 'completed'
      GROUP BY request_id

    ② 获取供应商侧账单（通过 API 拉取或上传解析）:
      // 供应商支持 request_id 回传 → 精确匹配
      // 供应商不支持 → 按时间+模型+Token 数模糊匹配

    ③ 逐笔对比:
      FOR each platformLog:
        IF 供应商账单中有匹配 request_id:
          IF 金额一致 → matched_count++
          ELSE → amount_mismatch_count++, 写入 discrepancies
        ELSE → platform_only_count++, 写入 discrepancies

      FOR each vendorLog not matched:
        vendor_only_count++, 写入 discrepancies

    ④ 写入 reconciliation_records:
      INSERT INTO reconciliation_records (...)

    ⑤ IF 存在差异:
      status = 'discrepant'
      通知 admin 查看对账结果
    ELSE:
      status = 'completed'
```

**对账结果查询 API**

| 项目 | 值 |
|------|-----|
| **API** | `GET /api/v1/admin/reconciliation/{reconciliationId}` |
| **Response** | 对账详情 + 差异明细列表 |
| **权限** | `finance:{read}` |

#### 业务逻辑

**匹配规则**

```
对账匹配优先级:
  ① 精确匹配: 按 request_id（供应商支持此字段返回时）
  ② 模糊匹配: 时间窗口内(±5分钟) + 模型名一致 + Token 数误差 < 5%
  ③ 人工匹配: 以上均无法匹配时标记为差异项，人工核查

模糊匹配条件:
  |platformTime - vendorTime| < 5min
  platformModel = vendorModel (平台映射后的上游模型名)
  |platformTokens - vendorTokens| / vendorTokens < 0.05
```

**边界条件**
- 供应商未返回 request_id → 全部走模糊匹配
- 供应商账单格式为 CSV/PDF → 需专门的解析模块
- 当平台侧与供应商侧笔数差异过大（> 5%）时触发告警
- 对账期间不允许修改 `consumption_logs.vendor_cost`（已归档）

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 对账执行时间 | `site_configs.reconciliation_time` | `'02:00'` | UTC+8 |
| 模糊匹配时间窗口 | `site_configs.reconciliation_fuzzy_window_minutes` | 5 | ±分钟 |
| 匹配 Token 容差率 | `site_configs.reconciliation_token_tolerance` | 0.05 | 5% |

---

## 3. 限流引擎

### 3.1 四级限流

#### 数据层

**涉及表：`user_quotas`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `user_id` | `varchar(32)` | — | ✅ | PK | 用户 ID |
| `qps_limit` | `int` | `100` | ✅ | — | L2 用户 QPS |
| `tpm_limit` | `int` | `600000` | ✅ | — | L2 用户 TPM |
| `daily_call_limit` | `int` | `0` | ✅ | — | 0=不限 |
| `daily_free_tokens` | `bigint` | `0` | ✅ | — | 每日免费额度 |
| `updated_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`rate_limit_records`（新增，用于限流统计）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `bigserial` | — | ✅ | PK | — |
| `limit_level` | `varchar(8)` | — | ✅ | INDEX | `L1` / `L2` / `L3` / `L4` |
| `limit_type` | `varchar(16)` | — | ✅ | — | `global_qps` / `global_tpm` / `user_qps` / `user_tpm` / `key_qps` / `key_tpm` / `model_qps` / `model_user_qps` |
| `target_id` | `varchar(64)` | — | ❌ | INDEX | 被限流对象 ID（用户ID/Key哈希/模型ID）|
| `current_value` | `int` | — | ✅ | — | 触发时的实际值 |
| `limit_value` | `int` | — | ✅ | — | 配置的阈值 |
| `triggered_at` | `timestamptz` | `now()` | ✅ | INDEX | — |
| `request_id` | `varchar(64)` | — | ❌ | — | 触发限流的请求 ID |

**数据一致性要求**
- 限流计数器存储在 Redis（性能要求），`rate_limit_records` 用于统计和审计
- 限流记录写入可采用异步队列，避免影响主请求路径

#### 接口层

**限流中间件**

```
Middleware: rateLimitMiddleware

执行位置: 鉴权通过后, 风控之前

伪代码:
  // L1 全局 QPS
  globalQpsKey = "ratelimit:global:qps"
  currentGlobalQps = INCR(globalQpsKey)  // Redis 自增 + 设置过期
  IF currentGlobalQps > site_configs.global_qps_limit:
    → 记录 rate_limit_records (L1, global_qps)
    → 返回 429, limit_type='global_qps'

  // L1 全局 TPM
  globalTpmKey = "ratelimit:global:tpm:YYYYMMDDHHMM"  // 每分钟一个窗口
  currentGlobalTpm = INCR(globalTpmKey)
  IF currentGlobalTpm > site_configs.global_tpm_limit:
    → 记录 rate_limit_records (L1, global_tpm)
    → 返回 429, limit_type='global_tpm'

  // L3 Key QPS（Key 级应先于 L2 用户级？按 PRD 顺序先全局→用户→Key→模型）
  keyQpsKey = "ratelimit:key:qps:{keyHash}"
  currentKeyQps = INCR(keyQpsKey)
  IF currentKeyQps > apiKey.qps_limit:
    → 记录 rate_limit_records (L3, key_qps, keyHash)
    → 返回 429, limit_type='key_qps'

  // L3 Key TPM
  keyTpmKey = "ratelimit:key:tpm:{keyHash}:YYYYMMDDHHMM"
  currentKeyTpm = INCR(keyTpmKey)
  IF currentKeyTpm > apiKey.tpm_limit:
    → 同上

  // L2 用户 QPS
  userQpsKey = "ratelimit:user:qps:{userId}"
  currentUserQps = INCR(userQpsKey)
  IF currentUserQps > userQuota.qps_limit:
    → 记录 rate_limit_records (L2, user_qps, userId)
    → 返回 429, limit_type='user_qps'

  // L2 用户 TPM
  userTpmKey = "ratelimit:user:tpm:{userId}:YYYYMMDDHHMM"
  // 类似逻辑

  // L4 模型全局 QPS
  modelQpsKey = "ratelimit:model:qps:{modelId}"
  currentModelQps = INCR(modelQpsKey)
  IF currentModelQps > vendorModel.rate_limit_qps:
    → 记录 rate_limit_records (L4, model_qps, modelId)
    → 返回 429, limit_type='model_qps'

  // L4 模型用户 QPS
  modelUserQpsKey = "ratelimit:model:user:qps:{modelId}:{userId}"
  currentModelUserQps = INCR(modelUserQpsKey)
  IF currentModelUserQps > vendorModel.rate_limit_user_qps:
    → 同上, limit_type='model_user_qps'
```

**注意**: 实际执行中，限流的检查顺序应为 L1 全局 → L2 用户 → L3 Key → L4 模型（由严格到宽松），并在任一级别触发时立即短路返回。为了使整体限流行为与 PRD 第 5.3.1 节保持一致，严格遵循 L1→L2→L3→L4 的顺序。

#### 业务逻辑

**四级限流决策表**

```
┌────────┬──────────────────┬──────────┬──────────────┬────────────┐
│ 级别   │ 维度             │ Redis Key│ 检查顺序     │ 超越方式   │
├────────┼──────────────────┼──────────┼──────────────┼────────────┤
│ L1     │ 全局 QPS         │ 固定窗口│ 1            │ 不可超越   │
│ L1     │ 全局 TPM         │ 滑动窗口│ 2            │ 不可超越   │
│ L2     │ 用户 QPS         │ 固定窗口│ 3            │ admin调整  │
│ L2     │ 用户 TPM         │ 滑动窗口│ 4            │ admin调整  │
│ L3     │ Key QPS          │ 固定窗口│ 5            │ 用户可调   │
│ L3     │ Key TPM          │ 滑动窗口│ 6            │ 用户可调   │
│ L4     │ 模型全局 QPS     │ 固定窗口│ 7            │ admin调整  │
│ L4     │ 模型用户 QPS     │ 固定窗口│ 8            │ admin调整  │
└────────┴──────────────────┴──────────┴──────────────┴────────────┘
```

**限流窗口算法**
- QPS 使用**固定窗口**（每秒一个计数器，过期时间 1 秒），Redis INCR + EXPIRE 实现
- TPM 使用**滑动窗口**（每分钟一个计数器，过期时间 2 分钟），以分钟为精度

**边界条件**
- 限流检查任一级别触发后立即短路返回，不再执行后续级别
- Redis 不可用时降级为通过（fail-open），但记录告警
- 限流计数的 Redis Key 统一前缀 `ratelimit:`，便于监控和管理

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 全局 QPS 上限 | `site_configs.global_qps_limit` | 10000 | L1 |
| 全局 TPM 上限 | `site_configs.global_tpm_limit` | 60000000 | L1 |
| 默认用户 QPS | `site_configs.default_user_qps` | 100 | L2 默认 |
| 默认用户 TPM | `site_configs.default_user_tpm` | 600000 | L2 默认 |
| 默认 Key QPS | `site_configs.default_key_qps` | 50 | L3 默认 |
| 默认 Key TPM | `site_configs.default_key_tpm` | 300000 | L3 默认 |
| 模型默认全局 QPS | `site_configs.default_model_qps` | 2000 | L4 默认 |
| 模型默认用户 QPS | `site_configs.default_model_user_qps` | 50 | L4 默认 |

---

### 3.2 限流命中响应

#### 接口层

**429 响应格式**

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "请求频率超限，请稍后重试",
    "limit_type": "user_qps",
    "limit_value": 100,
    "current_value": 156,
    "retry_after": 30
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | string | 固定为 `rate_limit_exceeded` |
| `message` | string | 多语言提示 |
| `limit_type` | string | 触发限流的级别：`global_qps` / `global_tpm` / `user_qps` / `user_tpm` / `key_qps` / `key_tpm` / `model_qps` / `model_user_qps` |
| `limit_value` | int | 该维度的配置阈值 |
| `current_value` | int | 触发时的实际请求数 |
| `retry_after` | int | 建议重试等待秒数 |

#### 业务逻辑

**`retry_after` 计算**
- 固定窗口（QPS）：retry_after = 窗口剩余秒数（最多 1s）
- 滑动窗口（TPM）：retry_after = 窗口剩余秒数（最多 60s）
- 如果难以精确计算，统一返回 30s（保守值）

---

### 3.3 限流统计与可视化

#### 数据层

限流触发统计数据直接查询 `rate_limit_records` 表按维度聚合。

#### 接口层

**限流统计查询 API**

| 项目 | 值 |
|------|-----|
| **API** | `GET /api/v1/admin/rate-limits/stats` |
| **Permission** | `config:{read}` |
| **Query** | `dateFrom`, `dateTo`, `limitType` |
| **Response** | 按维度聚合的限流触发统计 |

**响应 Schema（示例）**

```json
{
  "today_total_throttled": 948,
  "total_percentage": 0.8,
  "by_level": {
    "L1_global": { "total": 0, "percentage": 0 },
    "L2_user": { "total": 279, "percentage": 0.29 },
    "L3_key": { "total": 656, "percentage": 0.69 },
    "L4_model": { "total": 13, "percentage": 0.01 }
  },
  "top_users": [
    { "user_id": "u_1001", "nickname": "张三", "count": 123 },
    { "user_id": "u_2345", "nickname": "李四", "count": 98 }
  ],
  "hourly_trend": [
    { "hour": "14:00", "count": 89 }
  ]
}
```

#### 业务逻辑

**限流统计聚合（管理员面板用）**

```
今日被限流请求数 = COUNT(rate_limit_records WHERE triggered_at >= today 00:00)
今日总请求数 = COUNT(consumption_logs WHERE consumed_at >= today 00:00)
限流占比 = 被限流数 / 总请求数 × 100%

按级别分布:
  SELECT limit_level, COUNT(*) FROM rate_limit_records WHERE today GROUP BY limit_level

被限流最多用户 Top 10:
  SELECT target_id, COUNT(*) FROM rate_limit_records
  WHERE today AND limit_level IN ('L2', 'L3') GROUP BY target_id ORDER BY COUNT DESC LIMIT 10

按小时趋势:
  SELECT DATE_TRUNC('hour', triggered_at), COUNT(*) FROM rate_limit_records
  WHERE today GROUP BY 1 ORDER BY 1
```

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 限流记录保留天数 | `site_configs.rate_limit_log_retention_days` | 30 | — |

---

## 4. 通知与告警精化

### 4.1 通知推送架构

#### 数据层

**涉及表：`notifications`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `user_id` | `varchar(32)` | — | ✅ | INDEX | 接收用户 |
| `type` | `varchar(32)` | — | ✅ | INDEX | `recharge_success` / `balance_warn` / `key_expiring` / `security_alert` / `campaign` / `bill_ready` |
| `title` | `varchar(200)` | — | ✅ | — | 通知标题 |
| `body` | `text` | — | ✅ | — | 通知正文 |
| `channel` | `varchar(16)` | — | ✅ | — | `in_app` / `email` / `websocket` |
| `severity` | `varchar(8)` | `'info'` | ✅ | INDEX | `info` / `warning` / `critical` |
| `is_read` | `boolean` | `false` | ✅ | INDEX | — |
| `read_at` | `timestamptz` | `NULL` | ❌ | — | — |
| `related_entity_type` | `varchar(32)` | `NULL` | ❌ | — | `api_key` / `recharge` / `user` 等 |
| `related_entity_id` | `varchar(64)` | `NULL` | ❌ | — | — |
| `sent_at` | `timestamptz` | `now()` | ✅ | INDEX | — |
| `email_sent` | `boolean` | `false` | ✅ | — | — |
| `email_sent_at` | `timestamptz` | `NULL` | ❌ | — | — |

**涉及表：`notification_preferences`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `user_id` | `varchar(32)` | — | ✅ | PK | — |
| `preferences` | `jsonb` | `'{}'` | ✅ | — | 各通知类型的渠道偏好 |

`preferences` JSON 结构示例：

```json
{
  "recharge_success": ["in_app", "email"],
  "balance_warn": ["in_app", "email"],
  "key_expiring": ["in_app"],
  "security_alert": ["in_app", "email", "websocket"],
  "campaign": ["in_app"],
  "bill_ready": ["in_app", "email"]
}
```

**涉及表：`notification_queue`（新增，用于异步推送）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `bigserial` | — | ✅ | PK | — |
| `notification_id` | `uuid` | — | ✅ | INDEX | — |
| `channel` | `varchar(16)` | — | ✅ | — | — |
| `status` | `varchar(16)` | `'pending'` | ✅ | INDEX | `pending` / `sent` / `failed` |
| `retry_count` | `int` | `0` | ✅ | — | — |
| `last_error` | `text` | `NULL` | ❌ | — | — |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |
| `sent_at` | `timestamptz` | `NULL` | ❌ | — | — |

**数据一致性要求**
- 通知写入 `notifications` 表后立即写入 `notification_queue`（异步消费）
- 安全告警类型的通知强制全部渠道推送，不受用户偏好影响
- 邮件发送失败后重试 3 次（间隔 5/15/30 分钟）

#### 接口层

**通知发送 API（内部接口，各业务模块调用）**

```
Function: sendNotification(userId, type, title, body, relatedEntity)
  Input: userId, type, title, body, { entityType?, entityId? }
  
流程:
  ① 查询 notification_preferences 获取该用户的通知渠道偏好
     安全告警(security_alert) 强制全渠道，覆盖用户偏好
  ② 插入 notifications 记录
  ③ FOR each channel in preferences[type]:
     INSERT INTO notification_queue (notification_id, channel)
  ④ 触发异步推送

异步推送队列消费:
  IF channel = 'in_app':
    → 通过 WebSocket 推送到在线用户（如在线的会话）
    → 标记 notification_queue.status = 'sent'
  
  IF channel = 'email':
    → 调用 SMTP 服务发送邮件
    → 成功 → status='sent'; 失败 → status='failed', retry_count++
  
  IF channel = 'websocket':
    → 直接推送 WebSocket 消息到在线用户会话
    → 同上
```

**WebSocket 通知推送格式**

```json
{
  "type": "notification",
  "data": {
    "id": "uuid",
    "type": "recharge_success",
    "title": "充值成功",
    "body": "您充值的 ¥100.00 已到账",
    "severity": "info",
    "sent_at": "2026-07-26T11:35:00Z"
  }
}
```

#### 业务逻辑

**通知类型与推送渠道映射**

| 通知类型 | 用户默认偏好 | 是否可覆盖 | 强制渠道 |
|---------|-------------|-----------|---------|
| `recharge_success` | 站内 + 邮件 | ✅ | — |
| `balance_warn` | 站内 + 邮件 | ✅ | — |
| `key_expiring` | 站内（仅） | ✅ | — |
| `security_alert` | 站内 + 邮件 + WebSocket | ❌ | 全部 |
| `campaign` | 站内（仅） | ✅ | — |
| `bill_ready` | 站内 + 邮件 | ✅ | — |

**边界条件**
- 用户未配置偏好 → 使用各类型的默认偏好
- 邮件发送频率限制：每用户每天最多 5 封（`site_configs.daily_email_limit`）
- 同类型通知 5 分钟内合并：相同 `type` + 相同 `related_entity_id` 的合并为一条

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 每日邮件上限 | `site_configs.daily_email_limit` | 5 | 每用户每天 |
| 默认通知渠道 | `site_configs.default_notification_channels` | `["in_app", "email"]` | 用户未配置时使用 |

---

### 4.2 告警规则配置

#### 数据层

**涉及表：`alert_rules`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `name` | `varchar(100)` | — | ✅ | — | 规则名称 |
| `metric` | `varchar(32)` | — | ✅ | INDEX | 指标：`api_failure_rate` / `vendor_availability` / `response_time_p95` / `platform_balance` / `user_failure_rate` / `disk_usage` / `cpu_usage` |
| `condition_type` | `varchar(16)` | `'greater_than'` | ✅ | — | `greater_than` / `less_than` |
| `threshold` | `decimal(10,2)` | — | ✅ | — | 告警阈值 |
| `duration_seconds` | `int` | `300` | ✅ | — | 持续多久触发 |
| `severity` | `varchar(16)` | `'warning'` | ✅ | — | `critical` / `warning` / `info` |
| `notify_roles` | `jsonb` | `'["super_admin"]'` | ✅ | — | 通知的角色列表 |
| `frequency_seconds` | `int` | `300` | ✅ | — | 同规则推送频率限制 |
| `enabled` | `boolean` | `true` | ✅ | — | — |
| `created_at` | `timestamptz` | `now()` | ✅ | — | — |
| `updated_at` | `timestamptz` | `now()` | ✅ | — | — |

**涉及表：`alert_events`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `rule_id` | `uuid` | — | ✅ | INDEX | — |
| `metric` | `varchar(32)` | — | ✅ | — | — |
| `current_value` | `decimal(10,2)` | — | ✅ | — | 触发时的指标值 |
| `threshold` | `decimal(10,2)` | — | ✅ | — | — |
| `severity` | `varchar(16)` | — | ✅ | — | — |
| `status` | `varchar(16)` | `'firing'` | ✅ | INDEX | `firing` / `resolved` / `acknowledged` |
| `notified_users` | `jsonb` | `'[]'` | ❌ | — | 已通知的管理员 ID 列表 |
| `fired_at` | `timestamptz` | `now()` | ✅ | INDEX | — |
| `resolved_at` | `timestamptz` | `NULL` | ❌ | — | — |

**数据一致性要求**
- 同一 `rule_id` 在同一时间只能有一个 `firing` 状态的告警事件
- 告警恢复（指标回到阈值以下）后，自动将 `firing` 事件标记为 `resolved`

#### 接口层

**告警规则 CRUD API**

| 项目 | 值 |
|------|-----|
| **API** | `GET /api/v1/admin/alert-rules` |
| **API** | `POST /api/v1/admin/alert-rules` |
| **API** | `PUT /api/v1/admin/alert-rules/{ruleId}` |
| **API** | `DELETE /api/v1/admin/alert-rules/{ruleId}` |
| **Permission** | `config:{read,create,update,delete}` |

**告警事件查询 API**

| 项目 | 值 |
|------|-----|
| **API** | `GET /api/v1/admin/alert-events` |
| **Query** | `status` / `severity` / `dateFrom` / `dateTo` |
| **Response** | 告警事件列表 |

#### 业务逻辑

**告警规则配置（PRD 5.4.2 定义）**

| 告警指标 (metric) | 条件 (condition) | 阈值 | duration_seconds | 等级 | notify_roles | frequency_seconds |
|-------------------|-----------------|------|-----------------|------|-------------|------------------|
| `api_failure_rate` | `greater_than` | 5.00 | 300 | `critical` | `["admin","super_admin"]` | 300 |
| `vendor_availability` | `less_than` | 95.00 | 300 | `critical` | `["admin","super_admin"]` | 300 |
| `response_time_p95` | `greater_than` | 2000 | 300 | `warning` | `["admin"]` | 900 |
| `platform_balance` | `less_than` | 100.00 | 0 | `warning` | `["super_admin"]` | 3600 |
| `user_failure_rate` | `greater_than` | 20.00 | 300 | `info` | `["security"]` | 900 |
| `disk_usage` | `greater_than` | 85.00 | 0 | `warning` | `["admin"]` | 1800 |
| `cpu_usage` | `greater_than` | 80.00 | 300 | `warning` | `["admin"]` | 1800 |

**告警推送频率限制逻辑**
```
同一 alert_rule 的相邻两次推送至少间隔 frequency_seconds 秒
避免告警风暴
```

**告警自动恢复**
```
当指标值持续低于阈值（对于 greater_than 类型）达 duration_seconds 后
→ 自动将对应 firing 状态的 alert_event 标记为 resolved，记录 resolved_at
→ 发送恢复通知（"XXX 告警已恢复"）
```

**边界条件**
- 多条告警规则同时触发 → 每条独立生成 `alert_event`
- 告警规则被禁用（`enabled=false`）→ 不再触发，已有 `firing` 事件不受影响
- `duration_seconds = 0` 表示瞬时告警（立刻触发，无需持续）

#### 配置项

| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 告警检查间隔 | `site_configs.alert_check_interval_sec` | 60 | 秒，告警评估器轮询间隔 |

---

### 4.3 告警推送执行

#### 接口层

**告警评估器（内部定时任务）**

```
Cron Job: alertEvaluator
  Schedule: 每 60 秒

Job 逻辑:
  FOR each alert_rule WHERE enabled = true:
    ① 获取当前指标值:
      以 api_failure_rate 为例:
        SELECT COUNT(*), SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END)
        FROM consumption_logs
        WHERE consumed_at > now() - INTERVAL '5 minutes'
        → failureRate = 失败数 / 总数 × 100

    ② 判断是否触发:
      IF (condition_type = 'greater_than' AND currentValue > threshold)
        OR (condition_type = 'less_than' AND currentValue < threshold):
        
        → 检查是否已有 f状态 = 'firing' 的同规则告警
        → IF 存在 → 跳过（已触发）
        → ELSE → 创建 alert_event (status='firing')
        
        → 检查距上次推送是否超过 frequency_seconds
        → IF 未超过 → 跳过（频率限制）
        → ELSE → 推送告警通知:
           FOR each role in notify_roles:
             查询该角色的所有管理员用户
             FOR each admin user:
               sendNotification(adminId, 'alert', title, body, ...)

    ③ 检查告警恢复:
      IF 存在 firing 状态的该规则告警 AND 当前指标已回到正常范围:
        → 更新 alert_event.status = 'resolved', resolved_at = now()
        → 推送恢复通知
```

**告警推送通知格式**

```json
// 站内通知
{
  "type": "alert",
  "title": "🔴 API 失败率告警",
  "body": "API 失败率 7.2%（阈值 5%），持续 5 分钟",
  "severity": "critical"
}

// 邮件通知
Subject: [3cloud 告警] 🔴 API 失败率 7.2% - 请立即处理
Body: 指标: API 失败率
当前值: 7.2%
阈值: 5.00%
持续时间: 5 分钟
触发时间: 2026-07-26 11:35:00
请登录管理后台查看详情: https://admin.3cloud.ai/admin/monitoring
```

#### 业务逻辑

**告警收敛率计算**
```
告警收敛率 = 真实告警数 / 总告警数 × 100%

其中:
  真实告警 = alert_events 中由真实问题产生的告警（人工判定或自动恢复后未复现）
  总告警 = alert_events 的总数
```

**边界条件**
- 多个同类型告警同时触发 → 合并为一条通知（"3 条告警待处理"）
- 告警评估器不可用 → 积压的告警不会丢失，恢复后逐个处理

#### 配置项

同 [4.2](#42-告警规则配置) 配置项 + 全局告警检查间隔。

---

## 5. 核心商业指标与运营数据

### 5.1 运营 KPI 数据层

| 指标名称 | 数据源 | 计算方式 | 存储表 | 更新频率 |
|---------|-------|---------|-------|---------|
| DAU | `call_logs` | `SELECT COUNT(DISTINCT user_id) FROM call_logs WHERE date = today` | 实时计算 | 每日 |
| 日调用量 | `call_logs` | `SELECT COUNT(*) FROM call_logs WHERE date = today` | 实时计算 | 实时 |
| MRR | `consumption_logs` | `SELECT SUM(cost) FROM consumption_logs WHERE month = currentMonth` | `monthly_kpi` | 每日 |
| 毛利率 | `consumption_logs` + `vendor_models` | `(SUM(cost) - SUM(vendor_cost)) / SUM(cost) × 100` | `monthly_kpi` | 每日 |
| 7 日留存率 | `users` + `call_logs` | 第 7 天有调用的用户 / 注册总数 | 用户分析模块 | 每日 |
| 30 日留存率 | `users` + `call_logs` | 第 30 天有调用的用户 / 注册总数 | 用户分析模块 | 每日 |
| Key 使用率 | `api_keys` + `call_logs` | 近 7 天有调用的 Key / 总 Key 数 | 实时计算 | 每日 |
| 供应商健康度 | `health_check_logs` | 24 小时可用率 | `vendors.availability_24h` | 每次检查 |

**涉及表：`monthly_kpi`（新增）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `id` | `uuid` | — | ✅ | PK | — |
| `year_month` | `varchar(7)` | — | ✅ | INDEX | YYYY-MM |
| `mrr` | `decimal(12,2)` | `0.00` | ✅ | — | — |
| `gross_profit` | `decimal(12,2)` | `0.00` | ✅ | — | 毛利润 |
| `gross_margin` | `decimal(5,2)` | `0.00` | ✅ | — | 毛利率（%）|
| `new_users` | `int` | `0` | ✅ | — | 本月新增用户 |
| `active_users` | `int` | `0` | ✅ | — | 月活跃用户 |
| `total_vendor_cost` | `decimal(12,2)` | `0.00` | ✅ | — | 供应商总成本 |
| `agent_commission_total` | `decimal(12,2)` | `0.00` | ✅ | — | 代理佣金总额 |
| `updated_at` | `timestamptz` | `now()` | ✅ | — | — |

### 5.2 用户分层运营数据

**涉及表：`user_segments`（新增，缓存用户分层结果）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| `user_id` | `varchar(32)` | — | ✅ | PK | — |
| `segment` | `varchar(16)` | — | ✅ | INDEX | `seed` / `active` / `regular` / `dormant` / `churned` |
| `segment_month` | `varchar(7)` | — | ✅ | INDEX | YYYY-MM（分层生效月份）|
| `monthly_consumption` | `decimal(12,2)` | `0.00` | ✅ | — | 当月消费 |
| `updated_at` | `timestamptz` | `now()` | ✅ | — | — |

**用户分层计算逻辑（PRD 1.4 定义）**

```
每月 1 日 03:00 定时计算:

种子用户: 当月消费 > ¥1000
活跃用户: 当月消费 ¥100-1000
普通用户: 当月消费 ¥10-100
休眠用户: 当月有登录但无消费 (login_records > 0 AND consumption = 0)
流失用户: 注册 > 30天 且 近30天无登录

SQL:
UPDATE user_segments SET segment = CASE
  WHEN totalConsumption > 1000 THEN 'seed'
  WHEN totalConsumption >= 100 THEN 'active'
  WHEN totalConsumption >= 10 THEN 'regular'
  WHEN hasLogin = true THEN 'dormant'
  ELSE 'churned'
END
WHERE segment_month = currentMonth
```

---

*— DRD 核心引擎完 —*

**文档版本**：V1.0 | **最后更新**：2026-07-27
**文档维护**：架构-agent | **审批状态**：待评审
