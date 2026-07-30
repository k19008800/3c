# 用户端兑换码与发票管理深化文档

> **对应章节**：PRD-README.md §2.2.8 兑换码 `/console/redemption` + §2.2.9 发票 `/console/invoices`
> **最后更新**：2026-07-28
> **定位**：兑换码兑换流程、类型、发票申请、开票规则、前端组件规格

---

## 一、兑换码管理

### 1.1 页面组件树

```
Redemption
├── RedemptionInput
│   ├── 兑换码输入框
│   └── [兑换] 按钮
│
├── RedemptionPreviewModal（兑换确认弹窗）
│   ├── 兑换内容详情
│   └── 确认/取消
│
├── RedemptionResultDialog（兑换结果弹窗）
│   ├── 成功/失败状态
│   └── 到账金额/权益说明
│
└── RedemptionHistory（兑换记录）
    ├── 记录列表（时间/兑换码/内容/状态）
    └── 空状态提示
```

### 1.2 前端组件 Props

```typescript
interface RedemptionInputProps {
  onRedeem: (code: string) => Promise<RedemptionResult>;
  loading?: boolean;
}

interface RedemptionResult {
  success: boolean;
  type: 'balance' | 'trial' | 'discount' | 'mixed';
  amount?: string;                     // 余额码：到账金额
  trialInfo?: {                        // 体验码
    duration?: string;                 // "7天"
    maxCalls?: number;                 // 1000
    maxTokens?: number;                // 100000
  };
  discountRate?: string;               // 折扣码：0.8
  items?: RedemptionItem[];            // 混合码：组合权益
  message?: string;                    // 错误信息
}

interface RedemptionPreviewModalProps {
  open: boolean;
  code: string;
  result: RedemptionResult;
  onConfirm: () => void;
  onCancel: () => void;
}

interface RedemptionHistoryProps {
  records: RedemptionRecord[];
  loading?: boolean;
}

interface RedemptionRecord {
  id: number;
  redeemedAt: string;
  code: string;                         // 脱敏：3C-SUMMER-****
  type: 'balance' | 'trial' | 'discount' | 'mixed';
  amount?: string;
  status: 'success' | 'expired' | 'used' | 'invalid';
}
```

### 1.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/me/redemption/redeem` | 兑换兑换码 |
| `GET` | `/api/v1/me/redemption/history` | 兑换记录 |

### 1.4 兑换码验证流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant R as 兑换页
    participant API as 后端
    participant DB as 数据库

    U->>R: 输入兑换码 → 点击兑换
    R->>API: POST /me/redemption/redeem
    API->>DB: 查询兑换码

    alt 不存在
        API-->>R: "兑换码无效"
    else 已过期
        API-->>R: "兑换码已过期"
    else 已使用/已达上限
        API-->>R: "兑换码已被使用/已领完"
    else 有效
        API-->>U: 展示兑换内容确认
        U->>R: 确认兑换
        R->>API: 确认兑换
        API->>DB: 减少剩余次数 + 增加余额
        API-->>R: 兑换成功
        R->>U: 展示结果
    end
```

### 1.5 兑换码类型

| 类型 | 兑换内容 | 示例 |
|------|---------|------|
| 余额码 | 固定金额 | ¥10 / ¥20 / ¥50 / ¥100 |
| 体验码 | 限时/限量权益 | 7 天无限量 / 1000 次 / 10 万 Token |
| 折扣码 | 后续消费折扣 | 8 折 / 85 折 / 指定模型 |
| 混合码 | 组合权益 | 余额 ¥10 + 7 天体验 |

---

## 二、发票管理

### 2.1 页面组件树

```
InvoiceManagement
├── InvoiceablePeriods（可开票月份列表）
│   ├── MonthCard × N（月份/消费金额/是否已开票）
│   └── 合并开票入口
│
├── InvoiceApplicationForm（开票申请表单）
│   ├── 发票抬头
│   ├── 税号（企业必填，格式校验）
│   ├── 发票类型（普票/专票）
│   ├── 消费月份选择（多选，最多 12 个月）
│   ├── 开票金额（自动汇总）
│   ├── 收件邮箱
│   └── 收件地址（专票必填）
│
├── InvoiceHistory（已开发票列表）
│   ├── InvoiceRow × N（发票号/金额/类型/状态/时间）
│   └── 下载/查看操作
│
└── InvoiceDetailModal（发票详情弹窗）
    ├── 发票 PDF 预览
    └── 下载按钮
```

### 2.2 前端组件 Props

```typescript
interface InvoiceablePeriod {
  month: string;                       // "2026-07"
  totalConsumption: string;            // "¥890.50"
  isInvoiced: boolean;
  invoiceId?: number;
}

interface InvoiceApplicationFormProps {
  availableMonths: InvoiceablePeriod[];
  config: InvoiceConfig;
  onSubmit: (application: InvoiceApplication) => Promise<void>;
  submitting?: boolean;
}

