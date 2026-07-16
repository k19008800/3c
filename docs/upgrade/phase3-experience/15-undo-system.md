# 15 — 操作撤销机制

> **后端**: 1 人天 | **前端**: 0.5 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：关键操作（删除 API Key、禁用通道、修改定价）一旦执行无法回退。误操作可能导致服务中断或财务数据错误。

**目标**：关键操作支持 30 秒内撤销；数据层面软删除替代物理删除；所有变更可追溯。

---

## 2. 设计

### 撤销令牌机制

```
用户操作 → 创建 undo_token（有效期 30s） → 执行变更 → 返回 undo_token
              ↓                                  ↓
        用户点击"撤销"                     30 秒未操作
         → 撤销变更                         → token 过期自动清理
```

### Undo Token 存储

```typescript
// Redis 存储 undo token

interface UndoToken {
  id: string              // UUID
  action: string          // 'delete_api_key' | 'disable_vendor' | 'update_price' | ...
  resourceType: string    // 'api_key' | 'vendor' | 'model' | ...
  resourceId: number
  // 前值（用于恢复）
  before: Record<string, any>
  // 后值（用于记录已执行的操作）
  after: Record<string, any>
  operatorId: number
  createdAt: number       // timestamp
  expiresAt: number       // createdAt + 30s
}
```

---

## 3. API

| 端点 | 方法 | 用途 |
|------|------|------|
| `POST /api/v1/admin/undo/:token` | POST | 撤销操作 |
| `GET /api/v1/admin/undo/pending` | GET | 查看待撤销的操作（当前用户）|

```typescript
POST /api/v1/admin/undo/abc-123-def
Response: {
  success: true
  action: 'delete_api_key'
  resourceType: 'api_key'
  resourceId: 42
  restored: {
    name: 'prod-key',
    status: 'active',
    // ...
  }
}
```

---

## 4. 核心逻辑

### 创建 Undo Token

```typescript
// 在每次关键操作后调用
async function createUndoToken(params: {
  action: string
  resourceType: string
  resourceId: number
  before: Record<string, any>
  after: Record<string, any>
  operatorId: number
}): Promise<string> {
  const redis = getRedis()
  const tokenId = randomUUID()
  
  const undoToken: UndoToken = {
    id: tokenId,
    ...params,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000,  // 30 秒
  }
  
  await redis.setex(
    `undo:${tokenId}`,
    35,  // 35 秒 TTL（略长于有效期）
    JSON.stringify(undoToken),
  )
  
  return tokenId
}
```

### 执行撤销

```typescript
async function executeUndo(tokenId: string, operatorId: number): Promise<UndoResult> {
  const redis = getRedis()
  const raw = await redis.get(`undo:${tokenId}`)
  
  if (!raw) {
    throw new AppError('UNDO_EXPIRED', '撤销令牌已过期（超过 30 秒）', 410)
  }
  
  const token: UndoToken = JSON.parse(raw)
  
  // 仅创建者可以撤销
  if (token.operatorId !== operatorId) {
    throw new AppError('UNDO_FORBIDDEN', '只有操作者可以撤销', 403)
  }
  
  // 已撤销过的 token 不能再次撤销
  if (token.revoked) {
    throw new AppError('UNDO_ALREADY', '该操作已被撤销', 409)
  }
  
  // 执行恢复
  const db = getDb()
  
  switch (token.action) {
    case 'delete_api_key':
      // 恢复软删除的记录
      await db.update(apiKeys)
        .set({ status: 'active', deletedAt: null })
        .where(eq(apiKeys.id, token.resourceId))
      break
      
    case 'disable_vendor':
      // 恢复状态
      await db.update(vendors)
        .set({ status: token.before.status })
        .where(eq(vendors.id, token.resourceId))
      break
      
    case 'update_price':
      // 恢复定价
      await db.update(vendorModels)
        .set({
          sellPriceInput: token.before.sellPriceInput,
          sellPriceOutput: token.before.sellPriceOutput,
        })
        .where(eq(vendorModels.id, token.resourceId))
      break
      
    // ... 更多操作
  }
  
  // 标记 token 已使用
  await redis.set(`undo:${tokenId}:revoked`, '1', 'EX', 60)
  
  // 记录审计日志
  await db.insert(auditLogs).values({
    operatorId,
    action: 'undo',
    targetType: token.resourceType,
    targetId: token.resourceId,
    description: `撤销操作: ${token.action}`,
    after: token.before,  // 恢复后的值 = 操作前的值
  })
  
  return {
    success: true,
    action: token.action,
    resourceType: token.resourceType,
    resourceId: token.resourceId,
    restored: token.before,
  }
}
```

---

## 5. 前端 Toast 交互

```tsx
// 改造所有删除/禁用/修改操作，返回 undo_token 后显示：

function useUndoable<T>(
  actionFn: () => Promise<{ undoToken?: string; data: T }>,
  options: {
    successMessage: string
    undoAction: string    // 操作描述，如"删除了 prod-key"
  }
) {
  const execute = async () => {
    const result = await actionFn()
    
    if (result.undoToken) {
      toast({
        message: `${options.undoAction} 成功`,
        action: {
          label: '撤销',
          onClick: () => undoManager.execute(result.undoToken!),
        },
        duration: 30_000,  // 30 秒后自动消失
        // 增加倒计时进度条
        progress: true,
      })
    }
  }
  
  return { execute }
}

// 使用
const { execute: deleteKey } = useUndoable(
  () => del(`/api/v1/admin/api-keys/${key.id}`, { _undo: true }),
  { undoAction: `删除了 ${key.name}` },
)
```

渲染效果：
```
┌──────────────────────────────────────────────────────┐
│  ✅ 已删除 prod-key                          ┌─────┐  │
│                                      [撤销] [✕] │  │
│  ██████████████░░░░░░░░░░░░ 还剩 18 秒          └─────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 6. 适用操作清单

| 操作 | 危险性 | 撤销方式 |
|------|--------|---------|
| 删除 API Key | 🔴 高 | 恢复 status + deletedAt=null |
| 禁用供应商 | 🟡 中 | 恢复 status |
| 禁用模型映射 | 🟡 中 | 恢复 status=true |
| 修改定价 | 🟡 中 | 恢复原价 |
| 禁用用户 | 🟡 中 | 恢复 status |
| 删除用户 | 🔴 高 | 恢复 deletedAt=null（需额外检查）|
| 修改限流配置 | 🟢 低 | 恢复原值 |
| 批量删除 | 🔴 高 | 逐条恢复（批量撤销 = 遍历每个 token）|

---

## 7. 验收标准

- [ ] 关键操作（删除/禁用/修改定价）执行后显示"撤销"按钮
- [ ] 30 秒内点击撤销 → 数据恢复
- [ ] 30 秒后撤销按钮消失
- [ ] 非操作者不能撤销
- [ ] 撤销操作记录到 audit_logs
- [ ] 已撤销的操作显示"已撤销"标记，不可再次撤销
- [ ] 覆盖 8 种关键操作
