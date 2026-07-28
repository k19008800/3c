# 3cloud（3C）AI Token 聚合平台 — 管理后台技术实现规格说明书（第二批）

> **版本**：V1.0-技术规格 | **最后更新**：2026-07-27
> **文档定位**：管理后台第二批功能模块（安全管理、系统配置、运营工具、实时监控、Key 资源池、供应商业入驻）的数据层、接口层、业务逻辑、状态流转、配置项等技术规格定义
> **适用对象**：架构师、后端开发、测试工程师
> **关联文档**：`PRD-运营级.md`

---

# 一、安全管理

## 1.1 安全事件管理

### 数据层
#### 涉及表：`security_events`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| event_id | varchar(32) | | ✅ | UNIQUE | 事件编号，格式 SEC-YYYYMMDD-NNN |
| type | varchar(32) | | ✅ | IDX_sec_events_type | 事件类型：abnormal_login/brute_force/token_abnormal/key_leak/balance_abnormal/content_filter |
| severity | varchar(16) | 'warning' | ✅ | IDX_sec_events_severity | 严重等级：critical/warning/info |
| user_id | varchar(32) | NULL | | IDX_sec_events_user | 关联用户 ID（可为空） |
| api_key_id | varchar(32) | NULL | | | 关联 API Key（可为空） |
| source_ip | varchar(45) | '' | | IDX_sec_events_ip | 来源 IP |
| source_geo | varchar(64) | '' | | | IP 归属地 |
| description | text | '' | ✅ | | 事件描述 |
| status | varchar(16) | 'pending' | ✅ | IDX_sec_events_status | 状态：pending/processing/resolved/ignored |
| action_taken | varchar(128) | '' | | | 处置动作描述 |
| resolved_by | varchar(32) | NULL | | | 处置人 ID |
| resolved_at | timestamptz | NULL | | | 处置时间 |
| metadata | jsonb | {} | | | 附加信息（关联 Key 列表、同时调用城市等） |
| created_at | timestamptz | now() | ✅ | IDX_sec_events_created | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`security_event_dispositions`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| event_id | int8 | | ✅ | FK_sec_event_id | 引用 security_events.id |
| action | varchar(32) | | ✅ | | 处置类型：disable_key/ban_user/blacklist_ip/mark_false_positive/ignore |
| operator_id | varchar(32) | | ✅ | | 操作人 ID |
| operator_name | varchar(64) | | ✅ | | 操作人名称 |
| detail | text | '' | | | 处置备注 |
| created_at | timestamptz | now() | ✅ | | 处置时间 |

#### 数据一致性要求
1. 安全事件创建后不可修改（除非状态流转），保证事件记录的完整性
2. 处置操作必须记录完整操作人、时间、动作明细
3. 关联的 key 或 user 被删除后，事件记录保留（外键使用 soft reference）

### 接口层
#### API：GET `/admin/security/events`
**Request Schema**：
```json
{
  "type": "key_leak",
  "severity": "critical",
  "status": "pending",
  "user_id": "",
  "page": 1,
  "page_size": 20,
  "start_time": "2026-07-01T00:00:00Z",
  "end_time": "2026-07-27T23:59:59Z"
}
```
**Response Schema**：
```json
{
  "total": 234,
  "items": [
    {
      "id": 1,
      "event_id": "SEC-20260726-001",
      "type": "key_leak",
      "severity": "critical",
      "user_id": "u_10086",
      "user_name": "张三",
      "api_key_id": "ak_xxxx",
      "source_ip": "117.78.2.66",
      "source_geo": "深圳市",
      "description": "Key 在 30 秒内从 3 个不同城市同时调用",
      "status": "pending",
      "created_at": "2026-07-26T11:35:00Z"
    }
  ]
}
```
**错误码定义**：
- `403 Forbidden`：无 `security:read` 权限

#### API：GET `/admin/security/events/{event_id}`
**Response Schema**：
```json
{
  "event": { "... 同上, 含完整字段" },
  "dispositions": [
    {
      "action": "disable_key",
      "operator_name": "admin@3cloud.ai",
      "detail": "禁用 Key prod-key",
      "created_at": "2026-07-26T11:36:00Z"
    }
  ]
}
```

#### API：POST `/admin/security/events/{event_id}/dispose`
**Request Schema**：
```json
{
  "action": "disable_key",
  "detail": "禁用 Key prod-key"
}
```
**Response Schema**：`{"success": true}`
**错误码定义**：
- `403 Forbidden`：无 `security:operate` 权限
- `400 BadRequest`：无效的处置动作或事件已处置

#### 缓存策略
- 事件列表不缓存（实时数据）
- 事件详情缓存 30 秒（Redis key: `sec_event:{event_id}`）

### 业务逻辑
```
功能：安全事件处置
输入：event_id, action, detail

1. 查询 security_events 是否存在且 status ∈ [pending, processing]
2. 若 status = resolved/ignored → 返回 400 错误
3. 根据 action 执行处置：
   action = "disable_key"
     → 更新 api_keys.status = "disabled"
     → 记录 api_key 操作日志
   action = "ban_user"
     → 更新 users.status = "banned"
     → 将该用户所有 Key 置为 disabled
   action = "blacklist_ip"
     → 插入 ip_blacklist 表
   action = "mark_false_positive"
     → 仅标记事件，不触发副作用
   action = "ignore"
     → 仅标记事件，不触发副作用
4. 插入 security_event_dispositions 记录
5. 更新 security_events: status=resolved, action_taken=action, resolved_by=当前用户, resolved_at=now()
```

### 状态流转
```
状态迁移：
  pending ──→ processing（管理员标记处理中）
  pending ──→ resolved（一键处置后自动流转）
  pending ──→ ignored（标记忽略）
  processing ──→ resolved
  processing ──→ ignored

约束：
  resolved/ignored 不可再流转
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 事件保留天数 | `site_configs.security_event_retention_days` | 90 | 超过自动归档 |

---

## 1.2 风控规则引擎

### 数据层
#### 涉及表：`security_rules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | UNIQUE | 规则名称 |
| description | text | '' | | | 规则描述 |
| is_preset | boolean | false | ✅ | | 是否为内置预设规则 |
| enabled | boolean | true | ✅ | IDX_sec_rules_enabled | 启用状态 |
| conditions | jsonb | [] | ✅ | | 条件数组，见下方 schema |
| actions | jsonb | [] | ✅ | | 动作数组，见下方 schema |
| notify_channels | text[] | ['站内'] | | | 通知方式：站内/邮件 |
| hit_count | int4 | 0 | ✅ | | 累计命中次数 |
| last_hit_at | timestamptz | NULL | | | 最后命中时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

**conditions jsonb schema**：
```json
[
  {
    "field": "login_failures",     // 字段标识
    "operator": "gte",             // gte/gt/lte/lt/eq/neq/in_range
    "value": 5,                    // 比较值
    "unit": "minutes",             // 时间窗口单位（可选）
    "window": 5                    // 时间窗口大小（可选）
  }
]
```

**actions jsonb schema**：
```json
[
  {
    "action": "record_event",      // 动作类型
    "severity": "warning",         // 事件等级
    "ban_ip_minutes": 15,          // 封禁时长（可选）
    "disable_key_minutes": 15,     // 临时禁用 Key 时长（可选）
    "disable_key_permanent": false,// 永久禁用 Key（可选）
    "notify_admin": true           // 通知管理员
  }
]
```

#### 涉及表：`security_rule_hits`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| rule_id | int8 | | ✅ | FK_sec_rule_hits | 引用 security_rules.id |
| user_id | varchar(32) | NULL | | | 触发用户 |
| api_key_id | varchar(32) | NULL | | | 触发 Key |
| source_ip | varchar(45) | '' | | | 触发 IP |
| matched_conditions | jsonb | [] | ✅ | | 命中的条件明细 |
| action_taken | jsonb | {} | ✅ | | 执行的动作明细 |
| created_at | timestamptz | now() | ✅ | IDX_sec_rule_hits_time | 命中时间 |

#### 数据一致性要求
1. 预设规则（is_preset=true）不可删除，仅可禁用
2. 规则修改后立即生效（无需重启服务）
3. 命中计数必须与 security_rule_hits 记录保持最终一致（可异步批量更新，允许短时偏差）

### 接口层
#### API：GET `/admin/security/rules`
**Response Schema**：
```json
{
  "rules": [
    {
      "id": 1,
      "name": "暴力破解防护",
      "description": "5分钟内登录失败≥5次",
      "is_preset": true,
      "enabled": true,
      "conditions": [
        {"field": "login_failures", "operator": "gte", "value": 5, "window": 5, "unit": "minutes"}
      ],
      "actions": [
        {"action": "record_event", "severity": "warning", "ban_ip_minutes": 15}
      ],
      "hit_count": 234,
      "last_hit_at": "2026-07-26T11:35:00Z"
    }
  ]
}
```

#### API：POST `/admin/security/rules`
**Request Schema**：
```json
{
  "name": "自定义规则",
  "description": "",
  "conditions": [...],
  "actions": [...],
  "notify_channels": ["站内", "邮件"],
  "enabled": true
}
```

#### API：PUT `/admin/security/rules/{rule_id}`
**Request Schema**：同 POST，允许部分更新

#### API：DELETE `/admin/security/rules/{rule_id}`
**错误码定义**：
- `400 BadRequest`：预设规则不可删除

