# 3cloud 全链路仿真测试方案

> 版本: V1.0 · 2026-07-02
> 目标：本地环境通过 HTTP API 调用，模拟真实用户行为全链路跑通所有功能点
> 数据规模：≥10 万条 call_logs + 完整的佣金/财务/审计记录

---

## 1. 测试策略

### 1.1 测试方式

| 维度 | 方案 |
|------|------|
| **方式** | HTTP API 直调（`fetch` / `curl`），不绕过后端逻辑 |
| **环境** | 本地 `http://localhost:3000` |
| **数据库** | `threecloud`（独立测试库，不干扰原有数据） |
| **测试框架** | 单文件 `test-sim.ts`，`npx tsx` 执行 |
| **输出** | 控制台进度 + CSV 报告 |

### 1.2 测试流水线顺序

```
初始化种子
  ↓
注册 30 个用户
  ↓
邮箱验证（模拟跳过 code 校验）
  ↓
实名认证（5 个人用户 + 5 个企业用户）
  ↓
管理员审核实名（通过/拒绝）
  ↓
用户充值（线上扫码 + 对公转账）
  ↓
财务双审确认充值
  ↓
创建一个代理商体系（1 个顶级代理 + 3 个二级代理）
  ↓
分配客户到各代理商（共 12 名客户）
  ↓
批量生成 Token 调用 (100,000+ 条)
  ↓
验证计费 & 佣金计算 & 余额扣减
  ↓
佣金结算（管理员批量结算）
  ↓
代理商提现申请 + 双审 + 打款
  ↓
对账报表验证（资金平衡校验）
  ↓
审计日志全量检查
```

---

## 2. 数据初始化（阶段 0）

### 2.1 基础种子

| 种子数据 | 数量 | 说明 |
|----------|------|------|
| vendors | 3 | `openai`, `anthropic`, `deepseek` |
| models | 8 | `gpt-4o`, `gpt-4o-mini`, `claude-3.5-sonnet`, `deepseek-chat`, `deepseek-v4-flash`, `deepseek-v4-pro`, `text-embedding-3-small`, `text-embedding-3-large` |
| vendor_models | 10+ | 每个 vendor 关联多个模型，配置真实 sellPrice/costPrice/weight |
| system_configs | 全套 | 限流配置、折扣配置、佣金规则默认值 |
| 超级管理员 | 1 | `admin@3cloud.dev`，role=`super_admin` |
| 财务审计 | 2 | `finance@3c.local`(finance_ops), `auditor@3c.local`(auditor) |
| 运营 | 1 | `ops@3c.local`(ops) |

### 2.2 种子方式

通过 HTTP API 直接调用管理端接口创建：

```
POST /api/v1/admin/vendors       → 创建供应商
POST /api/v1/admin/vendors/:id/models → 创建供应商模型映射
```

种子完成后生成 `seed-report.json` 记录预置数据 hash。

---

## 3. 注册流程（阶段 1·覆盖功能点 #1~#3）

### 3.1 测试步骤

| 步骤 | API | 数据量 | 验证点 |
|------|-----|--------|--------|
| 1.1 用户注册 | `POST /api/v1/auth/register` | 30 个用户 | 响应含 accessToken + refreshToken；DB users 表多 30 行 |
| 1.2 邮箱验证 | `POST /api/v1/auth/verify-email` | 30 个用户 | users.status 从 `pending` → `active` |
| 1.3 获取个人信息 | `GET /api/v1/auth/me` | 30 个用户 | 返回的 role=user, status=active |

### 3.2 数据分布

| 用户类型 | 数量 | 说明 |
|----------|------|------|
| 个人用户 | 15 | email: `user{01..15}@test.local` |
| 企业用户 | 15 | email: `company{01..15}@test.local` |

### 3.3 校验点

- [ ] 已注册邮箱无法重复注册（`409 Conflict`）
- [ ] 密码最少 8 位校验
- [ ] Token 格式正确（JWT 3 段式）
- [ ] refreshToken 可用于 `POST /api/v1/auth/refresh`

---

## 4. 实名认证流程（阶段 2·覆盖功能点 #4~#6）

### 4.1 测试步骤

