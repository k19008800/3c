---
title: "Vendor Self Service Prd"
date: 2026-07-25
tags: [project]
---
# 供应商自助全流程 — 产品需求方案

> 版本: v1.0 | 状态: 待评审 | 最后更新: 2026-07-15

---

## 1. 产品定位

3cloud 为上游 AI 模型供应商（如 DeepSeek、OspreyAI、LLMRouter 等）提供自助管理门户，供应商入驻后可通过独立后台实现：

- 模型自运营（上下架、定价、调价）
- 调用与收入监控
- 财务结算（账单、提现、开票）
- 账户与安全配置

**核心理念**：供应商从"平台帮你管"变成"供应商自己管"，降低平台运营人力。

---

## 2. 用户角色

| 角色 | 定义 | 权限范围 |
|------|------|---------|
| **供应商（Vendor）** | 上游 AI API 提供商，入驻 3cloud 平台 | 管理自己的模型、查看自己的调用数据、财务结算 |
| **平台管理员（Admin）** | 3cloud 运营方 | 审核供应商入驻、管理全平台模型、全局配置 |
| **供应商子账号** | 供应商内部的多角色用户（P2） | 受供应商主账号管控 |

---

## 3. 六阶段业务全景

```
阶段一          阶段二          阶段三          阶段四          阶段五          阶段六
入驻与审核  →   模型运营    →   日常监控    →   财务结算    →   账户安全    →   支持通知
(P0)           (P1)           (P1)           (P0)           (P1)           (P2)
```

---

## 4. 阶段一：入驻与审核（P0 ⭐）

### 4.1 业务流程

```
供应商                             平台管理员
  │                                   │
  ├─ 1. 填写注册表单                   │
  │   ├ 公司名称/供应商名称            │
  │   ├ 联系人/电话/邮箱               │
  │   ├ 服务域名（baseUrl）            │
  │   ├ 营业执照（图片上传）           │
  │   └ 服务资质说明                   │
  │                                   │
  ├─ 2. 提交注册 ──────────────────►   │
  │   status: pending                  │
  │                                   ├─ 3. 审核信息
  │                                   │   ├ 查看资质文件
  │                                   │   ├ 联系核实（可选）
  │                                   │   ├ 通过 ──► ✅ approved
  │                                   │   │   ├ 自动创建 Vendor Key
  │                                   │   │   ├ 自动发送通知邮件
  │                                   │   │   └ 供应商端 status → active
  │                                   │   └ 驳回 ──► ❌ rejected
  │                                   │       └ 填写驳回原因 → 邮件通知
  │                                   │
  ├─ 4. 收到审核结果                   │
  │   ├ 通过：邮件含首次登录引导       │
  │   │   └ 设置密码 → 跳转门户        │
  │   └ 驳回：提示原因，重新提交       │
  │                                   │
```

### 4.2 供应商状态机

```
                         ┌─────────┐
                         │ pending │  ← 注册提交
                         └────┬────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              ┌──────────┐       ┌──────────┐
              │ approved │       │ rejected │  ← 可修改后重新提交
              └─────┬────┘       └──────────┘
                    │
                    ▼
              ┌──────────┐
              │  active   │  ← 首次设置密码/登录后
              └─────┬────┘
                    │
              ┌─────┴─────┐
              ▼           ▼
        ┌────────┐  ┌────────┐
        │suspend │  │terminat│
        └────────┘  │  ed    │
                    └────────┘
```

### 4.3 注册表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vendorName | string | ✅ | 供应商显示名称（唯一） |
| companyName | string | ❌ | 公司全称 |
| baseUrl | string | ✅ | API 基础地址 |
| description | text | ❌ | 供应商简介 |
| contactName | string | ✅ | 负责人姓名 |
| contactPhone | string | ✅ | 联系电话 |
| contactEmail | string | ✅ | 联系邮箱（也用于登录） |
| password | string | ✅ | 登录密码 |
| businessLicense | file | ❌ | 营业执照图片 |
| qualificationDesc | text | ❌ | 资质说明 |

### 4.4 管理员审核页面（增强）

在现有 `/admin/vendors` 页面新增：

- **待审核 Tab**：仅显示 status=pending 的供应商
- **审核详情弹窗**：
  - 基本信息展示
  - 资质文件预览（图片/PDF）
  - 审核操作：通过 / 驳回
  - 驳回原因输入框
  - 审核备注（内部用）
