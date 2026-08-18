# 3cloud 数据字典（Data Dictionary）

> **最后更新**：2026-08-12
> **版本**：v1.0
> **定位**：面向产品/运营/开发的字段定义文档，涵盖核心表结构的**业务含义**、**枚举值**、**业务规则**和**关联关系**。
> 技术实现细节（数据类型、索引、外键）请参考 Drizzle schema 文件（`api/src/db/schema/`）。

---

## 一、枚举值定义

### 1.1 用户状态

| 枚举值 | 显示名称 | 含义 | 可操作 |
|-------|---------|------|--------|
| `pending` | 待激活 | 注册后未验证邮箱 | 登录返回 403（需验证邮箱）|
| `active` | 正常 | 已验证邮箱，可正常使用 | 全部功能 |
| `disabled` | 已禁用 | 管理员手动禁用，原因在 `disabled_reason` | 可登录查看余额，不可请求 API |
| `deleted` | 已注销 | 用户主动注销，软删除 | 不可登录，不可重新注册同名邮箱 |

### 1.2 实名状态

| 枚举值 | 显示名称 | 含义 | 是否可调度 API |
|-------|---------|------|--------------|
| `unverified` | 未实名 | 未提交实名信息 | ❌ 不可调度 |
| `pending_review` | 审核中 | 已提交实名信息，等待审核 | ❌ 不可调度 |
| `approved` | 已实名 | 审核通过 | ✅ 可调度 |
| `rejected` | 未通过 | 审核拒绝，可重新提交 | ❌ 不可调度 |

### 1.3 用户角色

| 枚举值 | 显示名称 | 等级 | 说明 |
|-------|---------|------|------|
| `super_admin` | 超级管理员 | L5 | 全部权限，不可被管理 |
| `admin` | 管理员 | L4 | 除财务放款/系统密钥外的全部管理权限 |
| `finance_ops` | 财务专员 | L4 | 财务数据查看、充值审核、提现审核 |
| `ops` | 运维工程师 | L4 | 配置管理、模型管理、日志查看 |
| `support` | 客服/审核 | L4 | 用户管理（不含删除/改角色）、实名审核 |
| `auditor` | 审计员 | L4 | 日志只读、审计查看 |
| `agent` | 代理商 | L3 | 名下用户管理、分佣数据、提现 |
| `user` | 普通用户 | L2 | 基础用户功能 |

### 1.4 用户类型

| 枚举值 | 说明 |
|-------|------|
| `personal` | 个人用户 |
| `enterprise` | 企业用户 |

### 1.5 供应商状态

| 枚举值 | 含义 | 路由影响 |
|-------|------|---------|
| `pending` | 注册待审核 | 不入选路由 |
| `active` | 正常运营 | ✅ 正常入选路由 |
| `down` | 宕机（被动检测） | ❌ 自动排除 |
| `degraded` | 降级 | ⚠️ 降低权重 |
| `disabled` | 手动禁用 | ❌ 永久排除 |
| `rejected` | 审核未通过 | ❌ 不入选路由 |

### 1.6 模型类型

| 枚举值 | 显示名称 | 说明 |
|-------|---------|------|
| `chat` | 对话 | 文本对话模型 |
| `embedding` | 嵌入 | 向量嵌入模型 |
| `image` | 图像 | 图像生成/处理 |
| `audio` | 音频 | 语音识别/合成 |
| `rerank` | 重排序 | 搜索结果重排序 |
| `video` | 视频 | 视频生成 |
| `moderation` | 审核 | 内容安全审核 |
| `realtime` | 实时 | 实时语音 |

### 1.7 调用状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `success` | 成功 | 正常返回 |
| `failed` | 失败 | 供应商返回错误 |
| `timeout` | 超时 | 超过超时时间无响应 |
| `cancelled` | 取消 | 请求中途取消 |
| `rate_limited` | 被限流 | 命中限流规则 |

### 1.8 订单状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `pending` | 待支付 | 用户提交订单但未完成支付 |
| `paid` | 已支付 | 支付成功，余额已到账 |
| `cancelled` | 已取消 | 用户取消或超时取消 |
| `confirmed` | 已确认 | 对公转账人工确认 |
| `refunded` | 已退款 | 已退款处理 |

### 1.9 支付渠道