| 步骤 | API | 数据量 | 验证点 |
|------|-----|--------|--------|
| 2.1 个人实名提交 | `POST /api/v1/auth/real-name/personal` | 10 个用户 | users.realNameStatus → `pending_review` |
| 2.2 企业实名提交 | `POST /api/v1/auth/real-name/enterprise` | 10 个用户 | userRealNameReviews 新增记录 |
| 2.3 管理员审核通过 | `POST /api/v1/admin/real-name-review/:id` | 18 个用户 | status → `approved`, audit_logs 写入 |
| 2.4 管理员审核拒绝 | `POST /api/v1/admin/real-name-review/:id` | 2 个用户 | status → `rejected`, rejectReason 记录 |
| 2.5 重新提交 / 上诉 | `POST /api/v1/auth/real-name/personal` | 2 个拒审用户 | version 自增，status 回到 `pending_review` |
| 2.6 管理员再次通过 | `POST /api/v1/admin/real-name-review/:id` | 2 个用户 | 最终全部 approved |

### 4.2 模拟真实数据

```
个人用户：身份证号使用算法生成符合校验规则的虚拟号
企业用户：统一社会信用代码、营业执照（base64 模拟图片）
```

### 4.3 校验点

- [ ] 未实名用户无法发起 >= ¥10,000 的充值（预期拦截）
- [ ] 实名审核状态变更后，用户通知表生成相应记录
- [ ] 审核历史 `userRealNameReviews` version 递增

---

## 5. 充值流程（阶段 3·覆盖功能点 #7~#12）

### 5.1 测试步骤

| 步骤 | API | 数据量 | 验证点 |
|------|-----|--------|--------|
| 3.1 线上充值下单 | `POST /api/v1/recharge` | 15 笔 | 生成订单，status=pending |
| 3.2 支付回调通知 | `POST /api/v1/recharge/notify` | 15 笔 | status→paid, balance 增加 |
| 3.3 对公转账提交 | `POST /api/v1/recharge/bank-transfer` | 8 笔 | 含凭证号/voucher |
| 3.4 财务一审确认 | `POST /api/v1/admin/finance/recharge/:id/first-confirm` | 8 笔 | first_confirmed_by/at 写入 |
| 3.5 财务二审确认 | `POST /api/v1/admin/finance/recharge/:id/second-confirm` | 6 笔 | status→confirmed, balance 增加 |
| 3.6 拒绝对公转账 | `POST /api/v1/admin/finance/recharge/:id/second-confirm` (reject) | 2 笔 | status→cancelled, balance 不变 |
| 3.7 查询充值订单 | `GET /api/v1/recharge/orders` | 全部 | 分页结果正确 |

### 5.2 充值金额分布

| 金额区间 | 笔数 | 说明 |
|----------|------|------|
| ¥50~¥200 | 8 | 小额试用 |
| ¥500~¥2,000 | 10 | 中量使用 |
| ¥5,000~¥50,000 | 5 | 大额企业充值 |

### 5.3 校验点

- [ ] 支付成功后余额精确增加（`amount` + 无舍入误差）
- [ ] balance_logs 记录 `type=recharge`
- [ ] 双审：一审后 status 仍为 `pending`，二审后才变为 `confirmed`
- [ ] 重复回调幂等（第二次回调余额不重复增加）
- [ ] 未实名用户大额充值被拦截

---

## 6. 代理商体系（阶段 4·覆盖功能点 #13~#16）

### 6.1 代理商层级结构

```
                    Agent A (顶级，单独注册)
                   /         |          \
          Agent B1        Agent B2      Agent B3  (二级)
          /    \           /    \           |
      客户1~3  客户4   客户5~7  客户8~10   客户11~12
```

### 6.2 测试步骤

| 步骤 | API | 验证点 |
|------|-----|--------|
| 4.1 管理员创建 Agent A | `POST /api/v1/admin/agents` | agents 表新增，对应 user role→agent |
| 4.2 设置 Agent A 佣金规则 | `POST /api/v1/admin/agents/:id/commission-rules` | sale=10%, renewal=5%, team=2% |
| 4.3 Agent A 生成邀请链接 | `GET /api/v1/agent/referral-link` | 返回带 ref_code 的链接 |
| 4.4 管理员创建 Agent B1~B3 | `POST /api/v1/admin/agents` | 设置 parentAgentId=A |
| 4.5 绑定客户到各代理商 | `POST /api/v1/admin/agents/:id/clients` | agent_clients 表新增 |
| 4.6 查看代理商面板 | `GET /api/v1/agent/dashboard` | 返回统计数据 |
| 4.7 查看客户列表 | `GET /api/v1/agent/clients` | 含总量汇总 |

### 6.3 校验点

- [ ] 客户绑定关系唯一（同一客户不能被两个代理商绑定）
- [ ] 邀请链接包含的 refCode 可被注册接口识别
- [ ] 代理商的 pendingWithdraw 初始为 0

