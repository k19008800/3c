# T10 — Admin Vendor-Models 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/vendor-models.ts`
> 依赖: `api/src/services/encryption.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/vendor-models` | POST | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendor-models` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendor-models/:id` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendor-models/:id` | PATCH | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/vendor-models/:id` | DELETE | authenticateJWT + requireRole | ✅ |

## AES-256-GCM 加密 API Key

- `encryptApiKey(body.apiKey)` — 创建时加密 ✅
- `updates.apiKeyEncrypted = encryptApiKey(body.apiKey)` — 更新时加密 ✅
- `const { apiKeyEncrypted: _, ...safe } = vm` — 返回时排除加密字段 ✅

## 定价逻辑

- costPriceInput/costPriceOutput — 成本价 ✅
- sellPriceInput/sellPriceOutput — 售价 ✅
- weight — 路由权重 ✅
- 所有价格默认 "0.000000" ✅

## 健康状态管理

- healthScore (0.00~1.00) ✅
- healthSamples ✅
- consecutiveSuccess ✅
- isDown (boolean) ✅

## Schema 校验

**问题发现:** ❌ 创建/更新未使用 Zod Schema，纯手动校验。

```ts
// 手动校验，未用 createVendorModelSchema
if (!body.vendorId || !body.modelId || !body.upstreamModelName || !body.apiEndpoint || !body.apiKey) {
  reply.status(400).send({...});
}
```

虽然 schemas.ts 中定义了 `createVendorModelSchema` 和 `updateVendorModelSchema`，但路由未使用。

## 唯一冲突处理

- 23505 → 409 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 5/5 |
| AES-256-GCM 加密 | ✅ |
| 返回排除密钥 | ✅ |
| 定价管理 | ✅ |
| 健康状态 | ✅ |
| Zod Schema | ❌ 未使用 |
| 整体评分 | 80/100 |

**建议修复:**
1. 使用 `createVendorModelSchema` / `updateVendorModelSchema` 替代手动校验
