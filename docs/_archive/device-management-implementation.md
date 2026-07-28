# 设备管理功能实现文档

## 功能概述

设备管理功能已在 3cloud 项目中完整实现，允许用户查看和管理已登录设备，增强账号安全性。

## 已实现功能

### 1. 数据库设计 ✅

**表：`user_login_sessions`**（已存在于 `api/src/db/schema/security.ts`）

```typescript
export const userLoginSessions = pgTable(
  "user_login_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
    ip: varchar("ip", { length: 45 }).notNull(),
    userAgent: varchar("user_agent", { length: 500 }),
    deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    lastActivity: timestamp("last_activity", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
  },
  // indexes...
);
```

**字段说明：**
- `sessionToken`: JWT token 的唯一标识（jti）
- `ip`: 登录 IP 地址
- `userAgent`: 浏览器 User-Agent
- `deviceFingerprint`: 设备指纹（可选）
- `city/country`: IP 地理解析结果
- `isActive`: 会话是否活跃
- `lastActivity`: 最后活跃时间
- `expiredAt`: 过期时间

### 2. 后端 API ✅

**文件：`api/src/routes/auth-security.ts`**

已实现以下端点：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/v1/auth/security/login-history` | 获取登录历史 |
| GET | `/api/v1/auth/security/sessions` | 获取活跃会话列表 |
| POST | `/api/v1/auth/security/logout-session/:id` | 登出指定设备 |
| POST | `/api/v1/auth/security/logout-all` | 登出所有其他设备 |

**关键实现：**
- JWT 认证保护
- 当前设备标记（通过 Authorization header 中的 token 对比）
- 登出后同时失效 Redis 缓存和数据库记录
- 支持并发会话数限制

### 3. 会话管理服务 ✅

**文件：`api/src/services/session-manager.ts`**

核心功能：
- `createSession()`: 创建会话，检查并发数限制
- `validateSession()`: 校验会话有效性（Redis 缓存 + DB 回退）
- `revokeSession()`: 撤销单个会话
- `revokeAllUserSessions()`: 撤销用户所有会话
- `getUserActiveSessions()`: 获取用户活跃会话列表
- `cleanupExpiredSessions()`: 清理过期会话（定时任务）

### 4. 前端组件 ✅

**文件：`web/src/pages/Security.tsx`**

**功能特性：**
- ✅ 安全评分（基于活跃会话数和失败登录率）
- ✅ 活跃会话列表展示
- ✅ 当前设备标记（蓝色背景 + 徽章）
- ✅ 登出指定设备按钮
- ✅ 一键登出所有其他设备
- ✅ 登录历史记录表格
- ✅ 登录城市分布地图（Geo 汇总）
- ✅ 实时刷新功能

**UI 设计：**
- 使用 Tailwind CSS 样式
- Lucide React 图标
- 响应式布局
- 加载状态和错误处理

### 5. 路由集成 ✅

**前端路由：**`/console/security` → `Security.tsx`

已在 `web/src/App.tsx` 中配置：
```tsx
<Route path="security" element={withSuspense(<Security />)} />
```

**侧边栏菜单：**已集成到用户端导航

在 `web/src/components/layout/Sidebar.tsx` 中：
```typescript
{ to: '/console/security', icon: Lock, label: '账号安全' }
```

### 6. 类型定义 ✅

**文件：`web/src/types/security.ts` 和 `web/src/types/user.ts`**

```typescript
export interface ActiveSession {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  isCurrent: boolean
  lastActivity: string
  createdAt: string
}

export interface LoginHistoryItem {
  id: number
  ip: string
  userAgent: string | null
  city: string | null
  country: string | null
  success: boolean
  failReason: string | null
  createdAt: string
}
```

## 技术实现细节

### 设备识别

1. **User-Agent 解析**：前端显示原始 UA 字符串（可扩展使用 `ua-parser-js` 库）
2. **IP 地理解析**：登录时通过 IP 库解析城市/国家（已有 `city`、`country` 字段）
3. **当前设备标记**：对比 Authorization header 中的 token 与会话的 `sessionToken`

### 安全机制

1. **JWT 认证**：所有端点都需要有效的 JWT token
2. **会话隔离**：只能管理自己的会话
3. **并发限制**：可配置最大并发会话数（默认 5）
4. **双重失效**：登出时同时失效 Redis 缓存和数据库记录
5. **自动清理**：定时任务清理过期会话

### 数据流

```
用户登录
  ↓
创建会话记录（user_login_sessions）
  ↓
Redis 缓存会话信息
  ↓
用户访问安全页面
  ↓
GET /api/v1/auth/security/sessions
  ↓
显示活跃会话列表
  ↓
用户点击"登出"
  ↓
POST /api/v1/auth/security/logout-session/:id
  ↓
失效会话（DB + Redis）
  ↓
前端更新列表
```

## 验收标准检查

| 标准 | 状态 | 说明 |
|------|------|------|
| 设备列表正确显示 | ✅ | 显示 IP、UA、城市、最后活跃时间 |
| 登出功能正常 | ✅ | 单个登出 + 批量登出已实现 |
| 当前设备标记正确 | ✅ | 蓝色背景 + "当前设备" 徽章 |
| 登出后 session 失效 | ✅ | Redis + DB 双重失效 |

## 扩展建议

### 1. 设备名称优化

当前显示原始 User-Agent，建议使用 `ua-parser-js` 解析：

```typescript
import UAParser from 'ua-parser-js';

function parseDeviceName(userAgent: string): string {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  return `${result.browser.name} on ${result.os.name} (${result.device.type || 'Desktop'})`;
}
```

### 2. 设备指纹

可选实现设备指纹识别（使用 `fingerprintjs2`）：

```typescript
import Fingerprint2 from 'fingerprintjs2';

Fingerprint2.get((components) => {
  const fingerprint = Fingerprint2.x64hash128(components.map(c => c.value).join(''));
  // 发送到后端
});
```

### 3. 地理位置可视化

使用地图组件（如 `react-simple-maps`）可视化登录城市分布。

### 4. 异常登录告警

当检测到新设备或异常地理位置登录时，发送邮件/短信告警。

## 总结

**设备管理功能已完整实现，包括：**
- ✅ 数据库表设计
- ✅ 后端 API 实现
- ✅ 会话管理服务
- ✅ 前端 UI 组件
- ✅ 路由和菜单集成
- ✅ 类型定义
- ✅ 安全机制

**所有验收标准均已满足，功能可直接使用。**