| 枚举值 | 显示名称 | 说明 |
|-------|---------|------|
| `wechat_scan` | 微信扫码 | 电脑端微信扫码 |
| `wechat_jsapi` | 微信 JSAPI | 微信内支付 |
| `alipay_scan` | 支付宝扫码 | 电脑端支付宝扫码 |
| `alipay_jsapi` | 支付宝 JSAPI | 手机端支付宝 |
| `bank_transfer` | 对公转账 | 大额/企业支付 |

### 1.10 余额变动类型

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `recharge` | 充值 | 用户主动充值 |
| `consumption` | 消费 | API 调用扣费 |
| `refund` | 退款 | 退款退回 |
| `trial_grant` | 试用赠送 | 新用户注册赠送 |
| `admin_adjust` | 管理员调整 | 运营手动调整 |
| `negative_repay` | 负额偿还 | 欠费后补缴 |
| `redemption_prepay` | 兑换码充值 | 使用兑换码充值 |
| `redemption_refund` | 兑换码退款 | 兑换码退款 |

### 1.11 代理商等级

| 枚举值 | 显示名称 | 晋升条件 | 佣金率范围 | 客户数上限 | 状态（后台主导版） |
|-------|---------|---------|-----------|-----------|------|
| `preparatory` | 预备代理 | ~~注册即自动获得~~ **后台「设为代理商」** | 10% | 5 | 无自助获得 |
| `primary` | 一级代理 | ~~月消费 ≥ ¥10,000 或客户 ≥ 20~~ **后台设定** | 15-25% | 100 | 等级仅后台可调 |
| `advanced` | 高级代理 | ~~月消费 ≥ ¥100,000 或客户 ≥ 200~~ **后台设定** | 25-40% | 不限 | 等级仅后台可调 |
| ~~`sub`~~ | ~~子代理~~ | ~~隶属于一级代理~~ | ~~由一级代理配置~~ | ~~受一级代理限制~~ | **已移除（D1：单级分销）** |

> 注：依据 [`PRD-代理商体系-后台主导版.md`](PRD-代理商体系-后台主导版.md)（D1/D2），代理商身份由后台「设为代理商」创建（等级+佣金档位），**无注册/升级入口**；无子代理层级。

### 1.12 提现状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `pending_first_review` | 待初审 | 代理提交申请，等待财务初审 |
| `pending_second_review` | 待复审 | 初审通过，等待财务复审 |
| `approved` | 审核通过 | 双审通过，准备打款 |
| `rejected` | 已拒绝 | 审核拒绝，金额已解冻 |
| `paid` | 已打款 | 打款成功，流程完成 |

### 1.13 佣金状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `pending` | 待结算 | 佣金已记录但未结算 |
| `settled` | 已结算 | 已完成结算周期 |
| `cancelled` | 已取消 | 佣金取消（退款/冲正） |

### 1.14 熔断器状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `closed` | 关闭 | 正常状态，请求正常转发 |
| `half_open` | 半开 | 恢复中，允许少量请求测试 |
| `open` | 打开 | 熔断触发，请求被拒绝 |
| `dead` | 永久关闭 | 多次熔断后永久禁用 |

### 1.15 兑换码状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `unused` | 未使用 | 可用状态 |
| `used` | 已使用 | 已被兑换 |
| `expired` | 已过期 | 超过有效期 |
| `revoked` | 已撤销 | 管理员手动失效 |

### 1.16 活动状态

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `draft` | 草稿 | 编辑中，未发布 |
| `active` | 进行中 | 已发布，用户可参与 |
| `ended` | 已结束 | 超过结束时间 |
| `archived` | 已归档 | 运营标记归档 |

### 1.17 安全事件类型

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `brute_force` | 暴力破解 | 连续登录失败 |
| `unusual_location` | 异常登录 | 非常用登录地 |
| `new_device` | 新设备 | 从未使用过的设备 |
| `ip_banned` | IP 封禁 | 命中黑名单规则 |
| `user_banned` | 用户封禁 | 用户被禁用 |
| `user_captcha` | 验证码触发 | 要求验证码 |
| `circuit_trip` | 熔断触发 | 供应商熔断 |
| `circuit_recovery` | 熔断恢复 | 供应商恢复 |
| `vendor_failure` | 供应商失败 | 供应商连续失败 |
| `test_alert` | 测试告警 | 系统测试告警 |

