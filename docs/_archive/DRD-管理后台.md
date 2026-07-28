# 3cloud（3C）AI Token 聚合平台 — 管理后台技术实现规格说明书 (DRD)

> **版本**：V1.0-技术规格 | **最后更新**：2026-07-27
> **文档定位**：管理后台各功能模块的数据层、接口层、业务逻辑、状态流转、配置项等技术规格定义
> **适用对象**：架构师、后端开发、测试工程师
> **关联文档**：`PRD-运营级.md` / `SCHEMA.md`

---

## 角色与权限体系

### 数据层
#### 涉及表：`roles`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| id | int8 | 序列 | ✅ | PK | 自增主键 |
| identifier | varchar(32) | | ✅ | UNIQUE | 角色标识：super_admin/admin/finance/auditor/operator/security/agent_mgr/agent/user/developer |
| name | varchar(64) | | ✅ | | 角色显示名称 |
| level | smallint | | ✅ | IDX_roles_level | 等级：L5(super_admin)~L2(user) |
| permissions | jsonb | {} | ✅ | | 权限配置 {资源:[操作], 数据范围:''} |
| description | text | '' | | | 角色描述 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`users`
- **新增字段**：
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| role | varchar(32) | 'user' | ✅ | IDX_users_role | 引用roles.identifier |
| permissions | jsonb | NULL | | | 用户独立权限覆盖（优先级高于角色模板） |
| data_scope | varchar(16) | 'self' | ✅ | | 数据范围：self/agent_only/all |

#### 涉及表：`role_permission_templates`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 模板名称：财务专员/运营专员/客服专员/审计员/只读管理员 |
| role_identifier | varchar(32) | | ✅ | FK_roles_identifier | 关联角色标识 |
| permissions | jsonb | {} | ✅ | | 权限配置（同roles.permissions结构） |

#### 数据一致性要求
1. 用户角色变更时，需同步更新`users.permissions`（继承新角色模板）
2. `users.permissions`非空时，以用户独立权限为准，忽略角色模板
3. 敏感操作（角色变更、权限修改）必须记录操作日志

### 接口层
#### API：GET `/admin/roles`
**Request Schema**：无参数或`?include_users=true`
**Response Schema**：
```json
{
  "roles": [
    {
      "identifier": "admin",
      "name": "运营管理员",
      "level": 4,
      "permissions": {"user": ["read","create","update","delete"], ...},
      "user_count": enc // 当include_users=true时返回
    }
  ]
}
```
**错误码定义**：
- `403 Forbidden`：调用者无`config:read`权限

#### API：PUT `/admin/users/{userId}/role`
**Request Schema**：
```json
{
  "role": "admin",
  "reason": "晋升为运营负责人"
}
```
**Response Schema**：`{"success": true, "new_role": "admin"}`
**错误码定义**：
- `403 Forbidden`：调用者无`user:update`权限或无`all`数据范围
- `400 BadRequest`：目标角色等级≥调用者自身角色等级

#### 缓存策略
- 角色权限模板缓存24小时（Redis key: `role_perms:{identifier}`）
- 用户权限缓存：登录时计算并缓存12小时（Redis key: `user_perms:{userId}`）

### 业务逻辑
**权限计算逻辑**：
```python
def get_user_permissions(user_id):
    # 1. 检查用户独立权限
    user = db.users.find(id=user_id)
    if user.permissions:
        return user.permissions
    
    # 2. 获取角色模板
    role = db.roles.find(identifier=user.role)
    template = db.role_permission_templates.find(role_identifier=user.role)
    
    # 3. 合并：模板权限 + 角色基础权限
    permissions = merge(role.permissions, template.permissions)
    
    # 4. 应用数据范围
    permissions["data_scope"] = user.data_scope
    
    return permissions
```

**边界条件**：
1. super_admin角色不可被任何人修改（包括其他super_admin）
2. 管理员不可将用户角色提升至≥自己等级
3. agent角色的data_scope固定为`agent_only`，不可修改

### 状态流转
**用户角色变更状态迁移**：
```
发起请求 → 检查权限 → 记录操作日志 → 更新users表 → 清除用户权限缓存 → 返回结果
```

### 配置项
- `site_configs.role_hierarchy_enabled`：是否启用角色等级约束（默认true）
- `site_configs.sensitive_role_change_notify`：敏感角色变更通知对象（默认super_admin）

---

## 用户管理

### 数据层
#### 涉及表：`users`（补充字段）
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| status | varchar(16) | 'active' | ✅ | IDX_users_status | 状态：active/disabled/frozen |
| disabled_at | timestamptz | NULL | | | 禁用时间 |
| disabled_by | varchar(64) | NULL | | | 禁用人（管理员ID）|
| disabled_reason | text | NULL | | | 禁用原因 |
| real_name_status | varchar(16) | 'unverified' | ✅ | | 实名状态：unverified/pending/verified/rejected |
| total_consumption | decimal(15,2) | 0.00 | ✅ | | 累计消费金额 |
| registration_ip | inet | NULL | | | 注册IP |
| last_login_ip | inet | NULL | | | 最后登录IP |

#### 涉及表：`user_balance_logs`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| user_id | int8 | | ✅ | FK_users_id + IDX_user_id | 用户ID |
| type | varchar(32) | | ✅ | | 类型：recharge/consumption/refund/admin_adjust/activity |
| amount | decimal(15,2) | | ✅ | | 变动金额（正为增加，负为减少）|
| balance_before | decimal(15,2) | | ✅ | | 变动前余额 |
| balance_after | decimal(15,2) | | ✅ | | 变动后余额 |
| reference_id | varchar(64) | NULL | | | 关联ID（订单ID/请求ID等）|
| operator_id | int8 | NULL | | | 操作人ID（管理员调整时）|
| reason | text | NULL | | | 变动原因 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 涉及表：`real_name_reviews`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| user_id | int8 | | ✅ | FK_users_id + IDX_user_id | 用户ID |
| real_name | varchar(64) | | ✅ | | 真实姓名 |
| id_type | varchar(16) | 'id_card' | ✅ | | 证件类型：id_card/passport/business_license |
| id_number | varchar(64) | | ✅ | | 证件号码（存储时加密）|
| id_front_image | varchar(256) | NULL | | | 证件正面照URL |
| id_back_image | varchar(256) | NULL | | | 证件反面照URL |
| status | varchar(16) | 'pending' | ✅ | IDX_status | 审核状态：pending/approved/rejected |
| reviewer_id | int8 | NULL | | | 审核人ID |
| review_notes | text | NULL | | | 审核意见 |
| reviewed_at | timestamptz | NULL | | | 审核时间 |
| created_at | timestamptz | now() | ✅ | | 提交时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 用户余额变动必须通过`user_balance_logs`表原子操作
2. 余额调整必须记录`balance_before`/`balance_after`和操作人
3. 实名审核通过后，`users.real_name_status`同步更新

### 接口层
#### API：GET `/admin/users`
**Request Schema**：
```json
{
  "page": 1,
  "limit": ourline: 50,
  "role": "user",
  "status": "active",
  "real_name_status": "verified",
  "search": "关键词",
  "order_by": "created_at",
  "order": "desc"
}
```
**Response Schema**：
```json
{
  "users": [
    {
      "id": "u_10086",
      "nickname": "张三",
      "email": "zhangsan@example.com",
      "role": "user",
      "balance": "234.50",
      "total_consumption": "765.50",
      "status": "active",
      "real_name_status": "verified",
      "created_at": "2026-06-28T14:30:00Z",
      "last_login_at": "2026-07-26T10:30:00Z"
    }
  ],
  "pagination": {"total": 1234, "page": 1, "limit": 50}
}
```

#### API：POST `/admin/users/{userId}/balance/adjust`
**Request Schema**：
```json
{
  "amount": 100.00, // 正数增加，负数减少
  "reason": "活动奖励发放",
  "require_confirm": true // 金额>1000时需要二次确认
}
```
**Response Schema**：
```json
{
  "success": true,
  "balance_before": "234.50",
  "balance_after": "334.50",
  "adjustment_id": "adj_xxxx"
}
```
**错误码定义**：
- `402 InsufficientBalance`：减少金额>当前余额
- `403 Forbidden`：调用者无`user:operate`权限
- `400 BadRequest`：单次调整绝对值>1000且无二次确认

#### API：POST `/admin/users/{userId}/disable`
**Request Schema**：
```json
{
  "reason": "涉嫌违规操作",
  "disable_key": true // 是否同时禁用所有Key
}
```
**Response Schema**：`{"success": true, "disabled_keys_count": 5}`

#### API：POST `/admin/real-name-reviews/{reviewId}/approve`
**Request Schema**：
```json
{
  "notes": "证件清晰，信息一致",
  "auto_enable_withdraw": true // 是否自动开启提现权限
}
```

#### 缓存策略
- 用户列表分页缓存5分钟（Redis key: `admin_users:{query_hash}`）
- 用户详情缓存10分钟（Redis key: `user:{userId}:detail`）

### 业务逻辑
**余额调整算法**：
```python
def adjust_user_balance(user_id, amount, reason, operator_id):
    # 1. 开启事务
    with db.transaction():
        # 2. 获取当前余额（行锁）
        user = db.users.select_for_update().find(id=user_id)
        balance_before = user.balance
        
        # 3. 校验：减少时余额是否充足
        if amount < 0 and abs(amount) > balance_before:
            raise InsufficientBalanceError()
        
        # 4. 计算新余额
        balance_after = balance_before + amount
        
        # 5. 更新用户余额
        db.users.update(id=user_id, balance=balance_after)
        
        # 6. 记录日志
        log = UserBalanceLog(
            user_id=user_id,
            type='admin_adjust',
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            operator_id=operator_id,
            reason=reason
        ).save()
        
        # 7. 大额调整通知
        if abs(amount) > 1000:
            notify_super_admin(f"大额余额调整: {user_id} ¥{amount}")
    
    return balance_before, balance_after, log.id
```

**批量禁用用户逻辑**：
1. 禁用用户账号（status=disabled）
2. 记录禁用原因、操作人、时间
3. 可选：禁用用户所有Key（设置api_keys.status=disabled）
4. 强制登出用户所有会话
5. 发送站内通知和邮件通知

### 状态流转
**用户状态迁移表**：
| 当前状态 | 允许操作 | 目标状态 | 触发条件 |
|----------|---------|----------|---------|
| active | disable | disabled | 管理员手动禁用 |
| active | freeze | frozen | 风控自动冻结 |
| disabled | enable | active | 管理员手动启用 |
| frozen | unfreeze | active | 风控解除/管理员操作 |
| disabled | delete | deleted | 数据保留期（90天）后 |

**实名审核状态迁移**：
```
unverified → pending (用户提交) → verified (审核通过)
                              ↘ rejected (审核拒绝)
verified → (不可逆)
rejected → pending (用户重新提交)
```

### 配置项
- `site_configs.max_balance_adjust_per_op`：单次余额调整上限（默认¥10000）
- `site_configs.balance_adjust_confirm_threshold`：二次确认阈值（默认¥1000）
- `site_configs.user_disable_key_strategy`：禁用用户时Key处理策略：disable_all/keep_active/ask_each_time

---

## 供应商管理

