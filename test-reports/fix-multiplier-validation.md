# CRIT-1 修复报告：定价倍率值域校验

## 问题描述
`POST /api/v1/admin/finance/prices/multiplier` 未对 `value` 参数做值域校验，接受 `value=0`（计费全免）、`value=-1`（倒贴）、`value=abc` 等非法值。

## 修复范围
**文件：** `src/services/price-service.ts` — `updatePricingMultiplier` 函数

### 修改内容
在函数体最开头（`const db = getDb()` 之前）添加三段校验：

| 校验条件 | 错误码 | 错误消息 | HTTP 状态 |
|----------|--------|----------|-----------|
| `isNaN(parseFloat(value))` | `INVALID_MULTIPLIER` | 无效的定价倍率值 | 400 |
| `parseFloat(value) <= 0` | `INVALID_MULTIPLIER` | 定价倍率必须大于 0 | 400 |
| `parseFloat(value) > 10` | `INVALID_MULTIPLIER` | 定价倍率不能超过 10 | 400 |

## 验证结果

以下 4 个测试用例均在本地验证通过：

### 用例 1: `value=0` → 400
```bash
curl.exe -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"value":"0","reason":"test"}'
```
**预期：** HTTP 400, 错误消息 "定价倍率必须大于 0"
**结果：** ✅ 通过

### 用例 2: `value=-1` → 400
```bash
curl.exe -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"value":"-1","reason":"test"}'
```
**预期：** HTTP 400, 错误消息 "定价倍率必须大于 0"
**结果：** ✅ 通过

### 用例 3: `value=abc` → 400
```bash
curl.exe -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"value":"abc","reason":"test"}'
```
**预期：** HTTP 400, 错误消息 "无效的定价倍率值"
**结果：** ✅ 通过

### 用例 4: `value=1.15` → 200
```bash
curl.exe -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"value":"1.15","reason":"test"}'
```
**预期：** HTTP 200, 成功更新
**结果：** ✅ 通过

## 回归检查
- 旧逻辑全部保留不动（DB 查询、事务、Upsert、变更历史写入）
- TypeScript 编译无新增错误（13 个 pre-existing 错误均在其他文件中）
- 默认系统倍率 1.15 在合法范围内，不受影响

## 结论
修复完成，已合并。上线后非法倍率值将被 400 拒绝。
