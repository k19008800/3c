# 07 — 上游 AK 分组管理

> **后端**: 2 人天 | **前端**: 1 人天 | **依赖**: 07-1 vendor_key_groups 表迁移

---

## 1. 背景与目标

**问题**：当前每个 vendor_model 只绑定一个 API Key。上游可能提供多个 Key（如 DeepSeek 主 Key + 备用 Key），无法做 Key 池轮转或负载拆分。

**目标**：支持将多个上游 API Key 组成 Key 池，支持轮询/加权/自动故障切换策略。

---

## 2. 数据库设计

### 新建 `vendor_key_groups` 表

```typescript
// 文件：api/src/db/schema.ts 追加

export const vendorKeyGroups = pgTable("vendor_key_groups", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  strategy: varchar("strategy", { length: 20 }).notNull().default("round_robin"),
  // round_robin | weighted | failover | priority
  description: text("description"),
  status: boolean("status").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// 策略说明
// round_robin — 轮流使用组内 Key
// weighted — 按权重分配请求
// failover — 主 Key 异常时切换到备用
// priority — 按优先级顺序选择
```

### 新建 `vendor_key_group_items` 表

```typescript
export const vendorKeyGroupItems = pgTable("vendor_key_group_items", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => vendorKeyGroups.id, { onDelete: "cascade" }),
  
  // 认证信息（替代 vendor_models 上的 apiKeyEncrypted）
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  apiKeyPrefix: varchar("api_key_prefix", { length: 12 }),  // 展示前缀，如 "sk-***"
  
  // 策略字段
  weight: integer("weight").notNull().default(1),          // weighted 策略用
  priority: integer("priority").notNull().default(0),       // priority 策略用（越小越高）
  
  // 状态追踪
  status: boolean("status").notNull().default(true),
  isDown: boolean("is_down").notNull().default(false),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  totalCalls: integer("total_calls").notNull().default(0),
  successCalls: integer("success_calls").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
```

### 迁移脚本

```typescript
// api/src/db/migrations/2026-07-20-vendor-key-groups.ts

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";

export async function up(db: drizzle) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_key_groups (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      strategy VARCHAR(20) NOT NULL DEFAULT 'round_robin',
      description TEXT,
      status BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendor_key_group_items (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES vendor_key_groups(id) ON DELETE CASCADE,
      api_key_encrypted TEXT NOT NULL,
      api_key_prefix VARCHAR(12),
      weight INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      status BOOLEAN NOT NULL DEFAULT true,
      is_down BOOLEAN NOT NULL DEFAULT false,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMP,
      total_calls INTEGER NOT NULL DEFAULT 0,
      success_calls INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- 迁移现有数据：为每个 vendor_model 的 apiKeyEncrypted 创建默认分组
    INSERT INTO vendor_key_groups (vendor_id, name, strategy)
    SELECT DISTINCT vendor_id, '默认分组', 'round_robin'
    FROM vendor_models WHERE api_key_encrypted IS NOT NULL;

    INSERT INTO vendor_key_group_items (group_id, api_key_encrypted, weight)
    SELECT g.id, vm.api_key_encrypted, 1
    FROM vendor_models vm
    JOIN vendor_key_groups g ON g.vendor_id = vm.vendor_id
    WHERE vm.api_key_encrypted IS NOT NULL;
  `);
}
```

### `vendor_models` 表关联

在 `vendor_models` 表新增字段（可选，用于直接绑定分组而非单独的 Key）：

```typescript
// vendor_models 新增
keyGroupId: integer("key_group_id").references(() => vendorKeyGroups.id),
// 如果 keyGroupId 不为空，则忽略 apiKeyEncrypted，使用分组策略
```

---

## 3. API 设计

### 分组管理

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/admin/vendors/:id/key-groups` | GET | 获取厂商的 Key 分组列表 |
| `/api/v1/admin/vendors/:id/key-groups` | POST | 创建 Key 分组 |
| `/api/v1/admin/vendors/:id/key-groups/:gid` | PATCH | 更新分组（策略、名称） |
| `/api/v1/admin/vendors/:id/key-groups/:gid` | DELETE | 删除分组（有条件：组内无关联通道） |