### 数据层
#### 涉及表：`vendors`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 供应商名称：DeepSeek/OpenAI等 |
| slug | varchar(32) | | ✅ | UNIQUE | 标识符：deepseek/openai |
| logo_url | varchar(256) | NULL | | | Logo URL |
| website | varchar(256) | NULL | | | 官网 |
| api_base_url | varchar(256) | | ✅ | | API基础地址 |
| auth_type | varchar(32) | 'bearer_token' | ✅ | | 认证类型：bearer_token/api_key/custom |
| auth_header | varchar(64) | 'Authorization' | ✅ | | 认证头字段名 |
| auth_header_format | varchar(128) | 'Bearer {key}' | ✅ | | 认证头格式模板 |
| status | varchar(16) | 'online' | ✅ | IDX_vendors_status | 状态：online/maintenance/offline |
| health_check_url | varchar(256) | '/health' | ✅ | | 健康检查端点 |
| health_check_method | varchar(8) | 'GET' | ✅ | | 检查方法 |
| health_check_interval | int | 30 | ✅ | | 检查间隔（秒）|
| health_check_timeout | int | 5000 | ✅ | | 超时时间（毫秒）|
| circuit_breaker_threshold | int | 10 | ✅ | | 熔断阈值（连续失败次数）|
| circuit_breaker_recovery | int |215.00 | ✅ | | 恢复等待时间（秒）|
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`vendor_health_stats`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| vendor_id | int8 | | ✅ | FK_vendors_id + IDX_vendor_id | 供应商ID |
| timestamp | timestamptz | now() | ✅ | IDX_timestamp | 统计时间点 |
| availability | decimal(5,2) | | ✅ | | 可用率百分比（最近24小时）|
| avg_response_time | int | | ✅ | | 平均响应时间（ms）|
| p50_response_time | int | | ✅ | | P50响应时间 |
| p95_response_time | int | | ✅ | | P95响应时间 |
| p99_response_time | int | | ✅ | | P99响应时间 |
| total_requests | int | | ✅ | | 总请求数 |
| failed_requests | int | | ✅ | | 失败请求数 |

#### 涉及表：`vendor_status_changes`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| vendor_id | int8 | | ✅ | FK_vendors_id | 供应商ID |
| from_status | varchar(16) | | ✅ | | 原状态 |
| to_status | varchar(16) | | ✅ | | 新状态 |
| reason | text | NULL | | | 变更原因 |
| operator_id | int8 | NULL | | | 操作人ID（手动切换时）|
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 数据一致性要求
1. 供应商状态变更必须记录`vendor_status_changes`
2. 健康检查失败达到阈值时自动更新状态为`offline`
3. 供应商离线时，相关模型路由自动排除该供应商

### 接口层
#### API：GET `/admin/vendors`
**Request Schema**：`?status=online&include_stats=true`
**Response Schema**：
```json
{
  "vendors": [
    {
      "id": 1,
      "name": "DeepSeek",
      "slug": "deepseek",
      "api_base_url": "https://api.deepseek.com",
      "status": "online",
      "availability": "99.8",
      "today_calls": 12345,
      "today_cost": "2345.67",
      "health_check": {
        "last_check": "2026-07-27T12:30:00Z",
        "last_status": "success",
        "response_time": 45
      }
    }
  ]
}
```

#### API：PUT `/admin/vendors/{vendorId}/status`
**Request Schema**：
```json
{
  "status": "maintenance",
  "reason": "计划内维护，预计2小时",
  "fallback_vendor_id": 2 // 备用供应商ID
}
```
**Response Schema**：
```json
{
  "success": true,
  "previous_status": "online",
  "new_status": "maintenance",
  "estimated_affected_models": 5,
  "fallback_vendor": {"id": 2, "name": "OspreyAI"}
}
```

#### API：POST `/admin/vendors/{vendorId}/health-check/test`
**Request Schema**：无
**Response Schema**：
```json
{
  "success": true,
  "response_time": 67,
  "status_code": 200,
  "response_body": "{\"status\":\"ok\"}",
  "matches_expectation": true
}
```

#### 缓存策略
- 供应商列表缓存1分钟（Redis key: `vendors:list`）
- 供应商健康状态缓存30秒（Redis key: `vendor:{id}:health`）
- 模型-供应商映射缓存5分钟（Redis key: `model_vendors:{model}`）

### 业务逻辑
**供应商状态切换算法**：
```python
def change_vendor_status(vendor_id, new_status, reason, operator_id):
    vendor = Vendor.find(id=vendor_id)
    
    # 状态转换验证
    allowed_transitions = {
        'online': ['maintenance', 'offline'],
        'maintenance': ['online', 'offline'],
        'offline': ['online', 'maintenance']
    }
    
    if new_status not in allowed_transitions.get(vendor.status, []):
        raise InvalidStatusTransitionError()
    
    # 记录变更
    VendorStatusChange.create(
        vendor_id=vendor_id,
        from_status=vendor.status,
        to_status=new_status,
        reason=reason,
        operator_id=operator_id
    )
    
    # 更新供应商状态
    vendor.update(status=new_status)
    
    # 清除路由缓存
    clear_cache(f'model_vendors:*')
    
    # 发送通知
    if new_status == 'offline':
        notify_admins(f"供应商 {vendor.name} 已离线: {reason}")
    
    return vendor
```

**健康检查逻辑**：
```python
def check_vendor_health(vendor):
    try:
        start = time.time()
        response = http.request(
            method=vendor.health_check_method,
            url=f"{vendor.api_base_url}{vendor.health_check_url}",
            timeout=vendor.health_check_timeout/1000
        )
        elapsed = int((time.time() - start) * 1000)
        
        # 检查响应
        success = (
            response.status_code == 200 and
            vendor.health_check_expectation in response.text
        )
        
        # 记录统计
        VendorHealthStat.create(
            vendor_id=vendor.id,
            success=success,
            response_time=elapsed
        )
        
        # 更新熔断器
        if success:
            reset_circuit_breaker(vendor.id)
        else:
            increment_failure_count(vendor.id)
            if get_failure_count(vendor.id) >= vendor.circuit_breaker_threshold:
                auto_change_status(vendor.id, 'offline', '健康检查连续失败')
        
        return success, elapsed, response.text[:200]
    except Exception as e:\n        # 记录失败\n        increment_failure_count(vendor.id)\n        return False, 0, str(e)\n```\n\n### 状态流转\n**供应商状态迁移表**：
| 当前状态 | 允许操作 | 目标状态 | 触发条件 | 路由影响 |
|----------|---------|----------|---------|---------|
| online | 维护 | maintenance | 计划内维护 | 新请求不发往该供应商，已有请求继续 |
| online | 下线 | offline | 故障/熔断 | 所有请求返回错误或切到备用 |
| maintenance | 恢复 | online | 维护完成 | 恢复接收新请求 |
| maintenance | 下线 | offline | 维护转故障 | 同offline |
| offline | 上线 | online | 故障恢复 | 重新加入路由池 |
| offline | 维护 | maintenance | 从离线转维护 | 同maintenance |

**健康检查状态机**：
```
成功 → 失败计数清零
失败 → 失败计数+1 → 达到阈值 → 触发熔断 → 状态切为offline
熔断后 → 等待recovery秒 → 进入half-open → 探针成功 → 恢复online
```

### 配置项
- `site_configs.vendor_health_check_enabled`：是否启用健康检查（默认true）
- `site_configs.auto_circuit_breaker`：是否自动熔断（默认true）
- `site_configs.vendor_maintenance_notify_channels`：维护通知渠道：站内/邮件/钉钉

---

## 模型管理

### 数据层
#### 涉及表：`models`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(128) | | ✅ | UNIQUE | 模型名称：deepseek-chat/gpt-4o |
| slug | varchar(64) | | ✅ | UNIQUE | URL安全标识符 |
| display_name | varchar(128) | | ✅ | | 显示名称 |
| vendor_id | int8 | NULL | | FK_vendors_id | 默认供应商ID |
| capability | varchar(32) | 'chat' | ✅ | IDX_capability | 能力类型：text_generation/chat/image/embedding/code/audio |
| context_window | int | 4096 | ✅ | | 上下文窗口大小（token数）|
| description | text | '' | | | 模型描述 |
| input_price | decimal(12,6) | 0.002000 | ✅ | | 标准输入价格（¥/1K tokens）|
| output_price | decimal(12,6) | 0.008000 | ✅ | | 标准输出价格（¥/1K tokens）|
| cache_input_price | decimal(12,6) | 0.000500 | ✅ | | 缓存命中输入价格 |
| status | varchar(16) | 'active' | ✅ | IDX_status | 状态：active/deprecated/disabled |
| is_public | boolean | true | ✅ | | 是否公开（用户可见）|
| sort_order | int | 0 | ✅ | | 排序权重 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`model_vendor_mappings`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| model_id | int8 | | ✅ | FK_models_id + IDX_model_id | 平台模型ID |
| vendor_id | int8 | | ✅ | FK_vendors_id + IDX_vendor_id | 供应商ID |
| upstream_model_name | varchar(128) | | ✅ | | 供应商侧模型名 |
| custom_name | varchar(128) | NULL | | | 自定义别名 |
| input_price | decimal(12,6) | | ✅ | | 供应商采购输入价 |
| output_price | decimal(12,6) | | ✅ | | 供应商采购输出价 |
| weight | int | 50 | ✅ | | 流量权重（1-100）|
| priority | int | 1 | ✅ | | 优先级（数字越小越高）|
| max_concurrency | int | NULL | | | 最大并发数 |
| status | varchar(16) | 'active' | ✅ | | 状态：active/disabled |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`model_price_changes`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| model_id | int8 | | ✅ | FK_models_id | 模型ID |
| field | varchar(32) | | ✅ | | 变更字段：input_price/output_price/cache_input_price |
| old_value | decimal(12,6) | | ✅ | | 原值 |
| new_value | decimal(12,6) | | ✅ | | 新值 |
| change_percent | decimal(5,2) | | ✅ | | 变化百分比 |
| reason | text | NULL | | | 变更原因 |
| operator_id | int8 | NULL | | | 操作人ID |
| created_at | timestamptz | now() | ✅ | | 变更时间 |

#### 数据一致性要求
1. 模型价格变更必须记录`model_price_changes`
2. 模型禁用时，相关映射状态同步更新
3. 多供应商映射时，权重总和建议为100（非强制）

### 接口层
#### API：GET `/admin/models`
**Request Schema**：
```json
{
  "page": 1,
  "limit": 50,
  "vendor_id": 1,
  "capability": "chat",
  "status": "active",
  "search": "deepseek",
  "include_mappings": true,
  "include_price_history": false
}
```

#### API：POST `/admin/models`
**Request Schema**：
```json
{
  "name": "deepseek-v4-flash",
  "display_name": "DeepSeek V4 Flash",
  "vendor_id": 1,
  "capability": "chat",
  "context_window": 128000,
  "input_price": "0.001000",
  "output_price": "0.004000",
  "cache_input_price": "0.000250",
  "description": "DeepSeek最新快速模型"
}
```

#### API：PUT `/admin/models/{modelId}/prices`
**Request Schema**：
```json
{
  "input_price": "0.001800",
  "output_price": "0.007200",
  "reason": "供应商降价，同步调整",
  "effective_immediately": true
}
```
**Response Schema**：
```json
{
  "success": true,
  "changes": [
    {"field": "input_price", "old": "0.002000", "new": "0.001800", "percent": -10.0},
    {"field": "output_price", "old": "0.008000", "new": "0.007200", "percent": -10.0}
  ],
  "estimated_impact": "预计月收入减少 ¥1,234.56"
}
```

#### API：POST `/admin/models/batch-update-prices`
**Request Schema**：
```json
{
  "model_ids": [1, 2, 3],
  "action": "decrease_percent", // increase_percent/decrease_percent/set_absolute
  "value": 10.0, // 百分比或绝对价格
  "reason": "批量降价促销",
  "fields": ["input_price", "output_price"] // 或 ["input_price"]
}
```

#### 缓存策略
- 模型列表缓存2分钟（Redis key: `models:list`）
- 模型详情缓存5分钟（Redis key: `model:{id}:detail`）
- 模型价格缓存10分钟（Redis key: `model:{id}:prices`）
- 模型-供应商映射缓存5分钟（Redis key: `model:{id}:vendors`）

