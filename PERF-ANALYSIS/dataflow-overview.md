# 3cloud 关键业务流程数据流分析报告

## 概述

本报告梳理了 3cloud 平台的五个核心业务流程：充值、提现、计费、同步和仪表盘。通过对代码调用链的追踪，识别关键节点、数据转换、缓存使用，分析冗余查询、重复计算和串行瓶颈。

---

## 1. 充值流程（用户充值 → 审核 → 余额更新 → 通知）

### 流程图
```
用户请求 → 路由校验 → 订单创建 → 支付渠道调用 → 支付回调 → 余额更新 → 佣金计算 → 通知
```

### 调用链路分析

#### 1.1 在线支付下单 (`POST /api/v1/recharge`)
```
路由层: recharge.ts → 请求校验 (rechargeSchema)
服务层: recharge-service/orders.ts → createRechargeOrder()
├── 支付渠道适配: createPaymentProvider(channel)
├── 金额校验: 最小充值金额检查 (systemConfigs.min_recharge_amount)
├── 订单号生成: generateOrderNo("RECHARGE") + 唯一性重试
├── 数据库操作:
│   ├── INSERT rechargeOrders (pending状态)
│   └── SELECT systemConfigs (最小金额配置)
├── 支付参数获取: provider.createOrder()
└── 操作日志: logOperation()

关键节点:
- 订单生成: 订单号(RECHARGE_{timestamp}_{random})，30分钟过期
- 支付适配: 抽象支付渠道，支持微信、支付宝等
- 配置查询: 每次请求查询systemConfigs表
```

#### 1.2 对公转账 (`POST /api/v1/recharge/bank-transfer`)
```
路由层: recharge.ts → 请求校验 (bankTransferSchema)
服务层: recharge-service/orders.ts → submitBankTransfer()
├── 金额校验
├── 订单号生成: generateOrderNo("BANK")
├── 数据库操作:
│   └── INSERT rechargeOrders (pending状态，无expiresAt)
├── 付款人信息保存
└── 返回"等待后台审核"

关键节点:
- 人工审核流程: 状态保持pending，等待后台人工审核
- 付款信息存储: 保存银行账户信息用于下次预填
```

#### 1.3 支付回调 (`POST /api/v1/recharge/notify`)
```
路由层: recharge.ts → 支付回调处理
服务层: recharge-service/payment.ts → handlePaymentNotify()
├── 签名验证: verifyPaySign() (支付安全校验)
├── 订单状态检查: 防止重复处理
├── 金额一致性校验
├── 事务处理:
│   ├── UPDATE rechargeOrders (status→paid)
│   ├── 余额更新: applyRechargeBalance()
│   │   ├── SELECT users.balance (for update锁)
│   │   ├── UPDATE users.balance
│   │   ├── INSERT balanceLogs
│   │   └── 负余额回补逻辑
│   ├── 首充判断: SELECT count(*) rechargeOrders (历史充值)
│   ├── 首充佣金: processActivityCommission() (如有代理商)
│   └── 续费佣金: processRenewalCommission()
└── 响应: "SUCCESS" (支付渠道约定)

关键节点:
- 事务完整性: 所有数据库操作在单个事务中
- 并发安全: SELECT ... FOR UPDATE 防止余额竞争
- 佣金计算: 首充奖励 + 续费佣金双重逻辑
- 幂等处理: 已支付订单拒绝重复回调
```

#### 1.4 余额更新核心逻辑 (`applyRechargeBalance`)
```
服务层: recharge-service/balance.ts
├── 查询用户当前余额: SELECT users.balance
├── 计算新余额: newBalance = oldBalance + rechargeAmount
├── 负余额回补: 如果oldBalance < 0，优先填补负余额
├── 实际到账金额计算: actualAmount = newBalance - max(0, oldBalance)
├── 更新操作:
│   ├── UPDATE users.balance
│   ├── INSERT balanceLogs (类型: recharge)
│   └── 记录实际到账金额
└── 返回实际到账金额

关键特性:
- 负余额处理: 充值优先偿还负余额，剩余部分计入可用余额
- 精确记账: 区分充值金额和实际到账金额
```

### 缓存使用分析
1. **无Redis缓存**: 充值流程完全依赖数据库事务
2. **配置缓存缺失**: systemConfigs.min_recharge_amount 每次查询
3. **用户余额**: 每次更新都需要SELECT ... FOR UPDATE