#### API：GET `/admin/security/rules/stats`
**Response Schema**：
```json
{
  "stats": [
    {"rule_id": 1, "rule_name": "暴力破解防护", "hit_count": 234, "ban_count": 198},
    {"rule_id": 2, "rule_name": "异地登录检测", "hit_count": 56, "notify_count": 56}
  ]
}
```

#### 缓存策略
- 规则列表缓存 60 秒（Redis key: `security_rules:list`）
- 规则命中统计缓存 300 秒（Redis key: `security_rules:stats`）

### 业务逻辑
```
功能：风控规则引擎执行
触发时机：每次 API 请求或登录操作

1. 加载所有 enabled=true 的规则（缓存）
2. 对每条规则逐条评估条件：
   for each rule:
     all_conditions_met = true
     for each condition in rule.conditions:
       从当前请求/上下文获取对应字段值
       若 condition.operator 不满足 → all_conditions_met = false, break
     if all_conditions_met:
       根据 rule.actions 执行动作
       rule.hit_count += 1
       rule.last_hit_at = now()
       写入 security_rule_hits 记录
3. 定期（每分钟）异步批量更新 security_rules.hit_count
```

### 内置预设规则
| 规则名 | 条件 | 动作 |
|-------|------|------|
| 暴力破解防护 | login_failures ≥ 5, window=5min | record_event(warning), ban_ip(15min) |
| 异地登录检测 | login_ip_city ≠ last_3_login_cities | record_event(info), notify_user |
| Key 泄露检测 | key_cities_count ≥ 3, window=5min | record_event(critical), disable_key(15min), notify_admin |
| 大额消费预警 | single_consumption > 100 OR daily_consumption > 500 | record_event(warning), notify_user |
| 夜间敏感操作 | current_hour ∈ [0,6) AND action in sensitive_actions | record_event(info), notify_admin |
| 余额异常减少 | consumption_5min > balance * 0.5 | record_event(critical), disable_key(15min) |

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 规则评估超时 | `site_configs.rule_eval_timeout_ms` | 50 | 毫秒，超时跳过该规则 |
| 命中统计刷新间隔 | `site_configs.rule_hit_sync_interval_sec` | 60 | 异步同步命中计数的间隔 |

---

## 1.3 AI 风控模型

### 数据层
#### 涉及表：`risk_control_models`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 模型名称 |
| status | varchar(16) | 'running' | ✅ | | 状态：running/paused/training |
| sensitivity | smallint | 70 | ✅ | | 敏感度阈值 0-100 |
| decision_frequency | varchar(16) | 'realtime' | ✅ | 决策频率：realtime/batch/daily |
| feature_dimensions | int2 | 12 | ✅ | | 特征维度数 |
| trained_samples | int4 | 0 | ✅ | | 训练样本数 |
| positive_samples | int4 | 0 | | | 正样本（安全事件）数 |
| training_data_start | timestamptz | NULL | | | 训练数据起始时间 |
| training_data_end | timestamptz | NULL | | | 训练数据结束时间 |
| last_trained_at | timestamptz | NULL | | | 最后训练时间 |
| accuracy | decimal(5,2) | NULL | | | 准确率 % |
| recall | decimal(5,2) | NULL | | | 召回率 % |
| f1_score | decimal(5,2) | NULL | | | F1 分值 |
| confusion_matrix | jsonb | NULL | | | 混淆矩阵 {tp, fp, fn, tn} |
| roc_data | jsonb | NULL | | | ROC 曲线数据点 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 训练期间模型状态置为 training，训练完成自动恢复为 running
2. 混淆矩阵和 ROC 数据必须与最后一次训练结果一致

### 接口层
#### API：GET `/admin/security/risk-model`
**Response Schema**：
```json
{
  "id": 1,
  "name": "3cloud Risk Model v1",
  "status": "running",
  "sensitivity": 70,
  "decision_frequency": "realtime",
  "feature_dimensions": 12,
  "trained_samples": 12345,
  "positive_samples": 234,
  "training_data_start": "2026-06-28T00:00:00Z",
  "training_data_end": "2026-07-25T23:59:59Z",
  "last_trained_at": "2026-07-25T10:00:00Z",
  "accuracy": 87.30,
  "recall": 82.10,
  "f1_score": 84.60,
  "confusion_matrix": {"tp": 89, "fp": 13, "fn": 10, "tn": 55}
}
```

#### API：PUT `/admin/security/risk-model/params`
**Request Schema**：
```json
{
  "sensitivity": 65,
  "decision_frequency": "realtime"
}
```

#### API：POST `/admin/security/risk-model/train`
**Response Schema**：
```json
{
  "success": true,
  "message": "训练任务已提交",
  "estimated_duration_sec": 300
}
```

#### API：POST `/admin/security/risk-model/toggle`
**Request Schema**：
```json
{
  "action": "pause"
}
```
**动作**：pause（暂停）/ resume（恢复运行）

#### 缓存策略
- 模型配置缓存 30 秒（Redis key: `risk_model:config`）
- 模型评估报告缓存 300 秒（Redis key: `risk_model:report`）

### 业务逻辑
```
功能：AI 风控模型评估
触发时机：API 请求链路中

1. 若模型状态为 paused → 跳过
2. 实时模式（realtime）：
   提取 12 维特征向量：
     - IP 信誉分、历史异常次数、调用频率、
       目标模型是否敏感、时间段、用户信用分、
       Key 年龄、设备指纹、请求内容哈希相似度、
       用户历史消费模式偏差、供应商响应异常、
       同时段并发数、代理层级
   输入模型计算风险分数 [0, 100]
   若分数 > sensitivity → 标记为风险请求
     触发关联动作（记录事件/限流/拦截）
3. 训练流程：
   从 call_logs 和 security_events 抽取训练数据
   训练完成后更新 accuracy/recall/f1/confusion_matrix
   生成 ROC 曲线数据点
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 模型训练自动执行 | `site_configs.risk_model_auto_train` | false | 是否自动训练 |
| 训练数据窗口天数 | `site_configs.risk_model_training_window_days` | 28 | 训练数据范围 |

---

## 1.4 IP 黑白名单 / 地理封禁 / 登录限制

### 数据层
#### 涉及表：`ip_blacklist`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| ip_or_cidr | varchar(45) | | ✅ | IDX_ip_blacklist_ip | 单个 IP 或 CIDR 段 |
| type | varchar(8) | 'black' | ✅ | | black（黑名单）/ white（白名单）|
| scope | varchar(16) | 'global' | ✅ | | global（全局）/ user（用户级）|
| user_id | varchar(32) | NULL | | IDX_ip_blacklist_user | scope=user 时指定用户 |
| reason | text | '' | | | 添加原因 |
| expires_at | timestamptz | NULL | | | 过期时间，NULL 永久有效 |
| created_by | varchar(32) | | ✅ | | 创建人 ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 涉及表：`geo_blocking_config`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| blocked_regions | text[] | {} | ✅ | | 封禁国家代码数组，如 ["KP","SY","IR","CU"] |
| block_action | varchar(16) | 'all' | ✅ | | console（仅控制台）/ api（仅 API）/ all（全部）|
| enabled | boolean | false | ✅ | | 是否启用 |
| except_user_ids | text[] | {} | | | 例外用户 ID 列表 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`login_security_config`（单行配置表）
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 唯一行 |
| lockout_threshold | int2 | 5 | ✅ | | 5 分钟失败次数阈值 |
| lockout_minutes | int2 | 15 | ✅ | | 锁定时长（分钟）|
| lockout_threshold_high | int2 | 10 | ✅ | | 5 分钟失败 10 次 → 锁定 60 分钟 |
| lockout_minutes_high | int2 | 60 | ✅ | | 高级锁定分钟数 |
| time_restriction_enabled | boolean | false | ✅ | | 登录时段限制启用 |
| allowed_start_hour | int2 | 6 | ✅ | | 允许登录起始小时（北京时间）|
| allowed_end_hour | int2 | 23 | ✅ | | 允许登录结束小时 |
| new_device_verify | boolean | true | ✅ | | 新设备登录需邮箱验证 |
| new_ip_verify | boolean | false | ✅ | | 新 IP 登录需邮箱验证 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. IP 黑白名单变更立即生效（检查时实时读取最新数据，可缓存不超过 10 秒）
2. 地理封禁和登录限制配置为单行模式，更新通过 upsert

### 接口层
#### API：GET `/admin/security/ip-list`
**Query**：`?type=black&scope=global&page=1`

#### API：POST `/admin/security/ip-list`
**Request Schema**：
```json
{
  "type": "black",
  "ip_or_cidr": "192.168.1.100",
  "scope": "global",
  "reason": "暴力破解"
}
```

#### API：DELETE `/admin/security/ip-list/{id}`

#### API：GET `/admin/security/geo-blocking`
**Response Schema**：
```json
{
  "enabled": true,
  "blocked_regions": ["KP","SY","IR","CU"],
  "block_action": "all",
  "except_user_ids": ["u_1001"]
}
```

#### API：PUT `/admin/security/geo-blocking`
**Request Schema**：同 GET Response

#### API：GET `/admin/security/login-config`
**Response Schema**：login_security_config 完整行

#### API：PUT `/admin/security/login-config`
**Request Schema**：login_security_config 字段子集

#### 错误码定义
- `403 Forbidden`：无 `security:update` 权限（写操作）
- `400 BadRequest`：IP 格式非法 / CIDR 段格式错误

#### 缓存策略
- IP 黑白名单缓存 10 秒（Redis key: `ip_list:{scope}:{type}`）
- 地理封禁配置缓存 30 秒（Redis key: `geo_blocking:config`）
- 登录限制配置缓存 60 秒（Redis key: `login_security:config`）

### 业务逻辑
```
功能：IP/地理/登录检查（请求链路中）
触发时机：登录操作 + API 请求前

