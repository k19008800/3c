# 3cloud 全流程浏览器验证报告

**日期：** 2026-08-10
**架构：** 单前端 + 单后端（api@3000 / web-portal@5177 静态托管 web-console 于 `/app/`）
**数据库：** PostgreSQL `threecloud_v3`
**验证方式：** Playwright 真实浏览器（msedge）+ 真实后端 + 真实数据库，三角色代入

---

## 一、留存账号清单（供您亲自登录核实）

| 角色 | 邮箱 | 密码 | user_id | 余额 | 用途 |
|---|---|---|---|---|---|
| 普通用户 | `verify-user@3cloud.dev` | `Verify@2026!` | 103 | **¥509.999488** | 注册赠金¥10 + 对公打款审核到账¥500 − 消费 ¥0.000512 |
| 代理商 | `verify-agent@3cloud.dev` | `Verify@2026!` | 104 | ¥10 | senior 15% 佣金，邀请码 INVITE-AGENT-001 |
| 后台管理员 | `admin@3cloud.dev` | `Admin@2024!` | 58 | — | super_admin，负责充值审核 / 财务报表 |

> 另留存 1 个压力测试账号：`stress-1786349848429@test.com`（¥9.9442，90 次调度后余额一致）。

---

## 二、全流程验证结果（浏览器真实操作）

### ① 普通用户：登录 → 对公打款下单 ¥500 → 审核中 ✅
- 登录 `verify-user@3cloud.dev`，进入充值页 `/app/recharge`
- 初始余额 **¥10.00**（注册赠金）正确显示
- 选择「对公转账」，输入金额 ¥500，点击「提交审核」
- 页面进入 **「对公转账审核中」** 状态，最近充值记录出现订单
- **订单号：`RC202608101610514429`**（状态 pending，待财务确认）

📸 证据：`test-reports/evidence/01-user-recharge.png`

### ② 后台管理员：充值订单审核通过 → 余额到账 ✅
- 登录 `admin@3cloud.dev`，进入 `/app/admin/finance/orders`
- 搜索该用户对公打款订单 → 点击「审核通过」
- 后端事务原子完成：订单状态 `pending→paid` + `customer_balances.available_balance` +500 + 写入 `balance_transactions`（type=recharge，¥500）
- 页面提示「操作成功，余额已更新」，订单状态变为 **已完成**

📸 证据：`test-reports/evidence/03-admin-recharge-orders.png`

### ③ 普通用户：余额到账 ¥510 → 建 Key → 真实调度 → 消费核对 ✅
- 重新登录用户，余额显示 **¥510.00**（¥10 + ¥500）
- 创建 API Key：**`3c_bca88d74b…`**（`3c_` 前缀）
- **真实调度**：以该 Key 走 portal 统一入口 `POST /v1/chat/completions`（model=deepseek-chat，流式非流式均支持）→ 后端真实记账
  - 返回 200，`usage.total_tokens=73`，扣除 **¥0.000512**
- **消费核对**：调用日志页 `/app/logs` 出现该次调度记录（deepseek-chat / 73 tokens / ¥0.0005）

📸 证据：`test-reports/evidence/02-user-logs.png`

### ④ 后台管理员：财务工作台 + 消费追踪 ✅
- `/app/admin/finance/dashboard` 财务工作台可访问
- `/app/admin/consumption/tracking` 消费追踪页可访问（含用户调度产生的消费记录）

📸 证据：`test-reports/evidence/04-admin-finance-dashboard.png` / `05-admin-consumption-tracking.png`

### ⑤ 代理商：代理工作台 ✅
- 登录 `verify-agent@3cloud.dev`，进入 `/app/agent/dashboard`
- **代理商控制台** 正常渲染（累计佣金 / 名下客户 / 累计消费 / 业绩排行）

📸 证据：`test-reports/evidence/06-agent-dashboard.png`

---

## 三、调度压力测试（并发一致性）✅ 4/4 通过

脚本：`node scripts/stress-chat.cjs 30 3` — 并发 30 × 3 轮 = **90 次真实调度**

| 核对项 | 结果 |
|---|---|
| 全部请求成功 | ✅ 90/90 ok |
| 今日调用数 == 请求数 | ✅ todayCallCount=90 |
| 今日消费 > 0 | ✅ ¥0.0558 |
| 余额扣减 == 消费 | ✅ ¥10 → ¥9.9442（扣 ¥0.0558） |

---

## 四、财务报表与用户消费核对（数据库级）✅

### 消费记账一致性
```
consumption_records sum(cost)        = 0.000512
| balance_transactions sum(amount)|  = 0.000512
→ 一致 ✅
```

### 余额核对
```
赠金 ¥10 + 对公打款审核 ¥500 − 消费 ¥0.000512 = 509.999488
实际 customer_balances.available_balance      = 509.999488
→ 一致 ✅
```

### 关键数据行
```
RECHARGE_ORDERS:  RC202608101610514429 | 500.00 | paid | paid_at=true
BT_RECHARGE:      count=1 | sum=500.00
CONSUMPTION:      count=1 | cost=0.000512 | tokens=73
BT_CONSUMPTION:   count=1 | sum=-0.000512
```

---

## 五、发现并修复的缺陷

1. **记账精度 bug（已修复，关键）**：`amount`/`balance` 列原为 `numeric(18,4)`，`0.00062` 被截断为 `0.0006`，60 笔累积误差 ¥0.0012。已改为 `numeric(18,8)` + 手工 `ALTER TABLE`（db:push 因 enum 依赖失败），压测后 sum 完全一致。
2. **充值记录刷新竞态（已修复）**：`RechargePage` 在 POST 完成前 invalidate，订单不即时出现。改为在 `onSuccess` 后 invalidate，浏览器下单后订单即时展示。

---

## 六、回归验证

- 三角色登录角色正确：customer / agent / super_admin ✅
- API `/health` 正常（uptime 稳定）✅
- 金额精度：全流程 6 位小数记账无误，压测 90 笔 sum 精确一致 ✅

**结论：** 从注册 → 对公打款 → 后台审核 → 真实调度 → 压力测试 → 财务报表 → 消费核对，全链路真实走通；所有账号与数据已留存 DB 供核实。
