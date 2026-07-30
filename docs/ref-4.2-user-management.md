# 3cloud 用户管理（User Management）深化文档

> **对应章节**：PRD-README.md §4.2 用户管理
> **最后更新**：2026-07-28
> **定位**：管理后台用户管理的全链路规格，含用户列表/详情/编辑/禁用/批量操作/实名审核/登录安全/导入导出

---

## 一、功能总览

```
用户管理（/admin/users）
├── 用户列表（表格视图）
│   ├── 筛选器（邮箱/昵称/角色/状态/实名/注册时间）
│   ├── 排序（ID/昵称/余额/注册时间/最后登录）
│   ├── 批量操作栏
│   └── 分页（每页 20/50/100）
│
├── 用户详情
│   ├── 信息页（基本信息/实名/余额/安全）
│   ├── Key 页（该用户所有 API Key 管理）
│   ├── 日志页（调用日志 + 操作日志）
│   └── 余额页（余额变动流水）
│
├── 用户创建
│   ├── 手动创建
│   └── 批量导入
│
├── 实名审核
│   ├── 待审列表
│   ├── 详情弹窗
│   └── 审核通过/拒绝
│
└── 用户导出
    ├── CSV 导出
    └── JSON 导出
```

---

## 二、用户列表

### 2.1 表格列

| 列 | 说明 | 排序 | 搜索 | 筛选 |
|----|------|------|------|------|
| ID | 显示为 `u_xxxxx` 格式 | ✅ | ✅ | — |
| 昵称 | 可点击进入详情 | ✅ | ✅ | — |
| 邮箱 | 完整展示 | ✅ | ✅ | — |
| 手机 | 脱敏展示 `138****5678` | — | ✅ | — |
| 角色 | 标签颜色按等级 | ✅ | — | ✅ |
| 余额 | ¥ 格式，保留 2 位 | ✅ | — | — |
| 总消费 | ¥ 格式，累计消费 | ✅ | — | — |
| 状态 | 正常/禁用/冻结 三色标签 | ✅ | — | ✅ |
| 实名状态 | 已实名/未实名/审核中 | ✅ | — | ✅ |
| 用户类型 | 个人/企业 | ✅ | — | ✅ |
| 注册时间 | YYYY-MM-DD | ✅ | — | ✅（日期范围）|
| 最后登录 | YYYY-MM-DD HH:mm | ✅ | — | — |

### 2.2 筛选器

```
┌─ 筛选条件 ──────────────────────────────────┐
│ 角色: [全部 ▼] 状态: [全部 ▼] 实名: [全部 ▼] │
│ 用户类型: [全部 ▼]                           │
│ 注册时间: [2026-06-01] ~ [2026-07-28]       │
│ 搜索: [邮箱或昵称........................]    │
│ [搜索] [重置]                                 │
└──────────────────────────────────────────────┘
```

### 2.3 批量操作栏

```
当选中 ≥ 1 行时，底部出现操作栏：
┌─ 已选择 3 项 ──────────────────────────────────────────────────┐
│ [批量启用] [批量禁用] [批量调整角色] [批量调整余额] [批量调整配额] [导出] │
└─────────────────────────────────────────────────────────────────┘
```

| 批量操作 | 说明 | 确认机制 |
|---------|------|---------|
| 批量启用 | 将选中的已禁用用户恢复为 active | 二次确认弹窗 |
| 批量禁用 | 批量禁用用户（需填写原因） | 二次确认 + 原因必填 |
| 批量调整角色 | 统一修改角色 | 角色选择下拉 |
| 批量调整余额 | 统一增加或减少余额 | 输入金额 + 备注 |
| 批量调整配额 | 统一修改 QPS/TPM 限制 | 输入新配额值 |
| 导出 | 导出选中用户数据 | 格式选择 CSV/JSON |

---

## 三、用户详情

### 3.1 信息页