- **审核记录**：每个供应商的审核历史（谁审的、什么时候、结果）

### 4.5 首次登录引导

供应商首次登录后看到 **6 步引导**：

```
Step 1  │ 📋 欢迎！这里是你的供应商控制台
Step 2  │ 🔑 设置 API Key → 复制保存你的 Vendor Key
Step 3  │ 🤖 添加模型 → 选择平台支持的模型并设定售价
Step 4  │ 🔗 连通性测试 → 验证你的 API 是否正确接入
Step 5  │ 📊 查看数据 → 实时调用统计已为你打开
Step 6  │ 💰 财务结算 → 了解结算周期和费率
```

引导仅首次登录显示，可跳过，后期在设置中可重新打开。

---

## 5. 阶段二：模型运营（P1）

### 5.1 模型管理 CRUD（已有基础，增强）

| 功能 | 现有状态 | 增强内容 |
|------|---------|---------|
| 列表展示 | ✅ 有 | 增加搜索/筛选/分页 |
| 添加模型 | ✅ 有 | 增加选择平台预定义模型的下拉框（不是手输 modelId） |
| 编辑配置 | ✅ 有 | 增加成本价字段展示（只读，平台设置） |
| 上下架切换 | ✅ 有 | 行内开关，立即生效 |
| 删除模型 | ✅ 有（软删除） | 改为下架，增加二次确认 |

### 5.2 新增：连通性测试

- 每个模型行增加「测试连通性」按钮
- 后端 POST `/api/vendor/models/:id/test`
- 用供应商的真实 API Key + 所选 endpoint 发送一次推理请求
- 返回：`{ success: true, latency: 1234ms, error: null }`

### 5.3 新增：价格变更审批（可选）

- 供应商提交调价申请 → 管理员审核 → 生效
- 场景：大幅降价/涨价需要平台审批，小幅浮动可自动生效
- 配置阈值：平台可设置「调价无需审批的浮动范围 ±X%」

### 5.4 新增：批量操作

- 批量选择模型 → 统一上架/下架
- 批量调价 → 输入百分比统一调整
- 批量导出模型配置 → CSV

---

## 6. 阶段三：日常监控（P1）

### 6.1 数据看板

| 模块 | 内容 | 数据来源 |
|------|------|---------|
| 📈 调用趋势 | 24h/7d/30d 折线图（调用量、Token 量） | call_logs |
| 💰 收入趋势 | 同上时间维度的收入曲线 | call_logs.cost |
| 🏆 模型排名 | 按调用量/收入/成功率的 Top 10 模型 | call_logs |
| ✅ 成功率 | 总体成功率 + 各模型成功率 | call_logs.status |
| ⚡ 响应延迟 | 平均/中位数/P99 响应时间变化 | call_logs.duration |

### 6.2 健康监控

| 功能 | 说明 |
|------|------|
| 列表展示 | 各模型通道的健康分数、连接状态（已有） |
| 熔断告警 | 熔断触发时通知供应商（由熔断机制回调触发通知） |
| 历史记录 | 查看健康检查的历史记录（新表 vendor_health_logs） |

### 6.3 错误分析

- 供应商维度调用失败分布：HTTP 4xx / 5xx / 超时 / 限流
- 按模型、按时间段聚合

### 6.4 CSV 导出

看板上每个图表/表格都支持「导出 CSV」

---

## 7. 阶段四：财务结算（P0 ⭐）

### 7.1 结算流程

```
┌─────────────────────────────────────────────────┐
│                 结算周期                          │
│  T+1 日 → 系统自动生成前一日调用明细             │
│  每月 1 日 → 生成上月结算单                     │
└─────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────┐
│              供应商查看结算单                     │
│  ├ 结算总金额（汇总供应商调用量 × 结算单价）    │
│  ├ 平台佣金/服务费扣除                          │
│  ├ 实际应付金额                                 │
│  └ 每模型明细展开                               │
└─────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────┐
│           可选操作                               │
│  ├ 发起提现 → 填写提现金额 → 等待平台打款      │
│  ├ 申请开票 → 填写开票信息 → 平台开具发票      │
│  └ 下载结算单 → PDF/CSV                         │
└─────────────────────────────────────────────────┘
```