### 性能瓶颈识别
1. **串行瓶颈**: 支付回调事务包含多个SELECT和UPDATE，事务时间较长
2. **冗余查询**: 
   - 首充判断: `SELECT count(*) FROM rechargeOrders` 可能扫描大量数据
   - 代理商查询: 独立SELECT检查用户是否有代理商
3. **锁竞争**: 用户余额更新使用行级锁，高并发充值可能产生锁等待

---

## 2. 提现流程（用户提现 → 审核 → 打款 → 通知）

### 流程图
```
代理商提现申请 → 冻结资金 → 初审 → 二审 → 财务打款 → 状态更新 → 通知
```

### 调用链路分析

#### 2.1 提现申请 (`POST /api/v1/agent/withdraw/apply`)
```
路由层: agent/withdraw.ts
服务层: agent-withdraw/create.ts → createWithdraw()
├── 资格校验:
│   ├── SELECT agents (可用余额、状态)
│   └── 最小提现金额检查
├── 资金冻结:
│   ├── UPDATE agents (availableBalance减少, pendingWithdraw增加)
│   └── 余额不足检查
├── 订单创建:
│   ├── 生成提现单号: WD{timestamp}{random}
│   └── INSERT withdrawOrders (pending_first_review状态)
├── 操作日志
└── 返回提现单信息

关键节点:
- 资金冻结: 提现金额从可用余额转移到冻结余额
- 状态流转: pending_first_review → pending_second_review → processing → completed
- 审计级别: auditLevel字段记录审核层级(1=初审,2=二审,3=财务)
```

#### 2.2 初审流程 (`agent-withdraw/review.ts → firstReviewWithdraw()`)
```
输入: operatorId, withdrawId, action("approve"/"reject"), rejectReason
流程:
├── 状态校验: 必须是pending_first_review
├── 事务处理:
│   ├── 批准流程:
│   │   ├── 生成凭证号: generateVoucherNo('B')
│   │   ├── UPDATE withdrawOrders (status→pending_second_review)
│   │   └── INSERT auditLogs
│   └── 拒绝流程:
│       ├── 资金解冻: UPDATE agents (pendingWithdraw→availableBalance)
│       ├── UPDATE withdrawOrders (status→rejected)
│       └── INSERT auditLogs
└── 返回结果

关键节点:
- 凭证号生成: 初审通过时生成银行凭证号
- 资金解冻: 拒绝时返还冻结资金到可用余额
```

#### 2.3 二审流程 (`secondReviewWithdraw()`)
```
类似初审流程，但状态流转不同:
pending_second_review → processing (批准)
pending_second_review → rejected (拒绝)

新增特性:
- 二审拒绝时资金同样需要解冻
- 审计日志记录二审操作
```

#### 2.4 财务打款 (`markAsPaid()`)
```
输入: operatorId, withdrawId, bankTransactionNo
流程:
├── 状态校验: 必须是processing状态
├── 事务处理:
│   ├── UPDATE withdrawOrders (status→completed, 记录银行流水号)
│   ├── UPDATE agents (totalWithdraw增加, pendingWithdraw减少)
│   └── INSERT auditLogs
└── 返回结果

关键节点:
- 实际资金流出: 此步骤对应实际银行转账完成
- 统计更新: 更新代理商累计提现金额
```

#### 2.5 CSV批量导出 (`agent-withdraw/csv.ts`)
```
功能: 批量导出待处理提现单用于银行转账
流程:
├── 查询待处理订单: SELECT withdrawOrders WHERE status IN ('processing', 'pending_second_review')
├── 关联代理商信息: JOIN agents
├── 格式化银行数据:
│   ├── 收款人姓名
│   ├── 银行账号
│   ├── 开户行
│   └── 金额
└── 生成CSV文件

性能考虑:
- 数据量: 可能一次性导出大量数据
- 内存使用: 全部加载到内存后生成CSV
```

### 缓存使用分析
1. **无缓存**: 提审流程完全依赖数据库事务
2. **代理商信息**: 每次操作都需要查询agents表
3. **配置查询**: 最小提现金额等配置每次查询

### 性能瓶颈识别
1. **锁竞争**: 
   - agents表行级锁: 多个代理商同时提现可能竞争
   - 资金冻结/解冻涉及余额更新
2. **批量操作**: CSV导出可能处理大量数据，缺乏分页
3. **状态机复杂度**: 多状态流转增加逻辑复杂度

---