### 1.18 通知类型

| 枚举值 | 含义 | 接收方 |
|-------|------|--------|
| `real_name_approved` | 实名通过 | 申请用户 |
| `real_name_rejected` | 实名拒绝 | 申请用户 |
| `system` | 系统通知 | 全部用户 |
| `login_alert` | 登录提醒 | 用户 |
| `account_banned` | 账户封禁 | 用户 |
| `balance_low` | 余额不足 | 用户 |
| `quota_warning` | 配额预警 | 用户 |
| `quota_exceeded` | 配额超限 | 用户 |
| `withdraw_result` | 提现结果 | 代理商 |
| `commission_settled` | 佣金结算 | 代理商 |
| `agent_client_event` | 客户事件 | 代理商 |
| `new_model` | 新模型上线 | 全部用户 |
| `system_announcement` | 系统公告 | 全部用户 |
| `redemption_success` | 兑换成功 | 用户 |
| `redemption_used` | 兑换码被使用 | 兑换码创建者 |
| `redemption_expiring` | 兑换码即将过期 | 兑换码持有者 |
| `redemption_fraud` | 兑换码异常 | 管理员 |
| `redemption_revoked` | 兑换码被撤销 | 兑换码持有者 |
| `api_key_event` | API Key 事件 | 用户 |

### 1.19 留痕状态（conversation_context_records）

| 枚举值 | 含义 | 说明 |
|-------|------|------|
| `succeeded` | 成功 | 请求正常完成，有响应 |
| `failed` | 失败 | 上游错误 / 超时 / 余额不足，error_code 记录具体原因 |

> 留痕覆盖 6 个请求出口：mock 流式 / mock 非流式 / 上游错误 / 流式 / 非流式 / 402，失败也落一条（供纠纷举证）。详情见 [`ref-12.9-conversation-records.md`](ref-12.9-conversation-records.md)。

---

## 二、核心表字段说明

### 2.1 users（用户表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 用户唯一标识 | 自增整数，系统内部使用 | api_keys.user_id, call_logs.user_id 等 |
| `email` | 用户邮箱 | 唯一不可重复，注册/登录标识 | 用于登录、通知 |
| `password_hash` | 密码哈希 | bcrypt 加密，不可逆 | 敏感字段，不可展示 |
| `nickname` | 用户昵称 | 可选，前端展示用 | — |
| `user_type` | 个人/企业 | 枚举：personal / enterprise | 决定发票类型 |
| `role` | 用户角色 | 枚举，见 §1.3 | 权限判定依据 |
| `status` | 用户状态 | 枚举，见 §1.1 | 登录/API 鉴权控制 |
| `balance` | 可用余额 | 精度 18.6，单位 ¥ | 消费时扣减 |
| `discount_rate` | 折扣率 | 范围 0-1，默认 1.0（无折扣）| 计费计算时乘以此值 |
| `real_name_status` | 实名状态 | 枚举，见 §1.2 | 未实名不可调度 API |
| `real_name` | 真实姓名 | 实名认证时填写 | 发票用 |
| `id_number` | 身份证号 | 实名认证，加密存储 | 敏感字段 |
| `company_name` | 企业名称 | 企业认证时填写 | 发票用 |
| `two_factor_enabled` | 是否开启 2FA | 布尔值 | 登录时额外验证 |
| `theme` | 主题偏好 | light / dark / system | 前端渲染 |
| `last_login_at` | 最后登录时间 | 更新策略：每次登录时更新 | 安全监控 |
| `created_at` | 注册时间 | 自动设置 | 数据分析 |
| `deleted_at` | 注销时间 | 软删除，非 NULL 表示已注销 | 数据保留合规 |