interface InvoiceConfig {
  minAmount: number;                    // 最低开票金额 ¥50
  feePercent: number;                   // 手续费百分比
  maxMergeMonths: number;               // 最多合并月份 12
}

interface InvoiceApplication {
  title: string;                        // 发票抬头
  taxId: string;                        // 税号
  invoiceType: 'normal' | 'special';   // 普票/专票
  months: string[];                     // 消费月份 ["2026-07", "2026-06"]
  amount: string;                       // 自动汇总
  email: string;
  address?: string;                     // 专票必填
}

interface InvoiceHistoryProps {
  invoices: InvoiceRecord[];
  onDownload: (invoiceId: number) => void;
  loading?: boolean;
}

interface InvoiceRecord {
  id: number;
  invoiceNumber: string;                // 发票号
  amount: string;
  type: 'normal' | 'special';
  status: 'pending' | 'issued' | 'rejected';
  months: string[];
  createdAt: string;
  issuedAt?: string;
  pdfUrl?: string;
}
```

### 2.3 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/me/invoices/available-months` | 可开票月份列表 |
| `POST` | `/api/v1/me/invoices` | 提交开票申请 |
| `GET` | `/api/v1/me/invoices` | 已开发票列表 |
| `GET` | `/api/v1/me/invoices/:id` | 发票详情 |
| `GET` | `/api/v1/me/invoices/:id/download` | 下载发票 PDF |

### 2.4 开票流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant I as 发票页面
    participant API as 后端
    participant A as 管理员

    U->>I: 选择可开票月份
    I->>API: GET /me/invoices/available-months
    API-->>I: 返回可开票月份列表
    U->>I: 填写开票信息 → 提交
    I->>API: POST /me/invoices
    API->>API: 创建开票申请（pending）
    API-->>I: 提交成功
    Note over A: 管理员审核
    A->>API: 审核通过
    API->>API: 生成发票 PDF
    API->>API: 更新状态（issued）
    API->>U: 通知（站内 + 邮件）
```

### 2.5 配置项与约束

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `min_invoice_amount` | ¥50.00 | 最低开票金额 |
| `invoice_fee_percent` | 0% | 开票手续费 |
| `max_merge_months` | 12 | 最多合并月份数 |

| 约束 | 规则 |
|------|------|
| 实名要求 | 需完成实名认证 |
| 企业发票 | 需完成企业认证 |
| 税号格式 | 15/18/20 位数字字母 |
| 专票地址 | 必填，用于邮寄纸质发票 |
| 开票范围 | 仅已消费的月份（充值不开发票） |
| 重复开票 | 已开票月份不可再次申请 |
| 发票取消 | 管理员审核前可取消申请 |

---

## 三、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| PRD-README.md §2.2.8 | 兑换码总纲 |
| PRD-README.md §2.2.9 | 发票管理总纲 |
| ref-4.5-marketing.md | 兑换码系统配置（运营端） |
| ref-4.4-finance.md | 发票管理（财务端审核） |
| data-dictionary.md | 字段定义 |
| ref-4.6-security.md | 实名认证（开票前提） |

---

## 边界条件

### 兑换码场景

| # | 场景 | 触发条件 | 预期行为 |
|---|------|---------|---------|
| RDI-001 | 兑换码已过期 | 用户输入的兑换码已超过有效截止日期 | 兑换结果弹窗展示红色失败状态 +「兑换码已过期」提示 |
| RDI-002 | 兑换码已用完 | 兑换码的使用次数已耗尽（`max_uses` 达到上限） | 兑换结果弹窗展示红色失败状态 +「兑换码已被领完」提示 |
| RDI-003 | 发票申请信息不完整 | 企业发票申请时税号格式错误或专票未填写收件地址 | 表单校验失败，对应字段红色边框 + 错误提示「税号格式不正确（需 15/18/20 位）」/「专票必须填写收件地址」|
| RDI-004 | 发票开具失败后重试 | 税务系统开具发票时接口返回临时错误（网络超时/系统繁忙） | 自动重试 3 次（间隔 30 秒），3 次均失败后状态标记为 `failed`，通知管理员人工介入处理 |
| RDI-005 | 可开票月份无历史消费 | 用户当月无任何消费记录，`availableMonths` 全部为空 | InvoiceablePeriods 区域展示「当前无可开票的消费月份，消费满 ¥50 后可申请开票」空状态提示 |
| RDI-006 | 兑换码输入为空/无效格式 | 用户未输入兑换码或输入格式不符合 `3C-` 前缀规范 | 兑换按钮置灰，输入框下方显示红色提示「请输入有效的兑换码」/「兑换码格式不正确」|

### 异常流程

| 场景 | 恢复策略 |
|------|---------|
| 兑换码并发争抢（同一码最后 1 次被多用户同时兑换） | 数据库行锁保证原子减量，失败用户收到「兑换码已被领完」提示 |
| 发票 PDF 生成失败 | 管理员在后台重新触发 PDF 生成，用户端显示「发票生成中，请稍后查看」|