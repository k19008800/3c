# T9 — Admin Vendors 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/vendors.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/vendors` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendors` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendors/:id` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendors/:id` | PATCH | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendors/:id` | DELETE | authenticateJWT + requireRole | ✅ |

## AES-256-GCM 加密

- API Key 加密在 vendor-models 路由 (`admin/vendor-models.ts`)，非 vendors 路由 ✅
- Vendors 路由管理厂商基本信息（名称、URL、描述），不包含密钥 ✅

## 关联检查

- DELETE 前检查 `vendorModels` 引用 ✅

## 字段白名单

PATCH 白名单: baseUrl, description, status ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 5/5 |
| CRUD 完整性 | ✅ |
| 关联检查 | ✅ |
| 字段白名单 | ✅ |
| 整体评分 | 90/100 |