### 2.2 call_logs（调用日志，分区表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 日志唯一标识 | 自增，与 created_at 组成复合主键 | — |
| `user_id` | 调用用户 | NOT NULL | users.id |
| `api_key_id` | 使用的 API Key | 可为 NULL（key 删除后保留记录）| api_keys.id |
| `model_id` | 调用的模型 | 可为 NULL | models.id |
| `vendor_model_id` | 供应商模型映射 | 记录实际使用的供应商 | vendor_models.id |
| `vendor_name` | 供应商名称 | 冗余字段，避免关联查询 | 用于报表 |
| `model_name` | 模型名称 | 冗余字段 | 用于报表 |
| `prompt_tokens` | 输入 Token 数 | 整数 | 计费依据 |
| `completion_tokens` | 输出 Token 数 | 整数 | 计费依据 |
| `total_tokens` | 总 Token 数 | prompt + completion | 计费依据 |
| `cost` | 本次调用费用 | 精度 18.6，单位 ¥ | 扣减用户余额 |
| `cache_hit_tokens` | 缓存命中 Token 数 | 整数，可空；上游 usage 返回缓存字段时才有值 | 缓存命中打折计费（§2.6 说明） |
| `cache_discount` | 缓存命中打折省下的金额 | 精度 18.8，单位 ¥，可空（全价 − 折后价） | 计费审计 |
| `duration_ms` | 响应时间 | 毫秒，从发起到收到完整响应 | 性能监控 |
| `status` | 调用状态 | 枚举，见 §1.7 | 监控指标 |
| `is_streaming` | 是否流式 | 布尔值 | 计费方式区分 |
| `ip` | 请求来源 IP | 最长为 IPv6 45 位 | 安全排查 |
| `created_at` | 调用时间 | 分区键，按月分区 | 查询条件 |

### 2.3 api_keys（API Key 表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | Key 唯一标识 | 自增 | — |
| `user_id` | 所属用户 | NOT NULL | users.id |
| `key_hash` | Key 的 SHA-256 哈希 | 仅存储哈希，不可逆 | 认证时比对 |
| `key_prefix` | Key 明文前缀（前 8 位）| 展示用，不存储完整 Key | 前端展示 `sk-3c-xxxx...` |
| `name` | Key 名称 | 用户自定义 | 管理用 |
| `status` | Key 状态 | active / disabled / expired | 认证时校验 |
| `quota_balance` | 余额式额度 | 精度 18.6，独立余额 | 消费优先扣此余额 |
| `rpm_limit` | 每分钟请求数限制 | 用户可设置 | 三级限流（L3 Key） |
| `tpm_limit` | 每分钟 Token 数限制 | 用户可设置 | 三级限流（L3 Key） |
| `expires_at` | 过期时间 | NULL 表示永不过期 | 过期自动禁用 |
| `allowed_ips` | 允许调用的 IP 白名单 | NULL 表示不限制 | 安全控制 |
| `allowed_models` | 允许调用的模型列表 | NULL 表示不限制 | 权限控制 |
| `last_used_at` | 最后使用时间 | 每次调用时更新 | 闲置检测 |
| `created_at` | 创建时间 | 自动设置 | — |

### 2.4 vendors（供应商表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 供应商唯一标识 | 自增 | — |
| `name` | 供应商名称 | 显示名称 | 前端展示 |
| `api_base_url` | API 基础地址 | 供应商的 API 端点 | 转发请求 |
| `status` | 供应商状态 | 枚举，见 §1.5 | 路由选择 |
| `priority` | 优先级 | 数值越小越优先 | 路由排序 |
| `weight` | 权重 | 加权轮询时使用 | 路由负载均衡 |
| `health_check_url` | 健康检查地址 | 可选，不同于 api_base_url | 健康检查 |
| `last_health_check_at` | 最后健康检查时间 | 更新时间 | 健康状态判断 |
| `created_at` | 接入时间 | 自动设置 | — |

### 2.5 models（模型表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 模型唯一标识 | 自增 | — |
| `name` | 模型名称 | 如 "gpt-4o" | API 请求中的 model 参数 |
| `display_name` | 显示名称 | 可选，前端展示用 | 前端展示 |
| `type` | 模型类型 | 枚举，见 §1.6 | 分类筛选 |
| `description` | 模型描述 | 可选 | 模型详情页 |
| `status` | 模型状态 | active / disabled | 可用性控制 |