### 业务逻辑
**价格变更影响分析**：
```python
def analyze_price_change_impact(model_id, new_input_price, new_output_price):
    model = Model.find(id=model_id)
    
    # 1. 计算变化率
    input_change = ((new_input_price - model.input_price) / model.input_price * 100)
    output_change = ((new_output_price - model.output_price) / model.output_price * 100)
    
    # 2. 查询近期消费数据
    recent_30d = ConsumptionLog.filter(
        model_id=model_id,
        created_at >= now() - timedelta(days=30)
    )
    
    total_input_tokens = sum(log.input_tokens for log in recent_30d)
    total_output_tokens = sum(log.output_tokens for log in recent_30d)
    
    # 3. 计算收入影响
    old_revenue = (
        total_input_tokens/1000 * model.input_price +
        total_output_tokens/1000 * model.output_price
    )
    new_revenue = (
        total_input_tokens/1000 * new_input_price +
        total_output_tokens/1000 * new_output_price
    )
    revenue_change = new_revenue - old_revenue
    revenue_change_percent = (revenue_change / old_revenue * 100) if old_revenue else 0
    
    # 4. 预测弹性效应（简单线性模型）
    # 假设价格下降10% → 需求量增加15%
    price_elasticity = -1.5  # 弹性系数
    demand_change = price_elasticity * ((input_change + output_change)/2)
    adjusted_revenue_change = revenue_change * (1 + demand_change/100)
    
    return {
        "input_change_percent": round(input_change, 2),
        "output_change_percent": round(output_change, 2),
        "monthly_tokens": {
            "input": total_input_tokens,
            "output": total_output_tokens
        },
        "revenue_impact": {
            "old_monthly": round(old_revenue, 2),
            "new_monthly": round(new_revenue, 2),
            "change": round(revenue_change, 2),
            "change_percent": round(revenue_change_percent, 2),
            "elastic_adjusted": round(adjusted_revenue_change, 2)
        }
    }
```

**多供应商路由选择算法**：
```python
def select_vendor_for_model(model_id, request_context):
    mappings = ModelVendorMapping.filter(
        model_id=model_id,
        status='active'
    ).order_by('priority', 'weight')
    
    # 过滤熔断供应商
    available_mappings = []
    for mapping in mappings:
        vendor = Vendor.find(id=mapping.vendor_id)
        if vendor.status != 'offline' and not is_circuit_broken(vendor.id):
            available_mappings.append(mapping)
    
    if not available_mappings:
        raise NoAvailableVendorError()
    
    # 加权随机选择
    total_weight = sum(m.weight for m in available_mappings)
    if total_weight <= 0:
        return available_mappings[0]
    
    rand_val = random.random() * total_weight
    cumulative = 0
    for mapping in available_mappings:
        cumulative += mapping.weight
        if rand_val <= cumulative:
            return mapping
    
    return available_mappings[-1]
```

### 状态流转
**模型状态迁移表**：
| 当前状态 | 允许操作 | 目标状态 | 触发条件 | 用户影响 |
|----------|---------|----------|---------|---------|
| active | 弃用 | deprecated | 新版替代 | 仍可用但标记"旧版" |
| active | 禁用 | disabled | 故障/下线 | 不可调用 |
| deprecated | 恢复 | active | 重新启用 | 恢复正常 |
| deprecated | 禁用 | disabled | 完全下线 | 不可调用 |
| disabled | 启用 | active | 故障恢复 | 恢复调用 |

**价格变更审批流（阈值触发）**：
```
价格变化率 < 5% → 直接生效，记录日志
价格变化率 5-20% → 需要另一名admin确认
价格变化率 > 20% → 需要super_admin确认
```

### 配置项
- `site_configs.price_change_approval_thresholds`：价格变更审批阈值：{"minor": 5, "major": 20}
- `site_configs.default_model_markup_rate`：默认加价率（默认10.0%）
- `site_configs.model_routing_algorithm`：路由算法：weighted_random/least_connections/priority_only

---

## 财务管理

### 数据层
#### 涉及表：`finance_overview_cache`（物化视图）
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| date | date | | ✅ | PK | 统计日期 |
| metric | varchar(32) | | ✅ | PK | 指标名称 |
| value | jsonb | | ✅ | | 指标值 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`recharge_orders`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| order_no | varchar(64) | | ✅ | UNIQUE | 订单号：RCH-YYYYMMDD-xxxx |
| user_id | int8 | | ✅ | FK_users_id + IDX_user_id | 用户ID |
| amount | decimal(15,2) | | ✅ | | 充值金额 |
| payment_method | varchar(32) | | ✅ | | 支付方式：alipay/wechat/bank_transfer |
| payment_status | varchar(16) | 'pending' | ✅ | IDX_payment_status | 支付状态：pending/success/failed/expired/abnormal |
| payment_info | jsonb | {} | ✅ | | 支付信息（渠道订单号、二维码URL等）|
| balance_before | decimal(15,2) | NULL | | | 充值前余额 |
| balance_after | decimal(15,2) | NULL | | | 充值后余额 |
| completed_at | timestamptz | NULL | | | 完成时间 |
| expires_at | timestamptz | | ✅ | | 过期时间（创建后30分钟）|
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`invoices`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| invoice_no | varchar(64) | | ✅ | UNIQUE | 发票号：INV-YYYYMMDD-xxxx |
| user_id | int8 | | ✅ | FK_users_id | 用户ID |
| amount | decimal(15,2) | | ✅ | | 开票金额 |
| invoice_type | varchar(32) | 'vat_normal' | ✅ | | 发票类型：vat_normal/vat_special |
| title | varchar(100) | | ✅ | | 发票抬头 |
| tax_number | varchar(30) | NULL | | | 税号（企业必填）|
| status | varchar(16) | 'pending' | ✅ | IDX_status | 状态：pending/approved/issued/rejected |
| apply_months | text | | ✅ | | 申请月份（JSON数组）|
| pdf_url | varchar(256) | NULL | | | 发票PDF URL |
| express_no | varchar(50) | NULL | | | 快递单号（纸质发票）|
| reviewer_id | int8 | NULL | | | 审核人ID |
| issued_at | timestamptz | NULL | | | 开具时间 |
| created_at | timestamptz | now() | ✅ | | 申请时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`agent_settlements`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| settlement_no | varchar(64) | | ✅ | UNIQUE | 结算单号：STL-YYYYMM-xxx |
| agent_id | int8 | | ✅ | FK_users_id | 代理ID |
| period | varchar(7) | | ✅ | IDX_period | 结算周期：YYYY-MM |
| total_consumption | decimal(15,2) | | ✅ | | 名下用户总消费 |
| commission_rate | decimal(5,2) | | ✅ | | 佣金率 |
| commission_amount | decimal(15,2) | | ✅ | | 佣金金额 |
| status | varchar(16) | 'pending' | ✅ | | 状态：pending/confirmed/paid |
| confirmed_by | int8 | NULL | | | 确认人ID |
| confirmed_at | timestamptz | NULL | | | 确认时间 |
| paid_at | timestamptz | NULL | | | 支付时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 充值订单成功时，必须原子更新用户余额并记录`user_balance_logs`
2. 发票金额不得超过申请月份的实际消费总额
3. 代理结算单确认前需校验名下用户消费数据一致性

### 接口层
#### API：GET `/admin/finance/overview`
**Request Schema**：`?period=month&date=2026-07`
**Response Schema**：
```json
{
  "period": "2026-07",
  "revenue": {
    "total": "54321.00",
    "user_recharge": "45000.00",
    "agent_prepay": "8000.00",
    "other": "1321.00",
    "trend": "+12.3%"
  },
  "expense": {
    "total": "40876.50",
    "by_vendor": [
      {"vendor": "DeepSeek", "amount": "25600.00", "percent": "62.6%"},
      {"vendor": "OpenAI", "amount": "8900.00", "percent": "21.8%"}
    ],
    "trend": "+8.2%"
  },
  "profit": {
    "gross": "13444.50",
    "margin": "24.8%",
    "by_model": [
      {"model": "deepseek-chat", "margin": "32.5%"},
      {"model": "gpt-4o", "margin": "18.2%"}
    ]
  }
}
```

#### API：GET `/admin/finance/recharge-orders`
**Request Schema**：
```json
{
  "page": 1,
  "limit": 50,
  "status": "success",
  "user_id": "u_10086",
  "date_from": "2026-07-01",
  "date_to": "2026-07-27",
  "payment_method": "alipay"
}
```

#### API：POST `/admin/finance/recharge-orders/{orderNo}/reconcile`
**Request Schema**：
```json
{
  "action": "manual_success", // manual_success/refund/abandon
  "reason": "支付回调丢失，手动补单",
  "evidence": "支付截图base64"
}
```

#### API：POST `/admin/finance/invoices/{invoiceNo}/review`
**Request Schema**：
```json
{
  "action": "approve", // approve/reject
  "notes": "信息完整，符合开票要求",
  "pdf_url": "https://storage/invoices/INV-20260727-001.pdf"
}
```

#### API：POST `/admin/finance/agent-settlements/{settlementNo}/confirm`
**Request Schema**：
```json
{
  "action": "confirm", // confirm/reject
  "notes": "数据核对无误",
  "auto_withdraw": true // 是否自动转入代理可提现余额
}
```

#### 缓存策略
- 财务总览数据缓存5分钟（Redis key: `finance:overview:{period}`）
- 充值订单统计缓存1分钟（Redis key: `recharge:stats:{date}`）
- 发票申请状态缓存10分钟（Redis key: `invoice:{id}:status`）

### 业务逻辑
**财务对账算法**：
```python
def daily_reconciliation(date):
    # 1. 汇总平台消费数据
    platform_data = ConsumptionLog.filter(
        created_at >= date,
        created_at < date + timedelta(days=1)
    ).group_by('vendor_id').aggregate(
        total_cost=Sum('cost'),
        total_requests=Count('*')
    )
    
    # 2. 获取供应商账单（API调用）
    vendor_bills = {}
    for vendor in Vendor.all():
        bill = fetch_vendor_bill(vendor, date)
        vendor_bills[vendor.id] = bill
    
    # 3. 逐供应商对账
    discrepancies = []
    for vendor_id, platform_row in platform_data.items():
        vendor_bill = vendor_bills.get(vendor_id)
        if not vendor_bill:
            discrepancies.append({
                "vendor_id": vendor_id,
                "type": "vendor_bill_missing",
                "platform_amount": platform_row.total_cost
            })
            continue
        
        # 金额差异检查（允许0.1%误差）
        diff = abs(platform_row.total_cost - vendor_bill.amount)
        tolerance = platform_row.total_cost * 0.001
        
        if diff > tolerance:
            discrepancies.append({
                "vendor_id": vendor_id,
                "type": "amount_mismatch",
                "platform_amount": platform_row.total_cost,
                "vendor_amount": vendor_bill.amount,
                "difference": diff,
                "platform_requests": platform_row.total_requests,
                "vendor_requests": vendor_bill.request_count
            })
    
    # 4. 生成对账报告
    report = DailyReconciliationReport.create(
        date=date,
        total_vendors=len(platform_data),
        total_discrepancies=len(discrepancies),
        discrepancies=discrepancies,
        status='completed' if not discrepancies else 'has_issues'
    )
    
    # 5. 异常通知
    if discrepancies:
        notify_finance_admins(f"对账异常 {date}: {len(discrepancies)} 条差异")
    
    return report
```