---

## 7. Token 调用调度（阶段 5·覆盖功能点 #17~#21）

### 7.1 核心测试：10 万+ 条 call_logs

通过 `PROXY` 路由模拟 API 调用，绕过实际的大模型 API 调用（mock 返回），但完整走完计费链路。

#### 7.1.1 Mock 策略

```
真实 HTTP 流程：API Key 鉴权 → 限流检查 → 路由选择 → 转发到上游 → 拿到响应
Mock 策略：     API Key 鉴权 → 限流检查 → 路由选择 → MOCK 上游返回 → 计费 & 入库

Mock 实现：在 router.ts 中注入一个 mockVendorResponse 函数，
          在测试模式下（环境变量 SIMULATION=true）替换上游 HTTP 请求。
```

#### 7.1.2 调用量分布

| 维度 | 分布 | 说明 |
|------|------|------|
| **总量** | 100,000 条 | 硬性要求 |
| **模型分布** | gpt-4o: 20%, gpt-4o-mini: 25%, claude-3.5-sonnet: 15%, deepseek-chat: 25%, deepseek-v4-flash: 10%, embedding: 5% | 覆盖所有模型 |
| **用户分布** | 12 个已绑定代理商的客户 + 8 个直客 = 20 个调用用户 | 覆盖面广 |
| **状态分布** | success: 90%, failed: 5%, timeout: 3%, cancelled: 2% | 覆盖异常情况 |
| **Token 分布** | promptTokens: 500~8000, completionTokens: 100~4000 | 覆盖范围 |
| **时间跨度** | 过去 60 天均匀分布 | 测试时间分区、聚合查询 |
| **日调用量** | ~1,700 条/天（60 天） | 模拟真实频率 |
| **并发模拟** | 每个用户串行调用，用户间交替 | 模拟真实负载 |

### 7.2 Token 模拟数据生成

```
每条 call_log 生成：
{
  promptTokens: randInt(500, 8000),
  completionTokens: randInt(100, 4000),
  totalTokens: promptTokens + completionTokens,
  durationMs: randInt(200, 5000),
  isStreaming: Math.random() > 0.4,
  ip: randomIP(),
  userAgent: randomUAPicker(),
  status: weightedPick(['success'=>0.9,'failed'=>0.05,'timeout'=>0.03,'cancelled'=>0.02])
}

模型定价（sellPrice/1000 tokens）：
  gpt-4o:              ¥0.03 输入 / ¥0.12 输出
  gpt-4o-mini:         ¥0.01 输入 / ¥0.04 输出
  claude-3.5-sonnet:   ¥0.02 输入 / ¥0.08 输出
  deepseek-chat:       ¥0.005 输入 / ¥0.02 输出
  deepseek-v4-flash:   ¥0.002 输入 / ¥0.008 输出
  text-embedding-3:    ¥0.001 / ¥0.001
```

### 7.3 计费计算结果验证

| 字段 | 计算公式 | 验证方式 |
|------|----------|----------|
| cost | cost = promptTokens×inputPrice + completionTokens×outputPrice / 1000 | 逐条对比 |
| balance_after | balance_after = balance_before - cost | 连续追踪 |
| commission_amount | callCost × agentRate | 按规则计算 |

### 7.4 校验点

- [ ] 计费精确到 6 位小数，无浮点误差
- [ ] success 状态的调用才扣费（failed/timeout 不扣）
- [ ] 余额为 0 或负数时，后续调用被限流/拒绝
- [ ] VPN/代理用户触发安全事件（geo_check）
- [ ] rpm/tpm 限流正确拦截超限请求（429）
- [ ] 路由权重分配大致符合配置比例

---

## 8. 佣金结算（阶段 6·覆盖功能点 #22~#24）

### 8.1 测试步骤

| 步骤 | API | 验证点 |
|------|-----|--------|
| 6.1 管理员查看佣金列表 | `GET /api/v1/admin/finance/commissions` | 分页正确，数据完整 |
| 6.2 管理员执行结算 | `POST /api/v1/admin/finance/commissions/settle` | commissions status→settled |
| 6.3 查看代理商佣金汇总 | `GET /api/v1/agent/commissions?status=settled` | settled 状态佣金出现 |
| 6.4 查看佣金日汇总 | 检查 commission_daily_rollup | 预聚合数据正确 |

### 8.2 佣金计算验证矩阵