### 2.6 vendor_models（供应商模型映射表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 映射唯一标识 | 自增 | — |
| `vendor_id` | 供应商 | NOT NULL | vendors.id |
| `model_id` | 模型 | NOT NULL | models.id |
| `vendor_model_name` | 供应商侧的模型名 | 可能不同于 3cloud 的模型名 | 转发请求时使用 |
| `input_price` | 输入价格（¥/1K tokens）| 精度 18.6 | 用户计费依据 |
| `output_price` | 输出价格（¥/1K tokens）| 精度 18.6 | 用户计费依据 |
| `cost_input_price` | 输入成本价 | 精度 18.6，供应商结算价 | 毛利率计算 |
| `cost_output_price` | 输出成本价 | 精度 18.6 | 毛利率计算 |
| `status` | 映射状态 | active / disabled | 可用性控制 |
| `key_group_id` | 关联的 Key 资源池 | 可选 | 路由到具体 Key 池 |

> **缓存命中打折计费**（详见 `ref-5.2-billing.md §3.2.1`）：上游（DeepSeek `prompt_cache_hit_tokens` / Anthropic `cache_read_input_tokens` / OpenAI `prompt_tokens_details.cached_tokens`）返回缓存命中 token 时，命中部分按 `全价 × 折扣率` 计费。折扣率三级配置：① 模型级 `vendor_pricing.cache_discount_rate`（varchar(10)，可空，(0,1]）；② 全局 `system_config.billing.cache_hit_discount`（默认 0.1，(0,1]）；③ 代码兜底 0.1。命中数/折扣金额落 `consumption_records.cache_hit_tokens` / `cache_discount`。

### 2.7 recharge_orders（充值订单表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 订单唯一标识 | 自增 | — |
| `order_no` | 订单号 | 唯一，业务编号 | 支付回调标识 |
| `user_id` | 充值用户 | NOT NULL | users.id |
| `amount` | 充值金额 | 精度 18.6，单位 ¥ | 到账余额 |
| `pay_channel` | 支付渠道 | 枚举，见 §1.9 | 支付方式 |
| `status` | 订单状态 | 枚举，见 §1.8 | 状态流转 |
| `paid_at` | 支付时间 | 回调确认后设置 | 财务核算 |
| `expire_at` | 过期时间 | 30 分钟未支付自动过期 | 自动取消 |

### 2.8 balance_logs（余额变动流水表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 流水唯一标识 | 自增 | — |
| `user_id` | 用户 | NOT NULL | users.id |
| `type` | 变动类型 | 枚举，见 §1.10 | 分类统计 |
| `amount` | 变动金额 | 正数增加，负数减少 | 余额变更 |
| `balance_before` | 变动前余额 | 精度 18.6 | 审计用 |
| `balance_after` | 变动后余额 | 精度 18.6 | 余额校验 |
| `reference_type` | 关联单据类型 | recharge_order / call_log / ... | 溯源 |
| `reference_id` | 关联单据 ID | 对应 reference_type 的 ID | 溯源 |
| `operator_id` | 操作人（管理员调整时）| 可为 NULL | 审计 |
| `remark` | 备注 | 可选 | 说明 |
| `created_at` | 变动时间 | 自动设置 | 时间序列 |

### 2.9 agents（代理商表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 代理商标识 | 自增 | — |
| `user_id` | 对应的用户 ID | 唯一，一个用户只能是一个代理 | users.id |
| `level` | 代理等级 | 枚举，见 §1.11 | 权益计算 |
| `parent_agent_id` | ~~上级代理~~ | ~~可为 NULL（一级代理）~~ **已移除（D1：单级，无上下级代理）** | — |
| `commission_rate` | 自定义佣金率 | 精度 5.4，覆盖等级默认值 | 佣金计算 |
| `total_commission` | 累计佣金 | 汇总字段 | 展示 |
| `pending_balance` | 可提现余额 | 精度 18.6 | 提现限制 |
| `status` | 代理状态 | active / disabled | 分佣控制 |
| `created_at` | 成为代理时间 | 自动设置 | — |

### 2.10 agent_commissions（佣金流水表）