IP 检查流程：
  1. 获取请求 IP
  2. 检查全局白名单（白名单命中直接放行）
  3. 检查用户级白名单
  4. 检查全局黑名单（黑名单命中直接拦截）
  5. 检查用户级黑名单

地理封禁检查流程：
  1. geo_blocking_config.enabled = false → 跳过
  2. 解析请求 IP 所属国家
  3. 若国家 ∈ blocked_regions：
     - 若请求用户 ∈ except_user_ids → 放行
     - 否则按 block_action 拦截

登录限制检查流程：
  1. time_restriction_enabled 且当前不在 allowed 时段 → 拒绝登录
  2. 查询 login_history，最近 5 分钟内失败次数：
     - ≥ lockout_threshold_high → 锁定 lockout_minutes_high
     - ≥ lockout_threshold → 锁定 lockout_minutes
  3. new_device_verify：设备指纹首次出现 → 发送验证码
  4. new_ip_verify：IP 首次登录 → 发送验证码
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| IP 检查超时 | `site_configs.ip_check_timeout_ms` | 10 | 毫秒，超时放行（防阻塞） |

---

# 二、系统配置

## 2.1 系统参数配置

### 数据层
#### 涉及表：`site_configs`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| category | varchar(32) | | ✅ | IDX_site_configs_category | 分类：platform/payment/email/security/notification/rate_limit/pricing/settlement/kyc/vendor |
| key | varchar(64) | | ✅ | UNIQUE | 配置键名 |
| value | text | '' | ✅ | | 配置值（加密字段为密文）|
| value_type | varchar(16) | 'text' | ✅ | | 类型：text/int/decimal/select/boolean/encrypted/multi_select |
| is_encrypted | boolean | false | ✅ | | 是否加密存储 |
| description | text | '' | | | 配置说明 |
| default_value | text | '' | | | 系统默认值 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |
| updated_by | varchar(32) | | ✅ | | 更新人 ID |

#### 数据一致性要求
1. 加密字段使用 AES-256-GCM 加密，密钥存储在环境变量 `CONFIG_ENCRYPTION_KEY`
2. 配置修改必须记录审计日志（操作日志）
3. 所有配置项变更自动创建配置版本快照

### 接口层
#### API：GET `/admin/configs`
**Query**：`?category=payment`

**Response Schema**：
```json
{
  "categories": [
    {
      "category": "payment",
      "name": "支付",
      "items": [
        {
          "key": "payment_alipay_app_id",
          "value": "***encrypted***",
          "value_type": "encrypted",
          "is_encrypted": true,
          "description": "支付宝 App ID",
          "default_value": "",
          "updated_at": "2026-07-26T11:35:00Z",
          "updated_by": "admin@3cloud.ai"
        }
      ]
    }
  ]
}
```

#### API：PUT `/admin/configs/{key}`
**Request Schema**：
```json
{
  "value": "新配置值",
  "reason": "调整 DeepSeek 加价率"
}
```
**Note**：加密字段需要先通过身份验证端点获取临时令牌

#### API：POST `/admin/configs/verify-identity`
**Request Schema**：
```json
{
  "password": "用户登录密码"
}
```
**Response Schema**：
```json
{
  "verified": true,
  "token": "verify_t_xxxxx",
  "expires_in": 15
}
```
**说明**：token 有效期 15 秒，用于后续查看或修改加密配置

#### API：GET `/admin/configs/{key}?verify_token=verify_t_xxxxx`
**Response（加密字段）**：
```json
{
  "key": "payment_alipay_private_key",
  "value": "MIICXAIBAAKBgQC...",
  "value_type": "encrypted"
}
```
**说明**：非加密字段直接返回 value

#### 错误码定义
- `403 Forbidden`：无 `config:update` 权限或无有效 verify_token（加密字段）
- `400 BadRequest`：配置值类型校验失败

#### 缓存策略
- 全部配置缓存 60 秒（Redis key: `site_configs:all`）
- 单分类缓存 120 秒（Redis key: `site_configs:{category}`）
- 加密值不缓存

### 业务逻辑
```
功能：敏感配置查看确认流程

1. 用户点击"查看"加密配置
2. 前端弹出身份验证对话框
3. 用户输入登录密码 → POST /admin/configs/verify-identity
4. 服务端校验密码：
   - 比对 users.password_hash
   - 校验通过 → 生成 verify_token（15s 有效期）
   - 记录 audit log："admin@3cloud.ai 查看加密配置 payment_alipay_private_key"
5. 前端用 verify_token 调用 GET /admin/configs/{key}?verify_token=...
6. 服务端校验 token 有效性 → 返回解密后的明文值
7. 前端 15 秒后自动清除显示
```

### 配置项清单（27 项分 8 分类）

| 分类 | 键名 | 类型 | 默认值 | 敏感 |
|------|------|------|--------|------|
| platform | site_name | text | "3cloud" | 否 |
| platform | site_icp | text | "" | 否 |
| platform | support_email | text | "support@3cloud.ai" | 否 |
| platform | logo_url | text | "" | 否 |
| payment | alipay_app_id | encrypted | — | ✅ |
| payment | alipay_private_key | encrypted | — | ✅ |
| payment | wechat_mch_id | encrypted | — | ✅ |
| email | smtp_host | text | "" | 否 |
| email | smtp_port | int | 465 | 否 |
| email | smtp_username | encrypted | — | ✅ |
| email | smtp_password | encrypted | — | ✅ |
| email | sender_address | text | "" | 否 |
| security | mfa_policy | select | "optional" | 否 |
| security | password_min_length | int | 8 | 否 |
| notification | default_channels | multi_select | ["站内","邮件"] | 否 |
| notification | daily_email_limit | int | 5 | 否 |
| rate_limit | global_qps | int | 10000 | 否 |
| rate_limit | default_user_qps | int | 100 | 否 |
| rate_limit | default_key_qps | int | 50 | 否 |
| rate_limit | api_timeout_ms | int | 30000 | 否 |
| pricing | default_markup_rate | decimal(5,2) | 10.00 | 否 |
| settlement | default_cycle | select | "月结" | 否 |
| settlement | default_commission_rate | decimal(5,2) | 10.00 | 否 |
| settlement | settlement_delay_days | int | 3 | 否 |
| settlement | commission_freeze_days | int | 7 | 否 |
| kyc | kyc_level | select | "标准" | 否 |
| kyc | ocr_service_config | encrypted | "" | ✅ |
| vendor | health_check_interval_sec | int | 30 | 否 |
| vendor | circuit_breaker_failure_threshold | int | 10 | 否 |
| vendor | circuit_breaker_recovery_sec | int | 30 | 否 |

---

## 2.2 配置版本控制

### 数据层
#### 涉及表：`config_versions`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| version | int4 | 序列 | ✅ | UNIQUE | 版本号，自增 |
| snapshot | jsonb | {} | ✅ | | 全部配置项的快照 {key: value} |
| changes | jsonb | [] | ✅ | | 变更项列表 [{key, old_value, new_value}] |
| change_count | int2 | 0 | ✅ | | 变更项数 |
| reason | text | '' | | | 变更原因说明 |
| created_by | varchar(32) | 'system' | ✅ | IDX_config_versions_by | 创建人 ID，system 表示自动备份 |
| created_at | timestamptz | now() | ✅ | IDX_config_versions_time | 创建时间 |

#### 数据一致性要求
1. 每次配置修改（PUT /admin/configs/{key}）自动创建新版本
2. 配置导入操作也自动创建版本
3. 回滚操作自动创建新版本（不覆盖历史）
4. 加密字段在 snapshot 中存储为 `"__encrypted__"` 占位符

### 接口层
#### API：GET `/admin/configs/versions`
**Response Schema**：
```json
{
  "versions": [
    {
      "id": 42,
      "version": 42,
      "change_count": 2,
      "reason": "调整 DeepSeek 加价率",
      "created_by": "admin@3cloud.ai",
      "created_at": "2026-07-26T11:35:00Z"
    }
  ]
}
```

#### API：GET `/admin/configs/versions/diff?v1=40&v2=42`
**Response Schema**：
```json
{
  "diff": [
    {
      "key": "site_configs.default_markup_rate",
      "old_value": "15.00",
      "new_value": "10.00"
    },
    {
      "key": "site_configs.min_withdraw_amount",
      "old_value": "50.00",
      "new_value": "10.00"
    }
  ]
}
```

#### API：POST `/admin/configs/versions/{version}/rollback`
**Response Schema**：
```json
{
  "success": true,
  "new_version": 43,
  "restored_items": [
    {"key": "default_markup_rate", "old_value": "10.00", "new_value": "15.00"}
  ]
}
```

#### 错误码定义
- `403 Forbidden`：无 `config:update` 权限

#### 缓存策略
- 版本列表缓存 30 秒（Redis key: `config_versions:list`）