## 3. 计费流程（API 调用 → 路由选择 → Key 选择 → 计费 → 日志）

### 流程图
```
API请求 → 认证鉴权 → 模型路由 → 供应商转发 → 响应处理 → 实时计费 → 日志记录
```

### 调用链路分析

#### 3.1 请求转发 (`routes/proxy/forward.ts`)
```
入口: POST /api/v1/chat/completions 等OpenAI兼容接口
流程:
├── 认证鉴权: authenticateApiKey()
├── 模型解析: resolveModel() → SELECT models
├── 路由选择: selectRoute() → 供应商和密钥选择
├── 配额检查: getActiveUserQuota() → 用户/Key配额
├── 请求转发: forwardRequest() / forwardStreamRequest()
├── 响应处理: 流式/非流式响应处理
├── 实时计费: charge() → 调用计费服务
├── 健康检查: updateHealthAfterCall() → 供应商健康状态更新
└── 地理位置: enrichCallGeo() → IP地理位置信息

关键节点:
- 路由算法: 基于供应商健康度、价格、负载均衡选择
- 密钥选择: 从Key分组中选择合适API Key
- 流式支持: 特殊处理streaming响应
```

#### 3.2 实时计费 (`services/billing/charge.ts`)
```
输入: BillingInput (token数、模型、供应商、用户等)
流程:
├── 价格获取: getSellPrices(vendorModelId) → 供应商模型价格
├── Key价格覆盖: 如果使用Key分组专属价格
├── 折扣计算: getDiscountRate(userId) → 用户折扣率
├── 成本计算: (inputTokens×inputPrice + outputTokens×outputPrice) ÷ 1,000,000
├── 事务处理:
│   ├── SELECT users.balance FOR UPDATE
│   ├── 余额检查: 余额不足抛异常
│   ├── INSERT callLogs (详细调用日志)
│   ├── UPDATE users.balance
│   ├── UPDATE apiKeys.quotaBalance (如有配额)
│   ├── INSERT balanceLogs
│   └── 佣金计算: processCommission()
├── 低余额告警: 余额低于阈值时记录Redis cooldown
└── 返回计费结果

关键节点:
- 价格分层: vendor基价 → Key分组价 → 用户折扣价
- 精确计费: 元/百万tokens为单位，6位小数精度
- 配额管理: API Key级别的配额余额
```

#### 3.3 价格缓存 (`services/billing/cache.ts`)
```
缓存结构:
├── Redis键: vendor_model_price:{vendorModelId}
├── 缓存内容: {sellPriceInput, sellPriceOutput, updatedAt}
├── 缓存策略: 5分钟TTL，供应商同步时失效
└── 回退机制: 缓存miss时查询vendorModels表

折扣缓存:
├── Redis键: user_discount:{userId}
├── 缓存内容: discountRate
├── 缓存策略: 1小时TTL，用户信息更新时失效
└── 默认值: 1.0 (无折扣)
```

#### 3.4 路由选择 (`services/router.ts`)
```
算法逻辑:
├── 可用供应商过滤: 健康状态、启用状态
├── 价格排序: 按成本价格排序
├── 负载均衡: 避免单个供应商过载
├── 密钥选择: 从供应商的可用Key中选择
└── 返回: {vendor, vendorModel, apiKey}

健康度管理:
- 成功/失败计数
- 响应时间跟踪
- 自动熔断: circuit-breaker模式
```

### 缓存使用分析
1. **价格缓存**: vendor_model_price:{id} (5分钟TTL)
2. **折扣缓存**: user_discount:{userId} (1小时TTL)  
3. **健康度缓存**: 供应商健康状态内存缓存
4. **配置缓存**: 系统配置缺少缓存

### 性能瓶颈识别
1. **N+1查询**: 
   - 每次API调用查询models表
   - 每次计费查询users表(for update)
2. **锁竞争**: 用户余额更新行级锁，高频调用可能锁等待
3. **价格计算**: 每次调用都计算 (input×inputPrice + output×outputPrice) ÷ 1,000,000
4. **路由计算**: 每次请求都执行完整路由算法

---

## 4. 同步流程（供应商模型同步 → 价格更新 → 缓存刷新）

### 流程图
```
定时触发 → 供应商API调用 → 模型列表获取 → 本地模型同步 → 价格计算 → 缓存更新 → 价格生效
```

### 调用链路分析

