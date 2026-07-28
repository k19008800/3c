# T8 — Admin Models 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/models.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/models` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/models` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/models/:id` | PATCH | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/models/:id` | DELETE | authenticateJWT + requireRole | ✅ |

## Schema 校验

- 创建时手动校验 `name` 必填，`type` 在 `MODEL_TYPES` 中 ✅
- PATCH 手动白名单: displayName, status, type ✅

## 关联检查

- DELETE 前检查 `vendorModels` 引用: `count(*) WHERE modelId = id` ✅
- 有关联则阻止删除 ✅

## 数据库唯一冲突

- 23505 (唯一约束冲突) → 409 + message ✅

## 列表查询

- 支持 keyword (ILIKE)、type、status 筛选 ✅
- 分页: page/pageSize ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 4/4 |
| CRUD 完整性 | ✅ |
| 关联检查 | ✅ |
| 唯一冲突处理 | ✅ |
| 整体评分 | 90/100 |

**建议修复:**
1. 添加 Zod Schema 校验替代手动校验
2. PATCH 应该使用 Zod 校验而不是手动白名单