| 场景 | 客户消费 | 佣金率 | 预期佣金 | 验证 |
|------|----------|--------|----------|------|
| 直接销售佣金 | ¥1,000 | 10% | ¥100 | 按 call_cost 逐笔计算 |
| 续费佣金 | ¥500 | 5% | ¥25 | commissionType=renewal |
| 团队佣金（二级） | ¥800 | 2% | ¥16 | 上级提取下级客户的 2% |
| 活动固定佣金 | ¥300 | 固定 ¥50 | ¥50 | commissionType=activity |
| 手续费扣除 | - | 1% | ¥0.99 | fee_amount = commission×1% |

### 8.3 校验点

- [ ] 结算后代理商 settledCommission 增加
- [ ] 结算后代理商 pendingWithdraw 增加（= settledCommission - 已提现）
- [ ] commission 记录写入 commission_logs
- [ ] 手续费计算正确
- [ ] 上级代理商获得团队佣金

---

## 9. 提现流程（阶段 7·覆盖功能点 #25~#28）

### 9.1 测试步骤

| 步骤 | API | 验证点 |
|------|-----|--------|
| 7.1 Agent A 发起提现 | `POST /api/v1/agent/withdraw` | ¥1,000，status→pending_first_review |
| 7.2 财务一审通过 | `POST /api/v1/admin/finance/withdraw/:id/first-review` | 状态→pending_second_review |
| 7.3 财务二审通过 | `POST /api/v1/admin/finance/withdraw/:id/second-review` | 状态→approved |
| 7.4 管理员标记已打款 | `POST /api/v1/admin/finance/withdraw/:id/mark-paid` | 状态→paid, actual amount 计算 |
| 7.5 Agent B1 发起提现并被拒 | 同上流程，二审拒绝 | 状态→rejected，冻结金额释放 |
| 7.6 超额提现验证 | 尝试提现超过可用余额 | 400 error |

### 9.2 提现数据

| 提现申请 | 金额 | 结果 |
|----------|------|------|
| Agent A | ¥1,000 | 通过 |
| Agent A | ¥5,000 | 通过 |
| Agent B1 | ¥300 | 拒绝（二审） |
| Agent B2 | ¥800 | 通过 |
| Agent C | 超额 ¥99,999 | 拒绝（余额不足） |

### 9.3 校验点

- [ ] 双审流程：一审后不可直接变为 approved/paid
- [ ] 提现被拒后，frozen_amount 释放
- [ ] 提现打款后，pendingWithdraw 减少
- [ ] 手续费和实际到账计算正确（actual = amount - fee）
- [ ] 每日提现次数限制（系统配置 agent_daily_withdraw_limit）

---

## 10. 对账与审计（阶段 8·覆盖功能点 #29~#30）

### 10.1 对账验证

| 校验项 | SQL/API | 预期结果 |
|--------|---------|----------|
| 资金平衡 | 总充值 - 总消费 - 总提现 - 总手续费 = 0 | 差值 < ¥0.01 |
| 佣金平衡 | 各代理商 settledCommission 之和 = 佣金总池 | 精确匹配 |
| 余额一致性 | 所有用户 balance 之和 = 总充值 - 总消费 | 一致 |
| 日汇总一致性 | daily_recon_summary vs 当日明细聚合 | 一致 |

### 10.2 审计日志验证

| 操作类型 | 预期记录数 | 验证方式 |
|----------|-----------|----------|
| user_create (注册) | 30 | audit_logs action=user_create |
| real_name_approve | 20 | action=real_name_approve |
| recharge_confirm | 6 | action=recharge_confirm |
| withdraw_approve | 2 | action=withdraw_approve |
| commission_settle | 1 | action=commission_settle |
| 管理员创建代理商 | 4 | action=agent_create |

### 10.3 安全事件验证

| 事件类型 | 触发条件 | 预期 |
|----------|----------|------|
| unusual_location | 从异地 IP 调用 | security_events 新增 |
| ip_banned | 同一 IP 5 次失败登录 | 后续请求被拦截 |
| rate_limit_exceeded | 超限请求 | 返回 429 |

---

## 11. 自动化测试脚本设计

### 11.1 脚本架构