**发票审核逻辑**：
```python
def review_invoice(invoice_id, action, reviewer_id, notes, pdf_url):
    invoice = Invoice.find(id=invoice_id)
    
    if invoice.status != 'pending':
        raise InvalidInvoiceStatusError()
    
    # 验证开票金额不超过实际消费
    apply_months = json.loads(invoice.apply_months)
    total_consumption = ConsumptionLog.filter(
        user_id=invoice.user_id,
        created_at >= f"{apply_months[0]}-01",
        created_at <= f"{apply_months[-1]}-31"
    ).sum('cost')
    
    if invoice.amount > total_consumption:
        raise InvoiceAmountExceededError()
    
    # 企业发票需验证税号格式
    if invoice.invoice_type == 'vat_special':
        if not invoice.tax_number or len(invoice.tax_number) not in [15, 18, 20]:
            raise InvalidTaxNumberError()
    
    # 更新状态
    new_status = 'issued' if action == 'approve' else 'rejected'
    invoice.update(
        status=new_status,
        reviewer_id=reviewer_id,
        review_notes=notes,
        pdf_url=pdf_url if action == 'approve' else None,
        issued_at=now() if action == 'approve' else None
    )
    
    # 记录操作日志
    OperationLog.create(
        operator_id=reviewer_id,
        action='invoice.review',
        target_type='invoice',
        target_id=invoice.id,
        before_value={'status': 'pending'},
        after_value={'status': new_status},
        reason=notes
    )
    
    # 通知用户
    notify_user(invoice.user_id, f"发票申请已{new_status}: {notes}")
    
    return invoice
```

### 状态流转
**充值订单状态迁移**：
```
pending → success (支付成功) → 余额增加，订单完成
pending → failed (支付失败) → 可重新支付
pending → expired (超时未支付) → 不可恢复，需新建订单
success → refunded (退款) → 余额扣减，订单关闭
```

**发票状态迁移**：
```
pending → approved (审核通过) → 开具中
pending → rejected (审核拒绝) → 结束
approved → issued (已开具) → 可下载PDF
approved → cancelled (取消) → 回退到pending
```

**代理结算单状态迁移**：
```
pending → confirmed (确认) → 生成可提现金额
pending → rejected (拒绝) → 需修改后重新提交
confirmed → paid (已支付) → 结算完成
```

### 配置项
- `site_configs.min_invoice_amount`：最低开票金额（默认¥50.00）
- `site_configs.invoice_fee_percent`：开票手续费百分比（默认0%）
- `site_configs.reconciliation_tolerance_percent`：对账容忍误差百分比（默认0.1%）
- `site_configs.auto_generate_settlement`：是否自动生成结算单（默认true，每月5日）

---

## 安全管理

### 数据层
#### 涉及表：`security_events`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| event_id | varchar(64) | | ✅ | UNIQUE | 事件ID：SEC-YYYYMMDD-xxxx |
| type | varchar(32) | | ✅ | IDX_type | 事件类型：abnormal_login/brute_force/key_leak/balance_anomaly/content_filter |
| severity | varchar(16) | 'warning' | ✅ | IDX_severity | 严重等级：critical/warning/info |
| user_id | int8 | NULL | | FK_users_id | 关联用户ID |
| api_key_id | int8 | NULL | | FK_api_keys_id | 关联Key ID |
| source_ip | inet | | ✅ | | 来源IP |
| source_location | varchar(128) | NULL | | | IP地理位置 |
| details | jsonb | {} | ✅ | | 事件详情 |
| status | varchar(16) | 'pending' | ✅ | IDX_status | 处理状态：pending/in_progress/resolved/ignored |
| handled_by | int8 | NULL | | | 处理人ID |
| handled_at | timestamptz | NULL | | | 处理时间 |
| handled_action | varchar(32) | NULL | | | 处理动作：disable_key/ban_user/blacklist_ip/mark_false |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`security_rules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 规则名称 |
| description | text | '' | | | 规则描述 |
| conditions | jsonb | {} | ✅ | | 触发条件配置 |
| actions | jsonb | {} | ✅ | | 执行动作配置 |
| severity | varchar(16) | 'warning' | ✅ | | 触发时事件等级 |
| is_enabled | boolean | true | ✅ | | 是否启用 |
| execution_count | int | 0 | ✅ | | 触发次数 |
| last_triggered_at | timestamptz | NULL | | | 最后触发时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`ip_blacklist`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| ip | inet | | ✅ | UNIQUE | IP地址或CIDR |
| type | varchar(16) | 'manual' | ✅ | | 类型：manual/auto/geoblock |
| reason | text | '' | | | 封禁原因 |
| expires_at | timestamptz | NULL | | | 过期时间（NULL为永久）|
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 涉及表：`sensitive_words`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| word | varchar(128) | | ✅ | UNIQUE | 敏感词 |
| category | varchar(32) | 'custom' | ✅ | IDX_category | 分类：porn/politics/violence/ad/custom |
| severity | varchar(16) | 'medium' | ✅ | | 严重级别：high/medium/low |
| action | varchar(32) | 'block' | ✅ | | 命中动作：block/log/notify |
| hit_count | int | 0 | ✅ | | 命中次数 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 安全事件创建后必须可追溯原始请求上下文
2. IP黑名单命中时拒绝所有访问，无论用户身份
3. 敏感词命中记录需包含上下文和请求ID

### 接口层
#### API：GET `/admin/security/events`
**Request Schema**：
```json
{
  "page": 1,
  "limit": 50,
  "type": "key_leak",
  "severity": "critical",
  "status": "pending",
  "user_id": "u_10086",
  "date_from": "2026-07-01",
  "date_to": "2026-07-27"
}
```

#### API：POST `/admin/security/events/{eventId}/handle`
**Request Schema**：
```json
{
  "action": "disable_key", // disable_key/ban_user/blacklist_ip/mark_false
  "notes": "确认Key泄露，立即禁用",
  "notify_user": true
}
```

#### API：POST `/admin/security/rules`
**Request Schema**：
```json
{
  "name": "高频调用检测",
  "description": "检测异常高频API调用",
  "conditions": {
    "type": "and",
    "rules": [
      {"field": "calls_per_minute", "operator": "gt", "value": 1000},
      {"field": "ip_not_in_usual", "operator": "eq", "value": true},
      {"field": "outside_work_hours", "operator": "eq", "value": true}
    ]
  },
  "actions": [
    {"type": "log_event", "severity": "warning"},
    {"type": "disable_key_temporary", "duration_minutes": 15},
    {"type": "notify_admin"}
  ],
  "severity": "warning",
  "is_enabled": true
}
```

#### API：POST `/admin/security/sensitive-words/test`
**Request Schema**：
```json
{
  "text": "测试文本内容",
  "check_categories": ["porn", "politics", "violence"]
}
```
**Response Schema**：
```json
{
  "hits": [
    {
      "word": "敏感词",
      "category": "politics",
      "severity": "high",
      "position": {"start": 15, "end": 18},
      "action": "block"
    }
  ],
  "recommended_action": "block" // 按最高严重级别推荐
}
```

#### 缓存策略
- IP黑名单缓存5分钟（Redis key: `security:ip_blacklist`）
- 敏感词Trie树缓存10分钟（Redis key: `security:sensitive_words_trie`）
- 风控规则缓存5分钟（Redis key: `security:rules:enabled`）

### 业务逻辑
**风控规则引擎**：
```python
class RiskRuleEngine:
    def __init__(self):
        self.rules = self.load_rules()
    
    def evaluate_request(self, request_context):
        """
        request_context包含：
        - user_id, api_key_id
        - source_ip, user_agent
        - endpoint, model, tokens
        - historical_stats (近期调用频率、成功率等)
        """
        triggered_rules = []
        
        for rule in self.rules:
            if not rule.is_enabled:
                continue
            
            if self.evaluate_conditions(rule.conditions, request_context):
                # 规则命中
                triggered_rules.append(rule)
                
                # 执行动作
                for action in rule.actions:
                    self.execute_action(action, request_context, rule.severity)
                
                # 记录触发
                rule.update(
                    execution_count=rule.execution_count + 1,
                    last_triggered_at=now()
                )
        
        return triggered_rules
    
    def evaluate_conditions(self, conditions, context):
        if conditions.type == 'and':
            return all(self.evaluate_rule(rule, context) for rule in conditions.rules)
        elif conditions.type == 'or':
            return any(self.evaluate_rule(rule, context) for rule in conditions.rules)
        else:
            return self.evaluate_rule(conditions, context)
    
    def evaluate_rule(self, rule, context):
        field_value = get_field_value(rule.field, context)
        operator = rule.operator
        
        if operator == 'gt':
            return field_value > rule.value
        elif operator == 'lt':
            return field_value < rule.value
        elif operator == 'eq':
            return field_value == rule.value
        elif operator == 'ne':
            return field_value != rule.value
        elif operator == 'in':
            return field_value in rule.value
        elif operator == 'not_in':
            return field_value not in rule.value
        # ... 其他操作符
    
    def execute_action(self, action, context, severity):
        if action.type == 'log_event':
            SecurityEvent.create(
                type=action.event_type or 'rule_triggered',
                severity=severity,
                user_id=context.user_id,
                api_key_id=context.api_key_id,
                source_ip=context.source_ip,
                details={
                    'rule_name': action.rule_name,
                    'request_context': context.serialize(),
                    'action': action.type
                }
            )
        
        elif action.type == 'disable_key_temporary':
            # 临时禁用Key
            disable_api_key(context.api_key_id, duration_minutes=action.duration)
        
        elif action.type == 'notify_admin':
            notify_security_admins(f"风控规则触发: {action.rule_name}")
        
        elif action.type == 'block_request':
            raise SecurityBlockedError("请求被安全规则拦截")
```

**敏感词检测算法**：
```python
class SensitiveWordFilter:
    def __init__(self):
        self.trie = self.build_trie()
    
    def build_trie(self):
        # 从数据库加载所有敏感词构建Trie树
        words = SensitiveWord.filter(is_enabled=True).all()
        trie = {}
        for word in words:
            node = trie
            for char in word.word:
                if char not in node:
                    node[char] = {}
                node = node[char]
            node['$'] = {'word': word.word, 'category': word.category, 'severity': word.severity}
        return trie
    
    def find_hits(self, text):
        hits = []
        length = len(text)
        
        for i in range(length):
            node = self.trie
            j = i
            while j < length and text[j] in node:
                node = node[text[j]]
                j += 1
                if '$' in node:
                    # 找到匹配
                    word_info = node['$']
                    hits.append({
                        'word': word_info['word'],
                        'category': word_info['category'],
                        'severity': word_info['severity'],
                        'start': i,
                        'end': j,
                        'matched_text': text[i:j]
                    })
        
        return hits
    
    def filter_text(self, text, action='block'):
        hits = self.find_hits(text)
        if not hits:
            return text, []
        
        # 按严重级别排序
        severity_order = {'high': 3, 'medium': 2, 'low': 1}
        hits.sort(key=lambda x: severity_order[x['severity']], reverse=True)
        
        if action == 'block' and any(h['severity'] == 'high' for h in hits):
            raise SensitiveContentBlockedError("内容包含敏感词")
        
        # 替换为*号
        result = list(text)
        for hit in hits:
            for i in range(hit['start'], hit['end']):
                result[i] = '*'
        
        return ''.join(result), hits
```

### 状态流转
**安全事件处理流程**：
```
事件触发 → 记录security_events(status=pending) → 
├── 自动处理（规则配置）→ 执行动作 → status=resolved
└── 人工处理 → 管理员查看 → 选择处置动作 → 
    执行动作 + 记录handled_by/handled_at → status=resolved/ignored