### 业务逻辑
```
功能：配置回滚

1. 查询 config_versions 获取指定版本的 snapshot
2. 比对当前配置与目标版本的差异：
   for each (key, value) in target_version.snapshot:
     current_value = site_configs.value WHERE key=key
     if current_value != value（且非"__encrypted__"占位符）
       → 将此项加入 restore_items
3. 弹窗展示 restore_items 给管理员确认
4. 确认后：
   for each item in restore_items:
     UPDATE site_configs SET value = item.new_value WHERE key = key
   插入新的 config_versions 记录（显示"回滚到 vXX"）
   记录审计日志
```

### 状态流转
不适用（配置版本为追加模式，无状态流转）

---

## 2.3 配置导入导出

### 接口层
#### API：GET `/admin/configs/export`
**Query**：`?format=json`（支持 json / yaml）
**Response**：文件下载（Content-Type: application/json 或 application/x-yaml）

**导出内容示例**：
```json
{
  "export_time": "2026-07-27T12:00:00Z",
  "version": 42,
  "configs": {
    "site_name": "3cloud",
    "smtp_host": "smtp.example.com",
    "alipay_private_key": "__encrypted__"
  }
}
```

#### API：POST `/admin/configs/import`
**Request**：multipart/form-data 上传文件
**Request Schema**（body）：
```json
{
  "file": "config_export.json",
  "import_encrypted": false
}
```
**Response Schema**：
```json
{
  "diff_preview": [
    {"key": "default_markup_rate", "import_value": "12.00", "current_value": "10.00", "changed": true}
  ],
  "change_count": 5
}
```

#### API：POST `/admin/configs/import/confirm`
**Request Schema**：
```json
{
  "import_id": "import_xxxxx",
  "create_snapshot": true
}
```
**Response Schema**：
```json
{
  "success": true,
  "new_version": 43
}
```

### 业务逻辑
```
功能：配置导入（两步确认流程）

1. 上传文件 → 解析 JSON/YAML
2. 校验：
   - 按键名查询是否存在
   - 校验值类型是否匹配
3. 生成 diff_preview（导入值 vs 当前值）
4. 返回 diff_preview → 前端展示
5. 用户确认后：
   - 若 import_encrypted=false → 跳过加密字段
   - 逐项 UPDATE site_configs
   - 创建 config_versions 快照
   - 记录审计日志
```

---

# 三、运营工具

## 3.1 公告管理

### 数据层
#### 涉及表：`announcements`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| title | varchar(256) | | ✅ | | 公告标题 |
| type | varchar(32) | 'notice' | ✅ | | 类型：maintenance/upgrade/activity/security/other |
| content | text | '' | ✅ | | 富文本内容（HTML/Markdown）|
| status | varchar(16) | 'draft' | ✅ | IDX_ann_status | 状态：draft/published/archived |
| target_users | varchar(16) | 'all' | ✅ | | 目标用户：all/agent/enterprise/developer |
| is_pinned | boolean | false | ✅ | | 是否置顶 |
| scheduled_at | timestamptz | NULL | | | 定时发布时间 |
| published_at | timestamptz | NULL | | | 实际发布时间 |
| created_by | varchar(32) | | ✅ | | 创建人 ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`announcement_reads`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| announcement_id | int8 | | ✅ | FK_ann_read | 引用 announcements.id |
| user_id | varchar(32) | | ✅ | IDX_ann_read_user | 用户 ID |
| read_at | timestamptz | now() | ✅ | | 阅读时间 |

#### 数据一致性要求
1. 公告发布后自动生成未读记录队列（不预创建，按需查询）
2. 已读统计通过 `announcement_reads` 实时查询

### 接口层
#### API：GET `/admin/announcements`
**Query**：`?status=published&page=1`

#### API：POST `/admin/announcements`
**Request Schema**：
```json
{
  "title": "7 月系统维护通知",
  "type": "maintenance",
  "content": "<p>系统将于...</p>",
  "target_users": "all",
  "is_pinned": false,
  "status": "draft",
  "scheduled_at": "2026-07-30T23:00:00Z"
}
```

#### API：PUT `/admin/announcements/{id}/publish`
**Response**：发布或定时发布

#### API：GET `/admin/announcements/{id}/read-stats`
**Response Schema**：
```json
{
  "total_push": 12345,
  "read_count": 8901,
  "read_rate": 72.1,
  "unread_users": [
    {"user_id": "u_1002", "nickname": "李四", "read": false}
  ],
  "unread_total": 3444
}
```

#### API：POST `/admin/announcements/{id}/push-unread`
**说明**：向所有未读用户再次推送（触发站内通知或邮件）

#### 错误码定义
- `403 Forbidden`：无 `marketing:create/update` 权限

#### 缓存策略
- 已发布公告列表缓存 30 秒（Redis key: `announcements:published`）
- 已读统计缓存 60 秒（Redis key: `ann_read_stats:{ann_id}`）

### 状态流转
```
draft ──→ published（手动发布或定时到达）
published ──→ archived（手动归档）
draft ──→ archived（直接归档）
published ──→ draft（取消发布，撤回草稿）

约束：scheduled_at 不为空且状态为 draft → 定时任务自动发布
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 公告保留天数 | `site_configs.announcement_retention_days` | 365 | 超过自动归档 |

---

## 3.2 活动管理

### 数据层
#### 涉及表：`campaigns`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 活动名称 |
| type | varchar(32) | | ✅ | IDX_campaign_type | 类型：recharge_gift/consumption_rebate/new_user_discount/coupon_code/invite_reward/time_promotion |
| status | varchar(16) | 'draft' | ✅ | IDX_campaign_status | 状态：draft/pending_review/approved/running/paused/ended |
| start_time | timestamptz | | ✅ | | 开始时间 |
| end_time | timestamptz | | ✅ | | 结束时间 |
| rules | jsonb | {} | ✅ | | 规则配置，见下方 |
| budget_total | decimal(12,2) | 0 | ✅ | | 总预算上限 |
| budget_used | decimal(12,2) | 0 | ✅ | | 已使用预算 |
| per_user_limit | decimal(10,2) | 0 | ✅ | | 单人奖励上限，0 无限制 |
| target_users | varchar(16) | 'all' | ✅ | | all/agent/enterprise/developer |
| target_payment | varchar(32) | 'all' | ✅ | | all/alipay/wechat |
| stop_condition | varchar(32) | 'end_time' | ✅ | | 自动结束条件：end_time/budget_exhausted/manual |
| created_by | varchar(32) | | ✅ | | 创建人 ID |
| approved_by | varchar(32) | NULL | | | 审核人 ID |
| approved_at | timestamptz | NULL | | | 审核通过时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

**rules jsonb schema（各类型规则配置）**：
```json
// recharge_gift（充值满赠）
{"min_amount": 500, "gift_amount": 50, "per_user_max_gifts": 3}

// consumption_rebate（消费返利）
{"min_consumption": 1000, "rebate_amount": 30, "per_user_max_rebates": 5}

// new_user_discount（新客立减）
{"first_recharge_discount": 0.9, "max_discount_amount": 100}

// coupon_code（兑换码）
{"code_pool_id": 1, "rewards": {"balance": 50, "quota": 100000}}

// invite_reward（邀请奖励）
{"inviter_reward": 20, "invitee_reward": 10, "require_invitee_consumption": 100}

// time_promotion（时段特惠）
{"target_models": ["deepseek-chat"], "discount_rate": 0.8, "time_slots": [{"start": "22:00", "end": "06:00"}]}
```

#### 涉及表：`campaign_participations`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| campaign_id | int8 | | ✅ | FK_camp_part | 引用 campaigns.id |
| user_id | varchar(32) | | ✅ | IDX_camp_part_user | 参与用户 |
| reward_amount | decimal(12,2) | 0 | ✅ | | 发放奖励总额 |
| reward_used | decimal(12,2) | 0 | ✅ | | 已消费奖励金额 |
| trigger_count | int2 | 0 | ✅ | | 触发次数（每人限领控制）|
| created_at | timestamptz | now() | ✅ | | 参与时间 |

#### 涉及表：`campaign_metrics`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| campaign_id | int8 | | ✅ | FK_camp_metrics | 引用 campaigns.id |
| metric_date | date | | ✅ | IDX_camp_metrics_date | 统计日期 |
| participant_count | int4 | 0 | ✅ | | 当参与用户数 |
| reward_total | decimal(12,2) | 0 | ✅ | | 当日发放奖励总额 |
| reward_used | decimal(12,2) | 0 | ✅ | | 当日使用奖励金额 |
| consumption_lift | decimal(12,2) | 0 | | | 当日拉动消费增量 |

#### 数据一致性要求
1. 预算耗尽时活动自动暂停，需保证原子性（使用 Redis 分布式锁）
2. 活动结束时，未触发的新请求不再参与活动
3. 发放奖励与用户余额变更需在事务中完成

### 接口层
#### API：GET `/admin/campaigns`
**Query**：`?status=running&type=recharge_gift&page=1`

#### API：POST `/admin/campaigns`

#### API：PUT `/admin/campaigns/{id}`
**约束**：status=running 时仅允许修改部分字段（状态不可修改）

#### API：POST `/admin/campaigns/{id}/submit-review`
**说明**：提交审核，状态 → pending_review

#### API：POST `/admin/campaigns/{id}/approve`
**权限**：需 admin 以上角色

#### API：POST `/admin/campaigns/{id}/pause`

#### API：POST `/admin/campaigns/{id}/end`

#### API：GET `/admin/campaigns/{id}/metrics`
**Response Schema**：
```json
{
  "campaign_id": 1,
  "total_participants": 234,
  "total_reward_amount": 3450.00,
  "total_reward_used": 2800.00,
  "total_consumption_lift": 12000.00,
  "roi": 2.48,
  "daily_trend": [
    {"date": "2026-07-20", "participants": 45, "reward": 800, "consumption_lift": 3200}
  ]
}
```

#### 错误码定义
- `403 Forbidden`：无 `marketing:create/update` 权限
- `400 BadRequest`：预算总额 ≥ 当前已使用才有权限修改

#### 缓存策略
- 活动列表缓存 30 秒
- 活动指标缓存 300 秒

### 业务逻辑
```
功能：活动预算耗尽自动暂停