```
test-sim/
├── sim-runner.ts               ← 主入口
├── config.ts                   ← 测试配置（端口、账号、数据量）
├── api-client.ts               ← HTTP 客户端封装
├── phases/
│   ├── 0-seed.ts               ← 初始化种子数据
│   ├── 1-register.ts           ← 用户注册 & 验证
│   ├── 2-real-name.ts          ← 实名认证 & 审核
│   ├── 3-recharge.ts           ← 充值 & 双审
│   ├── 4-agent.ts              ← 代理商体系
│   ├── 5-tokens.ts             ← 10 万+ Token 调用
│   ├── 6-commission.ts         ← 佣金结算
│   ├── 7-withdraw.ts           ← 提现 & 审批
│   └── 8-verify.ts             ← 对账 & 审计验证
├── mock/
│   └── vendor-mock.ts          ← Mock 上游 API 响应
├── utils/
│   ├── data-gen.ts             ← 模拟数据生成器
│   └── verify.ts               ← 一致性校验函数
└── reports/
    └── sim-report-{timestamp}.json  ← 测试报告输出
```

### 11.2 关键函数签名

```typescript
// api-client.ts
class ApiClient {
  constructor(baseUrl: string);
  async register(email, password): Promise<AuthResult>;
  async login(email, password): Promise<AuthResult>;
  async submitRealName(userId, type, data): Promise<void>;
  async recharge(userId, amount, channel): Promise<OrderResult>;
  async callModel(apiKey, model, tokens): Promise<CallResult>;
  async withdraw(agentToken, amount): Promise<WithdrawResult>;
  // ... 所有 API 封装
}

// data-gen.ts
function generateCallLogBatch(count: number, users: User[], models: Model[]): CallLogInput[];
function generateRealNameData(type: 'personal' | 'enterprise'): RealNameData;
function randomTokenDistribution(): { prompt: number; completion: number };
```

### 11.3 执行参数

```bash
# 全量测试
npx tsx test-sim/sim-runner.ts

# 指定跳过的阶段（用于断点续测）
SKIP_PHASES=0,1 npx tsx test-sim/sim-runner.ts

# 只执行验证阶段
ONLY_PHASE=8 npx tsx test-sim/sim-runner.ts
```

---

## 12. 测试报告与通过标准

### 12.1 输出文件

| 文件 | 格式 | 内容 |
|------|------|------|
| `reports/sim-summary-{ts}.json` | JSON | 各阶段执行状态、耗时、行数 |
| `reports/verification-results-{ts}.csv` | CSV | 每条验证点的通过/失败详情 |
| `reports/call-logs-sample-{ts}.csv` | CSV | 随机抽取 100 条 call_logs 明细 |
| `reports/balance-reconciliation-{ts}.csv` | CSV | 资金平衡校验逐行对比 |

### 12.2 通过标准

| 标准 | 要求 |
|------|------|
| 功能覆盖 | 100% 功能点走通 |
| 数据规模 | call_logs ≥ 100,000 条 |
| 资金平衡 | 充值 - 消费 - 提现 - 手续费 = 0 (容差 < ¥0.01) |
| 佣金精度 | 每笔佣金计算误差 < ¥0.000001 |
| 审计完整性 | 每条管理操作都有 audit_log 记录 |
| 限流正确性 | 超限请求准确返回 429，正常请求不被误拒 |

### 12.3 失败场景对照表

| 失败现象 | 可能原因 | 排查路径 |
|----------|----------|----------|
| 余额对不上 | 计费浮点精度、重复回调 | 检查 balance_logs + call_logs JOIN |
| 佣金少算 | 佣金规则未生效、状态过滤 | 检查 commission_rules + commission_logs |
| 审计缺失 | audit 调用前置条件不足 | 检查 audit_logs action 枚举覆盖 |
| 限流失效 | Redis 滑动窗口溢出 | 检查 rate-limit.ts 时间窗口计算 |

---

## 13. 必要环境准备

### 13.1 本地环境

```bash
# 1. 确保 PostgreSQL 运行
pg_isready

# 2. 确保 Memurai (Redis) 运行
#    Windows 服务中确认 "Memurai" 状态为 Running

# 3. 创建测试数据库
psql -U postgres -c "CREATE DATABASE threecloud_sim;"

# 4. 修改 .env 测试配置
#    DATABASE_URL=postgres://postgres:postgres@localhost:5432/threecloud_sim
#    SIMULATION=true

# 5. 运行 migration
cd 3cloud/api
npx drizzle-kit push

# 6. 启动 API 服务 (测试模式)
npx tsx src/index.ts

# 7. 运行仿真测试
npx tsx test-sim/sim-runner.ts
```

### 13.2 前置依赖