```

**IP黑名单生命周期**：
```
手动添加/自动触发 → 加入黑名单 → 
├── 永久封禁（expires_at=NULL）
├── 临时封禁（expires_at=未来时间）→ 到期自动移除
└── 自动封禁（type=auto）→ 达到解封条件自动移除
```

### 配置项
- `site_configs.security_auto_block_ip_threshold`：自动封禁IP阈值（默认10次/5分钟）
- `site_configs.sensitive_word_action_mapping`：敏感词分类-动作映射：{"politics": "block", "ad": "log"}
- `site_configs.security_notification_channels`：安全通知渠道：站内/邮件/钉钉/webhook

---

## 系统配置

### 数据层
#### 涉及表：`site_configs`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| key | varchar(128) | | ✅ | UNIQUE | 配置键 |
| value | text | '' | | | 配置值（JSON/YAML/文本）|
| value_type | varchar(16) | 'string' | ✅ | | 值类型：string/number/boolean/json/yaml/encrypted |
| category | varchar(32) | 'general' | ✅ | IDX_category | 分类：general/payment/email/security/rate_limit/pricing/settlement/verification/vendor |
| description | text | '' | | | 配置描述 |
| is_encrypted | boolean | false | ✅ | | 是否加密存储 |
| is_sensitive | boolean | false | ✅ | | 是否敏感配置（查看需验证）|
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |
| updated_by | int8 | NULL | | | 最后修改人ID |

#### 涉及表：`config_versions`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| version | int8 | 序列 | ✅ | PK | 版本号 |
| changes | jsonb | {} | ✅ | | 变更内容 {key: {old, new}, ...} |
| operator_id | int8 | NULL | | | 操作人ID |
| reason | text | NULL | | | 变更原因 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 涉及表：`environment_configs`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| environment | varchar(32) | | ✅ | PK | 环境：development/staging/production |
| config_key | varchar(128) | | ✅ | PK | 配置键 |
| config_value | text | '' | | | 环境特定值 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 加密配置存储时必须加密，读取时需权限验证
2. 配置变更必须记录版本，支持回滚
3. 环境特定配置优先于全局配置

### 接口层
#### API：GET `/admin/configs`
**Request Schema**：
```json
{
  "category": "payment",
  "include_sensitive": false,
  "environment": "production"
}
```
**Response Schema**：
```json
{
  "configs": [
    {
      "key": "alipay_app_id",
      "value": "********", // 敏感配置脱敏
      "value_type": "encrypted",
      "category": "payment",
      "description": "支付宝App ID",
      "is_encrypted": true,
      "is_sensitive": true,
      "can_view": false // 当前用户无权查看明文
    },
    {
      "key": "site_name",
      "value": "3cloud",
      "value_type": "string",
      "category": "general",
      "description": "平台名称",
      "is_encrypted": false,
      "is_sensitive": false,
      "can_view": true
    }
  ]
}
```

#### API：POST `/admin/configs/{key}/view-sensitive`
**Request Schema**：
```json
{
  "password": "用户登录密码",
  "reason": "调试支付问题"
}
```
**Response Schema**：
```json
{
  "value": "2021000116671234",
  "view_expires_at": "2026-07-27T12:45:00Z" // 15秒后过期
}
```

#### API：PUT `/admin/configs/{key}`
**Request Schema**：
```json
{
  "value": "new_value",
  "environment": "production", // 可选，指定环境
  "reason": "调整支付宝手续费"
}
```

#### API：POST `/admin/configs/batch-update`
**Request Schema**：
```json
{
  "updates": [
    {"key": "site_name", "value": "3Cloud AI"},
    {"key": "default_markup_rate", "value": "12.5"}
  ],
  "reason": "品牌升级"
}
```

#### API：POST `/admin/configs/versions/{version}/rollback`
**Request Schema**：
```json
{
  "reason": "配置错误，回滚到稳定版本"
}
```

#### 缓存策略
- 配置缓存5分钟（Redis key: `config:{key}:{environment}`）
- 配置版本列表缓存1分钟（Redis key: `config:versions:latest10`）
- 敏感配置查看令牌有效期15秒（Redis key: `config:view_token:{token}`）

### 业务逻辑
**配置加载优先级**：
```python
def get_config(key, environment=None):
    # 优先级：环境配置 > 全局配置 > 默认值
    
    # 1. 检查环境特定配置
    if environment:
        env_config = EnvironmentConfig.find(
            environment=environment,
            config_key=key
        )
        if env_config:
            return parse_value(env_config.config_value)
    
    # 2. 检查全局配置
    config = SiteConfig.find(key=key)
    if config:
        value = config.value
        
        # 解密处理
        if config.is_encrypted:
            value = decrypt_value(value)
        
        return parse_value(value, config.value_type)
    
    # 3. 返回硬编码默认值
    return DEFAULT_CONFIGS.get(key)
```

**配置版本控制**：
```python
def update_config(key, new_value, operator_id, reason, environment=None):
    # 1. 获取当前值
    old_value = get_config(key, environment)
    
    # 2. 验证权限（敏感配置）
    config_meta = SiteConfig.find(key=key)
    if config_meta and config_meta.is_sensitive:
        if not has_permission(operator_id, 'config:sensitive_update'):
            raise PermissionDeniedError()
    
    # 3. 创建版本记录
    changes = {key: {'old': old_value, 'new': new_value}}
    ConfigVersion.create(
        changes=changes,
        operator_id=operator_id,
        reason=reason
    )
    
    # 4. 更新配置
    if environment:
        # 更新环境配置
        env_config = EnvironmentConfig.find_or_create(
            environment=environment,
            config_key=key
        )
        env_config.update(
            config_value=str(new_value),
            updated_at=now()
        )
    else:
        # 更新全局配置
        if config_meta:
            config_meta.update(
                value=encrypt_if_needed(new_value, config_meta.is_encrypted),
                updated_by=operator_id,
                updated_at=now()
            )
        else:
            SiteConfig.create(
                key=key,
                value=str(new_value),
                value_type=infer_value_type(new_value),
                updated_by=operator_id
            )
    
    # 5. 清除缓存
    clear_cache(f'config:{key}:*')
    
    # 6. 通知配置变更
    if config_meta and config_meta.category in ['payment', 'security', 'rate_limit']:
        notify_admins(f"配置变更: {key} = {new_value} (原因: {reason})")
    
    return old_value, new_value
```

### 状态流转
**配置变更审批流程**：
```
普通配置 → 直接修改，记录版本
敏感配置 → 需另一名管理员确认 → 修改，记录版本+确认人
关键配置（支付/安全）→ 需super_admin确认 → 修改，记录版本+确认人
```

**配置导入/导出流程**：
```
导出 → 选择分类 → 生成JSON/YAML（加密字段脱敏）→ 下载
导入 → 上传文件 → 解析验证 → 显示差异对比 → 确认导入 → 批量创建版本记录
```

### 配置项（关键示例）
| 分类 | 配置键 | 类型 | 默认值 | 说明 |
|------|-------|------|-------|------|
| general | site_name | string | "3cloud" | 平台名称 |
| general | icp_number | string | "" | ICP备案号 |
| general | customer_service_email | string | "support@3cloud.ai" | 客服邮箱 |
| payment | alipay_app_id | encrypted | "" | 支付宝App ID |
| payment | alipay_private_key | encrypted | "" | 支付宝私钥 |
| payment | wechat_merchant_id | encrypted | "" | 微信商户号 |
| email | smtp_host | string | "" | SMTP主机 |
| email | smtp_port | number | 465 | SMTP端口 |
| email | smtp_username | encrypted | "" | SMTP用户名 |
| email | smtp_password | encrypted | "" | SMTP密码 |
| security | password_min_length | number | 8 | 密码最小长度 |
| security | login_lock_threshold | number | 5 | 登录锁定阈值（次/5分钟）|
| security | login_lock_duration | number | 15 | 登录锁定时长（分钟）|
| rate_limit | global_qps_limit | number | 10000 | 全局QPS上限 |
| rate_limit | default_user_qps | number | 100 | 默认用户QPS |
| rate_limit | default_key_qps | number | 50 | 默认Key QPS |
| pricing | default_markup_rate | decimal | 10.00 | 默认加价率（%）|
| settlement | settlement_cycle | string | "monthly" | 结算周期：monthly/weekly |
| settlement | settlement_delay_days | number | 3 | 结算延迟天数 |
| verification | real_name_level | string | "standard" | 实名等级：standard/strict/relaxed |
| vendor | health_check_interval | number | 30 | 健康检查间隔（秒）|

---

## 运营工具

### 数据层
#### 涉及表：`announcements`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| title | varchar(200) | | ✅ | | 公告标题 |
| content | text | '' | | | 公告内容（富文本）|
| type | varchar(32) | 'info' | ✅ | | 类型：info/maintenance/alert/promotion |
| priority | smallint | 0 | ✅ | | 优先级（0普通，1重要，2紧急）|
| is_pinned | boolean | false | ✅ | | 是否置顶 |
| target_users | jsonb | '["all"]' | ✅ | | 目标用户：["all"] 或 ["role:admin", "user:u_xxxx"] |
| published_at | timestamptz | NULL | | IDX_published_at | 发布时间（NULL为草稿）|
| scheduled_at | timestamptz | NULL | | | 定时发布时间 |
| expires_at | timestamptz | NULL | | | 过期时间 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`announcement_reads`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| announcement_id | int8 | | ✅ | FK_announcements_id | 公告ID |
| user_id | int8 | | ✅ | FK_users_id | 用户ID |
| read_at | timestamptz | now() | ✅ | | 阅读时间 |
| UNIQUE(announcement_id, user_id) | | | | | 唯一约束 |

#### 涉及表：`campaigns`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(128) | | ✅ | UNIQUE | 活动名称 |
| type | varchar(32) | | ✅ | IDX_type | 类型：recharge_bonus/consumption_rebate/new_user_discount/redemption_code/invite_reward/time_discount |
| description | text | '' | | | 活动描述 |
| rules | jsonb | {} | ✅ | | 规则配置 |
| budget_total | decimal(15,2) | NULL | | | 总预算 |
| budget_used | decimal(15,2) | 0.00 | ✅ | | 已使用预算 |
| budget_user_max | decimal(15,2) | NULL | | | 单人奖励上限 |
| target_users | jsonb | '["all"]' | ✅ | | 目标用户 |
| start_at | timestamptz | | ✅ | | 开始时间 |
| end_at | timestamptz | | ✅ | | 结束时间 |
| status | varchar(16) | 'draft' | ✅ | IDX_status | 状态：draft/pending/active/paused/completed |
| approval_flow | jsonb | NULL | | | 审批流程记录 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`campaign_participations`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| campaign_id | int8 | | ✅ | FK_campaigns_id | 活动ID |
| user_id | int8 | | ✅ | FK_users_id | 用户ID |
| trigger_count | int | 0 | ✅ | | 触发次数 |
| reward_total | decimal(15,2) | 0.00 | ✅ | | 获得奖励总额 |
| last_triggered_at | timestamptz | NULL | | | 最后触发时间 |
| UNIQUE(campaign_id, user_id) | | | | | 唯一约束 |

#### 涉及表：`email_templates`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 模板名称 |
| scenario | varchar(32) | | ✅ | IDX_scenario | 场景：recharge_success/low_balance/key_expiry/real_name_approved/invoice_issued/withdraw_completed/security_alert/verification_code |
| subject | varchar(200) | | ✅ | | 邮件主题 |
| content | text | '' | | | 邮件内容（支持变量）|
| variables | jsonb | '[]' | ✅ | | 可用变量列表 |
| is_active | boolean | true | ✅ | | 是否启用 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 公告阅读统计需实时更新，支持去重计数
2. 活动预算使用需原子操作，防止超发
3. 邮件模板变量替换需验证变量存在性

### 接口层
#### API：GET `/admin/announcements`
**Request Schema**：
```json
{
  "page": 1,
  "limit": 50,
  "status": "published", // draft/published/expired
  "type": "maintenance",
  "include_stats": true // 包含阅读统计
}
```

#### API：POST `/admin/announcements`
**Request Schema**：
```json
{
  "title": "7月系统维护通知",
  "content": "<p>维护详情...</p>",
  "type": "maintenance",
  "priority": 1,
  "is_pinned": true,
  "target_users": ["all"],
  "scheduled_at": "2026-07-30T23:00:00Z",
  "expires_at": "2026-08-01T00:00:00Z"
}
```

#### API：GET `/admin/announcements/{id}/stats`
**Response Schema**：
```json
{
  "announcement": { /* 公告详情 */ },
  "stats": {
    "total_users": 12345,
    "read_count": 8901,
    "read_rate": "72.1%",
    "unread_users": [
      {"id": "u_1002", "nickname": "李四", "last_login": "2026-07-26T10:30:00Z"}
    ]
  }
}
```

#### API：POST `/admin/campaigns/{id}/approve`
**Request Schema**：
```json
{
  "action": "approve", // approve/reject
  "notes": "预算合理，规则清晰",
  "effective_immediately": true
}
```

#### API：POST `/admin/email-templates/{id}/test`
**Request Schema**：
```json
{
  "recipient": "test@example.com",
  "variables": {
    "username": "测试用户",
    "amount": "100.00",
    "balance": "234.50"
  }
}
```

#### 缓存策略
- 活动列表缓存1分钟（Redis key: `campaigns:active`）
- 公告列表缓存2分钟（Redis key: `announcements:published`）
- 邮件模板缓存10分钟（Redis key: `email_template:{scenario}`）

### 业务逻辑
**活动规则引擎**：
```python
class CampaignEngine:
    def check_eligibility(self, user_id, campaign):
        # 1. 检查活动状态
        if campaign.status != 'active':
            return False, "活动未开始或已结束"
        
        if campaign.start_at > now() or campaign.end_at < now():
            return False, "不在活动时间内"
        
        # 2. 检查目标用户
        if not self.check_target_users(user_id, campaign.target_users):
            return False, "不在目标用户范围内"
        
        # 3. 检查预算
        participation = CampaignParticipation.find(
            campaign_id=campaign.id,
            user_id=user_id
        )
        
        if participation:
            # 检查单人上限
            if campaign.budget_user_max and \
               participation.reward_total >= campaign.budget_user_max:
                return False, "已达到单人奖励上限"
            
            # 检查触发次数限制
            if campaign.rules.get('max_per_user') and \
               participation.trigger_count >= campaign.rules['max_per_user']:
                return False, "已达到单人触发上限"
        
        # 4. 检查总预算
        if campaign.budget_total and \
           campaign.budget_used >= campaign.budget_total:
            return False, "活动预算已用完"
        
        return True, ""
    
    def apply_campaign(self, user_id, campaign, trigger_data):
        # 1. 验证资格
        eligible, reason = self.check_eligibility(user_id, campaign)
        if not eligible:
            raise CampaignNotEligibleError(reason)
        
        # 2. 计算奖励（根据活动类型）
        reward = self.calculate_reward(campaign, trigger_data)
        
        # 3. 原子更新
        with db.transaction():
            # 更新活动预算
            if campaign.budget_total:
                if campaign.budget_used + reward > campaign.budget_total:
                    raise CampaignBudgetExhaustedError()
                campaign.update(budget_used=campaign.budget_used + reward)
            
            # 更新用户参与记录
            participation = CampaignParticipation.find_or_create(
                campaign_id=campaign.id,
                user_id=user_id
            )
            participation.update(
                trigger_count=participation.trigger_count + 1,
                reward_total=participation.reward_total + reward,
                last_triggered_at=now()
            )
            
            # 发放奖励
            if reward > 0:
                adjust_user_balance(user_id, reward, f"活动奖励: {campaign.name}", None)
            
            # 记录日志
            CampaignLog.create(
                campaign_id=campaign.id,
                user_id=user_id,
                trigger_data=trigger_data,
                reward=reward,
                created_at=now()
            )
        
        return reward