触发时机：每次发放奖励前

1. 查询 campaigns.budget_total 和 campaigns.budget_used
2. 计算发放奖励值
3. 若 budget_used + 发放值 > budget_total → 自动暂停活动
   UPDATE campaigns SET status = 'paused'
   触发通知给运营
   记录活动日志："预算耗尽，活动自动暂停"
4. 若在预算范围内 → 正常发放奖励
   UPDATE campaigns SET budget_used = budget_used + 发放值
   插入 campaign_participations
   调整用户余额
```

### 状态流转
```
draft ──→ pending_review（提交审核）
pending_review ──→ approved（审核通过）
pending_review ──→ draft（审核驳回，退回修改）
approved ──→ running（到达开始时间 或 手动启动）
running ──→ paused（手动暂停 / 预算耗尽）
paused ──→ running（手动恢复）
running ──→ ended（到达结束时间 / 手动结束）
paused ──→ ended（手动结束）

自动结束条件：
  end_time 到达 → 自动 ended
  budget_exhausted → 自动 paused
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 活动指标自动计算 | `site_configs.campaign_metric_auto_calc` | true | 每日凌晨计算前一日指标 |

---

## 3.3 敏感词库

### 数据层
#### 涉及表：`sensitive_words`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| word | varchar(256) | | ✅ | IDX_sw_word | 敏感词内容 |
| category | varchar(32) | 'custom' | ✅ | IDX_sw_category | 分类：porn/political/violence/ad/custom |
| severity | varchar(8) | 'medium' | ✅ | | 严重级别：high/medium/low |
| action | varchar(32) | 'log' | ✅ | | 命中动作：intercept_key/intercept/log |
| is_active | boolean | true | ✅ | IDX_sw_active | 是否启用 |
| created_by | varchar(32) | | ✅ | | 创建人 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 数据一致性要求
1. 敏感词变更需在 30 秒内生效（缓存刷新）
2. 批量导入需要事务保证全部或全部不导入

### 接口层
#### API：GET `/admin/sensitive-words`
**Query**：`?category=porn&severity=high&page=1`

#### API：POST `/admin/sensitive-words`
```json
{"word": "xxx", "category": "porn", "severity": "high", "action": "intercept"}
```

#### API：POST `/admin/sensitive-words/batch-import`
**Request**：multipart/form-data（TXT/CSV 文件）

#### API：GET `/admin/sensitive-words/export`
**Response**：文件下载

#### API：DELETE `/admin/sensitive-words/{id}`

#### API：POST `/admin/sensitive-words/test`
**Request Schema**：
```json
{
  "text": "测试文本包含敏感词内容"
}
```
**Response Schema**：
```json
{
  "hits": [
    {"word": "xxx", "category": "porn", "severity": "high", "position": [15, 18]}
  ],
  "total": 1
}
```

### 业务逻辑
```
功能：敏感词引擎（API 请求内容检查）

1. 按严重级别从高到低检查
2. 使用 AC 自动机（Aho-Corasick）进行多模式匹配
3. 命中时按 severity 执行对应动作：
   severity=high → 拦截请求 + 禁用 Key
   severity=medium → 拦截请求 + 记录审计日志
   severity=low → 记录审计日志（不拦截）
4. 支持部分匹配、同音字替换匹配

性能要求：
  单次检查耗时 < 5ms
  敏感词库支持 10 万级词条
```

### 命中动作配置（三级）

| 严重级别 | 命中动作 | 适用分类 | 说明 |
|---------|---------|---------|------|
| high | intercept_and_disable | porn, political | 拦截请求、禁用 Key、通知管理员 |
| medium | intercept_and_log | violence, ad | 拦截请求、记录审计日志、通知管理员 |
| low | log_only | custom | 仅记录审计日志 |

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 敏感词引擎启用 | `site_configs.sensitive_word_enabled` | true | 全局开关 |

---

## 3.4 邮件模板

### 数据层
#### 涉及表：`email_templates`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 模板名称 |
| scene | varchar(32) | | ✅ | UNIQUE | 场景标识：recharge_success/balance_low/key_expiring/kyc_approved/kyc_rejected/invoice_issued/withdraw_complete/security_alert/verification_code |
| subject | varchar(256) | | ✅ | | 邮件标题（支持变量）|
| body_html | text | '' | ✅ | | HTML 正文（支持变量）|
| variables | text[] | {} | ✅ | | 可用变量列表，如 ["username","amount","time"] |
| is_active | boolean | true | ✅ | | 是否启用 |
| updated_by | varchar(32) | | ✅ | | 更新人 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 模板变量名必须为常量池中的预定义变量
2. 同一场景只能有一个活动模板（is_active=true）

### 接口层
#### API：GET `/admin/email-templates`

#### API：PUT `/admin/email-templates/{scene}`
**Request Schema**：
```json
{
  "subject": "充值成功 - {{amount}} 已到账",
  "body_html": "<p>尊敬的 {{username}}，您好！...</p>",
  "variables": ["username", "amount", "time", "balance"],
  "is_active": true
}
```

#### API：POST `/admin/email-templates/{scene}/preview`
**Request Schema**：
```json
{
  "sample_values": {
    "username": "张三",
    "amount": "100.00",
    "time": "2026-07-26 11:35",
    "balance": "234.50"
  }
}
```
**Response**：
```json
{
  "subject": "充值成功 - ¥100.00 已到账",
  "body_html": "<p>尊敬的 张三，您好！...</p>"
}
```

#### API：POST `/admin/email-templates/{scene}/send-test`
**Request Schema**：
```json
{"to_email": "admin@3cloud.ai"}
```

#### 9 种场景模板定义

| 场景标识 | 触发条件 | 发送对象 | 频率限制 |
|---------|---------|---------|---------|
| recharge_success | 充值到账 | 充值用户 | 每次充值 |
| balance_low | 余额 < ¥10 | 余额不足用户 | 每日最多 1 次 |
| key_expiring | 过期前 7/3/1 天 | Key 持有人 | 每个 Key 独立 |
| kyc_approved | 审核通过 | 申请用户 | 每次审核 |
| kyc_rejected | 审核拒绝 | 申请用户 | 每次审核 |
| invoice_issued | 发票开具完成 | 申请人 | 每次开票 |
| withdraw_complete | 打款确认 | 申请代理 | 每次提现 |
| security_alert | 安全事件触发 | 安全管理员 | 事件级别 |
| verification_code | 登录/操作验证 | 操作用户 | 每 60 秒 |

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 默认发件人 | `site_configs.email_sender_address` | "" | 在 email 分类中配置 |

---

## 3.5 自定义报表

### 数据层
#### 涉及表：`custom_reports`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 报表名称 |
| description | text | '' | | | 描述 |
| data_source | varchar(32) | | ✅ | | 数据源：call_logs/users/finance/security |
| dimension | varchar(32) | 'time' | ✅ | | X 轴维度 |
| metrics | text[] | [] | ✅ | | Y 轴指标数组 |
| aggregation | varchar(16) | 'sum' | ✅ | | 聚合方式：sum/avg/max/min/count |
| filters | jsonb | [] | | | 筛选条件 [{field, operator, value}] |
| chart_type | varchar(16) | 'line' | ✅ | | 图表类型：line/bar/pie/heatmap/table |
| is_template | boolean | false | ✅ | | 是否保存为模板 |
| created_by | varchar(32) | | ✅ | | 创建人 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`report_schedules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| report_id | int8 | | ✅ | FK_rep_sched | 引用 custom_reports.id |
| frequency | varchar(16) | 'weekly' | ✅ | | daily/weekly/monthly |
| day_of_week | int2 | NULL | | | weekly 时指定周几 1-7 |
| day_of_month | int2 | NULL | | | monthly 时指定日 1-28 |
| hour | int2 | 9 | ✅ | | 发送时间（小时）|
| recipients | text[] | {} | ✅ | | 发送邮箱列表 |
| format | varchar(16) | 'pdf' | ✅ | | pdf/xlsx |
| last_sent_at | timestamptz | NULL | | | 最后发送时间 |
| is_active | boolean | true | ✅ | | 是否启用 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 数据一致性要求
1. 报表定时任务由后台调度器执行，支持秒级精度
2. 定时调度与报表绑定，删除报表时级联删除调度配置

### 接口层
#### API：POST `/admin/custom-reports/build`
**Request Schema**（报表构建器 6 步数据）：
```json
{
  "data_source": "call_logs",
  "dimension": "time",
  "metrics": ["call_count", "token_consumption"],
  "aggregation": "sum",
  "filters": [
    {"field": "model", "operator": "eq", "value": "deepseek-chat"},
    {"field": "time", "operator": "in_range", "value": "last_7_days"}
  ],
  "chart_type": "line"
}
```
**Response Schema**：
```json
{
  "report_data": {
    "labels": ["07-20", "07-21", "07-22", "07-23", "07-24", "07-25", "07-26"],
    "datasets": [
      {"name": "call_count", "data": [1234, 1456, 1345, 1567, 1432, 1678, 1890]},
      {"name": "token_consumption", "data": [56000, 62000, 58000, 70000, 65000, 78000, 85000]}
    ]
  }
}
```

#### API：POST `/admin/custom-reports`
**Request Schema**：同上 + name, description, is_template

#### API：GET `/admin/custom-reports`

#### API：POST `/admin/custom-reports/{id}/schedule`
**Request Schema**：
```json
{
  "frequency": "weekly",
  "day_of_week": 1,
  "hour": 9,
  "recipients": ["admin@3cloud.ai", "zhangsan@example.com"],
  "format": "pdf"
}
```

### 业务逻辑
```
功能：报表定时调度