```
┌─ 用户详情 — 张三 (u_10086) ─────────────────────────────┐
│                                                           │
│  [信息]  [Key管理]  [日志]  [余额]                         │
│                                                           │
│  ┌─ 基本信息 ──────────────────────────────────────┐      │
│  │ ID:        u_10086                               │      │
│  │ 昵称:      张三                                   │      │
│  │ 邮箱:      zhangsan@example.com                  │      │
│  │ 手机:      138****5678                            │      │
│  │ 角色:      user [编辑]                            │      │
│  │ 用户类型:  personal [编辑]                        │      │
│  │ 状态:      ✅ 正常 [禁用] [编辑]                   │      │
│  │ 注册时间:  2026-06-28 14:30                      │      │
│  │ 注册 IP:   117.78.2.66 (广东省深圳市)              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                           │
│  ┌─ 实名信息 ──────────────────────────────────────┐      │
│  │ 状态:      ✅ 已实名 (2026-07-01)                │      │
│  │ 真实姓名:  张三 (脱敏规则: 只显示姓)              │      │
│  │ 证件类型:  身份证                                │      │
│  │ 证件号:    4401**********1234 (脱敏)              │      │
│  │ 企业名称:  - (个人用户)                          │      │
│  │ 发票信息:  [查看详情]                            │      │
│  └──────────────────────────────────────────────────┘      │
│                                                           │
│  ┌─ 余额信息 ──────────────────────────────────────┐      │
│  │ 当前余额:    ¥234.50                            │      │
│  │ 总充值:     ¥1,000.00                           │      │
│  │ 总消费:     ¥765.50                             │      │
│  │ 冻结金额:   ¥0.00                               │      │
│  │ 折扣率:     1.0000 (无折扣) [编辑]              │      │
│  │ [调整余额]                                       │      │
│  └──────────────────────────────────────────────────┘      │
│                                                           │
│  ┌─ 登录安全 ──────────────────────────────────────┐      │
│  │ 最近登录 IP: 117.78.2.66 (广东省深圳市)           │      │
│  │ 最近登录时间: 2026-07-26 10:30                   │      │
│  │ 2FA 状态: ✅ 已启用 [重置]                       │      │
│  │ 登录设备: 3 台关联 [查看]                        │      │
│  │ 登录异常: 0 次最近 7 天                          │      │
│  │ [强制登出] [重置密码] [重置2FA]                   │      │
│  └──────────────────────────────────────────────────┘      │
│                                                           │
│  ┌─ 配额信息 ──────────────────────────────────────┐      │
│  │ QPS: 100 (默认) [编辑]                           │      │
│  │ TPM: 600000 (默认) [编辑]                        │      │
│  │ 日调用: 不限 (默认) [编辑]                        │      │
│  │ 并发: 20 (默认) [编辑]                           │      │
│  └──────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Key 管理页

```
┌─ 用户 API Key ───────────────────────────────────────────────┐
│                                                                │
│ [创建新 Key]                                                   │
│                                                                │
│ ┌─ Key 列表 ─────────────────────────────────────────────────┐│
│ │ 名称    | Key 前缀        | 状态   | 已用 Token | 最后使用  |│
│ │ 默认Key | sk-3c-a1b2...   | ✅ 正常 | 1,234K    | 2026-07-26││
│ │ 测试Key | sk-3c-x9y8...   | ❌ 禁用 | 12K       | 2026-07-20││
│ │         | [查看完整Key] [禁用] [删除]                        ││
│ └────────────────────────────────────────────────────────────┘│
│                                                                │
│ 管理员可查看 Key 完整明文（需确认身份：输入当前账号密码）        │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 日志页