| 依赖 | 是否已有 | 备注 |
|------|----------|------|
| PostgreSQL 17 | ✅ | 已在运行 |
| Memurai (Redis) | ✅ | 已在运行 |
| Fastify API 服务 | ✅ | 已有完整代码 |
| DrizzleORM + migration | ✅ | 表结构对齐 |
| `SIMULATION=true` mock 模式 | ❌ | **需新增** |
| call_logs 分区表 | ✅ | 已有 setup 脚本 |

---

## 14. 需新增/修改的代码

### 14.1 Mock 上游 API

在 `src/services/router.ts` 中增加：

```typescript
// 在 forwardRequest 函数中
if (process.env.SIMULATION === 'true') {
  return mockVendorResponse(route, body);
}

async function mockVendorResponse(route: RouteInfo, body: any) {
  const promptTokens = estimatePromptTokens(body);
  const completionTokens = Math.floor(Math.random() * 2000) + 100;
  
  return {
    status: 200,
    data: {
      id: 'chatcmpl-' + nanoid(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: route.upstreamModelName,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      choices: [{ message: { content: 'Mock response for simulation' } }],
    },
  };
}
```

### 14.2 测试脚本文件清单

| 文件 | 行数估算 | 说明 |
|------|----------|------|
| `test-sim/sim-runner.ts` | ~80 | 主入口，阶段编排 |
| `test-sim/config.ts` | ~40 | 配置常量 |
| `test-sim/api-client.ts` | ~200 | HTTP 客户端 |
| `test-sim/phases/0-seed.ts` | ~150 | 种子数据 |
| `test-sim/phases/1-register.ts` | ~100 | 注册阶段 |
| `test-sim/phases/2-real-name.ts` | ~150 | 实名阶段 |
| `test-sim/phases/3-recharge.ts` | ~200 | 充值阶段 |
| `test-sim/phases/4-agent.ts` | ~150 | 代理商 |
| `test-sim/phases/5-tokens.ts` | ~200 | 10 万调用 |
| `test-sim/phases/6-commission.ts` | ~100 | 佣金结算 |
| `test-sim/phases/7-withdraw.ts` | ~150 | 提现流程 |
| `test-sim/phases/8-verify.ts` | ~250 | 对账审计验证 |
| `test-sim/mock/vendor-mock.ts` | ~60 | Mock 响应 |
| `test-sim/utils/data-gen.ts` | ~120 | 数据生成 |
| `test-sim/utils/verify.ts` | ~100 | 校验函数 |
| **合计** | **~2,100** |

---

## 15. 测试数据量汇总

| 数据表 | 预期行数 | 说明 |
|--------|----------|------|
| users | 39 | 30 普通 + 1 admin + 3 运营 + 5 代理商 |
| api_keys | 30 | 每个用户 1 个 |
| user_real_name_reviews | 22 | 18 个人/企业 + 2 拒签后重提 |
| recharge_orders | 23 | 15 线上 + 8 对公转账 |
| balance_logs | 10,030+ | 1 条/充值 + 1 条/消费调用 |
| **call_logs** | **100,000** | **核心指标** |
| commission_logs | 4,800+ | 仅代理商客户的 success 调用产生 |
| commission_daily_rollup | 60 | 60 天日汇总 |
| withdraw_orders | 4 | 提现申请 |
| audit_logs | 70+ | 所有管理操作 |
| security_events | 若干 | 异地登录/异常 IP 事件 |
| agents | 4 | 1 顶级 + 3 二级 |
| agent_clients | 12 | 客户绑定关系 |

### 预期总数据量：~110,000+ 行（含 call_logs 10 万）

---

## 16. 风险 & 注意事项

| 风险 | 缓解措施 |
|------|----------|
| 电子邮箱验证码无法绕过 | 测试模式下跳过 verify-email 验证码校验（环境变量 `SIMULATION=true`） |
| 实名认证身份证校验 | 使用测试用虚拟身份证号格式（非真实号码） |
| 支付回调无法模拟 | 伪造支付回调通知（`POST /api/v1/recharge/notify`） |
| 10 万条数据插入性能 | 使用 `batch insert`（DrizzleORM `db.insert().values()`）批量写入，每批 1000 条 |
| Redis 限流对批量插入的影响 | 测试模式跳过限流（环境变量 `SIMULATION=true` 时），或用测试专用限流 key |
| 分区表按月分区 | 确保分区脚本已执行，覆盖 60 天时间范围 |
| API Key 鉴权绕过 | 测试模式下允许特殊 JWT token 绕过 |
| 脚本执行时间过长 | 预估 ~60-120 秒完成全部 |
