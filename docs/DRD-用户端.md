# 3cloud（3C）AI Token 聚合平台 — 用户端技术实现规格说明书 (DRD)

> **版本**：V1.0 | **最后更新**：2026-07-27
> **文档定位**：用户端模块技术实现规格，覆盖数据层、接口层、业务逻辑、配置项
> **关联文档**：`PRD-运营级.md` / `RELEASES.md` / `ROADMAP.md`
> **定位**：AI API 中间层平台，不涉及自研模型/训练推理/数据标注

---

## 目录

1. [仪表盘 — 区域 1：欢迎卡片](#1-仪表盘--区域-1欢迎卡片)
2. [仪表盘 — 区域 2：核心指标卡片](#2-仪表盘--区域-2核心指标卡片)
3. [仪表盘 — 区域 3：额度使用进度条](#3-仪表盘--区域-3额度使用进度条)
4. [仪表盘 — 区域 4：用量总览展开面板](#4-仪表盘--区域-4用量总览展开面板)
5. [仪表盘 — 区域 5：Token 消耗趋势图](#5-仪表盘--区域-5token-消耗趋势图)
6. [仪表盘 — 区域 6：模型分布明细表](#6-仪表盘--区域-6模型分布明细表)
7. [仪表盘 — 区域 7：API Key 对比表](#7-仪表盘--区域-7api-key-对比表)
8. [仪表盘 — 区域 8：快捷操作入口](#8-仪表盘--区域-8快捷操作入口)
9. [仪表盘 — 区域 9：最近登录记录](#9-仪表盘--区域-9最近登录记录)
10. [仪表盘 — 区域 10：快速接入引导](#10-仪表盘--区域-10快速接入引导-onboarding)
11. [仪表盘 — 区域 11：成本预测卡片](#11-仪表盘--区域-11成本预测卡片)
12. [仪表盘 — 区域 12：异常告警卡片](#12-仪表盘--区域-12异常告警卡片)
13. [仪表盘 — 区域 13：账单周期概览](#13-仪表盘--区域-13账单周期概览)
14. [仪表盘 — 区域 14：实时活动流](#14-仪表盘--区域-14实时活动流-websocket)
15. [仪表盘 — 区域 15：模型推荐/成本优化建议](#15-仪表盘--区域-15模型推荐成本优化建议)
16. [模型中心](#16-模型中心-consolemodels)
17. [API Key 管理](#17-api-key-管理-consoleapi-keys)
18. [调用日志](#18-调用日志-consolelogs)
19. [用量统计](#19-用量统计-consolestats)
20. [充值](#20-充值-consolerecharge)
21. [消费明细 / 余额变动](#21-消费明细--余额变动-consoletransactions)
22. [兑换码](#22-兑换码-consoleredemption)
23. [发票](#23-发票-consoleinvoices)
24. [安全设置](#24-安全设置)
25. [通知中心](#25-通知中心)

---

## 1. 仪表盘 — 区域 1：欢迎卡片

### 数据层

**涉及表：`users`, `call_logs`, `user_quotas`, `login_history`**

**`users` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | VARCHAR(32) | uuid 前缀 `u_` | ✅ | PK | 格式 `u_xxxxx` |
| nickname | VARCHAR(100) | NULL | ❌ | — | 用户昵称 |
| email | VARCHAR(255) | — | ✅ | UNIQUE | 登录邮箱 |
| role | VARCHAR(20) | `user` | ✅ | ✅ | 枚举: super_admin/admin/finance/auditor/operator/security/agent_mgr/agent/user/developer |
| vip_level | INT | 0 | ✅ | — | 0=无VIP |
| balance | DECIMAL(15,4) | 0.0000 | ✅ | — | 账户余额，单位元 |
| onboarding_completed | BOOLEAN | FALSE | ✅ | — | 新手指引完成标志 |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |
| status | VARCHAR(20) | `active` | ✅ | ✅ | active/disabled/frozen |

**`login_history` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| login_time | TIMESTAMPTZ | now() | ✅ | ✅ | — |
| ip | VARCHAR(45) | — | ✅ | — | IPv4/IPv6 |
| city | VARCHAR(100) | NULL | ❌ | — | IP 地理库解析 |
| province | VARCHAR(100) | NULL | ❌ | — | IP 地理库解析 |
| user_agent | TEXT | NULL | ❌ | — | UA 解析原始值 |
| status | VARCHAR(20) | `success` | ✅ | — | success/failed |
| device_info | VARCHAR(255) | NULL | ❌ | — | 设备/浏览器信息 |

**`user_quotas` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | UNIQUE | FK → users.id |
| quota_limit | DECIMAL(15,4) | NULL | ❌ | — | 额度上限，NULL=无限制 |
| daily_free | BIGINT | 0 | ✅ | — | 每日免费Token数 |
| qps_limit | INT | 100 | ✅ | — | 用户级 QPS |
| tpm_limit | INT | 600000 | ✅ | — | 用户级 TPM |

**数据一致性要求**
- `users.balance` 更新通过余额变动流水表 `balance_logs` 记录，禁止直接 UPDATE
- `call_logs` 当日聚合使用 Redis 计数器 + DB 兜底，10 秒一致性窗口可接受
- `login_history` 仅追加，不更新

### 接口层

#### 欢迎卡片数据聚合接口

**API**：`GET /api/v1/console/dashboard/welcome-card`

**Request**：无（从 JWT 获取当前用户）

**Response Schema**

```json
{
  "nickname": "张三",
  "email": "zhang@example.com",
  "role": "user",
  "vip_level": 0,
  "balance": 234.50,
  "balance_alert": "yellow",
  "today_tokens": 12345,
  "daily_free_remaining": 50000,
  "last_login": {
    "time": "2026-07-26T10:30:00Z",
    "ip": "117.78.2.66",
    "location": "广东省深圳市"
  },
  "is_new_user": true,
  "new_user_days_remaining": 4,
  "account_disabled": false,
  "is_arrears": false
}
```

**错误码**

| 错误码 | HTTP | 说明 |
|--------|------|------|
| UNAUTHORIZED | 401 | 未登录或 Token 过期 |
| USER_DISABLED | 403 | 账户已被禁用 |

**缓存策略**
- `users` 基础信息：Redis 缓存 60 秒（key: `user:{id}:basic`）
- `today_tokens`：Redis 计数器实时读取，不缓存
- `daily_free_remaining`：实时计算，不缓存
- `last_login`：Redis 缓存 300 秒（key: `user:{id}:last_login`）

### 业务逻辑

**余额预警计算**

```
IF balance <= site_configs.balance_warn_red → "red"
IF balance <= site_configs.balance_warn_yellow → "yellow"
ELSE → "none"
```

**新用户保护期计算**
```
new_user_days_remaining = 7 - (now() - users.created_at).days
IF new_user_days_remaining > 0 → is_new_user = true
```

**边界条件**
- `balance < 0`：is_arrears = true，额外返回 `overdue_banner: true`
- `role` 不在已知枚举中：显示空字符串
- `vip_level = 0`：不展示 VIP 标识
- 用户 `status = disabled` → account_disabled = true，隐藏余额/量化数据
- `daily_free = 0` → 不展示免费额度字段
- 数据库或 Redis 不可用 → 返回 HTTP 503 + `{"fallback": true, "data": {}}`

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.balance_warn_yellow` | DECIMAL(10,2) | 10.00 | 黄色预警阈值 |
| `site_configs.balance_warn_red` | DECIMAL(10,2) | 1.00 | 红色预警阈值 |
| `site_configs.daily_free_tokens` | BIGINT | 0 | 0=不启用免费额度 |
| `site_configs.new_user_protection_days` | INT | 7 | 新用户保护期天数 |

---

## 2. 仪表盘 — 区域 2：核心指标卡片

### 数据层

**涉及表：`call_logs`, `consumption_logs`, `users`**

**`call_logs` 相关字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| model | VARCHAR(100) | — | ✅ | ✅ | 模型名 |
| status | VARCHAR(20) | — | ✅ | ✅ | success/failed/timeout |
| input_tokens | INT | 0 | ✅ | — | — |
| output_tokens | INT | 0 | ✅ | — | — |
| total_tokens | INT | 0 | ✅ | — | — |
| cost | DECIMAL(15,6) | 0 | ✅ | ✅ | 消费金额 |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |

**`consumption_logs` 相关字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| amount | DECIMAL(15,4) | — | ✅ | — | 变动金额（正=增加，负=减少）|
| type | VARCHAR(30) | — | ✅ | ✅ | recharge/consumption/refund/admin_adjust/campaign |
| balance_before | DECIMAL(15,4) | — | ✅ | — | — |
| balance_after | DECIMAL(15,4) | — | ✅ | — | — |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |

**数据一致性要求**
- 指标聚合允许 10 秒以内的写入延迟
- Redis 计数器与 DB 之间的最终一致性：每 5 分钟 DB 全量回刷 Redis

### 接口层

**API**：`GET /api/v1/console/dashboard/stats-cards`

**Request**：无

**Response Schema**

```json
{
  "today_calls": {
    "value": 1234,
    "success": 1200,
    "failed": 34,
    "change_vs_yesterday": 12.5
  },
  "today_tokens": {
    "value": 56789,
    "input": 30000,
    "output": 26789,
    "change_vs_yesterday": -3.2
  },
  "today_cost": {
    "value": 45.60,
    "monthly_total": 890.50,
    "change_vs_yesterday": 8.1
  },
  "balance": {
    "value": 234.50,
    "yesterday_balance": 250.00
  }
}
```

**错误码**

| 错误码 | HTTP | 说明 |
|--------|------|------|
| DATA_UNAVAILABLE | 503 | 数据源不可用 |
| RATE_LIMITED | 429 | 请求频率过高 |

**缓存策略**
- 指标数据 Redis 缓存 10 秒（key: `user:{id}:stats:cards`）
- 当日聚合使用 Redis 计数器（key: `user:{id}:stats:{date}`）+ 定时持久化

### 业务逻辑

**变化率计算**

```
change_vs_yesterday = (today_value - yesterday_value) / yesterday_value * 100
IF yesterday_value = 0 → change_vs_yesterday = null（前端展示 "—"）
```

**数值格式化规则**
- 数值 > 9999 → 转换为 K/M 单位（如 12500 → "12.5K"）
- 费用保留两位小数

**边界条件**
- Redis 不可用 → 降级读取 DB 聚合
- DB 聚合超时（>500ms）→ 返回空值 + `fallback: true`
- 新用户无数据 → 返回 0 + `change_vs_yesterday: null`
- 昨日值为 0 时变化率返回 null

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.show_free_quota` | BOOLEAN | false | 是否展示免费额度消耗 |
| `site_configs.default_compare_period` | VARCHAR(20) | "yesterday" | 对比基准：yesterday/last_week/last_month |

---

## 3. 仪表盘 — 区域 3：额度使用进度条

### 数据层

**涉及表：`users`, `user_quotas`, `call_logs`**

（字段定义见前两节复用 + user_quotas.quota_limit）

### 接口层

**API**：`GET /api/v1/console/dashboard/quota-bar`

**Response Schema**

```json
{
  "has_quota_limit": true,
  "quota_total": 1000.00,
  "quota_used": 650.00,
  "usage_rate": 65,
  "remaining": 350.00,
  "estimated_days": 12,
  "avg_daily_consumption": 50.00,
  "progress_level": "warning"
}
```

**字段说明**
- `progress_level` = safe(<60%) / normal(60-80%) / warning(80-95%) / danger(>=95%) / exhausted(=100%)

**缓存策略**
- 缓存 60 秒（key: `user:{id}:quota`）

### 业务逻辑

**预估可用天数算法**

```
avg_daily = SUM(last_7_days_consumption) / 7
IF avg_daily = 0 → estimated_days = null（展示 "—"）
ELSE estimated_days = remaining / avg_daily
```

**进度条状态逻辑**

```
usage_rate < 60 → safe, 绿色
usage_rate >= 60 AND < 80 → normal, 绿色 + "剩余 ¥XX"
usage_rate >= 80 AND < 95 → warning, 黄色 + "已用 80%，剩余 ¥XX"
usage_rate >= 95 AND < 100 → danger, 红色 + "额度即将耗尽，立即充值 →"
usage_rate = 100 → exhausted, 红色 + "额度已用完，立即充值 →"（闪烁按钮）
```

**边界条件**
- `user_quotas.quota_limit IS NULL` → `has_quota_limit = false`，不展示进度条
- 新注册用户（注册 < 7 天）且无调用 → `avg_daily = 0`, `estimated_days = null`
- 余额为 0 且额度已用完 → 额外返回 `arrears_overlay: true`
- 日均消耗为 0 → 预估天数展示 "—"

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.auto_notify_quota_warning` | BOOLEAN | true | 额度 > 80% 自动通知 |
| `site_configs.auto_notify_quota_danger` | BOOLEAN | true | 额度 > 95% 追加邮件通知 |

---

## 4. 仪表盘 — 区域 4：用量总览展开面板

### 数据层

**涉及表：`call_logs`, `consumption_logs`, `api_keys`**

**`api_keys` 相关字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | VARCHAR(36) | uuid | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| name | VARCHAR(50) | — | ✅ | — | 别名 |
| key_prefix | VARCHAR(20) | — | ✅ | — | sk-xxxx****xxxx 显示前缀 |
| key_hash | VARCHAR(64) | — | ✅ | UNIQUE | SHA-256 哈希 |
| status | VARCHAR(20) | `active` | ✅ | ✅ | active/disabled/expired |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |
| last_used_at | TIMESTAMPTZ | NULL | ❌ | ✅ | 最后使用时间 |

### 接口层

#### 4.1 概要模式

**API**：`GET /api/v1/console/dashboard/usage-summary`

**Response Schema**

```json
{
  "today_calls": 1234,
  "monthly_tokens": 56700000,
  "monthly_cost": 890.50,
  "top_5_models": [
    {"model": "deepseek-chat", "calls": 567, "cost": 234.50},
    {"model": "gpt-4o", "calls": 234, "cost": 456.70}
  ],
  "failed_requests": 23,
  "failed_rate": 1.8,
  "timeout_requests": 5,
  "timeout_rate": 0.4
}
```

#### 4.2 趋势页签

**API**：`GET /api/v1/console/dashboard/usage-trend?range=7d&granularity=hour`

**Request Params**
- `range`: 1d / 7d / 30d / custom
- `granularity`: hour / day / week
- `start_time`, `end_time`（custom 时必填）

**Response Schema**

```json
{
  "series": [
    {"timestamp": "2026-07-26T00:00:00Z", "total_tokens": 12345, "input_tokens": 6000, "output_tokens": 6345}
  ]
}
```

#### 4.3 模型分布页签（热力图）

**API**：`GET /api/v1/console/dashboard/model-heatmap?range=7d`

**Response Schema**

```json
{
  "models": ["deepseek-chat", "gpt-4o"],
  "hours": [0,1,2,...,23],
  "data": [
    {"model": "deepseek-chat", "hour": 14, "calls": 234, "percentage": 25}
  ]
}
```

#### 4.4 Key 对比页签

**API**：`GET /api/v1/console/dashboard/key-comparison?range=today`

**Response Schema**

```json
{
  "keys": [
    {
      "key_name": "生产环境-主Key",
      "calls": 1234,
      "success_rate": 98.5,
      "cost": 45.60,
      "cost_ratio": 0.35,
      "vs_average": "above"
    }
  ],
  "average_calls": 500,
  "average_cost": 30.00
}
```

**缓存策略**
- 概要模式：Redis 缓存 10 秒（key: `user:{id}:usage:summary`）
- 趋势/热力图：缓存 60 秒
- Key 对比：缓存 30 秒

### 业务逻辑

**热力图颜色映射**

```
percentage: 0% → #f0f0f0, 25% → #c6e48b, 50% → #7bc96f, 75% → #239a3b, 100% → #196127
```

**Key 对比标准**
```
IF cost_ratio > average_cost_per_key → "above"
IF cost_ratio < average_cost_per_key → "below"
IF cost_ratio = average_cost_per_key → "equal"
IF cost_ratio = NULL → "none"
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.heatmap_max_models` | INT | 10 | 热力图 Y 轴最大模型数 |

---

## 5. 仪表盘 — 区域 5：Token 消耗趋势图

### 数据层

**涉及表：`call_logs`**（聚合查询）

### 接口层

**API**：`GET /api/v1/console/dashboard/token-trend`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| range | VARCHAR(10) | `7d` | 24h / 7d / 30d / custom |
| granularity | VARCHAR(10) | by_range | hour / day / week |
| series | VARCHAR(20) | `total` | total / input / output |
| compare | BOOLEAN | false | 是否开启对比 |
| compare_range | VARCHAR(10) | null | 对比周期，默认=当前范围长度 |

**Response Schema**

```json
{
  "main_series": [
    {"timestamp": "2026-07-20T00:00:00Z", "total_tokens": 50000, "input_tokens": 25000, "output_tokens": 25000}
  ],
  "compare_series": [
    {"timestamp": "2026-07-13T00:00:00Z", "total_tokens": 45000, "input_tokens": 22000, "output_tokens": 23000}
  ],
  "download_urls": {
    "png": "/api/v1/console/dashboard/token-trend/chart.png",
    "svg": "/api/v1/console/dashboard/token-trend/chart.svg",
    "csv": "/api/v1/console/dashboard/token-trend/export.csv"
  }
}
```

**缓存策略**
- 趋势数据缓存 60 秒，对比数据另算 TTL

### 业务逻辑

**对比基准叠加规则**

```
对比周期 = [range_start - range_length, range_end - range_length]
对比周期用虚线渲染
```

**导出 CSV 格式**

```
timestamp,total_tokens,input_tokens,output_tokens,compare_total_tokens
2026-07-20,50000,25000,25000,45000
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.trend_max_points` | INT | 500 | 最大数据点数 |

---

## 6. 仪表盘 — 区域 6：模型分布明细表

### 数据层

**涉及表：`call_logs`, `models`, `vendors`**

### 接口层

**API**：`GET /api/v1/console/dashboard/model-distribution?range=today&sort_by=calls&sort_dir=desc`

**Response Schema**

```json
{
  "models": [
    {
      "model_name": "deepseek-chat",
      "vendor": "DeepSeek",
      "calls": 567,
      "total_tokens": 450000,
      "cost": 234.50,
      "avg_latency_ms": 180
    }
  ],
  "total_calls": 1234,
  "has_data": true
}
```

**缓存策略**
- 缓存 30 秒（key: `user:{id}:model:dist:{range}`）

### 业务逻辑

**排序规则**
- 默认按调用量降序
- 支持列：model_name(A-Z), calls, total_tokens, cost, avg_latency_ms

**边界条件**
- 今日无调用 → `has_data: false` + 前端展示空状态插图

---

## 7. 仪表盘 — 区域 7：API Key 对比表

### 接口层

**API**：`GET /api/v1/console/dashboard/key-comparison-table`

**Response Schema**

```json
{
  "keys": [
    {
      "key_name": "生产环境-主Key",
      "key_prefix": "sk-d2x4****h2j6",
      "created_at": "2026-06-01T00:00:00Z",
      "last_used_at": "2026-07-26T11:30:00Z",
      "idle_status": "active",
      "today_calls": 500,
      "success_rate": 98.5,
      "cost_ratio": 0.35,
      "vs_average": "above"
    }
  ],
  "average_calls_per_key": 300,
  "average_success_rate": 97.0
}
```

**`idle_status` 取值**
- `active`：最后使用在 7 天内
- `idle`：>7 天未使用 → 行灰色，标注 "⚠️ 闲置"
- `dormant`：>30 天未使用 → 行浅红色，标注 "🔴 沉睡"
- `unused`：从未使用（last_used_at IS NULL）→ 行浅黄色，标注 "🆕 未使用"

**对比标准**
```
IF value > average → "above" + 蓝色 + ↑
IF value < average → "below" + 橙色 + ↓
IF value = average → "equal" + 黑色
IF no_data → "none" + 灰色 "--"
```

**缓存策略**
- 缓存 30 秒

### 业务逻辑

**闲置 Key 自动通知规则**
```
IF last_used > 30_days_ago → 发送站内通知"您有 Key 已超过 30 天未使用"
IF last_used > 90_days_ago → 自动禁用 Key + 发送通知
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.idle_key_days` | INT | 7 | 闲置判定天数 |
| `site_configs.dormant_key_days` | INT | 30 | 沉睡判定天数 |
| `site_configs.auto_disable_key_days` | INT | 90 | 自动禁用天数 |

---

## 8. 仪表盘 — 区域 8：快捷操作入口

### 接口层

#### 获取 cURL 示例

**API**：`GET /api/v1/console/dashboard/curl-example`

**Response Schema**

```json
{
  "curl_command": "curl https://api.unmisa.com/v1/chat/completions \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Authorization: Bearer sk-d2x4****h2j6\" \\\n  -d '{\n    \"model\": \"deepseek-chat\",\n    \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}]\n  }'",
  "curl_with_key": "curl https://api.unmisa.com/v1/chat/completions \\\n  -H \"Content-Type: application/json\" \\\n  -H \"Authorization: Bearer sk-d2x4abc123h2j6\" \\\n  -d '{\n    \"model\": \"deepseek-chat\",\n    \"messages\": [{\"role\": \"user\", \"content\": \"Hello!\"}]\n  }'",
  "first_valid_key_prefix": "sk-d2x4"
}
```

**逻辑**
- 自动选取用户的第一个 active 状态的 API Key
- 如无有效 Key → 返回 `no_key_available: true`

---

## 9. 仪表盘 — 区域 9：最近登录记录

### 接口层

**API**：`GET /api/v1/console/dashboard/recent-logins?limit=5`

**Response Schema**

```json
{
  "records": [
    {
      "time": "2026-07-26T10:30:00Z",
      "ip": "117.78.2.66",
      "location": "深圳市, 广东省",
      "device": "Chrome 120 / Windows 10",
      "status": "success",
      "abnormal": false,
      "abnormal_type": null
    }
  ]
}
```

**`abnormal_type` 取值**
- `null`：正常
- `unusual`：异地登录（省份不同）
- `suspicious`：异常登录（城市不同，且城市变化大）

### 业务逻辑

**异常检测规则**

```
current_ip_city = 当前登录的城市
last_3_cities = 最近 3 次登录的城市去重

IF current_ip_city NOT IN last_3_cities:
  current_ip_province = 当前登录的省份
  last_3_provinces = 最近 3 次登录的省份去重
  IF current_ip_province NOT IN last_3_provinces:
    abnormal = true, abnormal_type = "unusual"（行背景标黄）
  ELSE:
    abnormal = true, abnormal_type = "suspicious"（行背景标红）
```

**缓存策略**
- 缓存 60 秒（key: `user:{id}:recent:logins`）

---

## 10. 仪表盘 — 区域 10：快速接入引导 (Onboarding)

### 数据层

**`users.onboarding_completed`**: BOOLEAN, DEFAULT FALSE

### 接口层

**API**：`GET /api/v1/console/dashboard/onboarding-status`

**Response Schema**

```json
{
  "show_onboarding": true,
  "completed": false,
  "steps": [
    {"step": 1, "title": "创建您的第一个 API Key", "completed": false, "action": "create_key"},
    {"step": 2, "title": "复制接入代码", "completed": false, "action": "copy_curl"},
    {"step": 3, "title": "测试首次调用", "completed": false, "action": "open_playground"}
  ],
  "registration_days": 3,
  "show_minimized_banner": false
}
```

**API**：`PUT /api/v1/console/dashboard/onboarding/complete-step`

**Request**

```json
{
  "step": 2
}
```

**API**：`PUT /api/v1/console/dashboard/onboarding/dismiss`

**Request**

```json
{
  "dismiss_days": 7
}
```

### 业务逻辑

**展示逻辑**

```
IF onboarding_completed = true → show_onboarding = false，不再展示
IF onboarding_completed = false AND registration_days < 7:
  show_onboarding = true
  IF steps.all_completed → 执行完成动画，更新 onboarding_completed = true
IF registration_days >= 7 AND onboarding_completed = false:
  show_minimized_banner = true（缩为告警条："您还差一步就完成接入配置"）
```

**步骤完成判定**
- Step 1：API Keys 列表中至少 1 个 active 状态的 Key
- Step 2：用户点击了"复制 cURL 示例"按钮（前端上报）
- Step 3：`call_logs` 中至少 1 条该用户的 success 记录

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.onboarding_force_days` | INT | 7 | 强制展示天数 |

---

## 11. 仪表盘 — 区域 11：成本预测卡片

### 数据层

**涉及表：`consumption_logs`, `users`**

### 接口层

**API**：`GET /api/v1/console/dashboard/cost-prediction`

**Response Schema**

```json
{
  "has_enough_data": true,
  "predicted_monthly_cost": 890.50,
  "consumed": 450.20,
  "remaining_days": 15,
  "daily_average": 30.01,
  "balance": 200.00,
  "estimated_balance_days": 6.7,
  "balance_alert_level": "danger",
  "recommend_recharge": true
}
```

**`balance_alert_level` 取值**
- `safe` (>30 天)，`info` (15-30 天)，`warning` (7-14 天)，`danger` (3-6 天)，`critical` (<3 天)，`exhausted` (余额<=0)

### 业务逻辑

**预测算法**

```
IF registration_days >= 30:
  daily_avg = SUM(last_30_days_consumption) / 30
ELIF registration_days >= 7:
  daily_avg = SUM(since_registration_consumption) / registration_days
ELSE:
  has_enough_data = false （"数据不足，暂无法预测"）

predicted_monthly_cost = consumed + (daily_avg * remaining_days_in_month)
estimated_balance_days = balance / daily_avg
```

**边界条件**
- `daily_avg = 0` → `estimated_balance_days = null`（展示 "—"）
- `balance = 0` → `estimated_balance_days = 0`（展示 "已耗尽"）
- 注册不足 7 天 → `has_enough_data = false`

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.min_data_days_for_prediction` | INT | 7 | 最小数据天数 |

---

## 12. 仪表盘 — 区域 12：异常告警卡片

### 数据层

**涉及表：`security_events`**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| event_type | VARCHAR(50) | — | ✅ | ✅ | 告警类型 |
| severity | VARCHAR(10) | `warning` | ✅ | ✅ | emergency/warning/info |
| title | VARCHAR(200) | — | ✅ | — | 告警标题 |
| description | TEXT | — | ✅ | — | 告警描述 |
| status | VARCHAR(20) | `pending` | ✅ | ✅ | pending/resolved/ignored |
| related_key_id | VARCHAR(36) | NULL | ❌ | — | 关联 Key |
| detected_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |
| read_at | TIMESTAMPTZ | NULL | ❌ | — | 用户已读时间 |

### 接口层

**API**：`GET /api/v1/console/dashboard/alerts`

**Response Schema**

```json
{
  "emergency_count": 2,
  "warning_count": 3,
  "alerts": [
    {
      "id": 1001,
      "event_type": "failure_spike",
      "severity": "emergency",
      "title": "失败率突增",
      "description": "API 失败率 7.2%（阈值 5%）",
      "suggested_action": "检查模型状态 / 联系客服",
      "detected_at": "2026-07-26T12:30:00Z",
      "is_read": false
    }
  ],
  "read_alerts": [...]
}
```

**API**：`PUT /api/v1/console/dashboard/alerts/{id}/read`

**Request**：无

### 业务逻辑

**告警类型与触发条件（后端轮询）**

| 类型 | 事件判断 | 轮询频率 |
|------|---------|---------|
| failure_spike | 近 5 分钟失败率 > 5% AND > 前一小时 2x | 30 秒 |
| quota_exhausting | `estimated_balance_days < 7` | 60 秒 |
| abnormal_login | 当前登录 IP 属地 ≠ 常用地 | 每次登录 |
| key_leak | 同一 Key 在 < 5 分钟内从 > 2 个城市调用 | 实时（API 请求路径）|
| balance_overdue | balance < 0 | 30 秒 |
| model_offline | 用户常用模型状态变更为 offline | 实时（供应商状态变更）|

**告警合并规则**
```
相同 event_type 5 分钟内合并为一条
合并后 title 显示 "失败率突增 - N 次触发"
```

**缓存策略**
- 告警列表缓存 10 秒（key: `user:{id}:alerts`）

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.failure_spike_threshold` | DECIMAL(5,2) | 5.00 | 失败率阈值（%）|
| `site_configs.failure_spike_multiplier` | DECIMAL(3,1) | 2.0 | 与前一小时倍数 |
| `site_configs.alerts_merge_window_seconds` | INT | 300 | 告警合并窗口（秒）|

---

## 13. 仪表盘 — 区域 13：账单周期概览

### 数据层

**涉及表：`consumption_logs`, `billing_records`**

**`billing_records` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| period_start | DATE | — | ✅ | ✅ | 账单周期开始日 |
| period_end | DATE | — | ✅ | ✅ | 账单周期结束日 |
| total_cost | DECIMAL(15,4) | 0 | ✅ | — | 总消费 |
| settled_cost | DECIMAL(15,4) | 0 | ✅ | — | 已结算金额 |
| status | VARCHAR(20) | `pending` | ✅ | ✅ | pending/settled |
| generated_at | TIMESTAMPTZ | NULL | ❌ | — | 账单生成时间 |

### 接口层

**API**：`GET /api/v1/console/dashboard/billing-overview`

**Response Schema**

```json
{
  "current_period": {
    "start": "2026-07-01",
    "end": "2026-07-31",
    "settled_cost": 890.50,
    "pending_cost": 123.40,
    "days_to_next_billing": 5
  },
  "history": [
    {
      "period_start": "2026-06-01",
      "period_end": "2026-06-30",
      "total_cost": 450.00,
      "settled_cost": 450.00,
      "status": "settled",
      "download_url": "/api/v1/console/billing/2026-06/download/pdf"
    }
  ]
}
```

**缓存策略**
- 缓存 60 秒（key: `user:{id}:billing:overview`）

### 业务逻辑

**周期计算**
```
period_start = 当月 1 日 00:00:00 UTC+8
period_end = 当月最后一天 23:59:59 UTC+8
billing_cycle_end = period_end
days_to_next_billing = period_end - now()
IF days_to_next_billing < 0:
  展示 "已过结算日 N 天"
```

**待结算金额计算**
```
pending_cost = SUM(consumption_logs WHERE created_at > billing_cycle_end - settlement_delay_days)
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.billing_cycle_start` | INT | 1 | 月账单起始日 |
| `site_configs.settlement_delay_days` | INT | 3 | 结算延迟天数 |
| `site_configs.max_history_months` | INT | 12 | 展示历史账单月数 |

---

## 14. 仪表盘 — 区域 14：实时活动流 (WebSocket)

### 接口层

**WebSocket 端点**：`wss://api.unmisa.com/ws/console/activity?token={jwt}`

**服务端推送消息格式**

```json
{
  "type": "call_event",
  "data": {
    "id": "req_xxxxxxxx",
    "model": "deepseek-chat",
    "status": "success",
    "tokens": 1234,
    "duration_ms": 567,
    "cost": 0.0123,
    "timestamp": "2026-07-26T11:35:00Z"
  }
}
```

**前端推送方向消息**

```json
{
  "type": "ping"
}
```

**服务端响应 ping**

```json
{
  "type": "pong"
}
```

### 业务逻辑

**连接生命周期**

```
① 用户登录后，前端建立 WebSocket 连接
② 服务端验证 JWT Token
③ 验证通过 → 建立连接，绑定 user_id 到连接
④ 验证失败 → 返回 4001 关闭码 + "Invalid token"

断线重连策略：
  间隔：3 秒
  最大重试：5 次
  重连后批量拉取断线期间消息（最多 50 条）
  API: GET /api/v1/console/activity/recent?since={last_received_timestamp}
```

**消息推送频率控制**
```
每条成功的 API 调用推送一条消息
失败/超时调用即时推送
推送频次不超过 5 条/秒/用户
超出时合并为概要消息
```

**前端约束**
- 缓冲区最大 200 条
- 消息显示 8 秒后自动移出
- 鼠标悬停暂停自动滚动

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.ws_max_buffer_size` | INT | 200 | 前端最大缓冲消息数 |
| `site_configs.ws_reconnect_interval_sec` | INT | 3 | 重连间隔秒 |
| `site_configs.ws_max_reconnects` | INT | 5 | 最大重连次数 |
| `site_configs.ws_push_rate_per_user` | INT | 5 | 每用户每秒最大推送 |

---

## 15. 仪表盘 — 区域 15：模型推荐/成本优化建议

### 接口层

**API**：`GET /api/v1/console/dashboard/optimization-tips`

**Response Schema**

```json
{
  "tips": [
    {
      "id": 1,
      "model_used": "deepseek-chat",
      "model_alt": "deepseek-v4-flash",
      "monthly_tokens": 1234567,
      "estimated_monthly_saving": 15.80,
      "reason": "功能等价，价格更低",
      "action_url": "/console/models"
    }
  ],
  "dismissed_ids": [1]
}
```

**API**：`PUT /api/v1/console/dashboard/optimization-tips/{id}/dismiss`

**Request**：无

### 业务逻辑

**建议生成逻辑（每日异步生成，按用户维度）**

```
FOR each user:
  scan 近 30 天调用数据
  FOR each model where calls > 100:
    lookup functionally_equivalent_models WHERE:
      - capability 相同
      - input_price < current_model.input_price
      - status = 'active'
    IF found:
      saving = monthly_tokens * (current_price - alt_price) / 1000
      IF saving >= site_configs.min_save_amount:
        创建优化建议记录
```

**展示频率控制**
```
IF 上次展示时间 在 site_configs.optimization_tip_frequency 天内 → 不展示
```

**去重**
```
同一模型-替代模型组合 30 天内不重复展示
用户 dismiss 后永久不展示该组合
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.min_save_amount` | DECIMAL(10,2) | 5.00 | 最低节省金额（元/月）|
| `site_configs.optimization_tip_frequency` | INT | 7 | 建议展示频率（天）|
| `site_configs.optimization_min_calls` | INT | 100 | 最低调用次数 |

---

## 16. 模型中心 `/console/models`

### 数据层

**涉及表：`models`, `vendors`, `vendor_models`**

**`models` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | VARCHAR(50) | — | ✅ | PK | 模型标识，如 `deepseek-chat` |
| name | VARCHAR(100) | — | ✅ | — | 展示名 |
| vendor_id | VARCHAR(50) | — | ✅ | ✅ | FK → vendors.id |
| capability | VARCHAR(30) | — | ✅ | ✅ | text_generation/chat/image_generation/embedding/code/audio |
| context_window | INT | — | ✅ | — | 上下文窗口大小，如 128000 |
| override_input_price | DECIMAL(10,6) | NULL | ❌ | — | 模型覆盖价（输入），L2 定价 |
| override_output_price | DECIMAL(10,6) | NULL | ❌ | — | 模型覆盖价（输出），L2 定价 |
| status | VARCHAR(20) | `active` | ✅ | ✅ | active/maintenance/offline |
| sort_order | INT | 0 | ✅ | ✅ | 排序权重 |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |

**`vendors` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | VARCHAR(50) | — | ✅ | PK | 如 `deepseek` |
| name | VARCHAR(100) | — | ✅ | — | 展示名 |
| logo_url | TEXT | NULL | ❌ | — | Logo URL |

**`vendor_models` 表字段**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| vendor_id | VARCHAR(50) | — | ✅ | ✅ | FK → vendors.id |
| model_id | VARCHAR(50) | — | ✅ | ✅ | FK → models.id |
| upstream_model_name | VARCHAR(100) | — | ✅ | — | 供应商侧模型名 |
| input_price | DECIMAL(10,6) | — | ✅ | — | 供应商输入采购价 |
| output_price | DECIMAL(10,6) | — | ✅ | — | 供应商输出采购价 |
| weight | INT | 10 | ✅ | — | 流量分配权重 |
| priority | INT | 1 | ✅ | — | 优先级，越小越优先 |
| status | VARCHAR(20) | `active` | ✅ | — | active/disabled |

### 接口层

#### 16.1 模型列表

**API**：`GET /api/v1/console/models`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| category | VARCHAR(30) | `all` | all/text_generation/chat/image_generation/embedding/code/audio |
| search | VARCHAR(100) | — | 模糊搜索模型名/供应商名 |
| vendor_ids | VARCHAR(200) | — | 多选供应商，逗号分隔 |
| price_range | VARCHAR(20) | — | 0-0.01 / 0.01-0.05 / 0.05-0.10 / 0.10+ |
| status | VARCHAR(20) | `active` | active/maintenance/all |
| page | INT | 1 | 分页 |
| page_size | INT | 20 | 每页条数 |

**Response Schema**

```json
{
  "models": [
    {
      "id": "deepseek-chat",
      "name": "deepseek-chat",
      "vendor": {"id": "deepseek", "name": "DeepSeek", "logo_url": null},
      "capability": "chat",
      "context_window": 128000,
      "input_price": 0.002,
      "output_price": 0.008,
      "status": "active",
      "highlight": "<strong>deepseek</strong>-chat"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

**缓存策略**
- 模型列表缓存 300 秒（key: `models:list:{category}:{search}`）
- 模型详情缓存 300 秒（key: `models:{id}`）

#### 16.2 模型价格明细

**API**：`GET /api/v1/console/models/{model_id}/price-detail`

**Response Schema**

```json
{
  "model_id": "deepseek-chat",
  "model_name": "deepseek-chat",
  "input_price": 0.002,
  "output_price": 0.008,
  "cache_input_price": 0.0005,
  "vendor_price": {
    "input": 0.0018,
    "output": 0.007
  },
  "markup_rate": 11.1
}
```

#### 16.3 Playground

**API**：`POST /api/v1/console/playground/chat`

**Request Schema**

```json
{
  "model": "deepseek-chat",
  "api_key_id": "key_uuid",
  "system_prompt": "You are a helpful assistant",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "mode": "chat"
}
```

**Response Schema**

```json
{
  "id": "req_xxxxx",
  "model": "deepseek-chat",
  "choices": [{"message": {"role": "assistant", "content": "Hello! How can I help?"}}],
  "usage": {
    "input_tokens": 234,
    "output_tokens": 567,
    "total_tokens": 801
  },
  "cost": 0.0034,
  "duration_ms": 1200
}
```

**API**：`POST /api/v1/console/playground/compare`

**Request Schema**

```json
{
  "models": ["deepseek-chat", "gpt-4o"],
  "api_key_id": "key_uuid",
  "messages": [{"role": "user", "content": "Hello!"}]
}
```

**Response Schema**

```json
{
  "results": [
    {
      "model": "deepseek-chat",
      "content": "...",
      "input_tokens": 234,
      "output_tokens": 567,
      "cost": 0.0034,
      "duration_ms": 1200,
      "tags": ["最低价"]
    }
  ]
}
```

**Playground 计费规则**
- Playground 调用真实计费，与正常 API 调用流程一致
- 费用 > ¥0.01 时返回 `cost_warning: true`，前端展示确认弹窗
- 费用 <= ¥0.01 时不弹确认，直接发送

### 业务逻辑

**搜索逻辑**
```
search_text 对 models.name 和 vendors.name 做 ILIKE '%search_text%' 匹配
匹配结果中高亮关键词
无结果 → empty result set + 前端展示"未找到匹配的模型"
```

**分类筛选逻辑**
```
category = 'all' → WHERE status != 'offline'
category = specific → WHERE models.capability = category AND status != 'offline'
```

**价格范围筛选**
```
price_range = '0-0.01' → WHERE input_price >= 0 AND input_price <= 0.01
```

**边界条件**
- 搜索无结果 → 返回空列表 `{models: [], total: 0}`
- 模型已下线 → 不返回在"全部"列表中
- 未选择 API Key 时 Playground 返回 `error: api_key_required`

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.playground_cost_warning_threshold` | DECIMAL(10,4) | 0.01 | 计费确认弹窗阈值 |

---

## 17. API Key 管理 `/console/api-keys`

### 数据层

**涉及表：`api_keys`, `key_ip_whitelist`, `key_model_permissions`, `call_logs`**

**`api_keys` 表（完整字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | VARCHAR(36) | uuid | ✅ | PK | UUID v4 |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| name | VARCHAR(50) | — | ✅ | — | 用户自定义别名 |
| key_prefix | VARCHAR(20) | — | ✅ | UNIQUE | `sk-` + 前8位 |
| key_hash | VARCHAR(64) | — | ✅ | UNIQUE | SHA-256 哈希 |
| status | VARCHAR(20) | `active` | ✅ | ✅ | active/disabled/expired |
| permission_scope | VARCHAR(30) | `all` | ✅ | — | all/restricted |
| expires_at | TIMESTAMPTZ | NULL | ❌ | ✅ | NULL=永不过期 |
| qps_limit | INT | 50 | ✅ | — | Key 级 QPS |
| tpm_limit | INT | 300000 | ✅ | — | Key 级 TPM |
| last_used_at | TIMESTAMPTZ | NULL | ❌ | ✅ | 最后使用时间 |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |
| updated_at | TIMESTAMPTZ | now() | ✅ | — | — |

**`key_ip_whitelist` 表**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| key_id | VARCHAR(36) | — | ✅ | ✅ | FK → api_keys.id |
| ip_cidr | VARCHAR(45) | — | ✅ | — | 单个 IP 或 CIDR |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |

**`key_model_permissions` 表**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| key_id | VARCHAR(36) | — | ✅ | ✅ | FK → api_keys.id |
| model_id | VARCHAR(50) | — | ✅ | ✅ | FK → models.id |

### 接口层

#### 17.1 Key 列表

**API**：`GET /api/v1/console/api-keys`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| status | VARCHAR(50) | — | 多选，逗号分隔：active,disabled,expired |
| date_from | DATE | — | 创建时间起始 |
| date_to | DATE | — | 创建时间结束 |
| permission_scope | VARCHAR(30) | — | all / restricted |
| search | VARCHAR(100) | — | 按别名/Key 前缀模糊搜索 |
| page | INT | 1 | — |
| page_size | INT | 20 | — |

**Response Schema**

```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "生产环境-主Key",
      "key_prefix": "sk-d2x4****h2j6",
      "status": "active",
      "permission_scope": "all",
      "model_count": null,
      "created_at": "2026-06-01T00:00:00Z",
      "last_used_at": "2026-07-26T11:30:00Z",
      "expires_at": null,
      "today_calls": 500,
      "ip_whitelist_count": 2
    }
  ],
  "total": 10,
  "page": 1
}
```

#### 17.2 创建 Key

**API**：`POST /api/v1/console/api-keys`

**Request Schema**

```json
{
  "name": "生产环境-主Key",
  "permission_scope": "all",
  "model_ids": null,
  "expires_at": null,
  "ip_whitelist": ["192.168.1.100", "10.0.0.0/8"]
}
```

**Response Schema**

```json
{
  "id": "uuid",
  "name": "生产环境-主Key",
  "full_key": "sk-d2x4abc123def456h2j6",
  "key_prefix": "sk-d2x4****h2j6",
  "status": "active",
  "created_at": "2026-07-26T12:00:00Z",
  "expires_at": null
}
```

**安全约束**
- `full_key` 只在创建时返回一次
- 后端仅存储 `key_hash`（SHA-256），不存储明文
- Key 生成算法：`sk-` + uuid4 去除连字符 + 8 位随机字节 base62

#### 17.3 编辑 Key

**API**：`PUT /api/v1/console/api-keys/{id}`

**Request Schema**

```json
{
  "name": "生产环境-主Key-更新",
  "permission_scope": "restricted",
  "model_ids": ["deepseek-chat", "gpt-4o"],
  "expires_at": "2026-08-15T00:00:00Z"
}
```

#### 17.4 禁用/启用/删除 Key

**API**：`PUT /api/v1/console/api-keys/{id}/disable`
**API**：`PUT /api/v1/console/api-keys/{id}/enable`
**API**：`DELETE /api/v1/console/api-keys/{id}`

#### 17.5 批量操作

**API**：`POST /api/v1/console/api-keys/batch`

**Request Schema**

```json
{
  "action": "disable",
  "ids": ["uuid1", "uuid2"]
}
```

**`action` 取值**：`enable` / `disable` / `delete`

#### 17.6 Key 用量统计

**API**：`GET /api/v1/console/api-keys/{id}/stats`

**Response Schema**

```json
{
  "key_id": "uuid",
  "today_calls": 1234,
  "today_tokens": 56789,
  "today_cost": 1.23,
  "trend_7d": [
    {"date": "2026-07-20", "calls": 1000, "tokens": 50000, "cost": 1.00}
  ],
  "monthly_calls": 34567,
  "monthly_cost": 34.56,
  "rank": {"position": 2, "total": 5}
}
```

### 业务逻辑

**Key 生成流程**

```
① 生成 UUID v4
② 生成 random_bytes = crypto.randomBytes(8).toString('base62')
③ full_key = "sk-" + uuid_no_dashes + random_bytes
④ key_prefix = full_key.substring(0, 4) + "****" + full_key.substring(full_key.length - 4)
⑤ key_hash = SHA-256(full_key)
⑥ INSERT api_keys (..., key_prefix, key_hash, ...)
⑦ 返回 full_key（仅此一次）
```

**过期检查（API 请求时）**
```
IF expires_at IS NOT NULL AND now() > expires_at:
  RETURN HTTP 403
  {
    "error": {
      "code": "key_expired",
      "message": "API Key 已过期，请在控制台续期",
      "expired_at": "2026-08-15T00:00:00Z"
    }
  }
```

**IP 白名单检查**
```
IF ip_whitelist 非空:
  IF 请求来源 IP 不匹配任何 whitelist 条目:
    RETURN HTTP 403 "IP Not Allowed"
```

**过期提醒定时任务**
```
每日 08:00 执行：
  SELECT api_keys WHERE expires_at IS NOT NULL
  IF expires_at - now() = 7_days → 站内通知
  IF expires_at - now() = 3_days → 站内通知 + 邮件
  IF expires_at - now() = 1_day → 站内通知 + 邮件
  IF expires_at <= now() → 禁用 Key + 站内通知 + 邮件
```

**边界条件**
- 名称超过 50 字符 → 前端阻止输入，后端返回 400
- IP 白名单格式非法 → 后端返回 400 `invalid_ip_format`
- 删除已禁用的 Key → 允许，直接删除
- 批量删除时部分 Key 属于其他用户 → 返回 403

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.key_default_qps` | INT | 50 | Key 默认 QPS |
| `site_configs.key_default_tpm` | INT | 300000 | Key 默认 TPM |
| `site_configs.key_name_max_length` | INT | 50 | 别名最大长度 |
| `site_configs.key_expire_notify_7d` | BOOLEAN | true | 7 天过期提醒 |
| `site_configs.key_expire_notify_3d` | BOOLEAN | true | 3 天过期提醒 |
| `site_configs.key_expire_notify_1d` | BOOLEAN | true | 1 天过期提醒 |

---

## 18. 调用日志 `/console/logs`

### 数据层

**涉及表：`call_logs`（完整字段）**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| request_id | VARCHAR(40) | `req_` + uuid | ✅ | UNIQUE | 可复制给客服 |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| api_key_id | VARCHAR(36) | — | ✅ | ✅ | FK → api_keys.id |
| model | VARCHAR(100) | — | ✅ | ✅ | 模型名 |
| vendor | VARCHAR(50) | — | ✅ | — | 供应商标识 |
| status | VARCHAR(20) | — | ✅ | ✅ | success/failed/timeout |
| input_tokens | INT | 0 | ✅ | — | — |
| output_tokens | INT | 0 | ✅ | — | — |
| total_tokens | INT | 0 | ✅ | — | — |
| input_price | DECIMAL(10,6) | — | ✅ | — | 实际执行单价 |
| output_price | DECIMAL(10,6) | — | ✅ | — | — |
| cost | DECIMAL(15,6) | 0 | ✅ | ✅ | 实际费用 |
| duration_ms | INT | 0 | ✅ | — | 响应耗时 |
| error_code | VARCHAR(50) | NULL | ❌ | ✅ | 失败时返回 |
| error_message | TEXT | NULL | ❌ | — | 失败描述 |
| ip | VARCHAR(45) | NULL | ❌ | — | 请求来源 IP |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |

### 接口层

#### 18.1 日志列表

**API**：`GET /api/v1/console/logs`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | INT | 1 | — |
| page_size | INT | 50 | 默认 50，最大 500 |
| range | VARCHAR(10) | `today` | 15m / 1h / today / yesterday / 7d / 30d / custom |
| start_time | TIMESTAMP | — | custom 时必填 |
| end_time | TIMESTAMP | — | custom 时必填 |
| models | VARCHAR(500) | — | 多选模型，逗号分隔 |
| status | VARCHAR(50) | `success,failed,timeout` | 至少选一个 |
| request_id | VARCHAR(40) | — | 精确匹配 |
| api_key_ids | VARCHAR(500) | — | Key 筛选 |
| sort_by | VARCHAR(20) | `created_at` | created_at/cost/tokens/duration_ms |
| sort_dir | VARCHAR(4) | `desc` | asc/desc |

**Response Schema**

```json
{
  "logs": [
    {
      "id": 1000001,
      "request_id": "req_abc123def456",
      "model": "deepseek-chat",
      "vendor": "DeepSeek",
      "status": "success",
      "input_tokens": 234,
      "output_tokens": 567,
      "total_tokens": 801,
      "duration_ms": 1234,
      "cost": 0.0123,
      "error_code": null,
      "error_message": null,
      "created_at": "2026-07-26T11:35:00.123Z"
    }
  ],
  "total": 50000,
  "page": 1,
  "page_size": 50,
  "total_pages": 1000,
  "has_more": true
}
```

**性能约束**
- 首次加载 < 500ms（使用索引覆盖查询）
- 超过 500 条结果自动启用游标分页（cursor-based pagination）
- 默认展示最近 500 条，按时间倒序

#### 18.2 高级筛选预设

**API**：`GET /api/v1/console/logs/presets`
**Response**：用户已保存的筛选预设列表

**API**：`POST /api/v1/console/logs/presets`

**Request**

```json
{
  "name": "今日失败日志",
  "filters": {
    "range": "today",
    "status": "failed",
    "models": ["deepseek-chat"]
  }
}
```

**API**：`DELETE /api/v1/console/logs/presets/{id}`

#### 18.3 日志导出

**API**：`GET /api/v1/console/logs/export`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| format | VARCHAR(10) | `csv` | csv / json / excel |
| scope | VARCHAR(10) | `current_page` | current_page / all |
| (筛选参数) | — | — | 同日志列表 |

**Response**
- 范围 <= 10000 条 → 同步返回文件流
- 范围 > 10000 条 → 返回 `{"task_id": "export_xxx", "status": "processing"}`，异步生成
- 异步完成后通知用户下载，导出文件保留 7 天

#### 18.4 异常分析

**API**：`GET /api/v1/console/logs/error-analysis`

**Request Params**：同日志列表

**Response Schema**

```json
{
  "total_failed": 234,
  "failed_rate": 2.3,
  "by_error_type": [
    {"error_code": "auth_failed", "count": 89, "percentage": 38.0},
    {"error_code": "insufficient_balance", "count": 67, "percentage": 28.6},
    {"error_code": "rate_limited", "count": 45, "percentage": 19.2},
    {"error_code": "model_unavailable", "count": 23, "percentage": 9.8},
    {"error_code": "timeout", "count": 10, "percentage": 4.3}
  ],
  "error_rate_trend": [
    {"hour": "00:00", "rate": 1.2},
    {"hour": "01:00", "rate": 0.8}
  ],
  "failed_requests": [
    {
      "request_id": "req_xxx",
      "error_code": "auth_failed",
      "error_message": "Invalid API Key",
      "created_at": "2026-07-26T11:30:00Z"
    }
  ]
}
```

### 业务逻辑

**时间范围解析**

```
range='15m' → created_at >= now() - 15min
range='1h' → created_at >= now() - 1h
range='today' → created_at >= today 00:00:00
range='yesterday' → created_at BETWEEN yesterday 00:00:00 AND yesterday 23:59:59
range='7d' → created_at >= now() - 7d
range='30d' → created_at >= now() - 30d
```

**错误类型分类映射**

| error_code | 分类 | 说明 |
|------------|------|------|
| `invalid_api_key` | auth_failed | 认证失败 |
| `key_disabled` | auth_failed | Key 已被禁用 |
| `key_expired` | auth_failed | Key 已过期 |
| `ip_not_allowed` | auth_failed | IP 未在白名单 |
| `insufficient_balance` | insufficient_balance | 余额不足 |
| `rate_limit_exceeded` | rate_limited | 限流 |
| `model_not_found` | model_unavailable | 模型不存在 |
| `model_unavailable` | model_unavailable | 模型不可用 |
| `timeout` | timeout | 超时 |
| `upstream_error` | upstream_error | 上游供应商错误 |

**边界条件**
- 日志过多（> 500 条）→ 使用游标分页
- DB 查询超时（> 2秒）→ 返回前 500 条 + `truncated: true`
- 导出超过 100000 条 → 自动分片，通知多个下载链接

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.log_default_page_size` | INT | 50 | 默认每页条数 |
| `site_configs.log_max_page_size` | INT | 500 | 最大每页条数 |
| `site_configs.log_export_async_threshold` | INT | 10000 | 异步导出阈值 |
| `site_configs.log_export_retention_days` | INT | 7 | 导出文件保留天数 |
| `site_configs.log_default_range` | VARCHAR(10) | "today" | 默认时间范围 |

---

## 19. 用量统计 `/console/stats`

### 接口层

#### 19.1 组合查询聚合

**API**：`GET /api/v1/console/stats/aggregate`

**Request Params**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| dimension_x | VARCHAR(20) | `model` | model/vendor/key/time |
| dimension_series | VARCHAR(20) | `time` | time/model/key |
| metric | VARCHAR(20) | `calls` | calls/tokens/cost/success_rate/latency |
| range | VARCHAR(10) | `7d` | 7d / 30d / custom |
| start_time | TIMESTAMP | — | custom 时必填 |
| end_time | TIMESTAMP | — | custom 时必填 |
| compare | BOOLEAN | false | 开启对比 |
| compare_start | TIMESTAMP | — | 对比起始 |
| compare_end | TIMESTAMP | — | 对比结束 |

**Response Schema**

```json
{
  "chart_type": "grouped_bar",
  "dimension_x": "model",
  "dimension_series": "time",
  "metric": "calls",
  "series": [
    {
      "label": "deepseek-chat",
      "data": [
        {"timestamp": "2026-07-20", "value": 1234},
        {"timestamp": "2026-07-21", "value": 1500}
      ]
    }
  ],
  "compare_series": null
}
```

**`chart_type` 取值**

| 组合 | chart_type |
|------|-----------|
| model × time | grouped_bar |
| time × model | stacked_area |
| key × model | heatmap |
| vendor × time | line |

#### 19.2 数据表视图

**API**：`GET /api/v1/console/stats/table`

**Request Params**：同 aggregate，额外支持 sort_by / sort_dir / page / page_size

**Response Schema**

```json
{
  "columns": ["时间", "模型", "调用次数", "Token消耗", "费用"],
  "rows": [
    ["2026-07-20", "deepseek-chat", 1234, 450000, 12.30]
  ],
  "total": 50,
  "page": 1
}
```

### 业务逻辑

**图表类型映射**

```
IF dimension_x = 'model' AND dimension_series = 'time' → grouped_bar
IF dimension_x = 'time' AND dimension_series = 'model' → stacked_area
IF dimension_x = 'key' AND dimension_series = 'model' → heatmap
IF dimension_x = 'vendor' AND dimension_series = 'time' → line
```

**对比模式**
```
主数据：实线 + 填充色（蓝色）
对比数据：虚线 + 无填充（灰色）
对比基准选择：上周同期 / 上月同期 / 自定义时间段
```

**数据表导出**：同调用日志导出模式

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.stats_max_series` | INT | 10 | 最大系列数 |
| `site_configs.stats_max_points` | INT | 500 | 最大数据点数 |

---

## 20. 充值 `/console/recharge`

### 数据层

**涉及表：`recharge_orders`**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | VARCHAR(40) | `RCH-` + 时间+序列 | ✅ | PK | 格式 `RCH-20260726-0001` |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| amount | DECIMAL(10,2) | — | ✅ | — | 充值金额 |
| bonus_amount | DECIMAL(10,2) | 0 | ✅ | — | 赠送金额 |
| payment_method | VARCHAR(20) | — | ✅ | — | alipay/wechat/transfer |
| payment_channel | VARCHAR(50) | — | ❌ | — | 支付渠道具体参数 |
| status | VARCHAR(20) | `pending` | ✅ | ✅ | pending/success/failed/expired/abnormal |
| channel_order_id | VARCHAR(100) | NULL | ❌ | ✅ | 支付渠道订单号 |
| paid_at | TIMESTAMPTZ | NULL | ❌ | — | 支付时间 |
| expired_at | TIMESTAMPTZ | now()+30min | ✅ | — | 订单过期时间 |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |
| updated_at | TIMESTAMPTZ | now() | ✅ | — | — |

**`users.balance` 更新通过 `balance_logs` 记录**

### 接口层

#### 20.1 创建充值订单

**API**：`POST /api/v1/console/recharge`

**Request Schema**

```json
{
  "amount": 100.00,
  "payment_method": "alipay",
  "custom_amount": false
}
```

**Response Schema**

```json
{
  "order_id": "RCH-20260726-0001",
  "amount": 100.00,
  "bonus_amount": 0,
  "payment_method": "alipay",
  "payment_info": {
    "qr_code_url": "https://pay.alipay.com/qr/xxx",
    "expires_in": 1800
  },
  "status": "pending",
  "created_at": "2026-07-26T12:00:00Z",
  "expired_at": "2026-07-26T12:30:00Z"
}
```

#### 20.2 充值记录列表

**API**：`GET /api/v1/console/recharge/orders`

**Response Schema**

```json
{
  "orders": [
    {
      "order_id": "RCH-20260726-0001",
      "amount": 100.00,
      "bonus_amount": 0,
      "payment_method": "alipay",
      "status": "success",
      "created_at": "2026-07-26T11:35:00Z",
      "paid_at": "2026-07-26T11:35:30Z",
      "can_retry": false
    }
  ],
  "total": 10
}
```

#### 20.3 支付回调

**API**：`POST /api/v1/payment/callback/alipay`（公开端点）

**逻辑**：
```
① 验证支付渠道签名
② 查找对应 recharge_orders
③ 更新 status = success, paid_at = now()
④ 增加 users.balance
⑤ 记录 balance_logs
⑥ 发送站内通知 + 邮件通知
```

#### 20.4 充值优惠查询

**API**：`GET /api/v1/console/recharge/promotions`

**Response Schema**

```json
{
  "promotions": [
    {
      "type": "first_recharge",
      "title": "首充满 ¥100 送 ¥20",
      "condition": "首笔充值 ≥ ¥100",
      "bonus": "¥20",
      "expires_at": "2026-07-28T23:59:59Z",
      "show_badge": true
    }
  ],
  "applied_promotions": []
}
```

### 业务逻辑

**充值金额选项**：[50, 100, 200, 500, 1000, 5000]

**优惠计算**
```
查询该用户可参加的活动（campaigns）
检查是否满足活动触发条件
计算赠送金额：bonus_amount
充值后余额 = balance + amount + bonus_amount
```

**支付超时处理**
```
定时任务每分钟执行：
  UPDATE recharge_orders SET status='expired' WHERE status='pending' AND expired_at < now()
```

**对公转账流程**
```
① 用户选择 transfer
② 返回平台对公账户信息
③ 用户 POST /api/v1/console/recharge/transfer-proof
   上传凭证文件 + 订单号
④ 财务后台审核 → 手动确认到账
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.recharge_options` | JSON | [50,100,200,500,1000,5000] | 可选金额 |
| `site_configs.recharge_expire_minutes` | INT | 30 | 订单过期分钟数 |
| `site_configs.transfer_min_amount` | DECIMAL(10,2) | 5000.00 | 对公转账最低金额 |
| `site_configs.transfer_discount_rate` | DECIMAL(5,2) | 0.96 | 对公转账折扣率 |

---

## 21. 消费明细 / 余额变动 `/console/transactions`

### 接口层

#### 21.1 消费明细列表

**API**：`GET /api/v1/console/transactions/consumption`

**Response Schema**

```json
{
  "transactions": [
    {
      "id": 10001,
      "time": "2026-07-26T11:35:00.123Z",
      "model": "deepseek-chat",
      "key_name": "生产环境-主Key",
      "input_tokens": 234,
      "output_tokens": 567,
      "total_tokens": 801,
      "input_price": 0.002,
      "output_price": 0.008,
      "cost": 0.0123,
      "balance_before": 234.50,
      "balance_after": 234.4877,
      "request_id": "req_abc123"
    }
  ],
  "total": 5000,
  "page": 1
}
```

#### 21.2 余额变动流水

**API**：`GET /api/v1/console/transactions/balance`

**Response Schema**

```json
{
  "records": [
    {
      "time": "2026-07-26T11:35:00Z",
      "type": "consumption",
      "change": -0.0123,
      "balance_before": 234.50,
      "balance_after": 234.4877,
      "description": "模型调用 deepseek-chat"
    }
  ]
}
```

**`type` 取值**：recharge / consumption / refund / admin_adjust / campaign

#### 21.3 日/月汇总

**API**：`GET /api/v1/console/transactions/summary?granularity=day&range=30d`

**Response Schema**

```json
{
  "summaries": [
    {
      "date": "2026-07-26",
      "opening_balance": 234.50,
      "recharge": 0,
      "consumption": -5.67,
      "adjustment": 0,
      "closing_balance": 228.83
    }
  ],
  "total_recharge": 200,
  "total_consumption": -65.50,
  "total_adjustment": 0
}
```

### 缓存策略
- 消费明细：不缓存，实时查询
- 余额变动：缓存 10 秒
- 日/月汇总：缓存 60 秒

---

## 22. 兑换码 `/console/redemption`

### 数据层

**涉及表：`redemption_codes`, `redemption_logs`**

**`redemption_codes` 表**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| code | VARCHAR(50) | — | ✅ | UNIQUE | 如 `3C-SUMMER-2026` |
| type | VARCHAR(20) | — | ✅ | — | balance/trial/discount/mixed |
| content | JSONB | — | ✅ | — | 兑换内容详情 |
| total_uses | INT | 1 | ✅ | — | 总可使用次数 |
| remaining_uses | INT | 1 | ✅ | — | 剩余次数 |
| max_uses_per_user | INT | 1 | ✅ | — | 每人限制 |
| starts_at | TIMESTAMPTZ | — | ✅ | ✅ | 生效时间 |
| expires_at | TIMESTAMPTZ | — | ✅ | ✅ | 过期时间 |
| status | VARCHAR(20) | `active` | ✅ | ✅ | active/expired/disabled |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |

**`redemption_logs` 表**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| code_id | BIGINT | — | ✅ | ✅ | FK → redemption_codes.id |
| code | VARCHAR(50) | — | ✅ | — | 兑换码原文 |
| reward | JSONB | — | ✅ | — | 兑换奖励内容 |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |

### 接口层

**API**：`POST /api/v1/console/redemption/redeem`

**Request Schema**

```json
{
  "code": "3C-SUMMER-2026"
}
```

**Response Schema**

```json
{
  "success": true,
  "reward": {
    "type": "balance",
    "amount": 20.00,
    "description": "¥20 余额"
  },
  "balance_after": 250.00
}
```

**API**：`GET /api/v1/console/redemption/history`

**Response Schema**

```json
{
  "records": [
    {
      "code": "3C-SUMMER-2026",
      "reward": {"type": "balance", "amount": 20},
      "redeemed_at": "2026-07-26T11:35:00Z",
      "status": "success"
    }
  ]
}
```

### 业务逻辑

**验证流程**

```
① 查找 redemption_codes WHERE code = input
② IF NOT found → 404 "兑换码无效"
③ IF now() > expires_at → "兑换码已过期"
④ IF now() < starts_at → "兑换码尚未生效"
⑤ IF remaining_uses <= 0 → "兑换码已领完"
⑥ SELECT COUNT(*) FROM redemption_logs WHERE code_id = x AND user_id = y
   IF count >= max_uses_per_user → "您已领取过该兑换码"
⑦ 展示兑换内容确认，等待用户确认
⑧ UPDATE redemption_codes SET remaining_uses = remaining_uses - 1
⑨ INSERT redemption_logs
⑩ 根据 type 执行奖励逻辑：
    - balance：增加 users.balance + 记录 balance_logs
    - trial：创建或延长 trial_quota
    - discount：创建 discount_quota 记录
⑪ 返回成功
```

**边界条件**
- 并发兑换同一码 → 使用行锁或乐观锁防止超领
- 奖励发放失败（如余额更新异常）→ 回滚 all or nothing
- 兑换码不存在 → 返回 `code: "REDEMPTION_INVALID"`

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.redemption_lock_timeout_ms` | INT | 3000 | 兑换锁超时 |

---

## 23. 发票 `/console/invoices`

### 数据层

**涉及表：`invoice_requests`**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| title | VARCHAR(100) | — | ✅ | — | 发票抬头 |
| tax_id | VARCHAR(30) | NULL | ❌ | — | 税号 |
| invoice_type | VARCHAR(20) | `normal` | ✅ | — | normal/special |
| months | JSONB | — | ✅ | — | 消费月份数组 |
| total_amount | DECIMAL(10,2) | — | ✅ | — | 开票金额 |
| email | VARCHAR(255) | — | ✅ | — | 收件邮箱 |
| address | TEXT | NULL | ❌ | — | 邮寄地址（专票必填）|
| status | VARCHAR(20) | `pending` | ✅ | ✅ | pending/approved/rejected/issued |
| express_no | VARCHAR(50) | NULL | ❌ | — | 快递单号 |
| pdf_url | TEXT | NULL | ❌ | — | 发票 PDF 下载 URL |
| created_at | TIMESTAMPTZ | now() | ✅ | — | — |

### 接口层

**API**：`GET /api/v1/console/invoices/available-months`

**Response**

```json
{
  "months": ["2026-07", "2026-06", "2026-05"],
  "amount_by_month": {
    "2026-07": 890.50,
    "2026-06": 450.00
  }
}
```

**API**：`POST /api/v1/console/invoices/submit`

**Request Schema**

```json
{
  "title": "XX科技有限公司",
  "tax_id": "91440101MA5XXXXXX",
  "invoice_type": "normal",
  "months": ["2026-07", "2026-06"],
  "email": "finance@example.com",
  "address": null
}
```

**API**：`GET /api/v1/console/invoices`

**Response Schema**

```json
{
  "invoices": [
    {
      "id": 1,
      "title": "XX科技有限公司",
      "total_amount": 890.50,
      "status": "issued",
      "months": ["2026-07"],
      "created_at": "2026-07-26T11:35:00Z",
      "pdf_url": "/api/v1/console/invoices/1/download"
    }
  ]
}
```

### 业务逻辑

**可开票月份计算**
```
SELECT DISTINCT date_trunc('month', created_at) AS month
FROM consumption_logs WHERE user_id = x
AND month NOT IN (已开票月份汇总 FROM invoice_requests WHERE status IN ('approved','issued'))
```

**金额验证**
```
total_amount = SUM(consumption_logs WHERE month IN months)
IF total_amount < site_configs.min_invoice_amount → 400 "未达到最低开票金额"
IF length(months) > site_configs.max_merge_months → 400 "合并月份过多"
```

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.min_invoice_amount` | DECIMAL(10,2) | 50.00 | 最低开票金额 |
| `site_configs.invoice_fee_percent` | DECIMAL(5,2) | 0 | 开票手续费率 |
| `site_configs.max_merge_months` | INT | 12 | 最多合并月数 |

---

## 24. 安全设置

### 涵盖功能
- 2FA 双因素认证
- 密码修改
- 登录记录
- 设备管理

### 接口层

#### 24.1 2FA 管理

**API**：`POST /api/v1/console/security/2fa/enable`

**Request**

```json
{
  "password": "current_password"
}
```

**Response**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code_url": "otpauth://totp/3cloud:user@email?secret=XXX&issuer=3cloud"
}
```

**API**：`POST /api/v1/console/security/2fa/verify`

**Request**

```json
{
  "code": "123456"
}
```

**API**：`POST /api/v1/console/security/2fa/disable`

**Request**

```json
{
  "password": "current_password",
  "code": "123456"
}
```

#### 24.2 密码修改

**API**：`PUT /api/v1/console/security/password`

**Request**

```json
{
  "current_password": "old_pass",
  "new_password": "new_pass",
  "confirm_password": "new_pass"
}
```

**约束**
- 最小长度：8（配置 `site_configs.password_min_length`）
- 不能和当前密码相同
- 新密码哈希存储（bcrypt）

#### 24.3 登录记录

**API**：`GET /api/v1/console/security/login-history?page=1&page_size=20`

**Response** （同区域 9 记录格式，分页支持）

#### 24.4 设备管理

**API**：`GET /api/v1/console/security/devices`

**Response Schema**

```json
{
  "devices": [
    {
      "id": "device_uuid",
      "device_name": "Chrome on Windows",
      "ip": "117.78.2.66",
      "last_active_at": "2026-07-26T10:30:00Z",
      "created_at": "2026-07-01T00:00:00Z",
      "is_current": true
    }
  ]
}
```

**API**：`DELETE /api/v1/console/security/devices/{id}`（登出指定设备）

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.two_factor_policy` | VARCHAR(20) | "optional" | optional/required_all/required_admin |
| `site_configs.password_min_length` | INT | 8 | 密码最小长度 |
| `site_configs.login_lock_threshold` | INT | 5 | 锁定前失败次数 |
| `site_configs.login_lock_duration_minutes` | INT | 15 | 锁定时长（分钟）|

---

## 25. 通知中心

### 数据层

**涉及表：`notifications`**

| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 说明 |
|--------|------|--------|----------|------|------|
| id | BIGSERIAL | — | ✅ | PK | — |
| user_id | VARCHAR(32) | — | ✅ | ✅ | FK → users.id |
| title | VARCHAR(200) | — | ✅ | — | 通知标题 |
| body | TEXT | — | ✅ | — | 通知正文 |
| type | VARCHAR(30) | — | ✅ | ✅ | system/recharge/alert/key_expiry/billing/campaign |
| channel | VARCHAR(20) | `in_app` | ✅ | — | in_app/email/both |
| is_read | BOOLEAN | FALSE | ✅ | ✅ | — |
| read_at | TIMESTAMPTZ | NULL | ❌ | — | — |
| action_url | TEXT | NULL | ❌ | — | 点击跳转 URL |
| created_at | TIMESTAMPTZ | now() | ✅ | ✅ | — |

### 接口层

**API**：`GET /api/v1/console/notifications`

**Request Params**：`page`, `page_size`, `type`, `is_read`

**Response Schema**

```json
{
  "notifications": [
    {
      "id": 1001,
      "title": "充值成功 - ¥100.00 已到账",
      "body": "您于 2026-07-26 11:35 充值 ¥100.00 已成功到账。当前余额：¥234.50",
      "type": "recharge",
      "is_read": false,
      "created_at": "2026-07-26T11:35:30Z",
      "action_url": "/console/transactions"
    }
  ],
  "unread_count": 5,
  "total": 50,
  "page": 1
}
```

**API**：`PUT /api/v1/console/notifications/{id}/read`
**API**：`PUT /api/v1/console/notifications/read-all`
**API**：`GET /api/v1/console/notifications/unread-count`

**Response**：`{"count": 5}`

### 业务逻辑

**通知触发场景**

| 类型 | 触发条件 | 渠道 |
|------|---------|------|
| recharge | 充值成功 | in_app + email |
| key_expiry | Key 过期提醒 | in_app + email |
| balance_low | 余额 < ¥10 | in_app + email（每日最多1次）|
| alert | 安全事件触发 | in_app |
| billing | 账单生成 | in_app + email |
| campaign | 活动奖励 | in_app |

**缓存策略**
- 未读数：Redis 实时计数（key: `user:{id}:notifications:unread`）
- 通知列表：缓存 10 秒

### 配置项

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `site_configs.notifications_default_channels` | JSON | ["in_app","email"] | 默认通知渠道 |
| `site_configs.daily_email_cap` | INT | 5 | 每用户每天邮件上限 |
| `site_configs.notifications_page_size` | INT | 20 | 默认每页条数 |

---

## 附录 A：通用数据字典

### 枚举值定义

**`users.role`**

| 值 | 等级 | 说明 |
|----|------|------|
| super_admin | L5 | 平台拥有者/创始人 |
| admin | L4 | 运营管理员 |
| finance | L4 | 财务岗 |
| auditor | L4 | 审计岗 |
| operator | L4 | 运营岗 |
| security | L4 | 安全岗 |
| agent_mgr | L4 | 代理管理岗 |
| agent | L3 | 代理商 |
| user | L2 | 普通用户 |
| developer | L2 | 开发者用户 |

**`call_logs.status`**

| 值 | 说明 |
|----|------|
| success | 成功 |
| failed | 失败 |
| timeout | 超时 |

**`api_keys.status`**

| 值 | 说明 |
|----|------|
| active | 启用 |
| disabled | 禁用 |
| expired | 过期 |

**`recharge_orders.status`**

| 值 | 说明 |
|----|------|
| pending | 待支付 |
| success | 成功 |
| failed | 失败 |
| expired | 已过期 |
| abnormal | 异常 |

**`invoice_requests.invoice_type`**

| 值 | 说明 |
|----|------|
| normal | 增值税普通发票 |
| special | 增值税专用发票 |

### 通用错误码

| 错误码 | HTTP | 说明 |
|--------|------|------|
| UNAUTHORIZED | 401 | 未认证或 Token 过期 |
| FORBIDDEN | 403 | 无权限 |
| NOT_FOUND | 404 | 资源不存在 |
| RATE_LIMITED | 429 | 请求频率超限 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| SERVICE_UNAVAILABLE | 503 | 服务暂时不可用 |
| INSUFFICIENT_BALANCE | 402 | 余额不足 |
| VALIDATION_ERROR | 400 | 请求参数校验失败 |

### 通用缓存键命名规范

```
user:{userId}:{module}:{subkey}:{params_hash}
```

示例：
- `user:u_10086:dashboard:welcome-card`
- `user:u_10086:dashboard:stats:cards`
- `user:u_10086:api-keys:list`
- `models:list:all`
- `models:deepseek-chat:price-detail`

### 通用分页规范

```
Request:
  page (int, default=1)
  page_size (int, default=20, max=500)

Response:
  {
    "items": [...],
    "total": int,
    "page": int,
    "page_size": int,
    "total_pages": int,
    "has_more": boolean
  }
```

超过 500 条结果改用游标分页：

```
Request:
  cursor (string, base64 encoded last item id + sort value)
  page_size (int, default=50, max=500)

Response:
  {
    "items": [...],
    "next_cursor": string|null,
    "has_more": boolean
  }
```

---

> **文档结束**
>
> 本文档覆盖了 PRD-运营级.md 第 2.2 章用户端全部 15 个仪表盘区域及 8 个核心功能模块的技术实现规格。
> 所有表定义、接口定义、业务逻辑均直接引用 PRD 规格，按 DRD 标准格式输出。