```
┌─ 用户日志 ───────────────────────────────────────────────┐
│                                                            │
│ [调用日志] [操作日志]                                      │
│                                                            │
│ 调用日志 (最近 7 天):                                      │
│ 时间         | 模型      | Token | 状态    | 耗时 | 费用   │
│ 07-28 10:30  | gpt-4o   | 1,234 | ✅ 成功 | 1.2s | ¥0.12 │
│ 07-28 10:25  | deepseek | 567   | ✅ 成功 | 0.8s | ¥0.03 │
│ 07-28 09:50  | claude-3 | 2,345 | ❌ 失败 | 30s  | ¥0.00 │
│                                                            │
│ 操作日志:                                                   │
│ 时间         | 操作          | 操作人   | 详情              │
│ 07-26 15:30  | 密码修改      | 用户    | IP: 117.78.2.66  │
│ 07-25 10:00  | Key 创建      | 用户    | Key: sk-3c-a1b2  │
│ 07-20 09:00  | 管理员禁用    | admin   | 原因: 异常行为    │
└────────────────────────────────────────────────────────────┘
```

### 3.4 余额页面

```
┌─ 余额变动流水 ────────────────────────────────────────────┐
│                                                             │
│ 时间范围: [2026-07-01] ~ [2026-07-28] [查询] [导出CSV]     │
│                                                             │
│ 时间         | 类型   | 金额    | 变动前  | 变动后  | 备注  │
│ 07-28 10:30  | 消费   | -0.12  | 234.62 | 234.50 | gpt-4o│
│ 07-27 14:00  | 充值   | +100.00| 134.62 | 234.62 | 微信  │
│ 07-25 09:00  | 消费   | -0.50  | 135.12 | 134.62 | deepseek│
│ 07-20 12:00  | 试用   | +5.00  | 130.12 | 135.12 | 注册赠送│
│                                                             │
│ 汇总: 收入 ¥100.00  支出 ¥0.62  本期变动 ¥+99.38           │
└────────────────────────────────────────────────────────────┘
```

---

## 四、用户创建

### 4.1 手动创建

```
┌─ 创建用户 ────────────────────────────────┐
│                                             │
│ 邮箱:     [user@example.com     ]           │
│ 密码:     [·····················] 自动生成   │
│ 昵称:     [用户昵称              ]           │
│ 角色:     [user            ▼    ]           │
│ 用户类型:  [personal  ▼    ]                │
│ 赠送余额:  [0.00    ] ¥                    │
│ 备注:     [管理员创建              ]         │
│                                             │
│ [取消] [创建并发送通知]                      │
└─────────────────────────────────────────────┘
```

- 创建后自动发送邮件通知（含初始密码）
- 密码自动生成（12 位随机，含大小写+数字+特殊字符）

### 4.2 批量导入

```
导入格式: CSV
列: email, password, nickname, role, user_type, initial_balance

示例:
email,password,nickname,role,user_type,initial_balance
user1@example.com,Pass123!@,用户1,user,personal,5.00
user2@example.com,Pass456!$,用户2,user,enterprise,10.00

校验规则:
  - 邮箱格式正确 + 未注册
  - 密码符合复杂度要求
  - 角色必须在允许范围内
  - 导入前校验全部行，全部通过才执行
  - 最大 500 行/次
```

---

## 五、实名审核

### 5.1 待审列表