### 7.2 结算账单

| 字段 | 说明 |
|------|------|
| 结算周期 | 如 2026-07-01 ~ 2026-07-31 |
| 总调用量 | 该周期内成功调用次数 |
| 总 Token 数 | input + output tokens |
| 平台收入（汇总） | 上游调用成本价 × 调用量 |
| 平台佣金 | 平台抽成金额（费率 × 平台收入） |
| 应付金额 | 平台收入 - 平台佣金 |
| 状态 | 待确认 / 已确认 / 已结算 / 有争议 |

### 7.3 资金流水

- 展示所有流水记录：调用收入（+）、提现（-）、佣金扣除（-）、平台补贴（+）
- 可用余额 = 总收入 - 已提现 - 冻结中
- 支持按时间范围筛选

### 7.4 提现申请

| 步骤 | 说明 |
|------|------|
| 1. 输入金额 | 输入提现金额（≤ 可用余额） |
| 2. 选择收款账户 | 银行账户信息（开户行、户名、账号） |
| 3. 提交申请 | 状态：pending |
| 4. 平台审核 | 财务操作打款 → 状态：completed |
| 5. 确认到账 | 供应商确认收款 |

复用现有 `withdrawals` 模块扩展供应商角色支持。

### 7.5 开票申请

- 供应商向平台申请开具发票（供应商是开票方，平台是受票方）
- 复用现有 `invoices` 模块扩展

### 7.6 费率合同查看

- 只读展示：当前平台抽成比例、阶梯费率、结算周期
- 由平台管理员在后台配置并发布
- 费率变更时系统通知供应商确认

---

## 8. 阶段五：账户与安全（P1）

### 8.1 多 Key 管理

| 类型 | 用途 | 权限 |
|------|------|------|
| production | 生产环境使用 | 全权限（管理模型、查看数据） |
| testing | 测试环境 | 只读 + 连通性测试 |
| readonly | 数据分析用 | 只看统计和账单，不能改模型 |

- 每个 Key 可单独启用/禁用
- 删除 Key 不影响已有调用记录

### 8.2 Webhook 配置

供应商配置回调 URL，接收事件推送：

| 事件 | 触发条件 |
|------|---------|
| `model.health_changed` | 模型健康状态变化 |
| `model.circuit_broken` | 模型熔断触发/恢复 |
| `settlement.generated` | 新结算单生成 |
| `withdraw.completed` | 提现到账 |
| `platform.announcement` | 平台公告 |

### 8.3 登录日志

- 记录每次登录时间、IP、设备
- 异常登录告警（陌生 IP/设备）

### 8.4 2FA（P2）

- 基于 TOTP 的二次验证
- 可绑定 Authenticator App

---

## 9. 阶段六：支持与通知（P2）

### 9.1 工单系统

- 供应商提交工单（问题分类：技术问题/财务问题/接入咨询）
- 平台管理员回复
- 工单状态：待处理 → 处理中 → 已解决 → 已关闭

### 9.2 平台公告

- 复用已有的 `announcements` 模块
- 供应商门户侧边栏通知标记

### 9.3 告警通知

- 支持站内信 + 邮件（后续可加 Webhook/短信）
- 告警类型：
  - 健康告警：模型下线、熔断
  - 用量告警：日调用量/日收入下降超过阈值
  - 财务告警：余额不足、结算单待确认

---

## 10. 前端路由与页面架构

### 10.1 路由结构

```
/vendor                    → 供应商门户根（路由守卫）
/vendor/login              → 供应商登录页
/vendor/register           → 供应商注册页
/vendor/register-success   → 注册成功引导页
/vendor/forgot-password    → 忘记密码（P2）

/vendor/dashboard          → 工作台（数据看板首页）
/vendor/models             → 模型管理
/vendor/models/:id         → 模型详情
/vendor/stats              → 数据统计
/vendor/health             → 健康监控
/vendor/finance            → 财务总览
/vendor/finance/bills      → 结算账单
/vendor/finance/transactions → 资金流水
/vendor/finance/withdraw   → 提现申请
/vendor/finance/invoices   → 开票管理
/vendor/finance/rate       → 费率合同
/vendor/keys               → API Key 管理
/vendor/webhooks           → Webhook 配置
/vendor/security           → 安全设置（密码/2FA/登录日志）
/vendor/settings           → 供应商资料编辑
/vendor/tickets            → 工单列表（P2）
/vendor/notifications      → 通知中心
/vendor/guide              → 首次引导/操作指南
```