> ⚠️ 旧模型文档中的 `commission_logs` 已演化为 **`agent_commissions`**（当前实现）：字段为 `id, agent_id, customer_user_id, consumption_record_id, amount, rate, status(pending/settled/cancelled), settled_at, created_at`；`consumption_record_id` 唯一索引保证幂等（同一笔消费只产生一条佣金）。

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 流水唯一标识 | 自增 | — |
| `agent_id` | 归属代理商 | NOT NULL | agents.id |
| `customer_user_id` | 消费用户 | NOT NULL | users.id |
| `consumption_record_id` | 关联消费记录 | NOT NULL，唯一索引 | consumption_records.id |
| `amount` | 佣金金额 | 精度 18.4 | 佣金计算 |
| `rate` | 佣金率 | 当时生效的佣金率 | 计算验证 |
| `status` | 佣金状态 | 枚举，见 §1.13 | 结算控制 |
| `settled_at` | 结算时间 | 实时结算时设置 | 财务核算 |
| `created_at` | 记录时间 | 自动设置 | — |

### 2.11 withdraw_requests（提现申请表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 申请唯一标识 | 自增 | — |
| `agent_id` | 申请代理商 | NOT NULL | agents.id |
| `amount` | 提现金额 | 精度 18.6，≤ 可提现余额 | 余额冻结 |
| `status` | 提现状态 | 枚举，见 §1.12 | 双审流程 |
| `first_reviewer_id` | 初审人 | 管理员 ID | 审计 |
| `second_reviewer_id` | 复审人 | 管理员 ID | 审计 |
| `reject_reason` | 拒绝原因 | 审核拒绝时填写 | 通知用户 |
| `paid_at` | 打款时间 | 打款成功后设置 | 财务核算 |
| `created_at` | 申请时间 | 自动设置 | — |

### 2.12 security_events（安全事件表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 事件唯一标识 | 自增 | — |
| `event_type` | 事件类型 | 枚举，见 §1.17 | 分类 |
| `risk_level` | 风险等级 | low / medium / high / critical | 告警分级 |
| `user_id` | 关联用户 | 可为 NULL | 定位用户 |
| `ip` | 关联 IP | 可为 NULL | 溯源 |
| `details` | 事件详情 | JSONB 格式 | 存储上下文 |
| `resolved` | 是否已处理 | 布尔值 | 运营追踪 |
| `created_at` | 事件时间 | 自动设置 | 时间序列 |

### 2.13 operation_logs（操作日志表，分区表）

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 日志唯一标识 | 自增 | — |
| `operator_id` | 操作人 | NOT NULL | 操作人用户 ID |
| `operator_name` | 操作人昵称 | 冗余字段 | 方便展示 |
| `operator_ip` | 操作人 IP | 记录来源 | 安全审计 |
| `action` | 操作类型 | 枚举，见 §1.18 | 分类统计 |
| `target_type` | 操作对象类型 | user / api_key / agent / ... | 溯源 |
| `target_id` | 操作对象 ID | 对应目标 | 溯源 |
| `before_value` | 操作前值 | 敏感操作必填 | 审计追踪 |
| `after_value` | 操作后值 | 敏感操作必填 | 审计追踪 |
| `reason` | 操作理由 | 可选 | 说明 |
| `result` | 操作结果 | success / failed | 审计 |
| `created_at` | 操作时间 | 自动设置，分区键 | 时间序列 |

### 2.14 conversation_context_records（对话上下文留痕表）

> 每笔 `/v1/chat/completions` 请求落一条**完整上下文**（上文 messages + 响应原文 + 路由/Key/计费明细），后台查询/回放/导出，供交易纠纷举证与政府调证。内容全量原样存储、不脱敏；供应商 Key 只存 sha256 指纹。详见 [`ref-12.9-conversation-records.md`](ref-12.9-conversation-records.md)。

