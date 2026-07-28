# 3cloud（3C）运营版 PRD 补充规格文档

> **版本**：V4.1-补充规格 | **生成**：2026-07-27
> **定位**：对 `PRD-运营级.md` 做可执行级补充（表结构、API 规格、交互细节、边界条件）
> **不动已有实现**，只补充 PRD 已列但未精化到编码级别的部分

---

## 目录

1. [账号注销流程](#1-账号注销流程)
2. [Playground 交互与计费规格](#2-playground-交互与计费规格)
3. [代理结算账单与对账（表+API+PDF）](#3-代理结算账单与对账)
4. [PRD 已有但前端未实现的差异清单](#4-prd-已有但前端未实现的差异清单)
5. [运营待办队列（Push + Backend）](#5-运营待办队列)
6. [A/B 测试模块（表+API+统计）](#6-ab-测试模块)
7. [新手任务 / Onboarding 引导系统](#7-新手任务--onboarding-引导系统)
8. [操作日志增强规格](#8-操作日志增强规格)
9. [熔断器配置持久化方案](#9-熔断器配置持久化方案)

---

## 1. 账号注销流程

### 1.1 业务逻辑

运营逻辑：注销不是删除，是**软删除+冻结期**，保护用户数据且在冻结期内可撤销。

```
用户发起注销申请
  → 系统检查注销条件（余额、未结账单、进行中提现等）
  → 满足 → 冻结期 7 天（用户可撤销）
  → 不满足 → 提示并列出待处理事项
  → 冻结期内：用户可登录（仅查看和数据下载），不可调用 API
  → 冻结期满 → 自动执行注销（数据脱敏+标记删除）
```

### 1.2 表设计

```sql
-- 注销申请表
CREATE TABLE account_deletion_requests (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            TEXT,                          -- 用户填写的注销原因
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending: 待审核 / cooling: 冻结期 / completed: 已注销 / cancelled: 用户撤销 / rejected: 管理员驳回
  cooling_deadline  TIMESTAMPTZ,                   -- 冻结期截止（7天后）
  cancelled_at      TIMESTAMPTZ,                   -- 用户撤销时间
  completed_at      TIMESTAMPTZ,                   -- 执行注销时间
  rejected_reason   TEXT,                          -- 驳回原因
  processed_by      INTEGER REFERENCES users(id),  -- 管理员操作人
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT uq_user_deletion UNIQUE (user_id, status)  -- 一个用户同时只有一个活跃注销请求
);

-- 注销检查项清单（记录每项检查结果）
CREATE TABLE deletion_checklist (
  id                SERIAL PRIMARY KEY,
  request_id        INTEGER NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  check_item        VARCHAR(50) NOT NULL,
                    -- balance_cleared / no_pending_withdraw / no_unsettled_bills / no_active_keys / no_pending_invoices / no_active_agent
  passed            BOOLEAN NOT NULL DEFAULT FALSE,
  detail            TEXT,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/me/deletion` | 提交注销申请 |
| GET | `/api/v1/me/deletion` | 查看注销申请状态 |
| DELETE | `/api/v1/me/deletion` | 撤销注销申请（冻结期内） |
| GET | `/api/v1/admin/users/:id/deletion` | 管理员查看用户注销信息 |
| POST | `/api/v1/admin/users/:id/deletion/reject` | 管理员驳回注销 |
| POST | `/api/v1/admin/users/:id/deletion/force` | 管理员强制注销 |

### 1.4 注销条件检查逻辑

```
POST /api/v1/me/deletion 请求体：
  { "reason": "不再使用" }

后端检查：
  1. 余额 < ¥0.01（欠费必须清账才能注销？→ 是，欠费不允许注销）
  2. 无进行中的提现申请
  3. 无未结算的佣金（代理商）
  4. 无进行中的发票申请
  5. 无进行中的退款申请
  6. 所有 API Key 已禁用

任一项不通过 → 返回 400 + 详细问题列表
全部通过 → 创建 account_deletion_requests (status=cooling, cooling_deadline=NOW() + 7天)
  → 禁用用户所有 Key
  → 将用户 status 改为 'deleting'
```

### 1.5 冻结期行为

- 登录：✅ 允许（仅查看+下载）
- API 调用：❌ 返回 403 "账户注销中"
- 充值：❌ 入口隐藏
- 新建 Key：❌ 入口隐藏
- 提现/发票/退款：❌ 入口隐藏
- 数据下载：✅ 允许导出消费明细

### 1.6 自动注销定时任务（cron 每日 03:00）

```sql
UPDATE users SET 
  status = 'deleted',
  nickname = CONCAT('已注销用户_', id),
  email = CONCAT('deleted_', id, '@internal.3cloud.ai'),
  phone = NULL,
  avatar_url = NULL,
  deleted_at = NOW()
WHERE status = 'deleting'
  AND EXISTS (
    SELECT 1 FROM account_deletion_requests
    WHERE user_id = users.id
    AND status = 'cooling'
    AND cooling_deadline <= NOW()
  );

-- 同时执行数据脱敏（Key 脱敏、日志保留但 userId 保留、个人身份信息清除）
UPDATE account_deletion_requests SET status = 'completed', completed_at = NOW()
WHERE status = 'cooling' AND cooling_deadline <= NOW();
```

### 1.7 UI 展现形式

**用户端 `/console/settings` → "注销账号"区域**

```
┌─ 账号注销 ──────────────────────────────────┐
│ ⚠️ 注销后将无法恢复                           │
│                                              │
│ 注销前请确认：                                │
│   ✓ 余额已用完（¥0.00） ✅                     │
│   ✓ 所有 Key 已禁用 ✅                         │
│   ✗ 存在 1 笔进行中的发票 → [前往处理]        │
│                                              │
│ 提交注销后将进入 7 天冷静期                    │
│ 期内可撤销注销，期满自动执行                  │
│                                              │
│ [提交注销申请]（需全部通过才可点击）           │
└──────────────────────────────────────────────┘
```

**冻结期状态页（用户端）**

```
┌─ 账号注销中 ─────────────────────────────────┐
│ 🔄 您已提交账号注销申请                       │
│                                              │
│ 冷静期截止：2026-08-03 18:30                 │
│ 剩余：6 天 12 小时                           │
│                                              │
│ 期间您可以：                                  │
│ • 登录查看历史数据 ✅                          │
│ • 下载消费记录 ✅                             │
│ • 撤销注销申请 [点击撤销]                     │
│                                              │
│ × 不可调用 API                               │
│ × 不可充值、新建 Key                         │
└──────────────────────────────────────────────┘
```

---

## 2. Playground 交互与计费规格

### 2.1 全量交互规格

#### 界面结构

```
┌───────────────── Main Layout ─────────────────┐
│ [Logo/Tab: 对话模式 | 对比模式]                │
├────────── Input Panel ───────┬─ Output Panel ──┤
│ 模型选择 [ deepseek-chat ▼ ] │  响应区域        │
│ Key 选择 [ my-key ▼ ]       │                 │
│ System Prompt:               │ [模型]: ds-c    │
│ [__________________________] │ Token: 234/567  │
│ Messages:                    │ 费用: ¥0.0034   │
│ ┌──────────────────────────┐ │ 耗时: 1.2s     │
│ │ user: Hello              │ │                │
│ │ assistant: Hi!           │ │ [响应内容...]   │
│ │ user: What is AI?        │ │                │
│ └──────────────────────────┘ │                │
│ [Input Box ██████████████]   │                │
│ Token: 89  [发送] [清空]    │                │
├────────────── Footer ─────────────────────────┤
│ 已用 Token: 1,234 | 费用: ¥0.0123 | [历史]    │
└──────────────────────────────────────────────┘
```

#### 计费确认弹窗（费用 > ¥0.01 时）

```
┌─ Playground 费用确认 ─────────────────────┐
│ 本次调用预估费用：¥0.0345                   │
│                                           │
│ 模型：deepseek-chat                        │
│ 输入 Token：约 890（含 System + 历史）     │
│ 输出 Token：约 500（max_tokens）           │
│                                           │
│ ☐ 不再提醒（本次会话内）                    │
│                                           │
│ [取消] [确认发送]                           │
└───────────────────────────────────────────┘
```

#### 对比模式布局

```
┌─ Input ──────────────────────────────────────┐
│ 选择对比模型：[☑ deepseek-chat] [☑ gpt-4o]   │
│ [☐ claude-3.5] [☐ deepseek-v4-flash]         │
│ [Prompt █████████████████████████████████]    │
│ [全部发送]                                     │
├─ Results ────────────────────────────────────┤
│ ┌── deepseek-chat ──┬── gpt-4o ──────────┐  │
│ │ Token: 234/567    │ Token: 245/590     │  │
│ │ 费用: ¥0.0034     │ 费用: ¥0.0156     │  │
│ │ 耗时: 1.2s        │ 耗时: 0.8s 🏆最快 │  │
│ │                   │                    │  │
│ │ [Response...]     │ [Response...]      │  │
│ └───────────────────┴────────────────────┘  │
│ 🏆 最低价: deepseek-chat                     │
│ 🏆 最快: gpt-4o                              │
└──────────────────────────────────────────────┘
```

### 2.2 历史记录数据结构

```typescript
// localStorage 存储（索引键）和服务端存储（持久化）
interface PlaygroundSession {
  id: string;                  // uuid
  userId: number;
  model: string;
  mode: 'chat' | 'compare';
  compareModels?: string[];    // 对比模式所选模型
  messages: PlaygroundMessage[];
  createdAt: string;           // ISO 8601
  updatedAt: string;
  totalTokens: number;
  totalCost: number;
}

interface PlaygroundMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  model?: string;              // 对比模式下标注来自哪个模型
  tokens?: {
    input: number;
    output: number;
  };
  cost?: number;
  durationMs?: number;
  timestamp: string;
}
```

### 2.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/playground/chat` | 代理转发到上游模型（真实计费） |
| GET | `/api/v1/playground/history` | 本地+服务端历史查询 |
| DELETE | `/api/v1/playground/history/:id` | 删除一条历史 |
| POST | `/api/v1/playground/history/:id/save` | 保存当前会话到服务端 |

### 2.4 后端转发代码关键逻辑

```typescript
// POST /api/v1/playground/chat
// 请求体与标准 OpenAI Chat Completions 格式一致
// 特殊字段：playground_mode: 'chat' | 'compare'

// 处理逻辑：
1. 验证 API Key（用户自己的 Key，valide 状态）
2. 预计算费用（按模型定价 × max_tokens）
3. 余额检查（同正式路由）
4. 预扣费用
5. 转发到上游供应商
6. 收到响应后：
   a. 解析实际 Token 消耗
   b. 调整预扣（多退少补）
   c. 记录 playground_logs（与 call_logs 分离，但计费计入正常消费流水）
   d. 返回标准响应格式 + playload 元数据（token/cost/duration）
```

### 2.5 playground_logs 表

```sql
CREATE TABLE playground_logs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  api_key_id        INTEGER NOT NULL REFERENCES api_keys(id),
  session_id        VARCHAR(36),                -- 会话分组 ID
  model             VARCHAR(100) NOT NULL,
  mode              VARCHAR(10) NOT NULL DEFAULT 'chat',  -- chat / compare
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  input_price       DECIMAL(12,8) NOT NULL,
  output_price      DECIMAL(12,8) NOT NULL,
  cost              DECIMAL(18,8) NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  status            VARCHAR(20) NOT NULL DEFAULT 'success',
  error_code        VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_playground_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_playground_user_created ON playground_logs(user_id, created_at DESC);
```

---

## 3. 代理结算账单与对账

### 3.1 业务逻辑

```
当前状态：代理商佣金按笔记录，但缺少"结算周期"概念
补充目标：引入结算周期 + 自动生成账单 + 对账确认流程

结算周期：
  固定月结（每月 1 日生成上期账单）
  账单内容：期内佣金汇总 + 逐笔明细
  对账流程：生成 → 代理确认 | 3 天未确认自动确认 → 结算完成 → 金额计入可提现余额
```

### 3.2 表设计

```sql
-- 结算周期定义
CREATE TABLE settlement_cycles (
  id                SERIAL PRIMARY KEY,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
                    -- open: 进行中 / closed: 已关账 / settled: 已结算
  generated_at      TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_period UNIQUE (period_start, period_end)
);

-- 代理结算账单
CREATE TABLE agent_settlements (
  id                SERIAL PRIMARY KEY,
  cycle_id          INTEGER NOT NULL REFERENCES settlement_cycles(id),
  agent_id          INTEGER NOT NULL REFERENCES users(id),
  total_commission  DECIMAL(18,4) NOT NULL DEFAULT 0,  -- 期内佣金总额
  settled_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,   -- 实际结算金额（扣除退货/退款调整）
  adjustment_amount DECIMAL(18,4) NOT NULL DEFAULT 0,   -- 调整金额（正为补，负为扣）
  adjustment_reason TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending: 待确认 / confirmed: 代理已确认 / auto_confirmed: 自动确认 / settled: 已结算
  confirmed_at      TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_agent_cycle UNIQUE (cycle_id, agent_id),
  CONSTRAINT fk_agent_sett_cycle FOREIGN KEY (cycle_id) REFERENCES settlement_cycles(id),
  CONSTRAINT fk_agent_sett_agent FOREIGN KEY (agent_id) REFERENCES users(id)
);

-- 结算明细（每笔佣金归期）
CREATE TABLE settlement_details (
  id                SERIAL PRIMARY KEY,
  settlement_id     INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  commission_id     INTEGER NOT NULL REFERENCES agent_commission_logs(id),
  amount            DECIMAL(18,4) NOT NULL,
  client_user_id    INTEGER NOT NULL REFERENCES users(id),
  consumption_id    INTEGER REFERENCES consumption_logs(id),
  model             VARCHAR(100),
  tokens            INTEGER,
  commission_rate   DECIMAL(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 对账确认日志
CREATE TABLE settlement_confirm_logs (
  id                SERIAL PRIMARY KEY,
  settlement_id     INTEGER NOT NULL REFERENCES agent_settlements(id) ON DELETE CASCADE,
  action            VARCHAR(20) NOT NULL,
                    -- generate / confirm / auto_confirm / adjust / settle
  operator_id       INTEGER REFERENCES users(id),
  operator_role     VARCHAR(20),
  detail            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/finance/settlement-cycles` | 结算周期列表 |
| POST | `/api/v1/admin/finance/settlement-cycles/generate` | 手动触发关账+账单生成 |
| GET | `/api/v1/admin/finance/settlements` | 所有代理结算单列表 |
| GET | `/api/v1/admin/finance/settlements/:id` | 单条结算单详情 |
| GET | `/api/v1/admin/finance/settlements/:id/details` | 结算明细 |
| GET | `/api/v1/admin/finance/settlements/:id/export` | 导出结算单 CSV |
| POST | `/api/v1/admin/finance/settlements/:id/adjust` | 管理员调整结算金额 |
| GET | `/api/v1/agent/settlements` | 代理端查看自己结算单 |
| GET | `/api/v1/agent/settlements/:id` | 代理查看单条结算详情 |
| POST | `/api/v1/agent/settlements/:id/confirm` | 代理确认结算单 |
| GET | `/api/v1/agent/settlements/:id/export-pdf` | 下载结算账单 PDF |

### 3.4 账单 PDF 内容结构

```
3cloud 代理结算单
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

代理名称: TechAgent (ID: u_1001)
结算周期: 2026-07-01 ~ 2026-07-31
生成日期: 2026-08-01
账单编号: STL-20260801-0001

━━━━ 汇总 ━━━━━━━━━━━━━━━━━━━━━━━━━
期内总佣金:        ¥ 3,456.78
调整金额:         -¥ 23.50（退款扣回）
本期结算金额:      ¥ 3,433.28

━━━━ 佣金明细（共 45 笔）━━━━━━━━━━
日期        | 客户         | 模型          | 消费金额 | 佣金率 | 佣金
2026-07-01 | 张三         | deepseek-chat | ¥100.00 | 10%   | ¥10.00
2026-07-01 | 李四         | gpt-4o        | ¥200.00 | 10%   | ¥20.00
...（全部 45 笔明细）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

确认状态: [ ] 待确认
自动确认日: 2026-08-04（逾期自动确认）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3cloud - AI Token 聚合平台
support@3cloud.ai
```

### 3.5 定时任务（cron 每月 1 日 02:00）

```
1. 获取上期周期（open）
2. 查询所有代理期内佣金汇总
3. 计算调整（退款扣回）
4. 写入 agent_settlements
5. 写入 settlement_details（含每笔佣金来源）
6. 关闭周期（status=closed）
7. 通知各代理（站内+邮件）
```

### 3.6 代理确认后的操作

```
代理确认结算单后：
  → agent_settlements.status = 'confirmed'
  → 更新代理余额：withdrawable += settled_amount
  → 记录 balance_logs（类型: commission_settlement）
  → 通知代理：结算金额已转入可提现余额

3 天未确认 → 自动确认（auto_confirmed）
  → 同样执行余额增加操作
  → 额外记录"已自动确认"日志
```

---

## 4. PRD 已有但前端未实现的差异清单

> 基于 2026-07-27 前端路由 + 组件扫描与 PRD-运营级.md 对比

### 4.1 完全缺失（PRD 写了，完全没做）

| 序号 | PRD 章节 | 功能 | 缺失等级 | 备注 |
|------|---------|------|---------|------|
| 1 | 2.2.1-14 | 实时活动流（WebSocket） | P1 | 后端有 alert-ws.ts，但用户端无对应组件 |
| 2 | 2.2.1-12 | 异常告警卡片（用户端） | P1 | 管理端有 alert，用户端无独立的告警面板 |
| 3 | 2.2.1-15 | 模型推荐/成本优化建议 | P2 | 无对应组件或 API |
| 4 | 2.2.1 | 账号注销流程 | P0 | 整个功能本章补充 |
| 5 | 4.5.3 | 敏感词库 `/admin/sensitive-words` | P2 | 后端有敏感词路由，但无管理页面前端组件 |
| 6 | 4.6.3 | 风控规则引擎 `/admin/security-rules` | P2 | 后端 rule-engine 存在，无管理页面 |
| 7 | 4.6.4 | AI 风控模型 `/admin/risk-control` | P2 | 后端 risk-control 路由存在，无管理页面 |
| 8 | 4.9.1 | 自定义报表 `/admin/custom-reports` | P2 | 后端 custom-reports 路由存在，无管理页面 |
| 9 | 4.9.2 | A/B 测试 `/admin/ab-testing` | P2 | 后端 ab-testing 路由存在，无管理页面 |
| 10 | 2.2.6 | 对公转账凭证上传 | P0 | 充值页面无上传入口 |
| 11 | 4.7.3 | 实时监控 `/admin/monitoring` | P1 | 后端 monitoring 路由存在，无独立监控页面 |

### 4.2 部分缺失（PRD 写了，组件不完整）

| 序号 | PRD 章节 | 功能 | 现状 | 缺失内容 |
|------|---------|------|------|---------|
| 12 | 2.2.3 | Key 过期时间 UI | Key 列表无过期时间列 | 创建 Key 弹窗无过期间选项、过期提醒未实现 |
| 13 | 2.2.3 | Key 权限控制 | 后端权限控制有但 UI 缺失 | 前端创建 Key 弹窗缺少"选择模型"权限选择器 |
| 14 | 2.2.9 | 发票申请 | 前端有页面，但缺少状态追踪 | 发票进度追踪、专票收件地址填写、快递单号查看 |
| 15 | 4.5.2 | 公告已读统计 | 公告页面存在 | 缺少"已读/未读"统计面板和二次推送功能 |
| 16 | 4.6.2 | IP 黑白名单 / 地理封禁 | 安全配置页 | 缺少导出功能、缺少"例外用户"配置 |
| 17 | 4.7.4 | 限流可视化 `/admin/rate-limits` | 后端有 rate-limits.ts | 前端无独立限流管理页面 |

### 4.3 UI 功能标注（⬡ ⓘ 功能提示）

**当前已有功能说明浮标**：已在 46/47 管理页面添加 FeatureDescription 组件（ⓘ 图标）。

**待补充的建议标注**：缺少关键弹窗及操作引导的场景

| 场景 | 缺失内容 |
|------|---------|
| 批量操作（用户/Key） | 缺少"选中 N 项后底部操作栏"的交互逻辑 |
| 数据导出（列表页） | 大部分列表缺少导出 CSV 按钮 |
| 充值对账管理 | 缺少"补单"和"退款"操作按钮和确认弹窗 |

---

## 5. 运营待办队列

### 5.1 业务逻辑

```
运营待办是管理后台的"任务中心"，聚合所有需要管理员干预的事项。
当前状态：各模块独立（提现审核、实名审核、发票审核等），无统一入口。

补充目标：统一待办 API + 管理后台入口组件 + 自动推送
```

### 5.2 表设计

```sql
CREATE TABLE admin_todo_queue (
  id                SERIAL PRIMARY KEY,
  todo_type         VARCHAR(50) NOT NULL,
                    -- agent_audit / withdraw_audit / real_name_review / invoice_audit / refund_audit / announcement_push / settlement_confirm / supplier_offline / campaign_end
  todo_title        VARCHAR(200) NOT NULL,     -- 展示标题
  todo_summary      TEXT,                       -- 摘要信息
  priority          VARCHAR(10) NOT NULL DEFAULT 'normal',
                    -- urgent / high / normal / low
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending / processing / completed / ignored
  source_id         INTEGER,                    -- 来源记录 ID（如 withdraw_id）
  source_table      VARCHAR(50),                -- 来源表名
  assigned_role     VARCHAR(30),                -- 指定角色处理（如 finance / operator）
  assigned_user_id  INTEGER REFERENCES users(id),  -- 指定人员
  deadline          TIMESTAMPTZ,                -- 处理截止时间
  completed_by      INTEGER REFERENCES users(id),
  completed_at      TIMESTAMPTZ,
  auto_notify       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_todo_assignee FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  CONSTRAINT fk_todo_completer FOREIGN KEY (completed_by) REFERENCES users(id)
);

CREATE INDEX idx_todo_status_priority ON admin_todo_queue(status, priority DESC, created_at);
CREATE INDEX idx_todo_assigned ON admin_todo_queue(assigned_user_id, status);
CREATE INDEX idx_todo_type ON admin_todo_queue(todo_type, status);
```

### 5.3 待办类型与生成规则

| todo_type | 触发条件 | 优先级 | 处理入口 | 自动过期 |
|-----------|---------|--------|---------|---------|
| withdraw_audit | 代理提交提现申请 | urgent | 提现审核 | — |
| real_name_review | 用户提交实名认证 | normal | 实名审核 | 48h |
| agent_audit | 代理升级申请 | high | 代理审核 | 72h |
| invoice_audit | 用户提交发票申请 | normal | 发票审核 | 48h |
| refund_audit | 用户提交退款 | high | 退款管理 | — |
| announcement_push | 定时公告到发布时间 | normal | 公告列表 | 24h |
| settlement_confirm | 结算周期关账 | normal | 结算管理 | — |
| supplier_offline | 供应商状态异常 | urgent | 供应商管理 | — |
| campaign_end | 活动快到截止日 | low | 活动管理 | — |

### 5.4 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/todo-queue` | 待办列表（筛选+分页） |
| GET | `/api/v1/admin/todo-queue/stats` | 各类型待办数量统计 |
| POST | `/api/v1/admin/todo-queue/:id/claim` | 认领待办（转 processing）|
| POST | `/api/v1/admin/todo-queue/:id/complete` | 完成待办 |
| POST | `/api/v1/admin/todo-queue/:id/ignore` | 忽略待办 |
| POST | `/api/v1/admin/todo-queue/generate` | 手动触发待办生成 |
| GET | `/api/v1/admin/todo-queue/:id` | 待办详情 |

### 5.5 管理后台组件布局

```
管理后台 → 侧边栏顶部新增「待办队列」入口

┌─ 待办队列 ──────────────────────────────────┐
│ 🔴 紧急 (2)   🟡 高 (5)   🟢 正常 (8)   ▫️ 低 (3)│
│                                              │
│ ── 🔴 紧急 ──                                 │
│ 待处理提现 #WD-001  | 代理 TechAgent          │
│   ¥5,000.00  | 已等待 15 分钟  | [处理 →]     │
│                                              │
│ 供应商 DeepSeek 异常下线                      │
│   影响 5 个模型, 45 个用户  | [处理 →]        │
│                                              │
│ ── 🟡 高 ──                                   │
│ 代理升级申请: 张三 → 高级代理                  │
│   提交时间: 2 小时前  | [审核 →]              │
│                                              │
│ 实名认证待审 (3 条)                           │
│   最久等待: 6 小时  | [审核 →]               │
└──────────────────────────────────────────────┘
```

---

## 6. A/B 测试模块

### 6.1 表设计

```sql
-- A/B 测试实验
CREATE TABLE ab_experiments (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- draft / running / paused / completed / cancelled
  experiment_type   VARCHAR(30) NOT NULL,
                    -- pricing / model_routing / ui_component / discount
  allocation_method VARCHAR(20) NOT NULL DEFAULT 'user_hash',
                    -- user_hash / key_hash / random / region
  a_label           VARCHAR(50) NOT NULL DEFAULT 'A - 对照组',
  b_label           VARCHAR(50) NOT NULL DEFAULT 'B - 实验组',
  a_config          JSONB,                     -- A 组配置
  b_config          JSONB,                     -- B 组配置
  a_percent         INTEGER NOT NULL DEFAULT 50, -- A 组占比
  b_percent         INTEGER NOT NULL DEFAULT 50, -- B 组占比
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 实验目标指标
CREATE TABLE ab_experiment_metrics (
  id                SERIAL PRIMARY KEY,
  experiment_id     INTEGER NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  metric_name       VARCHAR(50) NOT NULL,
                    -- call_count / token_usage / cost / success_rate / user_retention / revenue / latency
  metric_label      VARCHAR(100),
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,  -- 主要指标
  is_secondary      BOOLEAN NOT NULL DEFAULT FALSE   -- 次要指标
);

-- 实验分组分配记录
CREATE TABLE ab_experiment_assignments (
  id                SERIAL PRIMARY KEY,
  experiment_id     INTEGER NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  group_assigned    VARCHAR(1) NOT NULL,      -- 'A' or 'B'
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_ab_user_exp UNIQUE (experiment_id, user_id)
);

-- 实验指标汇总快照（定时计算存储）
CREATE TABLE ab_experiment_snapshots (
  id                SERIAL PRIMARY KEY,
  experiment_id     INTEGER NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  snapshot_at       DATE NOT NULL,
  a_metrics         JSONB NOT NULL,           -- {"call_count": 1234, "revenue": 456.78, ...}
  b_metrics         JSONB NOT NULL,
  significance      DECIMAL(10,8),            -- p-value（主要指标）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ab_snapshot UNIQUE (experiment_id, snapshot_at)
);
```

### 6.2 分流算法（user_hash）

```typescript
function assignUserToGroup(userId: number, experiment: AbExperiment): 'A' | 'B' {
  const hash = hashCode(`${experiment.id}_${userId}`);
  const mod = hash % 100;
  return mod < experiment.a_percent ? 'A' : 'B';
}

// hashCode 使用稳定且均匀分布的算法（如 DJB2 改良版）
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash &= 0x7FFFFFFF; // 保持正数
  }
  return hash;
}
```

### 6.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/ab-testing` | 实验列表 |
| POST | `/api/v1/admin/ab-testing` | 创建实验 |
| GET | `/api/v1/admin/ab-testing/:id` | 实验详情 + 当前结果 |
| PUT | `/api/v1/admin/ab-testing/:id` | 更新实验配置 |
| POST | `/api/v1/admin/ab-testing/:id/start` | 启动实验 |
| POST | `/api/v1/admin/ab-testing/:id/pause` | 暂停实验 |
| POST | `/api/v1/admin/ab-testing/:id/complete` | 完成实验 + 选择优胜组 |
| GET | `/api/v1/admin/ab-testing/:id/snapshots` | 历史快照 |

### 6.4 统计结果计算（后端定时任务 cron 每日 02:00）

```sql
-- 对每个 running 状态的实验，计算当天快照
INSERT INTO ab_experiment_snapshots (experiment_id, snapshot_at, a_metrics, b_metrics)
SELECT
  e.id,
  CURRENT_DATE,
  jsonb_build_object(
    'call_count', a_stats.call_count,
    'token_usage', a_stats.token_usage,
    'cost', a_stats.cost,
    'success_rate', a_stats.success_rate
  ),
  jsonb_build_object(...)  -- B 组同理
FROM ab_experiments e
  LEFT JOIN (
    -- A 组统计
    SELECT ... FROM consumption_logs cl
    JOIN ab_experiment_assignments a ON cl.user_id = a.user_id AND a.group_assigned = 'A'
    WHERE cl.created_at >= CURRENT_DATE - INTERVAL '1 day'
    AND a.experiment_id = e.id
  ) a_stats ON TRUE
  LEFT JOIN (
    -- B 组统计
    SELECT ... FROM consumption_logs cl
    JOIN ab_experiment_assignments a ON cl.user_id = a.user_id AND a.group_assigned = 'B'
    WHERE ...
  ) b_stats ON TRUE
WHERE e.status = 'running';
```

### 6.5 UI 展现形式

**实验列表页**

```
┌─ A/B 测试 ──────────────────────────────────┐
| [新建实验]                                    │
|                                               │
| 实验名          | 状态    | 运行天数 | 创建人    │
| 定价弹性测试     | ▶ 运行中 | 7 天   | admin   │
| 模型推荐测试     | ⏸ 暂停   | 3 天   | admin   │
| 收费模式测试     | ⏹ 已完成 | 14 天  | admin   │
└───────────────────────────────────────────────┘
```

**实验详情页**

```
┌─ 定价弹性测试: deepseek-chat ───────────────┐
│ 状态: ▶ 运行中    运行天数: 7/30             │
│                                              │
│ 分组:                                         │
│ A 组 (50%) ¥0.002/1K  调用量: 12,340/天      │
│ B 组 (50%) ¥0.0017/1K 调用量: 15,678/天      │
│                                              │
│ 关键指标对比:                                  │
│ 调用量变化: +27.1%  p=0.003 ✅ 显著           │
│ 收入变化:  +8.0%   p=0.12  ❌ 不显著          │
│                                              │
│ 数据充足度: 73% (建议继续运行至 14 天)        │
│                                              │
│ [暂停] [完成并选择优胜]                        │
└──────────────────────────────────────────────┘
```

---

## 7. 新手任务 / Onboarding 引导系统

### 7.1 业务逻辑

```
目标：提升新用户注册后 7 日留存率和首次 API 调用转化率

核心原则：
  1. 有奖励才有动力 —— 完成引导任务获得小额体验金
  2. 渐进式引导 —— 不是一次性弹窗，而是"下一步该做什么"的轻提示
  3. 可跳过 —— 永远提供"稍后再说"选项
```

### 7.2 表设计

```sql
-- Onboarding 任务定义（系统级配置）
CREATE TABLE onboarding_tasks (
  id                SERIAL PRIMARY KEY,
  task_key          VARCHAR(50) NOT NULL UNIQUE, -- create_first_key / test_first_api / complete_profile / bind_phone / first_recharge / invite_friend
  title             VARCHAR(100) NOT NULL,       -- 展示标题
  description       TEXT,                        -- 详细说明
  icon              VARCHAR(50),                 -- 图标名称
  sort_order        INTEGER NOT NULL DEFAULT 0,  -- 排序
  reward_type       VARCHAR(20),                 -- balance / free_tokens / coupon
  reward_amount     DECIMAL(18,4) DEFAULT 0,     -- 奖励数量
  is_required       BOOLEAN NOT NULL DEFAULT FALSE, -- 是否必须完成
  auto_complete     BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否自动检测完成（vs 手动领取）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户 Onboarding 进度
CREATE TABLE user_onboarding_progress (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_key          VARCHAR(50) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending / completed / reward_claimed / skipped
  completed_at      TIMESTAMPTZ,
  reward_claimed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_task UNIQUE (user_id, task_key)
);

-- 系统级任务默认配置（种子数据）
INSERT INTO onboarding_tasks (task_key, title, description, icon, sort_order, reward_type, reward_amount, is_required, auto_complete) VALUES
('create_first_key', '创建你的第一个 API Key', '在控制台创建 API Key，开始使用 3cloud', '🔑', 1, 'balance', 1.00, true, true),
('test_first_api', '测试首次 API 调用', '在 Playground 中发送一条消息体验服务', '🚀', 2, 'balance', 2.00, true, true),
('complete_profile', '完善个人资料', '设置昵称和头像，方便我们称呼你', '👤', 3, 'free_tokens', 10000, false, true),
('bind_phone', '绑定手机号', '绑定手机号增强账号安全', '📱', 4, 'balance', 1.00, false, true),
('first_recharge', '首次充值', '充值任意金额开始正常使用（体验金不可提现）', '💰', 5, 'balance', 5.00, false, false),
('invite_friend', '邀请好友注册', '邀请一位好友注册 3cloud', '🤝', 6, 'balance', 10.00, false, false);
```

### 7.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/me/onboarding` | 获取用户引导任务列表+进度 |
| POST | `/api/v1/me/onboarding/:task_key/claim` | 领取任务奖励 |
| POST | `/api/v1/me/onboarding/:task_key/skip` | 跳过任务 |
| GET | `/api/v1/admin/onboarding-tasks` | 管理员查看任务配置 |
| PUT | `/api/v1/admin/onboarding-tasks/:id` | 编辑任务配置 |
| GET | `/api/v1/admin/onboarding/stats` | Onboarding 完成率统计 |

### 7.4 自动完成检测逻辑

```typescript
// 在触发这些事件时，检查并自动完成对应任务：

// 1. 创建 API Key → 检查 create_first_key
await tryCompleteOnboarding(userId, 'create_first_key');

// 2. 首次成功的 API 调用 → 检查 test_first_api
await tryCompleteOnboarding(userId, 'test_first_api');

// 3. 更新用户 nickname → 检查 complete_profile
await tryCompleteOnboarding(userId, 'complete_profile');

// 4. 绑定手机号 → 检查 bind_phone
await tryCompleteOnboarding(userId, 'bind_phone');

async function tryCompleteOnboarding(userId: number, taskKey: string) {
  const existing = await db.select().from(userOnboardingProgress)
    .where(and(
      eq(userOnboardingProgress.userId, userId),
      eq(userOnboardingProgress.taskKey, taskKey)
    )).limit(1);
  
  if (existing.length === 0) {
    // 自动完成
    await db.insert(userOnboardingProgress).values({
      userId,
      taskKey,
      status: 'completed',
      completedAt: new Date()
    });
    
    // 通知前端推送已完成状态
  }
}
```

### 7.5 UI 展现形式

**仪表盘顶部引导条（首次登录或未完成引导时）**

```
┌─ 🎯 快速入门 —──────────────────────────────┐
│ 🔑 创建 Key  ✅  |  🚀 测试调用  [进行中]    │
│ 👤 完善资料  ⏳  |  📱 绑定手机  ⏳          │
│ 💰 首次充值  ⏳  |  🤝 邀请好友  ⏳          │
│                                              │
│ 完成全部 6 项任务可额外获得 ¥5 🎁           │
│                        [稍后再说]            │
└──────────────────────────────────────────────┘
```

**任务面板展开（/console/onboarding）**

```
┌─ 新手任务 ──────────────────────────────────┐
│ 进度: 2/6 任务完成 | 已获得 ¥3.00            │
│                                              │
│ ┌── 必做任务 ────────────────────────────┐  │
│ │ ✅ 创建 API Key          🔑 +¥1.00 ✅    │  │
│ │ 🚀 测试 API 调用         ⏳ 进行中        │  │
│ └──────────────────────────────────────────┘  │
│ ┌── 可选任务 ────────────────────────────┐  │
│ │ ⏳ 完善资料              👤 +10000 Token│  │
│ │ ⏳ 绑定手机              📱 +¥1.00     │  │
│ │ ❌ 首次充值              💰 +¥5.00     │  │
│ │ ❌ 邀请好友              🤝 +¥10.00    │  │
│ └──────────────────────────────────────────┘  │
│                                              │
│ 全部完成额外奖励: ¥5 🎁  [已完成所有任务]      │
└──────────────────────────────────────────────┘
```

### 7.6 新用户注册后自动触发

```
用户注册成功（POST /api/v1/auth/register）后：
  → 自动创建 user_onboarding_progress 的 6 条 pending 记录
  → 设置 users.onboarding_completed = false
  → 首次登录仪表盘时展示引导横幅（注册后 7 天内）
  → 7 天后仍未完成任何任务 → 降级为右上角小铃铛提示
```

---

## 8. 操作日志增强规格

### 8.1 当前状态

已有 `operation_logs` 表 + 操作日志查询页面（操作类型/操作人等字段）

### 8.2 补充内容

#### 8.2.1 敏感操作自动检测+二次确认弹窗

```typescript
// 敏感操作列表（需二次确认 + 记录前后值）
const SENSITIVE_OPERATIONS = [
  { action: 'user.balance.adjust', threshold: 1000 },  // 超过 ¥1000 需双人确认
  { action: 'withdraw.approve', threshold: null },      // 所有提现审核
  { action: 'recharge.manual_complete', threshold: null },
  { action: 'user.role.change', threshold: null },
  { action: 'config.update', threshold: null },          // 系统配置修改
  { action: 'vendor.status.change', threshold: null },
  { action: 'model.price.change', threshold: null },
  { action: 'user.status.ban', threshold: null },
  { action: 'agent.commission.change', threshold: null },
  { action: 'campaign.budget.change', threshold: null },
];

// 敏感操作检查中间件
async function sensitiveOperationCheck(req, reply, actionName, beforeValue, afterValue) {
  const config = SENSITIVE_OPERATIONS.find(s => s.action === actionName);
  if (!config) return true; // 非敏感操作直接通过
  
  // 记录操作日志（含前后值）
  await logOperation(req, actionName, beforeValue, afterValue);
  
  // 如果有阈值且超阈值，通知 super_admin
  if (config.threshold && Math.abs(Number(afterValue) - Number(beforeValue)) > config.threshold) {
    await notifySuperAdmin(actionName, req.user.id, {
      beforeValue, afterValue, diff: Number(afterValue) - Number(beforeValue)
    });
  }
  
  return true; // 记录已写入，弹窗由前端控制
}
```

#### 8.2.2 操作日志 API 增强

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/admin/operation-logs/anomaly-check` | 检测异常操作（夜间操作/高频操作/非惯用IP）|
| GET | `/api/v1/admin/operation-logs/export` | 导出操作日志 CSV |
| GET | `/api/v1/admin/operation-logs/stats` | 操作类型统计（今日各类型操作次数）|

#### 8.2.3 异常操作标注规则

```typescript
function annotateOperation(log: OperationLog, recentOps: OperationLog[]): string[] {
  const annotations: string[] = [];
  
  // 1. 夜间敏感操作
  const hour = new Date(log.createdAt).getHours();
  if (hour >= 0 && hour < 6 && SENSITIVE_OPERATIONS.some(s => s.action === log.action)) {
    annotations.push('🌙 夜间操作');
  }
  
  // 2. 高频操作（5 分钟内同类操作 ≥ 5 次）
  const recentCount = recentOps.filter(o => 
    Math.abs(new Date(o.createdAt).getTime() - new Date(log.createdAt).getTime()) < 300000
    && o.action === log.action
  ).length;
  if (recentCount >= 5) {
    annotations.push('⚡ 高频操作');
  }
  
  // 3. 非惯用 IP
  const ipHistory = recentOps.map(o => o.ip);
  const commonIps = getCommonIps(ipHistory);
  if (!commonIps.includes(log.ip)) {
    annotations.push('🆕 新 IP');
  }
  
  return annotations;
}
```

---

## 9. 熔断器配置持久化方案

### 9.1 当前状态

熔断器状态在内存中运行（`circuit-breaker/` 目录已有 6 个子文件），启动时从 `vendor_models` 表读取初始配置，运行时状态存在内存。

### 9.2 补充内容

#### 9.2.1 持久化表

```sql
CREATE TABLE circuit_breaker_configs (
  id                SERIAL PRIMARY KEY,
  target_type       VARCHAR(20) NOT NULL,      -- key / vendor / model
  target_id         INTEGER NOT NULL,           -- 关联对象 ID
  failure_threshold INTEGER NOT NULL DEFAULT 5, -- 连续失败次数触发
  cooldown_seconds  INTEGER NOT NULL DEFAULT 30, -- 全开→半开等待秒数
  probe_count       INTEGER NOT NULL DEFAULT 3,  -- 探针成功次数恢复
  probe_interval_seconds INTEGER NOT NULL DEFAULT 10, -- 探针间隔
  status            VARCHAR(20) NOT NULL DEFAULT 'closed',
                    -- closed / half_open / open
  last_state_change TIMESTAMPTZ,
  current_failures  INTEGER NOT NULL DEFAULT 0, -- 当前连续失败数
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_circuit_target UNIQUE (target_type, target_id)
);
```

#### 9.2.2 熔断事件记录表

```sql
CREATE TABLE circuit_breaker_events (
  id                SERIAL PRIMARY KEY,
  config_id         INTEGER NOT NULL REFERENCES circuit_breaker_configs(id) ON DELETE CASCADE,
  target_type       VARCHAR(20) NOT NULL,
  target_id         INTEGER NOT NULL,
  event_type        VARCHAR(20) NOT NULL,       -- open / half_open / close / failure / recovery / probe_success / probe_fail
  detail            TEXT,
  failure_count     INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_circuit_events_config ON circuit_breaker_events(config_id, created_at DESC);
CREATE INDEX idx_circuit_events_time ON circuit_breaker_events(created_at DESC);
```

#### 9.2.3 启动时加载

```typescript
// 应用启动时
async function loadCircuitBreakers() {
  const configs = await db.select().from(circuitBreakerConfigs);
  for (const config of configs) {
    circuitBreakerRegistry.set(
      `${config.targetType}:${config.targetId}`,
      {
        ...config,
        // 恢复内存状态
      }
    );
  }
}

// 运行时状态变更 → 同时写入 DB
async function updateCircuitState(targetType, targetId, newState, currentFailures) {
  // 更新内存
  circuitBreakerRegistry.set(...);
  // 持久化
  await db.update(circuitBreakerConfigs).set({
    status: newState,
    currentFailures,
    lastStateChange: new Date(),
    updatedAt: new Date()
  }).where(
    and(
      eq(circuitBreakerConfigs.targetType, targetType),
      eq(circuitBreakerConfigs.targetId, targetId)
    )
  );
  // 记录事件
  await db.insert(circuitBreakerEvents).values({
    configId: config.id,
    targetType,
    targetId,
    eventType: newState === 'open' ? 'open' : newState === 'half_open' ? 'half_open' : 'close',
    failureCount: currentFailures,
    detail: `从 ${oldState} → ${newState}`
  });
}
```

#### 9.2.4 管理端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/admin/circuit-breakers` | 熔断器列表+状态 |
| PUT | `/api/v1/admin/circuit-breakers/:id` | 修改熔断器参数 |
| POST | `/api/v1/admin/circuit-breakers/:id/reset` | 手动重置熔断器 |
| GET | `/api/v1/admin/circuit-breakers/:id/events` | 熔断事件历史 |

---

> **本文件定位**：对 `PRD-运营级.md` 的**可执行级补充**。
> 优先度建议：P0（账号注销/结算对账/待办队列）→ P1（Playground完善/操作日志增强/熔断器持久化）→ P2（A/B测试/新手任务/PRD差距补齐）