### 10.2 布局设计

```
┌─────────────────────────────────────────┐
│  Logo + [供应商名称]           🔔 👤     │ ← 顶栏
├─────────┬───────────────────────────────┤
│         │                               │
│  📊 工作台    │                         │
│  🤖 模型管理  │    内容区域              │
│  📈 数据统计  │                         │
│  💰 财务中心  │                         │
│  🔑 API 管理  │                         │
│  🔔 通知中心  │                         │
│  ⚙️ 设置      │                         │
│         │                               │
├─────────┴───────────────────────────────┤
│  技术支持 · 平台公告 · @2026 3cloud     │ ← 底栏
└─────────────────────────────────────────┘
```

### 10.3 路由守卫

```typescript
// VendorRoute.tsx — 与 AdminRoute 类似但检查 vendor JWT
function VendorRoute() {
  const { user, isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/vendor/login" />
  if (user?.role !== 'vendor') return <Navigate to="/" />
  return <Outlet />
}
```

---

## 11. 鉴权模型

### 11.1 三层分离

| 层 | 鉴权方式 | 用途 |
|----|---------|------|
| **门户登录** | email + password → JWT session | 前端页面访问 |
| **API 调用** | X-Vendor-Key header → SHA-256 | 供应商操作 API |
| **管理员操作** | Admin JWT | 平台方审核、管理 |

### 11.2 表结构变更

**vendors 表新增字段：**

```sql
ALTER TABLE vendors ADD COLUMN email VARCHAR(255) UNIQUE;      -- 登录邮箱
ALTER TABLE vendors ADD COLUMN password_hash VARCHAR(255);       -- 登录密码
ALTER TABLE vendors ADD COLUMN approved_at TIMESTAMPTZ;          -- 审核通过时间
ALTER TABLE vendors ADD COLUMN approved_by INTEGER;              -- 审核人
ALTER TABLE vendors ADD COLUMN reject_reason TEXT;               -- 驳回原因
```

**新增 vendor_health_logs 表（P1）：**