定时任务（cron）：
  每分钟检查 report_schedules
  找出满足当前时间条件的调度：
    frequency=daily AND hour=当前小时
    frequency=weekly AND day_of_week=当前星期 AND hour=当前小时
    frequency=monthly AND day_of_month=当前日 AND hour=当前小时
  执行报表生成：
    1. 按 report_id 加载 custom_reports 配置
    2. 根据 data_source/dimension/metrics/filters 查询数据库
    3. 按 chart_type 渲染为 PDF 或 Excel
    4. 发送邮件到 recipients
    5. 更新 last_sent_at
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 报表导出最大行数 | `site_configs.report_max_rows` | 100000 | 导出限制 |

---

## 3.6 A/B 测试

### 数据层
#### 涉及表：`ab_experiments`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 实验名称 |
| description | text | '' | | | 描述 |
| status | varchar(16) | 'draft' | ✅ | IDX_ab_status | draft/running/completed/archived |
| start_time | timestamptz | | ✅ | | 开始时间 |
| end_time | timestamptz | | ✅ | | 结束时间 |
| split_method | varchar(16) | 'user_hash' | ✅ | | 分流方式：user_hash/random |
| groups | jsonb | [] | ✅ | | 分组配置 [{name, config, user_percent}] |
| primary_metric | varchar(64) | | ✅ | | 主要指标 |
| secondary_metrics | text[] | [] | | | 次要指标列表 |
| confidence_threshold | decimal(5,2) | 95.00 | ✅ | | 置信度阈值 % |
| data_sufficiency | decimal(5,2) | 0 | | | 数据充足度 %（运行中计算）|
| result_conclusion | text | '' | | | 结论建议 |
| created_by | varchar(32) | | ✅ | | 创建人 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

**groups jsonb schema**：
```json
[
  {
    "name": "A 组（对照组）",
    "config": {"pricing": 0.002, "description": "标准定价 ¥0.002/1K"},
    "user_percent": 50
  },
  {
    "name": "B 组（实验组）",
    "config": {"pricing": 0.0017, "description": "降价 15% ¥0.0017/1K"},
    "user_percent": 50
  }
]
```

#### 涉及表：`ab_experiment_results`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| experiment_id | int8 | | ✅ | FK_ab_result | 引用 ab_experiments.id |
| group_name | varchar(64) | | ✅ | | 分组名称 |
| metric_date | date | | ✅ | IDX_ab_result_date | 统计日期 |
| primary_value | decimal(15,4) | 0 | ✅ | | 主要指标值 |
| secondary_values | jsonb | {} | | | 次要指标值 |

#### 数据一致性要求
1. 同一用户必须始终分配到同一实验组（基于 user_id hash 的确定性分配）
2. 实验运行期间不可修改分组配置

### 接口层
#### API：GET `/admin/ab-testing`

#### API：POST `/admin/ab-testing`
**Request Schema**：
```json
{
  "name": "定价弹性测试 - deepseek-chat",
  "description": "测试不同定价对用户调用量的影响",
  "start_time": "2026-07-20T00:00:00Z",
  "end_time": "2026-08-20T23:59:59Z",
  "split_method": "user_hash",
  "groups": [
    {"name": "A 组（对照组）", "config": {"pricing": 0.002}, "user_percent": 50},
    {"name": "B 组（实验组）", "config": {"pricing": 0.0017}, "user_percent": 50}
  ],
  "primary_metric": "7_day_call_volume_change_rate",
  "secondary_metrics": ["consumption_change", "user_retention"]
}
```

#### API：GET `/admin/ab-testing/{id}/results`
**Response Schema**：
```json
{
  "experiment_name": "定价弹性测试 - deepseek-chat",
  "status": "running",
  "running_days": 7,
  "data_sufficiency": 73,
  "group_comparison": [
    {
      "group": "A 组（标准价）",
      "daily_avg_calls": 12340,
      "daily_avg_consumption": 246.80
    },
    {
      "group": "B 组（降价 15%）",
      "daily_avg_calls": 15678,
      "daily_avg_consumption": 266.53
    }
  ],
  "call_volume_lift": 27.1,
  "p_value": 0.003,
  "significant": true,
  "conclusion": "降价 15% 显著提升调用量 (27%)，但收入增长不显著 (8%)"
}
```

### 业务逻辑
```
功能：A/B 测试用户分流

1. 当用户进入实验范围时：
   group_index = hash(user_id + experiment_id) % 100
   遍历 groups 按 user_percent 累加：
     group A: [0, 50)
     group B: [50, 100)
   group_index 落在哪个区间 → 分配到对应组

2. 指标采集：
   每日凌晨计算各组的 primary/secondary 指标
   存储到 ab_experiment_results

3. 统计分析：
   data_sufficiency = 实际样本量 / 所需最小样本量 × 100
   p_value 计算（t-test 或 z-test）
   p_value < (1 - confidence_threshold/100) → 结果显著
```

### 状态流转
```
draft ──→ running（到达开始时间 或 手动启动）
running ──→ completed（到达结束时间 / 手动结束）
completed ──→ archived
running ──→ archived（强制终止）
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 实验最少运行天数 | `site_configs.ab_min_days` | 7 | 不足此天数不可提前结束 |

---

# 四、实时监控

## 4.1 监控面板

### 数据层
#### 涉及表：`system_metrics`（时序数据，使用 TimescaleDB hypertable 或独立时序表）
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| time | timestamptz | | ✅ | IDX_sys_metrics_time | 采集时间 |
| metric_name | varchar(64) | | ✅ | | 指标名 |
| metric_value | decimal(15,4) | | ✅ | | 指标值 |
| tags | jsonb | {} | | | 标签（如 service名称、host） |

**指标清单**：
| metric_name | 说明 | 单位 |
|------------|------|------|
| cpu_usage | CPU 使用率 | % |
| memory_usage | 内存使用率 | % |
| api_p95_latency | API P95 响应时间 | ms |
| qps | 每秒请求数 | count/s |
| db_connections | 数据库连接数 | count |
| db_max_connections | 数据库最大连接数 | count |
| redis_hit_rate | Redis 缓存命中率 | % |
| websocket_users | WebSocket 在线用户数 | count |
| disk_usage | 磁盘使用率 | % |
| api_p50_latency | API P50 响应时间 | ms |
| api_p99_latency | API P99 响应时间 | ms |
| api_error_rate | API 错误率 | % |

#### 涉及表：`service_health`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| service_name | varchar(64) | | ✅ | UNIQUE | 服务名称 |
| status | varchar(16) | 'up' | ✅ | | up/degraded/down |
| uptime_days | decimal(10,2) | 0 | ✅ | | 正常运行天数 |
| p95_latency | int4 | 0 | | | 当前 P95 延迟 ms |
| last_check_at | timestamptz | | ✅ | | 上次检查时间 |
| last_down_at | timestamptz | NULL | | | 上次宕机时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 时序数据保留 30 天，自动清理过期数据
2. 聚合数据保留 6 个月（分钟级聚合 → 小时级 → 天级）

### 接口层
#### API：GET `/admin/monitoring/overview`
**Response Schema**：
```json
{
  "system_metrics": {
    "cpu": 45.6,
    "memory": 62.3,
    "api_p95": 187,
    "qps": 234,
    "db_connections": {"current": 12, "max": 100},
    "redis_hit_rate": 97.8,
    "websocket_users": 234,
    "disk_usage": 41.2
  },
  "services": [
    {"name": "API Service", "status": "up", "uptime_days": 45, "p95_latency": 187},
    {"name": "WebSocket", "status": "up", "uptime_days": 45, "p95_latency": 45},
    {"name": "PostgreSQL", "status": "up", "uptime_days": 45, "p95_latency": 12},
    {"name": "Redis", "status": "up", "uptime_days": 45, "p95_latency": 3},
    {"name": "DeepSeek API", "status": "degraded", "uptime_days": 45, "p95_latency": 890}
  ]
}
```

#### API：GET `/admin/monitoring/trends`
**Query**：`?metric=api_p95_latency&range=1h`
**Response Schema**：
```json
{
  "metric": "api_p95_latency",
  "unit": "ms",
  "data_points": [
    {"time": "12:00", "p50": 120, "p95": 187, "p99": 350},
    {"time": "12:05", "p50": 125, "p95": 195, "p99": 380}
  ]
}
```

#### 缓存策略
- 监控概览不缓存（实时数据，轮询间隔 ≤ 10 秒）
- 趋势数据缓存 30 秒

### 业务逻辑
```
功能：系统指标采集