#### 4.1 同步引擎 (`services/vendor-sync/sync-engine.ts`)
```
入口: syncVendorModels(vendorId, options)
流程:
├── 供应商信息获取: SELECT vendors
├── API密钥获取: getVendorApiKey() 或 options.apiKeyOverride
├── 上游模型获取: fetchUpstreamModels(vendor.baseUrl, apiKey)
├── 价格计算: getModelPrices() → 已知价格映射
├── 价格倍率: getPricingMultiplier() → 全局价格倍率
├── 批量操作优化:
│   ├── 批量查询现有模型: IN查询代替N+1
│   ├── 批量查询现有映射
│   ├── 批量INSERT新模型
│   └── 批量INSERT vendor_model映射
├── 价格更新:
│   ├── 新价格计算: basePrice × pricingMultiplier
│   └── UPDATE vendorModels.sellPriceInput/Output
├── 缓存失效: 删除vendor_model_price缓存
└── 生成同步报告

关键节点:
- 批量优化: 使用IN查询减少数据库往返
- 价格策略: 基价×倍率=售价
- 缓存协同: 同步后立即失效价格缓存
```

#### 4.2 供应商API客户端 (`services/vendor-sync/api-client.ts`)
```
功能: 统一供应商API调用
支持供应商:
├── OpenAI兼容: /models端点
├── Anthropic: 特殊处理
├── 深度求索: 特殊处理
├── 阿里云: 特殊处理
└── 其他: 通用处理

错误处理:
- 超时控制
- 重试机制
- 错误降级
```

#### 4.3 价格计算 (`services/vendor-sync/pricing.ts`)
```
价格来源优先级:
1. 已知价格映射: KNOWN_PRICE_MAP (硬编码映射)
2. 模型类型推断: guessModelType() → 按命名规则推断
3. 默认价格: DEFAULT_PRICE (后备方案)

价格倍率:
- 来源: system_configs.pricing_multiplier
- 默认值: 1.5 (50%加价)
- 应用: basePrice × multiplier = sellPrice
```

### 缓存使用分析
1. **价格缓存**: vendor_model_price:{id} 同步后立即删除
2. **无结果缓存**: 供应商API响应未缓存
3. **配置缓存**: pricing_multiplier配置未缓存

### 性能瓶颈识别
1. **供应商API延迟**: 依赖外部API响应时间
2. **大批量操作**: 供应商有大量模型时，批量操作可能影响性能
3. **价格计算**: 每个模型都需要价格计算和映射查找
4. **缓存雪崩**: 同步后立即失效所有价格缓存，可能导致瞬时数据库压力

---

## 5. 仪表盘流程（统计聚合 → 缓存 → 前端展示）

### 流程图
```
数据聚合 → Redis缓存 → API响应 → 前端渲染 → 定时更新
```

### 调用链路分析

#### 5.1 统计聚合 (`services/dashboards/stats.ts → buildStats()`)
```
入口: GET /api/v1/admin/dashboard/stats
聚合维度:
├── 用户统计: 总数、今日新增、昨日新增
├── 调用统计: 今日/昨日调用量、token数、成本、成功率
├── 充值统计: 今日充值金额、待审核充值
├── 实名审核: 待审核实名数量
├── 模型排行: 今日TOP5调用模型
├── 安全统计: 高风险事件、熔断器、封禁IP/用户
├── 实名漏斗: 各状态用户分布
├── 代理商摘要: 总数、活跃数、累计佣金、待提现
├── 供应商状态: 活跃/异常供应商数
├── 平台余额: 用户总余额
└── 低余额用户: 余额低于阈值用户数

查询特点:
- 多维度聚合: 多个SELECT语句并行执行
- 日期范围: 基于createdAt的时间范围查询
- 分组统计: GROUP BY + 聚合函数
```

#### 5.2 缓存策略 (`services/dashboards/cache-warmup.ts`)
```
缓存键设计:
├── dashboard:stats:current → 当前统计(5分钟TTL)
├── dashboard:stats:historical:{date} → 历史统计(24小时TTL)
└── dashboard:cache:warmup:lock → 缓存预热锁

预热策略:
- 定时任务: 每5分钟预热一次
- 防重复: Redis锁防止并发预热
- 渐进式: 先返回旧数据，后台预热新数据
```