```

**邮件模板渲染**：
```python
def render_email_template(template_name, variables, user_id=None):
    template = EmailTemplate.find(name=template_name)
    if not template or not template.is_active:
        raise TemplateNotFoundError()
    
    # 验证变量
    available_vars = set(template.variables)
    provided_vars = set(variables.keys())
    
    missing = available_vars - provided_vars
    if missing:
        raise MissingTemplateVariablesError(f"缺少变量: {missing}")
    
    # 渲染内容
    content = template.content
    subject = template.subject
    
    for key, value in variables.items():
        placeholder = f"{{{{{key}}}}}"
        content = content.replace(placeholder, str(value))
        subject = subject.replace(placeholder, str(value))
    
    # 添加通用变量
    if user_id:
        user = User.find(id=user_id)
        content = content.replace("{{user_id}}", str(user_id))
        content = content.replace("{{user_nickname}}", user.nickname)
        subject = subject.replace("{{user_nickname}}", user.nickname)
    
    # 添加时间变量
    now_str = now().strftime("%Y-%m-%d %H:%M")
    content = content.replace("{{current_time}}", now_str)
    subject = subject.replace("{{current_time}}", now_str)
    
    return {
        "subject": subject,
        "content": content,
        "html_content": markdown_to_html(content) if template.is_html else content
    }
```

### 状态流转
**公告生命周期**：
```
draft → pending_review (提交审核) → approved (审核通过) → 
├── scheduled (定时发布) → published (已发布) → expired (已过期)
└── published (立即发布) → expired (已过期)
```

**活动状态迁移**：
```
draft → pending (提交审批) → approved (审批通过) → active (进行中) → 
├── paused (手动暂停) → active (恢复) → completed (结束)
└── completed (自动结束) → archived (已归档)
```

### 配置项
- `site_configs.announcement_approval_required`：公告是否需要审批（默认true）
- `site_configs.campaign_approval_workflow`：活动审批流程：single/multi/super_admin
- `site_configs.email_send_rate_limit`：邮件发送速率限制（默认5封/用户/天）

---

## 实时监控

### 数据层
#### 涉及表：`monitoring_metrics`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| metric | varchar(64) | | ✅ | PK | 指标名称 |
| timestamp | timestamptz | now() | ✅ | PK | 时间戳（分钟精度）|
| value | decimal(15,4) | | ✅ | | 指标值 |
| tags | jsonb | {} | ✅ | | 标签：{"vendor": "deepseek", "model": "deepseek-chat"} |
| created_at | timestamptz | now() | ✅ | | 创建时间 |

#### 涉及表：`alerts`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| alert_id | varchar(64) | | ✅ | UNIQUE | 告警ID：ALT-YYYYMMDD-xxxx |
| metric | varchar(64) | | ✅ | | 指标名称 |
| condition | jsonb | {} | ✅ | | 触发条件 |
| severity | varchar(16) | 'warning' | ✅ | | 严重等级：critical/warning/info |
| status | varchar(16) | 'firing' | ✅ | IDX_status | 状态：firing/resolved/silenced |
| starts_at | timestamptz | now() | ✅ | | 开始时间 |
| ends_at | timestamptz | NULL | | | 结束时间（解决时间）|
| labels | jsonb | {} | ✅ | | 标签 |
| annotations | jsonb | {} | ✅ | | 注释/描述 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`alert_rules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 规则名称 |
| metric | varchar(64) | | ✅ | | 指标名称 |
| condition | jsonb | {} | ✅ | | 条件配置 |
| for_duration | int | 300 | ✅ | | 持续时长（秒）|
| severity | varchar(16) | 'warning' | ✅ | | 严重等级 |
| labels | jsonb | {} | ✅ | | 标签 |
| annotations | jsonb | {} | ✅ | | 注释 |
| is_enabled | boolean | true | ✅ | | 是否启用 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`vendor_health_panels`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| vendor_id | int8 | | ✅ | FK_vendors_id | 供应商ID |
| panel_config | jsonb | {} | ✅ | | 面板配置 |
| refresh_interval | int | 30 | ✅ | | 刷新间隔（秒）|
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 监控指标每分钟聚合一次，保留30天
2. 告警状态变更需记录时间线
3. 供应商健康面板数据需实时更新

### 接口层
#### API：GET `/admin/monitoring/metrics`
**Request Schema**：
```json
{
  "metric": "api_response_time_p95",
  "start": "2026-07-27T11:00:00Z",
  "end": "2026-07-27T12:00:00Z",
  "step": "1m", // 1m/5m/1h
  "tags": {"vendor": "deepseek"}
}
```
**Response Schema**（Prometheus格式）：
```json
{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [
      {
        "metric": {"__name__": "api_response_time_p95", "vendor": "deepseek"},
        "values": [[1627387200, "187"], [1627387260, "192"], ...]
      }
    ]
  }
}
```

#### API：GET `/admin/monitoring/alerts`
**Request Schema**：
```json
{
  "status": "firing",
  "severity": "critical",
  "metric": "api_failure_rate"
}
```

#### API：POST `/admin/monitoring/alert-rules`
**Request Schema**：
```json
{
  "name": "高失败率告警",
  "metric": "api_failure_rate",
  "condition": {
    "operator": "gt",
    "threshold": 5.0, // 百分比
    "duration": "5m"  // 持续5分钟
  },
  "for_duration": 300,
  "severity": "critical",
  "labels": {"team": "sre", "service": "api"},
  "annotations": {
    "summary": "API失败率超过5%",
    "description": "最近5分钟API失败率{{$value}}%超过阈值5%",
    "runbook": "https://wiki/runbook/api-failure"
  },
  "is_enabled": true
}
```

#### API：GET `/admin/monitoring/vendor-health/{vendorId}`
**Response Schema**：
```json
{
  "vendor": { /* 供应商信息 */ },
  "current_status": "online",
  "availability_24h": "99.8%",
  "response_time": {
    "avg": 180,
    "p50": andline: 120,
    "p95": 350,
    "p99": 890
  },
  "today_metrics": {
    "calls": 12345,
    "tokens": 56789012,
    "cost": "2345.67",
    "success_rate": "99.2%"
  },
  "health_timeline": [
    {"time": "12:00", "status": "online", "response_time": 145},
    {"time": "12:01", "status": "online", "response_time": 156},
    // ...
  ]
}
```

#### 缓存策略
- 监控指标查询缓存30秒（Redis key: `metrics:{query_hash}`）
- 告警规则缓存1分钟（Redis key: `alert_rules:enabled`）
- 供应商健康状态缓存15秒（Redis key: `vendor:{id}:health:realtime`）

### 业务逻辑
**告警引擎**：
```python
class AlertManager:
    def __init__(self):
        self.rules = self.load_rules()
    
    def evaluate_metrics(self):
        for rule in self.rules:
            if not rule.is_enabled:
                continue
            
            # 查询指标
            result = query_metric(
                metric=rule.metric,
                start=now() - timedelta(seconds=rule.for_duration),
                end=now(),
                step='1m'
            )
            
            # 评估条件
            triggered = self.evaluate_condition(result, rule.condition)
            
            if triggered:
                # 检查是否已有相同告警
                existing = Alert.filter(
                    metric=rule.metric,
                    status='firing',
                    labels=rule.labels
                ).first()
                
                if not existing:
                    # 创建新告警
                    alert = Alert.create(
                        alert_id=f"ALT-{now().strftime('%Y%m%d')}-{uuid4()[:8]}",
                        metric=rule.metric,
                        condition=rule.condition,
                        severity=rule.severity,
                        status='firing',
                        starts_at=now(),
                        labels=rule.labels,
                        annotations=rule.annotations
                    )
                    
                    # 发送通知
                    self.send_notification(alert, rule)
            else:
                # 解决已存在告警
                existing = Alert.filter(
                    metric=rule.metric,
                    status='firing',
                    labels=rule.labels
                ).first()
                
                if existing:
                    existing.update(
                        status='resolved',
                        ends_at=now(),
                        updated_at=now()
                    )
                    
                    # 发送解决通知
                    self.send_resolution_notification(existing)
    
    def evaluate_condition(self, result, condition):
        # 提取时间序列值
        values = [float(v[1]) for v in result['values']]
        
        if condition.operator == 'gt':
            # 检查是否持续超过阈值
            threshold = float(condition.threshold)
            duration = parse_duration(condition.duration)
            
            # 计算连续超过阈值的点数
            over_threshold = 0
            for value in values:
                if value > threshold:
                    over_threshold += 1
                else:
                    over_threshold = 0
                
                if over_threshold >= duration // 60:  # 转换为分钟数
                    return True
        
        elif condition.operator == 'lt':
            # 类似处理低于阈值的情况
            pass
        
        elif condition.operator == 'increase':
            # 检查增长率
            pass
        
        return False
```