| 字段 | 业务含义 | 约束/规则 | 关联 |
|------|---------|----------|------|
| `id` | 记录唯一标识 | 自增 | — |
| `request_id` | 请求 ID | NOT NULL，唯一索引 | 对应 consumption_records.request_id |
| `user_id` | 调用用户 | NOT NULL，**无 ON DELETE CASCADE**（删用户留孤儿行） | users.id |
| `api_key_id` | 客户端 Key | 可空 | api_keys.id |
| `client_key_hash` | 客户端 Key 指纹 | NOT NULL，复用 api_keys.key_hash | 溯源用哪个 Key |
| `requested_model` | 用户请求模型 | NOT NULL | 如 gpt-4o |
| `routed_model` | 实际路由模型 | 可空（未路由则空） | 供应商侧模型名 |
| `supplier_id` | 实际供应商 | 可空 | suppliers.id |
| `supplier_model_id` | 供应商模型 | 可空 | supplier_models.id |
| `supplier_key_fp` | 供应商 Key 指纹 | 可空，sha256 前 32 位 | 不存明文 |
| `messages` | 请求上文 | NOT NULL，jsonb，**全量不脱敏** | 调证核心 |
| `response_text` | 响应原文 | 可空（失败无响应） | 流式聚合全文 |
| `finish_reason` | 结束原因 | stop / length / ... | 正常终止判断 |
| `status` | 留痕状态 | 见 §1.19 枚举 | succeeded / failed |
| `error_code` | 错误码 | 可空 | 失败原因 |
| `input_tokens` / `output_tokens` | 计费 token | 默认 0 | 与账单对质 |
| `cost` | 费用 | numeric(18,8) | 扣费金额 |
| `client_ip` / `user_agent` | 来源 | 可空 | 政府调证 |
| `occurred_at` | 请求发生时间 | NOT NULL，索引 | 时间序列 |
| `completed_at` | 完成时间 | 可空 | 耗时 |
| `created_at` | 落库时间 | NOT NULL 自动 | — |

---

## 三、业务规则与约束

### 3.1 余额计算规则

```
用户余额 = 充值金额 + 兑换码充值 + 退款 + 管理员调整 - API 消费 - 提现
```

- 余额精度 18 位整数，6 位小数
- 消费时先扣 `api_keys.quota_balance`（Key 独立余额），再扣 `users.balance`（用户余额）
- 余额可低至负数（欠费模式），但欠费超过 ¥50 后 API 路由返回 402

### 3.2 佣金计算规则（单级 · 按消费时刻归属解析）

```
佣金 = 归属客户消费金额 × 代理商佣金率（commission_rate）

归属解析（消费时刻）：
  SELECT agent_user_id FROM agent_customer_bindings
  WHERE customer_user_id = $1 AND status = 'active'
    AND bound_at <= $2            -- $2 = 消费发生时刻
    AND (unbound_at IS NULL OR unbound_at > $2)
  LIMIT 1;
  -- 命中 → 佣金计入该代理；未命中 → 该笔消费不计佣金
```

- 佣金率由管理员（后台）配置，等级/佣金档位仅后台可调（无自助升级）
- 佣金记录在 `agent_commissions`，按消费时刻归属解析入账，`consumption_record_id` 唯一索引幂等
- 结算周期：实时 settled（消费发生时入账）+ 月结对账
- 用户退款时，对应佣金自动冲正（置 cancelled 并回冲代理余额）
- **单级**：无多级抽成/团队分润（D1）

### 3.3 提现双审规则

```
提现流程：申请 → 初审 → 复审 → 打款
```

- 初审：检查金额合理性、收款账号一致性
- 复审：核心合规检查（风控、限额）
- 双审不可为同一人
- 提现后 24h cooldown
- 提现失败金额解冻，重新申请

### 3.4 四级限流规则

```
L1 全局：全系统 10000 QPS / 60M TPM（不可超越）
L2 用户：用户级 100 QPS / 600K TPM（管理员可调整）
L3 Key：Key 级 50 QPS / 300K TPM（用户可调整）
L4 模型：模型级 2000 QPS（管理员可调整）
```

- 前三级串联判断，取最小值
- 命中限流返回 429 + retry_after

### 3.5 数据保留周期

| 日志类型 | 保留周期 | 清理方式 |
|---------|---------|---------|
| 调用日志 | 90 天 | 分区表 DROP 旧分区 |
| 操作日志 | 180 天 | 分区表 DROP 旧分区 |
| 安全事件 | 365 天 | 定时 DELETE |
| 审计日志 | 永久 | 不删除 |
| 余额流水 | 永久 | 不删除 |
| 对话上下文留痕 | 后台可配置（默认永久） | 保留策略调度器（system_config `conv_retention`），按 日/周/月/季度/半年/全年 配置清理 |

> 对话留痕保留策略见 [`ref-12.9-conversation-records.md`](ref-12.9-conversation-records.md)：`enabled=false` 时全量永久保留；启用后按「保留期 + 轮询计划（UTC+8）」每分钟检查、命中周期执行清理，周期 key 存 `conv_retention_last_poll` 防重复。
| 通知记录 | 90 天 | 定时 DELETE |