采集方式（Prometheus 风格 pull 或 agent push）：
  每 10 秒采集一次：
    CPU：读取 /proc/stat 或 WMI
    内存：读取系统内存信息
    API 延迟：从 call_logs 最近 1 分钟数据计算 P50/P95/P99
    QPS：1 分钟内 call_logs 计数 / 60
    DB 连接：查询 pg_stat_activity 当前连接数
    Redis：INFO stats keyspace_hits / (keyspace_hits + keyspace_misses) * 100

聚合策略：
  原始数据 → 每分钟聚合（avg/max/min）→ 每小时聚合 → 每天聚合
  超过 7 天的数据仅保留小时级聚合
  超过 30 天的数据仅保留天级聚合
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 指标采集间隔 | `site_configs.metric_collect_interval_sec` | 10 | 秒 |
| 时序数据保留天数 | `site_configs.metric_retention_days` | 30 | 天 |
| 聚合数据保留天数 | `site_configs.metric_agg_retention_days` | 180 | 天 |

---

## 4.2 告警自动触发

### 数据层
#### 涉及表：`alert_rules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 告警规则名称 |
| metric_name | varchar(64) | | ✅ | IDX_alert_metric | 监控指标名 |
| condition | varchar(16) | 'gt' | ✅ | | gt/gte/lt/lte |
| threshold | decimal(15,4) | | ✅ | | 阈值 |
| duration_sec | int4 | 300 | ✅ | | 持续时长触发（秒）|
| severity | varchar(16) | 'warning' | ✅ | | warning/critical/info |
| notify_channels | text[] | ['站内', '邮件'] | | | 通知方式 |
| enabled | boolean | true | ✅ | | 是否启用 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`alert_history`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| rule_id | int8 | | ✅ | FK_alert_rule | 引用 alert_rules.id |
| triggered_value | decimal(15,4) | | ✅ | | 触发时的实际值 |
| severity | varchar(16) | | ✅ | | 事件等级 |
| acknowledged | boolean | false | ✅ | | 是否已确认 |
| acknowledged_by | varchar(32) | NULL | | | 确认人 |
| resolved_at | timestamptz | NULL | | | 恢复时间 |
| created_at | timestamptz | now() | ✅ | IDX_alert_history_time | 触发时间 |

#### 数据一致性要求
1. 同一告警规则在持续期内不重复告警（间隔至少 15 分钟）
2. 告警解除后自动记录 resolved_at

### 接口层
#### API：GET `/admin/monitoring/alerts`

#### API：POST `/admin/monitoring/alerts/{id}/acknowledge`

#### 6 条内置告警规则

| 规则名 | 指标 | 条件 | 持续时长 | 等级 |
|-------|------|------|---------|------|
| CPU 过载 | cpu_usage | > 80% | 300s | warning |
| API 响应过慢 | api_p99_latency | > 2000ms | 300s | warning |
| API 错误率过高 | api_error_rate | > 5% | 300s | critical |
| 磁盘空间不足 | disk_usage | > 85% | 0（即时）| warning |
| 数据库连接过高 | db_connections | > max 80% | 300s | warning |
| Redis 命中率过低 | redis_hit_rate | < 90% | 600s | info |

### 业务逻辑
```
功能：告警评估引擎

运行频率：每 30 秒

for each enabled alert_rule:
  1. 查询最近 duration_sec 秒内的 metric 数据
  2. 检查 condition 是否持续满足
  3. 若已持续满足且最后一条告警记录 > 15 分钟前：
     → 创建新的 alert_history 记录
     → 按 severity 发送通知（站内/邮件）
     → 若 severity=critical，额外发送短信（如已配置）
  4. 若条件不满足且有未 resolved 的告警：
     → 更新 alert_history.resolved_at = now()
     → 发送"告警已恢复"通知
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 告警评估间隔 | `site_configs.alert_eval_interval_sec` | 30 | 秒 |
| 告警重复间隔 | `site_configs.alert_cooldown_sec` | 900 | 同一规则 15 分钟不重复 |

---

## 4.3 限流可视化

### 数据层
#### 涉及表：`rate_limit_logs`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| rule_level | varchar(16) | | ✅ | | global/user/key/model |
| rule_name | varchar(64) | | ✅ | | 规则名 |
| user_id | varchar(32) | NULL | | IDX_ratelimit_user | 触发用户 |
| api_key_id | varchar(32) | NULL | | | 触发 Key |
| model_name | varchar(64) | NULL | | | 触发模型 |
| current_value | decimal(15,4) | | ✅ | | 触发时的实际值 |
| limit_value | decimal(15,4) | | ✅ | | 限流阈值 |
| created_at | timestamptz | now() | ✅ | IDX_ratelimit_time | 触发时间 |

#### 数据一致性要求
1. 限流日志仅在触发时写入，不影响正常请求路径性能
2. 限流日志保留 30 天

### 接口层
#### API：GET `/admin/monitoring/rate-limits`
**Response Schema**：
```json
{
  "rules": [
    {"level": "global", "rule_name": "总 QPS 上限", "current_value": 10000, "today_triggers": 0, "enabled": true},
    {"level": "global", "rule_name": "总 TPM 上限", "current_value": 60000000, "today_triggers": 1, "enabled": true},
    {"level": "user", "rule_name": "默认用户 QPS", "current_value": 100, "today_triggers": 234, "enabled": true},
    {"level": "user", "rule_name": "默认用户 TPM", "current_value": 600000, "today_triggers": 45, "enabled": true},
    {"level": "key", "rule_name": "默认 Key QPS", "current_value": 50, "today_triggers": 567, "enabled": true},
    {"level": "key", "rule_name": "默认 Key TPM", "current_value": 300000, "today_triggers": 89, "enabled": true},
    {"level": "model", "rule_name": "deepseek-chat QPS", "current_value": 2000, "today_triggers": 12, "enabled": true},
    {"level": "model", "rule_name": "gpt-4o QPS", "current_value": 500, "today_triggers": 0, "enabled": true}
  ],
  "total_limited_count": 948,
  "limited_percent": 0.8,
  "top_users": [
    {"user_id": "u_1001", "nickname": "张三", "limited_count": 123},
    {"user_id": "u_2345", "nickname": "李四", "limited_count": 98}
  ],
  "hourly_trend": [
    {"hour": "14:00", "count": 89},
    {"hour": "15:00", "count": 76}
  ]
}
```

#### 缓存策略
- 限流规则列表缓存 30 秒
- 限流统计缓存 60 秒

### 业务逻辑
```
功能：限流统计聚合

今日触发次数（today_triggers）：
  SELECT COUNT(*) FROM rate_limit_logs
  WHERE rule_level = ? AND rule_name = ? AND created_at >= today

Top 10 用户：
  SELECT user_id, COUNT(*) as cnt FROM rate_limit_logs
  WHERE created_at >= today
  GROUP BY user_id ORDER BY cnt DESC LIMIT 10

按小时趋势：
  SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as cnt
  FROM rate_limit_logs WHERE created_at >= today
  GROUP BY hour ORDER BY hour
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 限流日志保留天数 | `site_configs.ratelimit_log_retention_days` | 30 | 天 |

---

# 五、Key 资源池

## 5.1 分组管理与加权轮询

### 数据层
#### 涉及表：`vendor_key_groups`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| name | varchar(128) | | ✅ | | 分组名 |
| vendor_id | int8 | | ✅ | FK_vkg_vendor | 引用 vendors.id |
| weight | int4 | 1 | ✅ | | 分组流量权重 |
| pricing_overrides | jsonb | {} | | | 定价覆盖（可选），格式 {"model_key": "price"} |
| status | varchar(16) | 'enabled' | ✅ | | enabled/disabled |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`vendor_keys`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| group_id | int8 | | ✅ | FK_vk_group | 引用 vendor_key_groups.id |
| key_value | text | | ✅ | | API Key 实际值（加密存储）|
| alias | varchar(64) | '' | | | Key 别名，如 "Key A" |
| weight | int4 | 1 | ✅ | | Key 在组内权重 |
| status | varchar(16) | 'enabled' | ✅ | IDX_vk_status | enabled/disabled/circuit_broken |
| daily_calls | int4 | 0 | | | 今日调用次数（缓存）|
| last_call_at | timestamptz | NULL | | | 最后调用时间 |
| circuit_break_at | timestamptz | NULL | | | 熔断时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 数据一致性要求
1. Key 值加密存储（AES-256-GCM），不返回明文
2. 分组权重变更后，后续请求立即按新权重分配
3. Key 熔断后自动从轮询池移除

### 接口层
#### API：GET `/admin/vendor-key-groups`
**Query**：`?vendor_id=1`