**供应商健康评分计算**：
```python
def calculate_vendor_health_score(vendor_id):
    # 获取24小时数据
    stats_24h = VendorHealthStat.filter(
        vendor_id=vendor_id,
        timestamp >= now() - timedelta(hours=24)
    ).all()
    
    if not stats_24h:
        return 0
    
    # 1. 可用率得分（权重70%）
    success_count = sum(1 for s in stats_24h if s.success)
    availability = success_count / len(stats_24h) * 100
    
    # 2. 响应时间得分（权重30%）
    avg_response_time = sum(s.response_time for s in stats_24h) / len(stats_24h)
    
    # 基准响应时间200ms
    response_time_score = max(0, 100 * (1 - avg_response_time / 200))
    
    # 3. 综合得分
    health_score = availability * 0.7 + response_time_score * 0.3
    
    # 4. 附加扣分项
    # - 最近5分钟有失败：-5分
    recent_failures = sum(1 for s in stats_24h[-5:] if not s.success)
    if recent_failures >047.00:
        health_score -= 5
    
    # - 响应时间突增：-10分
    if len(stats_24h) >= 10:
        last_10_avg = sum(s.response_time for s in stats_24h[-10:]) / 10
        prev_10_avg = sum(s.response_time for s in stats_24h[-20:-10]) / 10
        if last_10_avg > prev_10_avg * 2:
            health_score -= 10
    
    return max(0, min(100, health_score))
```

### 状态流转
**告警生命周期**：
```
指标异常 → 评估规则 → 触发告警(status=firing) → 
├── 发送通知 → 人工处理 → 标记解决(status=resolved)
└── 指标恢复 → 自动解决(status=resolved) → 发送解决通知
```

**监控面板更新流程**：
```
数据收集器 → 写入monitoring_metrics → 
定时任务（每分钟）→ 聚合计算 → 更新vendor_health_panels → 
前端WebSocket推送 → 实时展示
```

### 配置项
- `site_configs.monitoring_retention_days`：监控数据保留天数（默认30）
- `site_configs.alert_notification_channels`：告警通知渠道：站内/邮件/钉钉/webhook
- `site_configs.vendor_health_score_thresholds`：健康评分阈值：{"critical": 60, "warning": 80}

---

## 数据报表

### 数据层
#### 涉及表：`reports`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| report_id | varchar(64) | | ✅ | UNIQUE | 报告ID：RPT-YYYYMMDD-xxxx |
| name | varchar(128) | | ✅ | | 报告名称 |
| type | varchar(32) | 'custom' | ✅ | | 类型：daily/weekly/monthly/custom/ad_hoc |
| config | jsonb | {} | ✅ | | 报告配置 |
| data_source | varchar(32) | 'call_logs' | ✅ | | 数据源：call_logs/users/finance/security |
| filters | jsonb | {} | ✅ | | 筛选条件 |
| dimensions | jsonb | '[]' | ✅ | | 分析维度 |
| metrics | jsonb | '[]' | ✅ | | 计算指标 |
| status | varchar(16) | 'pending' | ✅ | IDX_status | 状态：pending/generating/completed/failed |
| file_url | varchar(256) | NULL | | | 报告文件URL |
| generated_at | timestamptz | NULL | | | 生成时间 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`report_schedules`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| schedule_id | varchar(64) | | ✅ | UNIQUE | 调度ID |
| report_id | int8 | | ✅ | FK_reports_id | 报告ID |
| frequency | varchar(16) | 'daily' | ✅ | | 频率：daily/weekly/monthly/custom |
| cron_expression | varchar(64) | NULL | | | Cron表达式 |
| recipients | jsonb | '[]' | ✅ | | 接收人列表 |
| format | varchar(16) | 'pdf' | ✅ | | 格式：pdf/excel/csv/html |
| is_active | boolean | true | ✅ | | 是否激活 |
| last_run_at | timestamptz | NULL | | | 最后运行时间 |
| next_run_at | timestamptz | | ✅ | | 下次运行时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`ab_tests`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| test_id | varchar(64) | | ✅ | UNIQUE | 测试ID：ABT-YYYYMMDD-xxxx |
| name | varchar(128) | | ✅ | | 测试名称 |
| description | text | '' | | | 测试描述 |
| hypothesis | text | '' | | | 假设 |
| groups | jsonb | {} | ✅ | | 分组配置 |
| metrics | jsonb | '[]' | ✅ | | 观测指标 |
| start_at | timestamptz | | ✅ | | 开始时间 |
| end_at | timestamptz | | ✅ | | 结束时间 |
| status | varchar(16) | 'draft' | ✅ | | 状态：draft/running/paused/completed |
| results | jsonb | NULL | | | 测试结果 |
| created_by | int8 | NULL | | | 创建人ID |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. 报告生成需确保数据一致性（使用事务或数据快照）
2. A/B测试分组分配需保证用户始终在同一组
3. 定时报告失败需重试并通知

### 接口层
#### API：POST `/admin/reports/generate`
**Request Schema**：
```json
{
  "name": "7月模型调用分析",
  "data_source": "call_logs",
  "filters": {
    "date_range": {"from": "2026-07-01", "to": "2026-07-31"},
    "models": ["deepseek-chat", "gpt-4o"]
  },
  "dimensions": ["model", "date"],
  "metrics": [
    {"name": "call_count", "aggregation": "count"},
    {"name": "token_consumption", "field": "total_tokens", "aggregation": "sum"},
    {"name": "revenue", "field": "cost", "aggregation": "sum"}
  ],
  "format": "excel",
  "include_charts": true
}
```
**Response Schema**：
```json
{
  "report_id": "RPT-20260727-001",
  "status": "generating",
  "estimated_time": "30秒",
  "download_url": null // 生成后才有
}
```

#### API：POST `/admin/reports/{reportId}/schedule`
**Request Schema**：
```json
{
  "frequency": "weekly",
  "cron_expression": "0 9 * * 1", // 每周一9点
  "recipients": ["admin@3cloud.ai", "zhangsan@example.com"],
  "format": "pdf",
  "is_active": true
}
```

#### API：POST `/admin/ab-tests`
**Request Schema**：
```json
{
  "name": "定价弹性测试 - deepseek-chat",
  "description": "测试不同定价对用户调用量的影响",
  "hypothesis": "降价15%将提升调用量20%以上",
  "groups": {
    "A": {"name": "对照组", "pricing": "standard", "traffic_percent": 50},
    "B": {"name": "实验组", "pricing": "discounted_15", "traffic_percent": 50}
  },
  "metrics": [
    {"name": "daily_calls", "calculation": "sum(call_logs)"},
    {"name": "revenue", "calculation": "sum(cost)"},
    {"name": "user_retention", "calculation": "7_day_retention_rate"}
  ],
  "start_at": "2026-07-20T00:00:00Z",
  "end_at": "2026-08-20T00:00:00Z"
}
```

#### API：GET `/admin/ab-tests/{testId}/results`
**Response Schema**：
```json
{
  "test": { /* 测试配置 */ },
  "results": {
    "duration": "7天",
    "data_sufficiency": "73%",
    "group_comparisons": [
      {
        "group": "A (对照组)",
        "metrics": {
          "daily_calls": {"value": 12340, "confidence_interval": [11800, 12900]},
          "revenue": {"value": 246.80, "confidence_interval": [235.00,点258.00]}
        }
      },
      {
        "group": "B (实验组)",
        "metrics": {
          "daily_calls": {"value": 15678, "change_percent": "+27.1%", "p_value": 0.003},
          "revenue": {"value": 266.53, "change_percent": "+8.0%", "p_value": 0.12}
        }
      }
    ],
    "conclusion": "降价15%显著提升调用量(27%)，但收入增长不显著(8%)",
    "recommendation": "建议调整降价幅度为10%做第二轮实验"
  }
}
```

#### 缓存策略
- 报告配置缓存5分钟（Redis key: `report:{id}:config`）
- A/B测试分组分配缓存用户会话（Redis key: `ab_test:{test_id}:user:{user_id}`）
- 报表数据缓存10分钟（Redis key: `report_data:{hash}`）

### 业务逻辑
**报表数据聚合**：
```python
class ReportGenerator:
    def generate_report(self, report_config):
        # 1. 解析配置
        data_source = report_config.data_source
        filters = report_config.filters
        dimensions = report_config.dimensions
        metrics = report_config.metrics
        
        # 2. 构建查询
        query = self.build_query(data_source, filters, dimensions, metrics)
        
        # 3. 执行查询
        raw_data = self.execute_query(query)
        
        # 4. 数据转换
        processed_data = self.process_data(raw_data, dimensions, metrics)
        
        # 5. 生成输出
        if report_config.format == 'excel':
            output = self.generate_excel(processed_data, report_config)
        elif report_config.format == 'pdf':
            output = self.generate_pdf(processed_data, report_config)
        elif report_config.format == 'csv':
            output = self.generate_csv(processed_data)
        else:
            output = self.generate_html(processed_data, report_config)
        
        # 6. 存储文件
        file_url = self.store_output(output, report_config)
        
        return file_url
    
    def build_query(self, data_source, filters, dimensions, metrics):
        # 根据数据源选择基础表
        if data_source == 'call_logs':
            base_table = 'call_logs'
            join_tables = ['models', 'vendors']
        elif data_source == 'users':
            base_table = 'users'
            join_tables = []
        elif data_source == 'finance':
            base_table = 'consumption_logs'
            join_tables = ['users', 'models']
        
        # 构建SELECT子句
        select_fields = []
        
        # 维度字段
        for dim in dimensions:
            if dim == 'date':
                select_fields.append("DATE(created_at) as date")
            elif dim == 'hour':
                select_fields.append("EXTRACT(HOUR FROM created_at) as hour")
            else:
                select_fields.append(dim)
        
        # 指标字段
        for metric in metrics:
            if metric.aggregation == 'count':
                select_fields.append(f"COUNT(*) as {metric.name}")
            elif metric.aggregation == 'sum':
                select_fields.append(f"SUM({metric.field}) as {metric.name}")
            elif metric.aggregation == 'avg':
                select_fields.append(f"AVG({metric.field}) as {metric.name}")
        
        # 构建WHERE子句
        where_conditions = []
        for key, value in filters.items():
            if key == 'date_range':
                where_conditions.append(f"created_at BETWEEN '{value.from}' AND '{value.to}'")
            elif key == 'models':
                models_str = ','.join(f"'{m}'" for m in value)
                where_conditions.append(f"model IN ({models_str})")
            # ... 其他过滤条件
        
        # 构建GROUP BY
        group_by_fields = dimensions
        
        # 组合SQL
        sql = f"""
        SELECT {', '.join(select_fields)}
        FROM {base_table}
        {' '.join(f'LEFT JOIN {t} ON ...' for t in join_tables)}
        WHERE {' AND '.join(where_conditions)}
        GROUP BY {', '.join(group_by_fields)}
        ORDER BY {', '.join(dimensions[:1])}
        """
        
        return sql
```