```sql
CREATE TABLE vendor_health_logs (
  id SERIAL PRIMARY KEY,
  vendor_model_id INTEGER REFERENCES vendor_models(id),
  health_score NUMERIC(5,2),
  latency_ms INTEGER,
  success BOOLEAN,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 12. 新增 API 列表

| # | 方法 | 路径 | 阶段 | 说明 |
|---|------|------|------|------|
| 1 | POST | /api/vendor/register | P0 | ✅ 已实现 |
| 2 | POST | /api/vendor/login | P0 | 供应商登录，返回 JWT |
| 3 | GET | /api/vendor/me | P0 | ✅ 已实现 |
| 4 | PUT | /api/vendor/me | P0 | ✅ 已实现 |
| 5 | PUT | /api/vendor/password | P0 | 修改密码 |
| 6 | GET | /api/vendor/models | P0 | ✅ 已实现 |
| 7 | POST | /api/vendor/models | P0 | ✅ 已实现 |
| 8 | PUT | /api/vendor/models/:id | P0 | ✅ 已实现 |
| 9 | PATCH | /api/vendor/models/:id | P0 | ✅ 已实现（上下架） |
| 10 | DELETE | /api/vendor/models/:id | P0 | ✅ 已实现 |
| 11 | POST | /api/vendor/models/:id/test | P1 | 连通性测试 |
| 12 | POST | /api/vendor/models/batch | P1 | 批量操作 |
| 13 | GET | /api/vendor/stats | P1 | ✅ 已实现（需增强） |
| 14 | GET | /api/vendor/health | P1 | ✅ 已实现 |
| 15 | GET | /api/vendor/health/logs | P1 | 健康检查历史 |
| 16 | POST | /api/vendor/api-keys | P0 | ✅ 已实现 |
| 17 | DELETE | /api/vendor/api-keys/:id | P1 | 删除 Key |
| 18 | GET | /api/vendor/api-keys | P1 | 列出所有 Key |
| 19 | GET | /api/vendor/finance/bills | P0 | 结算账单列表 |
| 20 | GET | /api/vendor/finance/bills/:id | P0 | 结算单明细 |
| 21 | GET | /api/vendor/finance/transactions | P0 | 资金流水 |
| 22 | POST | /api/vendor/finance/withdraw | P0 | 提现申请 |
| 23 | GET | /api/vendor/finance/rate | P0 | 查看费率合同 |
| 24 | POST | /api/vendor/webhooks | P1 | 配置 Webhook |
| 25 | GET | /api/vendor/audit-logs | P1 | 操作审计日志 |

---

## 13. 验收标准

### 13.1 入驻审核（12 条）

1. ✅ 供应商可通过 `/vendor/register` 提交完整注册信息
2. ✅ 注册后状态为 pending
3. ✅ 管理员在后台可看到待审核列表
4. ✅ 管理员可查看供应商提交的完整信息和资质文件
5. ✅ 审核通过后供应商状态变为 approved，自动生成 Vendor Key
6. ✅ 供应商收到邮件通知审核结果
7. ✅ 审核驳回时管理员必须填写驳回原因
8. ✅ 供应商可看到驳回原因并修改后重新提交
9. ✅ 首次登录要求设置密码
10. ✅ 首次登录显示引导流程
11. ✅ 已有供应商无法重复注册
12. ✅ 注册邮箱唯一性校验

### 13.2 模型管理（8 条）

1. ✅ 供应商可查看自己的模型列表
2. ✅ 供应商可添加新的模型映射（选择平台模型 + 设定售价）
3. ✅ 供应商可编辑模型定价
4. ✅ 供应商可一键上下架模型
5. ✅ 供应商可测试模型连通性
6. ✅ 模型下架后不影响已有调用记录
7. ✅ 列表支持搜索和分页
8. ✅ 上下架操作立即生效

### 13.3 财务结算（14 条）

1. ✅ 供应商可查看月度结算账单
2. ✅ 结算账单包含每模型明细
3. ✅ 供应商可查看资金流水（收入/提现/佣金）
4. ✅ 可用余额计算正确（累计收入 - 累计提现 - 冻结）
5. ✅ 供应商可发起提现申请
6. ✅ 提现金额不能超过可用余额
7. ✅ 提现需填写收款银行信息
8. ✅ 提现有审核流程（平台财务审批）
9. ✅ 供应商可查看提现进度
10. ✅ 供应商可申请开票
11. ✅ 供应商可下载结算单（PDF/CSV）
12. ✅ 供应商可查看当前费率合同
13. ✅ 费率变更时供应商收到通知
14. ✅ 结算数据与 call_logs 一致

---

## 14. 实施建议

### 分阶段实施

| 阶段 | 内容 | 预估工时 |
|------|------|---------|
| **Phase 0** | 入驻审核 + 独立门户路由 + 供应商登录 | 2-3 天 |
| **Phase 1** | 财务结算模块（账单/流水/提现） | 3-5 天 |
| **Phase 2** | 数据看板增强 + 模型管理增强 | 2-3 天 |
| **Phase 3** | Webhook + 多 Key + 健康告警 | 2-3 天 |
| **Phase 4** | 工单系统 + 2FA + 批量操作 | 3-4 天 |

### 关键依赖

- 供应商表需新增 email/passwordHash 字段
- 财务模块需复用已有的 withdrawals/invoices 并扩展 vendor 支持
- 独立前端布局组件（VendorLayout, VendorSidebar, VendorRoute）

---

## 15. 附录：未来扩展项

1. **SLA 监控看板** — 展示平台对供应商的 SLA 承诺达成率
2. **多语言支持** — 供应商门户支持英文（面向海外供应商）
3. **OpenAPI 规范** — 开放供应商自助 API 文档
4. **自动扩缩容建议** — 根据调用趋势推荐 RPM/TPM 调整
5. **数据订阅** — 供应商订阅原始调用日志到自己的数据仓库
6. **营收预测** — 基于历史趋势预测下月收入
7. **供应商市场** — 让下游用户/Agent 发现和选择供应商
8. **自动结算** — 低于某金额自动打款免审核
9. **API 版本管理** — 供应商为不同模型版本独立定价
10. **合作分成** — 支持自定义分成比例（非固定佣金率）