**Response Schema**：
```json
{
  "groups": [
    {
      "id": 1,
      "name": "高优先级组",
      "vendor_id": 1,
      "vendor_name": "DeepSeek",
      "weight": 3,
      "status": "enabled",
      "pricing_overrides": {},
      "keys": [
        {"id": 1, "alias": "Key A", "weight": 5, "status": "enabled", "daily_calls": 1234},
        {"id": 2, "alias": "Key B", "weight": 3, "status": "enabled", "daily_calls": 987},
        {"id": 3, "alias": "Key C", "weight": 2, "status": "circuit_broken", "daily_calls": 0}
      ]
    }
  ]
}
```

#### API：POST `/admin/vendor-key-groups`

#### API：POST `/admin/vendor-key-groups/{id}/keys`

#### API：PUT `/admin/vendor-key-groups/{id}/keys/{key_id}`

#### API：DELETE `/admin/vendor-key-groups/{id}/keys/{key_id}`

#### API：POST `/admin/vendor-key-groups/{id}/test-connectivity`
**说明**：测试组内所有 Key 的连通性，逐个发送健康检查请求

**Response Schema**：
```json
{
  "results": [
    {"key_id": 1, "alias": "Key A", "success": true, "latency_ms": 45},
    {"key_id": 2, "alias": "Key B", "success": true, "latency_ms": 67},
    {"key_id": 3, "alias": "Key C", "success": false, "error": "请求超时"},
    {"key_id": 4, "alias": "Key D", "success": true, "latency_ms": 32}
  ]
}
```

#### 错误码定义
- `403 Forbidden`：无 `vendor:update` 权限

#### 缓存策略
- Key 资源池路由配置缓存 60 秒（Redis key: `vendor_key_routes:{vendor_id}`）
- 测试连通性结果不缓存

### 业务逻辑
```
功能：加权轮询算法

输入：vendor_id（供应商）
输出：选中的 Key

1. 加载该供应商下的所有 enabled 分组
2. 计算分组总权重 sum(group_weight)
3. 按分组权重比率选择一个分组
4. 在分组内加载所有 enabled 的 Key（排除 circuit_broken）
5. 计算组内 Key 总权重 sum(key_weight)
6. 按 Key 权重比率选择一个 Key

实现：平滑加权轮询（Smooth Weighted Round-Robin）
  维护 current_weight 变量，每次选中后减去总权重，避免短时间重复选中同一 Key

示例：
  分组"高优先级组"（权重 3），组内 Key A(5) / Key B(3) / Key C(2, 熔断跳过)
  可用 Key 权重：A=5, B=3
  Key A 接收 5/8 的请求
  Key B 接收 3/8 的请求
```

### 状态流转
```
vendor_keys.status:
  enabled ──→ circuit_broken（连续失败达熔断阈值）
  circuit_broken ──→ enabled（熔断恢复等待后探针成功）
  enabled ──→ disabled（手动禁用）
  circuit_broken ──→ disabled（手动禁用）

vendor_key_groups.status:
  enabled ──→ disabled（手动禁用）
  disabled ──→ enabled（手动启用）
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| Key 熔断失败阈值 | `site_configs.key_circuit_break_failure_count` | 10 | 连续失败次数 |
| Key 熔断恢复等待 | `site_configs.key_circuit_break_recovery_sec` | 30 | 秒后自动探针 |
| Key 健康检查间隔 | `site_configs.key_health_check_interval_sec` | 60 | 秒 |

---

# 六、供应商业入驻流程

## 6.1 入驻流程

### 数据层
#### 涉及表：`vendor_applications`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| company_name | varchar(256) | | ✅ | | 供应商名称 |
| contact_name | varchar(128) | | ✅ | | 联系人姓名 |
| contact_email | varchar(256) | | ✅ | | 联系邮箱 |
| contact_phone | varchar(32) | | ✅ | | 联系电话 |
| api_base_url | varchar(512) | | ✅ | | API 基础地址 |
| auth_type | varchar(32) | 'bearer_token' | ✅ | | 认证方式：bearer_token/api_key/basic_auth |
| auth_config | jsonb | {} | | | 认证配置 |
| models | jsonb | [] | ✅ | | 支持的模型列表 [{name, price, ...}] |
| business_license_url | text | '' | | | 营业执照 URL |
| api_doc_url | text | '' | | | API 文档 URL |
| agreement_url | text | '' | | | 合作协议 URL |
| status | varchar(16) | 'draft' | ✅ | IDX_va_status | draft/submitted/reviewing/approved/rejected |
| reviewer_id | varchar(32) | NULL | | | 审核人 ID |
| review_comment | text | '' | | | 审核意见 |
| rejected_reason | text | '' | | | 驳回原因 |
| submitted_at | timestamptz | NULL | | | 提交时间 |
| reviewed_at | timestamptz | NULL | | | 审核时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 入驻申请审核通过后，自动在 vendors 表创建供应商记录
2. 入驻申请的所有文档上传需先完成后才能提交审核

### 接口层（面向供应商的公开入驻 API）

#### API：POST `/api/vendor/register/step1`
**Step 1：注册信息**
```json
{
  "company_name": "示例供应商",
  "contact_name": "张三",
  "contact_email": "zhangsan@example.com",
  "contact_phone": "13800138000"
}
```

#### API：PUT `/api/vendor/register/step2`
**Step 2：API 配置**
```json
{
  "application_id": 1,
  "api_base_url": "https://api.example.com",
  "auth_type": "bearer_token",
  "auth_config": {"token": "sk-xxxxx"},
  "models": [
    {"name": "example-chat", "price_per_1k_tokens": 0.002, "description": "示例对话模型"}
  ]
}
```

#### API：POST `/api/vendor/register/step3`
**Step 3：资质上传**
**Request**：multipart/form-data（business_license, api_doc, agreement 三个文件）

#### API：POST `/api/vendor/register/step4`
**Step 4：提交审核**
```json
{"application_id": 1}
```
**Response**：
```json
{
  "success": true,
  "message": "入驻申请已提交，等待平台审核"
}
```

### 业务逻辑
```
功能：供应商入驻 4 步流程

step1 → step2 → step3 → step4（强制顺序）
每步校验前置步骤是否已完成

步骤间暂存：
  填写 step1 后自动创建 vendor_applications(status=draft)
  后续步骤通过 application_id 关联更新
  未完成的申请保留 7 天后自动清理

审核流程：
  提交后 status = submitted
  管理员收到审核通知
  管理员审核 → approved：
    在 vendors 表创建供应商记录
    在 vendor_key_groups 创建默认分组
    发送通知邮件给供应商联系人
  管理员审核 → rejected：
    记录 rejected_reason
    发送通知邮件给供应商联系人
```

### 状态流转
```
draft ──→ submitted（提交审核）
submitted ──→ reviewing（管理员标记开始审核）
reviewing ──→ approved（审核通过）
reviewing ──→ rejected（审核驳回）
rejected ──→ draft（修改后重新提交）
approved: 终态
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 入驻申请表自动清理天数 | `site_configs.vendor_app_cleanup_days` | 7 | 未完成的 draft 申请自动删除 |

---

## 6.2 供应商管理后台功能

### 数据层
供应商管理后台复用现有 `vendors` / `vendor_key_groups` / `vendor_keys` / `call_logs` / `settlements` 等表。
供应商后台访问需独立身份认证（vendor 账号体系），使用 `vendor_users` 表。

#### 涉及表：`vendor_users`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| vendor_id | int8 | | ✅ | FK_vendor_user | 引用 vendors.id |
| email | varchar(256) | | ✅ | UNIQUE | 登录邮箱 |
| password_hash | text | | ✅ | | 密码哈希 |
| name | varchar(128) | | ✅ | | 联系人名称 |
| last_login_at | timestamptz | NULL | | | 最后登录时间 |
| is_active | boolean | true | ✅ | | 是否启用 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

### 接口层

#### API：GET `/vendor/dashboard`（仪表盘）
**Response Schema**：
```json
{
  "today_calls": 12345,
  "today_revenue": 345.60,
  "availability_rate": 99.8,
  "daily_trend": [
    {"date": "07-26", "calls": 12000, "revenue": 340},
    {"date": "07-27", "calls": 12345, "revenue": 345.6}
  ]
}
```

#### API：GET `/vendor/models`（模型管理）
**Response Schema**：当前供应商接入的模型列表，含名称、状态、价格、调用量

#### API：PUT `/vendor/models/{model_id}/price`（价格修改）
```json
{"price_per_1k_tokens": 0.0018}
```

#### API：GET `/vendor/stats`（数据统计）
**Query**：`?range=last_30_days`
**Response**：调用趋势、收入趋势、用户分布（脱敏）

#### API：GET `/vendor/settlement`（结算）
**Response**：结算单列表、对账数据

#### API：GET `/vendor/notifications`（通知）
**Response**：平台通知列表

### 业务逻辑
```
功能：供应商管理后台访问控制

1. 供应商使用 vendor_users 独立账号登录（非平台用户体系）
2. 登录后 session 绑定 vendor_id
3. 所有 /vendor/* 接口自动过滤为该供应商的数据
4. 数据统计用户分布为脱敏输出（仅展示省市分布，不展示具体用户信息）

访问路径：
  /vendor → 仪表盘
  /vendor/models → 模型管理
  /vendor/stats → 数据统计
  /vendor/settlement → 结算
  /vendor/notifications → 通知
```

### 配置项
| 配置项 | 路径 | 默认值 | 说明 |
|-------|------|-------|------|
| 供应商后台访问域名 | `site_configs.vendor_admin_domain` | "vendor.3cloud.ai" | 独立子域名或路径 |

---
