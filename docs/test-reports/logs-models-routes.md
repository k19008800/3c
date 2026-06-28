# T3 — Logs & Models 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/logs.ts`, `api/src/routes/models.ts`
> 依赖: `api/src/schemas.ts`, `api/src/middleware/auth.ts`, `api/src/db/schema.ts`

## 端点覆盖 — logs.ts

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/logs` | GET | authenticateJWT (app.addHook) | logFilterSchema | ✅ |
| `/api/v1/logs/:id` | GET | authenticateJWT (app.addHook) | 手动校验 | ✅ |
| `/api/v1/logs/summary` | GET | authenticateJWT (app.addHook) | 手动参数 | ✅ |

## 端点覆盖 — models.ts

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/models` | GET | 无 (公开访问) | ✅ |

## Logs 审计

### Schema 校验
- `logFilterSchema`: paginationSchema 扩展了 modelId, vendorName, status, startDate, endDate ✅
- 使用 `z.coerce.number()` 做自动类型转换 ✅

### 分页参数
- 默认 page=1, pageSize=20 ✅
- offset 计算: (page-1) * pageSize ✅
- 总数查询 + 分页查询 分离 ✅

### 时间范围筛选
- startDate → gte(callLogs.createdAt) ✅
- endDate → lte(callLogs.createdAt) ✅
- 时间兼容 ISO 字符串 ✅

### 用户隔离
- 所有查询使用 `eq(callLogs.userId, userId)` ✅
- 用户只能查看自己的日志 ✅

### 日志详情
- `/:id` 参数手动 parseInt + isNaN 检查 ✅
- 404 处理 ✅
- CallLogDetail 接口包含完整字段 ✅

### Summary 端点
- 聚合查询: count, sum, filter by status ✅
- cost 类型: numeric → cast(`::text`) ✅

**问题发现:**
⚠️ `logFilterSchema` 中 `vendorName` 不应用精确匹配 `eq`，应该用 `like`/`ilike`，因为 call_logs 中的 vendorName 可能包含 URL 或额外信息。但当前 schema 定义 vendorName 为 `z.string().optional()`，路由中使用 `eq(callLogs.vendorName, parsed.vendorName)` → 精确匹配。

## Models 审计

### 公开访问
- 无 authenticateJWT 中间件 ✅
- 任何用户/非用户均可访问 ✅

### 查询逻辑
- 三表 INNER JOIN: models → vendorModels → vendors ✅
- 仅查询 status=true 的 vendorModels ✅
- 结果按 name + weight 排序 ✅

### 缺失字段
❌ 公共模型列表缺少 `costPriceInput`/`costPriceOutput`（成本价），不应暴露 ✅ (设计合理)
❌ 但返回字段未包含 `model.displayName` 于 ModelListItem ✅ (包含的)

### 聚合
- 使用 Map<number, ModelListItem> 合并同模型的多供应商 ✅
- total = list.length ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 4/4 |
| logFilterSchema | ✅ |
| 分页逻辑 | ✅ |
| 用户隔离 | ✅ |
| 公开模型 | ✅ |
| Zod Schema | ⚠️ vendorName 精确匹配 |
| 响应格式 | ✅ |
| 整体评分 | 88/100 |

**建议修复:**
1. vendorName 筛选使用 `ilike` 替代 `eq`
