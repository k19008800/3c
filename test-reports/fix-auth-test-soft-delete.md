# Fix: auth.test.ts — 适配 API Key 软删除行为

## 问题

CRIT-3 修复将 API Key 删除从 `db.delete` 改为 `db.update(..., {status: false})` 后，`auth.test.ts` 中有 2 个测试用例仍然期望硬删除行为，导致测试失败。

## 根因

DELETE `/api/v1/api-keys/:id` 路由现在执行软删除：
1. `SELECT` 检查 key 是否存在且属于当前用户
2. `UPDATE apiKeys SET status=false WHERE id=X`
3. 返回 `200`

软删除的 key 仍在数据库中存在（`status: false`），但两个测试用例仍假设物理删除行为。

## 修改内容

文件：`src/__tests__/auth.test.ts`

### 1. "should no longer appear in the list after delete"

| 修改前 | 修改后 |
|--------|--------|
| 测试名: `should no longer appear in the list after delete` | 测试名: `should reflect soft-deleted status in list` |
| `expect(key).toBeUndefined()` | `expect(key).toBeDefined(); expect(key.status).toBe(false)` |

**原因**：软删除后 key 仍在列表中出现，只是 `status` 变为 `false`。

### 2. "should reject deleting non-existent key (404)"

| 修改前 | 修改后 |
|--------|--------|
| URL: `` /api/v1/api-keys/${keyId} ``（已软删除的 key）| URL: `/api/v1/api-keys/999999999`（真实不存在的 ID）|

**原因**：软删除后 key 在数据库仍存在（`status: false`），`SELECT` 检查通过，返回 `200`。需要真正不存在的 ID 才能触发 `404`。

## 验证结果

```
$ npx vitest run __tests__/auth.test.ts
✓ src/__tests__/auth.test.ts (32 tests) — 32 passed (0 failed)

$ npx vitest run
✓ 11 test files — 507 passed (0 failed)
```
