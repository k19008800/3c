# CRIT-3 修复报告: API Key 硬删除改为软删除

## 问题

`DELETE /api/v1/api-keys/:id` 直接执行 `db.delete(apiKeys)`，记录从数据库中彻底移除，无法追溯历史操作，也无法恢复。

## 修复内容

### 修改文件

| 文件 | 行号 | 修改前 | 修改后 |
|------|------|--------|--------|
| `src/routes/api-keys.ts` | ~194 | `await db.delete(apiKeys).where(eq(apiKeys.id, id));` | `await db.update(apiKeys).set({ status: false }).where(eq(apiKeys.id, id));` |
| `src/routes/admin/api-keys.ts` | ~149 | `await db.delete(apiKeys).where(eq(apiKeys.id, kId));` | `await db.update(apiKeys).set({ status: false }).where(eq(apiKeys.id, kId));` |

### 修改说明

两处 DELETE handler 均已从物理删除改为软删除：

- **用户侧** `DELETE /api/v1/api-keys/:id` → 设置 `status = false`
- **管理侧** `DELETE /api/v1/admin/users/:id/api-keys/:keyId` → 设置 `status = false`

## 安全验证

### 认证层兼容性

`src/middleware/auth.ts` 第 228 行已有 `authenticateApiKey` 守卫：

```typescript
// 检查 Key 状态
if (!keyRecord.status) {
  reply.status(401).send({
    error: { message: "API Key 已被禁用", type: "invalid_request_error" },
  });
  return;
}
```

软删除后 `status = false` 触发此守卫，已删除的 key **无法再用于认证**，认证行为与硬删除完全一致。

### 列表兼容性

- **用户列表** `GET /api/v1/api-keys` — 无 `status` WHERE 过滤，软删除后仍显示在列表中（`status: false`），用户可见
- **管理列表** `GET /api/v1/admin/users/:id/api-keys` — 同样无 `status` 过滤，所有 key 可追溯

### 编译验证

```
npx tsc --noEmit         # 通过（已有预存错误均不涉及 api-keys）
npx tsc --noEmit | grep api-keys   # 零 errors
```

## 影响范围

- **API Key 列表**不受影响，仍显示所有 key（含 `status: false` 的已删除 key）
- **认证流程**不受影响，`authenticateApiKey` 已检查 `status` 字段
- **新增行为**：已删除的 key 记录保留在数据库中，管理员可通过 admin 列表查看/重新启用
- **数据恢复**：将 `status` 改回 `true` 即可恢复

## 验证方法

### psql 验证

```sql
-- 删除前
SELECT id, name, status FROM api_keys WHERE id = <id>;
-- 返回: 1, "my-key", true

-- 调用 DELETE API 后
SELECT id, name, status FROM api_keys WHERE id = <id>;
-- 返回: 1, "my-key", false    ← 记录仍在，status 变为 false
```

### API 认证验证

```bash
# 使用已删除 key 调用
curl -H "Authorization: Bearer sk-3c-xxx" https://api.3cloud.com/v1/chat/completions
# 返回 401: "API Key 已被禁用"
```