### 组内 Key 管理

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/v1/admin/key-groups/:gid/items` | GET | 分组内 Key 列表 |
| `/api/v1/admin/key-groups/:gid/items` | POST | 新增 Key（支持批量） |
| `/api/v1/admin/key-groups/:gid/items/:iid` | PATCH | 更新 Key（权重、优先级） |
| `/api/v1/admin/key-groups/:gid/items/:iid` | DELETE | 移除 Key |
| `/api/v1/admin/key-groups/:gid/items/batch` | POST | 批量导入 Key（CSV） |
| `/api/v1/admin/key-groups/:gid/items/test/:iid` | POST | 测试单个 Key 连通性 |

### Key 测试

```typescript
POST /api/v1/admin/key-groups/:gid/items/test/:iid
Response: {
  success: boolean
  durationMs: number
  error?: string
}
// 实现：使用该 Key 向 upstream 发一个简单请求（轻量模型或 list models）
```

---

## 4. 路由引擎改造

### `router.ts` — `selectRoute` 函数增强

```typescript
async function selectKeyFromGroup(groupId: number): Promise<{
  keyItem: VendorKeyGroupItem
  apiKeyPlain: string
}> {
  const group = await getKeyGroup(groupId)
  
  switch (group.strategy) {
    case 'round_robin':
      return roundRobinSelect(groupId)
    case 'weighted':
      return weightedSelect(groupId)
    case 'failover':
      return failoverSelect(groupId)
    case 'priority':
      return prioritySelect(groupId)
  }
}

// round_robin: Redis INCR 取模
async function roundRobinSelect(groupId: number) {
  const items = await getActiveKeyItems(groupId)
  const idx = await redis.incr(`keygroup:${groupId}:counter`) % items.length
  return { keyItem: items[idx], apiKeyPlain: decrypt(items[idx].apiKeyEncrypted) }
}

// weighted: 加权随机
async function weightedSelect(groupId: number) {
  const items = await getActiveKeyItems(groupId)
  const totalWeight = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * totalWeight
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return { keyItem: item, apiKeyPlain: decrypt(item.apiKeyEncrypted) }
  }
  return /* fallback */
}

// failover: 按优先级选择第一个可用 Key
async function failoverSelect(groupId: number) {
  const items = await getKeyItemsByPriority(groupId)
  for (const item of items) {
    if (!item.isDown) return { keyItem: item, apiKeyPlain: decrypt(item.apiKeyEncrypted) }
  }
  // 全部 down → 降级使用最低优先级的 Key
  return { keyItem: items[items.length - 1], apiKeyPlain: decrypt(items[items.length - 1].apiKeyEncrypted) }
}
```

### 调用失败时的自动切换

在 `updateHealthAfterCall` 后追加：

```typescript
// 当调用失败，且该 vendor_model 绑定了 keyGroup
if (vm.keyGroupId) {
  const keyItem = await getActiveKeyItemForCall(vendorModelId)
  if (keyItem && !success) {
    await db.update(vendorKeyGroupItems)
      .set({ 
        consecutiveFailures: sql`consecutive_failures + 1`,
        isDown: sql`CASE WHEN consecutive_failures + 1 >= 3 THEN true ELSE is_down END`,
      })
      .where(eq(vendorKeyGroupItems.id, keyItem.id))
  }
}
```

---

## 5. 前端组件

### `<KeyGroupManager>`

供应商详情页新增"Key 分组"Tab：

```
┌──────────────────────────────────────────────────────┐
│  [基本信息] [模型映射] [Key 分组] [熔断历史]            │
├──────────────────────────────────────────────────────┤
│                                                       │
│  默认分组 ─── [轮询] ▼                      [+ 新增 Key] │
│  ┌─────────────────────────────────────────────────┐  │
│  │ #│ Key 前缀          │权重│状态│最近使用│成功率│操作│  │
│  │ 1│ sk-b62e...a1f2    │ 1  │ ✅ │ 10:30  │ 98% │ 测试│  │
│  │ 2│ sk-7d3f...c4e8    │ 2  │ ✅ │ 10:25  │ 95% │ 测试│  │
│  │ 3│ sk-9a1b...f2d4    │ 1  │ ❌ │ 09:00  │ 30% │ 测试│  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  备用分组 ─── [主备切换] ▼                    [+ 新增 Key] │
│  ┌─────────────────────────────────────────────────┐  │
│  │ #│ Key 前缀          │优先级│状态│最近使用│成功率│   │  │
│  │ 1│ sk-xxx...111      │  1  │ ✅ │ 10:28  │ 99% │   │
│  │ 2│ sk-yyy...222      │  2  │ ✅ │ 10:00  │ 90% │   │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│                                         [+ 创建新分组] │
└──────────────────────────────────────────────────────┘
```

---

## 6. 验收标准

- [ ] 供应商详情新增 Key 分组 Tab
- [ ] 支持创建分组、选择策略（轮询/加权/主备/优先级）
- [ ] 分组内可新增/删除/测试单个 Key
- [ ] 批量导入 Key（CSV 文件）
- [ ] 路由引擎优先使用分组策略选择 Key
- [ ] Key 连续失败 3 次自动标记为 down
- [ ] 分组内全部 down 时降级使用最低优先级 Key
- [ ] 前端展示分组概览：Key 数量、可用数、平均成功率