```
┌─ 实名审核 ─────────────────────────────────────────────────┐
│                                                              │
│ 筛选: 状态 [全部 ▼] 用户类型 [全部 ▼] 提交时间 [最近7天 ▼]   │
│                                                              │
│ ┌─ 待审列表 ───────────────────────────────────────────────┐│
│ │ 用户ID | 昵称   | 类型     | 提交时间      | 操作         ││
│ │ u_10086 | 张三   | 个人    | 07-28 10:00   | [审核]      ││
│ │ u_10090 | 某公司 | 企业    | 07-28 09:30   | [审核]      ││
│ │ u_10092 | 李四   | 个人    | 07-27 16:00   | [审核]      ││
│ │         |        | 共 3 项待审                           ││
│ └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 5.2 审核详情弹窗

```
┌─ 实名审核 — 张三 (u_10086) ─────────────────────────────────┐
│                                                                │
│ 提交信息:                                                      │
│   真实姓名: 张三                                                │
│   身份证号: 4401**********1234 (脱敏)                          │
│   身份证正面: [查看图片]                                        │
│   身份证背面: [查看图片]                                        │
│   提交时间: 2026-07-28 10:00                                   │
│   提交 IP: 117.78.2.66                                         │
│                                                                │
│ 用户信息:                                                      │
│   注册时间: 2026-07-20 14:00                                   │
│   注册 IP: 117.78.2.66                                         │
│   总消费: ¥234.50                                              │
│   是否有代理: 否                                               │
│                                                                │
│ 审核意见:                                                      │
│   [审核通过]  [审核拒绝]                                       │
│   拒绝原因: [___________________________] (拒绝时必填)         │
└────────────────────────────────────────────────────────────────┘
```

---

## 六、登录安全与异常检测

### 6.1 异地登录检测

| 检测项 | 规则 | 处置 |
|-------|------|------|
| 异地登录 | 当前 IP 所在地与常用地不同 | 登录页面弹窗提示 + 通知 |
| 新设备登录 | 首次使用该设备登录 | 邮件通知 + 通知列表 |
| 暴力破解 | 连续 5 次登录失败 | 验证码要求 + 30 分钟锁定 |
| 异常时间登录 | 02:00-06:00 首次登录 | 通知提醒 |

### 6.2 登录记录

```
┌─ 登录记录 (最近 30 天) ──────────────────────────────────────┐
│                                                                │
│ 时间           | IP              | 地点     | 设备    | 结果  │
│ 07-28 10:30    | 117.78.2.66     | 深圳     | Chrome  | ✅ 成功│
│ 07-28 00:10    | 8.149.140.186   | 深圳     | Firefox | ✅ 成功│
│ 07-27 22:30    | 123.60.55.62    | 北京     | Safari  | ⚠️ 异地│
│ 07-27 10:00    | 192.168.1.100   | 内网     | Chrome  | ❌ 失敗│
└────────────────────────────────────────────────────────────────┘
```

### 6.3 管理员操作

| 操作 | 说明 | 确认机制 | 日志记录 |
|------|------|---------|---------|
| 禁用用户 | 禁止登录 + API 调度 | 原因必填 | ✅ audit_action: user_disable |
| 启用用户 | 恢复 active 状态 | 确认弹窗 | ✅ audit_action: user_enable |
| 调整余额 | 增加/减少余额 | 金额 + 备注 | ✅ audit_action: balance_adjust |
| 调整角色 | 变更角色权限 | 确认弹窗 | ✅ audit_action: role_change |
| 重置密码 | 发送重置链接到邮箱 | 二次确认 | ✅ audit_action: user_password_reset |
| 重置 2FA | 关闭 2FA 并清空密钥 | 二次确认 + 原因 | ✅ audit_action: user_update |
| 强制登出 | 清除所有会话 | 确认弹窗 | ✅ audit_action: user_update |
| 模拟登录 | 临时以该用户身份登录 | 需要 super_admin | ✅ audit_action: user_impersonate |

---

## 七、Drizzle Schema

### 7.1 users 表（含管理字段）

```typescript
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 100 }),
  userType: userTypeEnum("user_type").notNull().default("personal"),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("pending"),

  // 禁用信息
  disabledReason: text("disabled_reason"),
  disabledBy: integer("disabled_by").references((): AnyPgColumn => users.id),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledUntil: timestamp("disabled_until", { withTimezone: true }),

  // 实名信息
  realNameStatus: realNameStatusEnum("real_name_status").notNull().default("unverified"),
  realName: varchar("real_name", { length: 100 }),
  idNumber: varchar("id_number", { length: 30 }),
  companyName: varchar("company_name", { length: 255 }),
  companyRegNumber: varchar("company_reg_number", { length: 50 }),

  // 余额 & 计费
  balance: numeric("balance", { precision: 18, scale: 6 }).notNull().default("0.000000"),
  discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).default("1.0000"),

  // 安全控制
  loginCaptchaUntil: timestamp("login_captcha_until", { withTimezone: true }),
  maxConcurrentSessions: integer("max_concurrent_sessions"),
  forceLogoutAt: timestamp("force_logout_at", { withTimezone: true }),

  // 2FA
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
  twoFactorBackupCodes: jsonb("two_factor_backup_codes").$type<string[]>(),

  // 时间
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
```

### 7.2 login_records（登录记录表）

```typescript
export const loginRecords = pgTable("login_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  ip: varchar("ip", { length: 45 }).notNull(),
  location: varchar("location", { length: 200 }),
  device: varchar("device", { length: 200 }),
  userAgent: varchar("user_agent", { length: 500 }),
  success: boolean("success").notNull(),
  failReason: varchar("fail_reason", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 八、API 接口

### 8.1 用户管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/users` | 用户列表（分页/筛选/排序） | support 以上 |
| `GET` | `/api/v1/admin/users/:id` | 用户详情 | support 以上 |
| `POST` | `/api/v1/admin/users` | 创建用户 | admin 以上 |
| `PUT` | `/api/v1/admin/users/:id` | 更新用户信息 | admin 以上 |
| `POST` | `/api/v1/admin/users/import` | 批量导入用户 | admin 以上 |
| `GET` | `/api/v1/admin/users/export` | 导出用户 | admin 以上 |

### 8.2 用户操作

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/users/:id/disable` | 禁用用户 | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/enable` | 启用用户 | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/balance` | 调整余额 | finance_ops 以上 |
| `POST` | `/api/v1/admin/users/:id/role` | 调整角色 | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/force-logout` | 强制登出 | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/reset-password` | 重置密码 | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/reset-2fa` | 重置 2FA | admin 以上 |
| `POST` | `/api/v1/admin/users/:id/impersonate` | 模拟登录 | super_admin 以上 |

### 8.3 批量操作

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/v1/admin/users/batch/disable` | 批量禁用 | admin 以上 |
| `POST` | `/api/v1/admin/users/batch/enable` | 批量启用 | admin 以上 |
| `POST` | `/api/v1/admin/users/batch/role` | 批量调整角色 | admin 以上 |
| `POST` | `/api/v1/admin/users/batch/balance` | 批量调整余额 | finance_ops 以上 |
| `POST` | `/api/v1/admin/users/batch/quota` | 批量调整配额 | admin 以上 |

### 8.4 实名审核

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/real-name-reviews` | 实名审核列表 | support 以上 |
| `GET` | `/api/v1/admin/real-name-reviews/:id` | 审核详情 | support 以上 |
| `POST` | `/api/v1/admin/real-name-reviews/:id/approve` | 审核通过 | support 以上 |
| `POST` | `/api/v1/admin/real-name-reviews/:id/reject` | 审核拒绝 | support 以上 |

### 8.5 登录记录

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/v1/admin/users/:id/login-records` | 用户登录记录 | admin 以上 |

---

## 九、前端组件规格

### 9.1 用户列表页

```typescript
interface UserListPageProps {
  defaultFilters?: UserFilters;
  onUserClick?: (userId: number) => void;
}

interface UserFilters {
  role?: string[];
  status?: string[];
  realNameStatus?: string[];
  userType?: string[];
  dateRange?: [string, string];
  keyword?: string;
}

interface UserTableRow {
  id: number;
  displayId: string;       // u_xxxxx
  nickname: string | null;
  email: string;
  phone: string | null;
  role: UserRole;
  balance: string;
  totalConsumption: string;
  status: UserStatus;
  realNameStatus: RealNameStatus;
  userType: UserType;
  createdAt: string;
  lastLoginAt: string | null;
}

interface BatchActionBarProps {
  selectedIds: number[];
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchRole: (role: string) => void;
  onBatchBalance: (amount: number, note: string) => void;
  onBatchQuota: (quota: Partial<UserQuota>) => void;
  onExport: (format: 'csv' | 'json') => void;
}
```

### 9.2 用户详情页

```typescript
interface UserDetailProps {
  userId: number;
  tabs: ('info' | 'keys' | 'logs' | 'balance')[];
  defaultTab?: 'info' | 'keys' | 'logs' | 'balance';
}

interface UserInfoSection {
  basic: {
    id: number;
    displayId: string;
    nickname: string | null;
    email: string;
    phone: string | null;
    role: UserRole;
    userType: UserType;
    status: UserStatus;
    createdAt: string;
    registerIp: string;
  };
  realName: {
    status: RealNameStatus;
    realName: string | null;
    idNumber: string | null;    // 脱敏
    companyName: string | null;
    approvedAt: string | null;
  };
  balance: {
    current: string;
    totalRecharge: string;
    totalConsumption: string;
    frozenAmount: string;
    discountRate: string;
  };
  security: {
    lastLoginIp: string;
    lastLoginAt: string | null;
    twoFactorEnabled: boolean;
    deviceCount: number;
    anomalies: number;
  };
  quota: {
    qps: number;
    tpm: number;
    dailyCall: number | null;
    concurrency: number;
  };
}
```

---

## 十、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| PRD-README.md §4.2 | 用户管理总纲 |
| ref-2.1-roles-permissions.md | 角色权限体系（影响用户角色管理） |
| ref-2.2-user-dashboard.md | 用户端仪表盘（用户视角的管理功能） |
| ref-3-agent-system.md | 代理商体系（代理也算用户） |
| ref-4.6-security.md | 安全风控（登录安全/异常检测） |
| ref-5.3-rate-limiter.md | 用户配额管理（QPS/TPM 限制） |
| data-dictionary.md §2.1 | users 表字段定义 |
| ref-7-nfr.md | 安全要求（登录防护/2FA/审计） |

---

## 十一、用户禁用/删除后的数据一致性处理（运营视角补充）

> **P0 补充**：2026-07-30 — 用户禁用/删除后各项关联数据的处理策略

### 11.1 用户禁用影响范围

| 关联数据 | 处理策略 | 恢复操作 |
|---------|---------|---------|
| API Key（api_keys） | 自动禁用所有 Key（status=disabled） | 恢复用户时自动恢复 |
| 余额（users.balance） | 保留，冻结不可用 | 恢复用户时解冻 |
| 消费记录（call_logs） | 保留（审计需要） | 不受影响 |
| 充值订单（recharge_orders） | 保留 | 不受影响 |
| 发票（invoices） | 保留 | 不受影响 |
| 代理关系（agent_clients） | 保留关联但代理不可操作该用户 | 恢复后恢复关联 |
| 工单（tickets） | 保留，标记用户已禁用 | 客服可查看但不能操作 |
| 通知（notifications） | 保留，不再推送 | 恢复后恢复推送 |
| 会话（sessions） | 立即失效（所有 token 过期） | 恢复后需重新登录 |

### 11.2 禁用/删除操作规则

```
禁用（soft）:
  - status = disabled
  - 所有关联数据保留
  - 可恢复
  - 操作需记录原因

删除（hard）:
  - 仅允许在用户无余额、无活跃 Key、无未完成工单时执行
  - 物理删除 users 表记录
  - 关联数据匿名化（脱敏邮箱/手机/姓名）
  - 消费记录保留（但 user_id 置空）
  - 不可恢复
  - 需 super_admin 审批
```

### 11.3 批量禁用安全控制

| 保护措施 | 说明 |
|---------|------|
| 二次确认弹窗 | "将禁用 N 个用户，确认后所有 API Key 将立即失效" |
| 操作预览 | 展示禁用前活跃用户数、涉及 Key 数、余额情况 |
| 操作限流 | 单次最多操作 1000 个用户 |
| 操作撤销 | 批量操作后 30 秒内可撤销（通过 operation_logs 回滚） |
| 审计日志 | 记录操作用户、时间、涉及用户数 |