**A/B测试分组分配**：
```python
class ABTestManager:
    def assign_group(self, user_id, test_id):
        # 使用一致性哈希确保用户始终在同一组
        hash_input = f"{test_id}:{user_id}"
        hash_value = hashlib.md5(hash_input.encode()).hexdigest()
        hash_int = int(hash_value[:8], 16)
        
        test = ABTest.find(test_id)
        groups = test.groups
        
        # 按流量百分比分配
        total_percent = sum(g['traffic_percent'] for g in groups.values())
        cumulative = 0
        
        for group_id, group_config in groups.items():
            group_percent = group_config['traffic_percent']
            threshold = (cumulative + group_percent) / total_percent * 100
            
            if hash_int % 100 < threshold:
                return group_id
            
            cumulative += group_percent
        
        # 默认返回第一个组
        return list(groups.keys())[0]
    
    def analyze_results(self, test_id):
        test = ABTest.find(test_id)
        groups = test.groups
        
        results = {}
        
        for group_id in groups.keys():
            # 获取该组用户的数据
            group_users = self.get_group_users(test_id, group_id)
            
            group_results = {}
            for metric_config in test.metrics:
                metric_name = metric_config.name
                calculation = metric_config.calculation
                
                # 计算指标值
                if calculation == 'sum(call_logs)':
                    value = CallLog.filter(
                        user_id.in_(group_users),
                        created_at.between(test.start_at, test.end_at)
                    ).count()
                elif calculation == 'sum(cost)':
                    value = ConsumptionLog.filter(
                        user_id.in_(group_users),
                        created_at.between(test.start_at, test.end_at)
                    ).sum('cost')
                elif calculation == '7_day_retention_rate':
                    value = self.calculate_retention(group_users, test.start_at)
                
                # 计算置信区间（简化版）
                # 实际需要更复杂的统计计算
                confidence_interval = self.calculate_confidence_interval(value, group_users)
                
                group_results[metric_name] = {
                    'value': value,
                    'confidence_interval': confidence_interval
                }
            
            results[group_id] = group_results
        
        # 计算组间差异
        control_group = test.groups['A']  # 假设A为对照组
        for group_id, group_results in results.items():
            if group_id == 'A':
                continue
            
            for metric_name, metric_value in group_results.items():
                control_value = results['A'][metric_name]['value']
                
                if control_value > 0:
                    change_percent = (metric_value['value'] - control_value) / control_value * 100
                    
                    # 计算p值（简化）
                    p_value = self.calculate_p_value(
                        metric_value['value'], control_value,
                        len(self.get_group_users(test_id, group_id)),
                        len(self.get_group_users(test_id, 'A'))
                    )
                    
                    metric_value['change_percent'] = round(change_percent, 1)
                    metric_value['p_value'] = round(p_value, 3)
        
        return results
```

### 状态流转
**报告生成流程**：
```
创建配置 → 验证配置 → 提交生成任务 → 后台执行 → 
数据查询 → 数据处理 → 格式转换 → 文件存储 → 
更新状态为completed → 通知创建人
```

**A/B测试生命周期**：
```
draft → 配置分组 → 启动(running) → 数据收集 → 
├── 手动暂停(paused) → 恢复(running)
└── 到达结束时间 → 自动分析 → 生成结果(completed) → 归档
```

### 配置项
- `site_configs.report_max_data_points`：报表最大数据点数量（默认10000）
- `site_configs.ab_test_min_sample_size`：A/B测试最小样本量（默认100）
- `site_configs.report_generation_timeout`：报告生成超时时间（默认300秒）

---

## Key管理

### 数据层
#### 涉及表：`api_keys`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| key_hash | varchar(64) | | ✅ | UNIQUE | Key哈希值（SHA-256）|
| user_id | int8 | | ✅ | FK_users_id + IDX_user_id | 所属用户ID |
| alias | varchar(50) | | ✅ | | 别名 |
| key_group_id | int8 | NULL | | FK_key_groups_id | 所属Key组ID |
| permissions | jsonb | '{"models": ["all"], "operations": ["all"]}' | ✅ | | 权限配置 |
| ip_whitelist | text | NULL | | | IP白名单（每行一个）|
| expires_at | timestamptz | NULL | | | 过期时间 |
| status | varchar(16) | 'active' | ✅ | IDX_status | 状态：active/disabled/expired |
| total_calls | int | 0 | ✅ | | 总调用次数 |
| total_tokens | bigint | 0 | ✅ | | 总Token消耗 |
| last_used_at | timestamptz | NULL | | | 最后使用时间 |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`key_groups`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| name | varchar(64) | | ✅ | UNIQUE | 组名 |
| vendor_id | int8 | | ✅ | FK_vendors_id | 所属供应商ID |
| description | text | '' | | | 组描述 |
| weight | int | 50 | ✅ | | 流量权重 |
| pricing_config | jsonb | NULL | | | 定价配置（覆盖全局）|
| status | varchar(16) | 'active' | ✅ | | 状态：active/disabled |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 涉及表：`key_group_members`
| 字段名 | 类型 | 默认值 | NOT NULL | 索引 | 约束说明 |
|--------|------|--------|----------|------|----------|
| group_id | int8 | | ✅ | FK_key_groups_id | Key组ID |
| api_key | varchar(256) | | ✅ | | API Key明文（加密存储）|
| key_hash | varchar(64) | | ✅ | UNIQUE | Key哈希 |
| weight | int | 50 | ✅ | | 组内权重 |
| status | varchar(16) | 'active' | ✅ | | 状态：active/disabled/circuit_broken |
| today_calls | int | 0 | ✅ | | 今日调用次数 |
| last_health_check | timestamptz | NULL | | | 最后健康检查时间 |
| health_status | varchar(16) | 'unknown' | ✅ | | 健康状态：healthy/unhealthy/unknown |
| created_at | timestamptz | now() | ✅ | | 创建时间 |
| updated_at | timestamptz | now() | ✅ | | 更新时间 |

#### 数据一致性要求
1. API Key明文只在创建时返回，存储时只保存哈希值
2. Key组成员健康状态需定时更新
3. Key组权重变化时需重新计算路由概率

### 接口层
#### API：GET `/admin/key-groups`
**Request Schema**：`?vendor_id=1&include_members=true`
**Response Schema**：
```json
{
  "groups": [
    {
      "id": 1,
      "name": "高优先级组",
      "vendor": "DeepSeek",
      "weight": 3,
      "member_count": 5,
      "healthy_members": 4,
      "today_calls": 12345,
      "status": "active"
    }
  ]
}
```

#### API：POST `/admin/key-groups/{groupId}/members`
**Request Schema**：
```json
{
  "api_key": "sk-xxxxxxxxxxxxxxxx",
  "weight": 5,
  "test_connectivity": true
}
```

#### API：POST `/admin/key-groups/{groupId}/health-check`
**Request Schema**：无
**Response Schema**：
```json
{
  "results": [
    {
      "member_id": 1,
      "api_key": "sk-xxx****xxx",
      "status": "success",
      "response_time": 45,
      "error": null
    },
    {
      "member_id": 2,
      "api_key": "sk-yyy****yyy",
      "status": "failed",
      "response_time": 0,
      "error": "Connection timeout"
    }
  ],
  "summary": {
    "total": 5,
    "healthy": 4,
    "unhealthy": 1,
    "avg_response_time": Plantory line: 67
  }
}
```

#### API：POST `/admin/key-groups/{groupId}/rebalance`
**Request Schema**：
```json
{
  "strategy": "equalize_load", // equalize_load/prioritize_fast/round_robin
  "parameters": {"max_calls_per_key": 1000}
}
```

#### 缓存策略
- Key组列表缓存2分钟（Redis key: `key_groups:{vendor_id}`）
- Key组成员状态缓存30秒（Redis key: `key_group:{id}:members`）
- Key路由权重缓存5分钟（Redis key: `routing_weights:{vendor}:{model}`）

### 业务逻辑
**Key组路由算法**：
```python
class KeyGroupRouter:
    def select_key(self, vendor_id, model):
        # 1. 获取该供应商的所有活跃Key组
        groups = KeyGroup.filter(
            vendor_id=vendor_id,
            status='active'
        ).order_by('-weight')
        
        if not groups:
            raise NoAvailableKeyGroupError()
        
        # 2. 按权重选择Key组
        total_weight = sum(g.weight for g in groups)
        if total_weight <= 0:
            selected_group = groups[0]
        else:
            rand_val = random.random() * total_weight
            cumulative = 0
            for group in groups:
                cumulative += group.weight
                if rand_val <= cumulative:
                    selected_group = group
                    break
            else:
                selected_group = groups[-1]
        
        # 3. 在组内选择Key
        members = KeyGroupMember.filter(
            group_id=selected_group.id,
            status='active',
            health_status='healthy'
        ).all()
        
        if not members:
            # 无健康成员，尝试不健康成员
            members = KeyGroupMember.filter(
                group_id=selected_group.id,
                status='active'
            ).all()
        
        if not members:
            raise NoAvailableKeyError()
        
        # 4. 加权选择成员
        member_weights = [m.weight for m in members]
        total_member_weight = sum(member_weights)
        
        if total_member_weight <= 0:
            selected_member = members[0]
        else:
            rand_val = random.random() * total_member_weight
            cumulative = 0
            for i, member in enumerate(members):
                cumulative += member_weights[i]
                if rand_val <= cumulative:
                    selected_member = member
                    break
            else:
                selected_member = members[-1]
        
        # 5. 解密Key
        decrypted_key = decrypt(selected_member.api_key)
        
        # 6. 更新使用统计
        selected_member.update(
            today_calls=selected_member.today_calls + 1,
            updated_at=now()
        )
        
        return decrypted_key, selected_group.id, selected_member.id
```

**Key健康检查**：
```python
def check_key_health(member):
    try:
        # 1. 解密Key
        api_key = decrypt(member.api_key)
        
        # 2. 发送测试请求
        start = time.time()
        response = requests.get(
            f"{member.group.vendor.api_base_url}/health",
            headers={
                member.group.vendor.auth_header: 
                member.group.vendor.auth_header_format.format(key=api_key)
            },
            timeout=5
        )
        elapsed = int((time.time() - start) * 1000)
        
        # 3. 判断结果
        success = (
            response.status_code == 200 and
            member.group.vendor.health_check_expectation in response.text
        )
        
        # 4. 更新状态
        new_status = 'healthy' if success else 'unhealthy'
        member.update(
            health_status=new_status,
            last_health_check=now(),
            updated_at=now()
        )
        
        # 5. 熔断处理
        if not success:
            failure_count = increment_failure_count(member.id)
            if failure_count >= 3:  # 连续3次失败
                member.update(status='circuit_broken')
                notify_admins(f"Key熔断: {member.api_key[:10]}...")
        
        return success, elapsed, response.text[:100]
    except Exception as e:\n        member.update(\n            health_status='unhealthy',\n            last_health_check=now()\n        )\n        return False, 0, str(e)\n```\n\n### 状态流转
**Key组成员状态迁移**：
```
active → unhealthy (健康检查失败) → 
├── healthy (恢复成功) → active
├── circuit_broken (连续失败) → 
│   ├── active (手动恢复)
│   └── disabled (永久禁用)
└── disabled (手动禁用)
```

**Key组负载均衡流程**：
```
定时任务（每小时）→ 分析各Key调用量 → 
计算不均衡度 → 超过阈值 → 自动调整权重 → 
更新路由配置 → 清除缓存
```

### 配置项
- `site_configs.key_health_check_interval`：Key健康检查间隔（默认60秒）
- `site_configs.key_circuit_breaker_threshold`：Key熔断阈值（默认3次）
- `site_configs.key_group_rebalance_threshold`：负载不均衡阈值（默认30%）