#### 5.3 消费者分析 (`services/dashboards/consumers.ts`)
```
分析维度:
├── 活跃用户: 今日调用API的用户
├── 高消费用户: 消费金额TOP用户
├── 使用模式: 调用频率、时间段分布
├── 模型偏好: 用户偏好的模型分布
└── 地理位置: 用户地域分布

数据来源:
- call_logs表聚合
- 用户表关联
- IP地理位置映射
```

#### 5.4 收入分析 (`services/dashboards/revenue.ts`)
```
收入构成:
├── 充值收入: rechargeOrders已支付订单
├── 消费支出: call_logs成本汇总
├── 净利润: 收入 - 支出
├── 趋势分析: 日/周/月趋势
└── 渠道分析: 支付渠道分布

计算方法:
- 时间区间聚合
- 状态过滤(只计算成功交易)
- 货币单位统一(元，6位小数)
```

### 缓存使用分析
1. **统计结果缓存**: dashboard:stats:current (5分钟TTL)
2. **历史缓存**: dashboard:stats:historical:{date} (24小时TTL)
3. **锁机制**: Redis锁防止缓存预热并发
4. **无查询缓存**: 原始查询未缓存，每次预热都执行完整查询

### 性能瓶颈识别
1. **复杂查询**: 多个聚合查询可能扫描大量数据
2. **call_logs表压力**: 统计查询频繁扫描大表(已分区)
3. **实时性 vs 性能**: 5分钟缓存间隔 vs 查询成本
4. **内存使用**: 多个维度的统计结果可能较大

---

## 优化建议总结

### 1. 缓存优化
- **充值配置缓存**: systemConfigs.min_recharge_amount等高频配置加入Redis
- **用户信息缓存**: 用户余额、折扣率等高频访问数据缓存
- **供应商价格缓存**: 当前5分钟TTL可考虑延长，依赖失效机制
- **仪表盘查询缓存**: 更细粒度的缓存策略，减少全量查询

### 2. 数据库优化
- **索引优化**: 确保高频查询字段有合适索引
- **分区表**: call_logs已按月分区，考虑按用户ID子分区
- **查询合并**: 减少N+1查询，使用JOIN或批量查询
- **读写分离**: 统计查询使用只读副本

### 3. 流程优化
- **异步处理**: 支付回调中的佣金计算可异步化
- **批量操作**: 供应商同步进一步批量优化
- **限流降级**: 高峰时段统计查询降级
- **预处理**: 每日统计预计算，减少实时计算

### 4. 架构优化
- **事件驱动**: 关键业务事件(充值成功、提现审核)触发通知
- **微服务拆分**: 计费、充值、提现等核心流程可服务化
- **队列缓冲**: 高并发写入使用队列缓冲
- **监控告警**: 关键流程性能指标监控

---

## 关键数据流表

| 流程 | 关键表 | 主要操作 | 缓存使用 | 性能关注点 |
|------|--------|----------|----------|------------|
| 充值 | rechargeOrders, users, balanceLogs | INSERT订单, UPDATE余额 | 无 | 事务时间, 锁竞争 |
| 提现 | withdrawOrders, agents, auditLogs | 资金冻结/解冻, 状态流转 | 无 | 锁竞争, 批量导出 |
| 计费 | callLogs, users, balanceLogs, apiKeys | INSERT日志, UPDATE余额 | 价格缓存, 折扣缓存 | N+1查询, 锁竞争 |
| 同步 | vendorModels, models, vendors | 批量UPSERT, 价格更新 | 价格缓存失效 | API延迟, 批量操作 |
| 仪表盘 | callLogs, users, rechargeOrders等 | 多维度聚合查询 | 结果缓存 | 查询复杂度, 数据量 |

---

## 冗余查询识别

1. **充值流程**: 
   - 首充判断的`COUNT(*)`查询可能扫描大量历史数据
   - 每次支付回调查询systemConfigs.alert_stop_balance等配置

2. **计费流程**:
   - 每次API调用查询models表
   - 用户折扣率每次查询(有缓存但可能miss)

3. **仪表盘流程**:
   - 多个维度的相似日期范围重复查询
   - 关联查询未充分利用索引

## 串行瓶颈识别

1. **支付回调事务**: 包含订单更新、余额更新、佣金计算等多个步骤
2. **提现审核流程**: 状态机严格串行，无法并行审核
3. **供应商同步**: 供应商间串行同步，未充分利用并行
4. **仪表盘预热**: 全量统计计算在单次请求中完成

---

*报告生成时间: 2025-07-24*
*分析基于代码版本: 3cloud/api/src 最新代码*