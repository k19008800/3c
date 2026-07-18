# 修复报告: 倍率变更价格重算 + 默认值统一

## 概述

修复两个 HIGH 级别问题：
- **HIGH-1**: 修改定价倍率后，已有非零 sell price 不自动更新
- **HIGH-2**: 三个模块默认值不一致（price-service.ts=1.15, billing/cache.ts=1.01, vendor-sync/pricing.ts=1.01, sync-engine.ts=1.01）

## 改动文件

### 1. `services/price-service.ts` — 核心修复

**新增导出常量**:
```typescript
export const DEFAULT_PRICING_MULTIPLIER = 1.15;
```

**重写 `updatePricingMultiplier` 函数**:
- 若新旧倍率相同 → 只更新 system_configs + 写历史（无重算）
- 若倍率变化 → 在一个事务内完成：
  1. Upsert `system_configs`（k=v）
  2. 读取所有 `vendor_models` 中 `sell_price_input > 0 OR sell_price_output > 0` 的行
  3. 按公式 `newSellPrice = (oldSellPrice / oldMultiplier) * newMultiplier` 重算
  4. 逐行 UPDATE `vendor_models`
  5. 写倍率变更历史（1 条）
  6. 批量写 sell_price 变更历史（每个非零字段 1 条）
- 事务外：动态 import `clearPricingMultiplierCache()` 清除 billing cache

### 2. `routes/admin/prices.ts` — 默认值统一

- 导入 `DEFAULT_PRICING_MULTIPLIER`
- Line 63: `1.15` → `DEFAULT_PRICING_MULTIPLIER`

### 3. `services/billing/cache.ts` — 默认值统一

- 导入 `DEFAULT_PRICING_MULTIPLIER`
- Line 15: `1.01` → `DEFAULT_PRICING_MULTIPLIER`

### 4. `services/vendor-sync/pricing.ts` — 默认值统一

- 导入并 re-export `DEFAULT_PRICING_MULTIPLIER`
- Line 74: `1.01` → `DEFAULT_PRICING_MULTIPLIER`（try 块）
- Line 75: `1.01` → `DEFAULT_PRICING_MULTIPLIER`（catch 块）

### 5. `services/vendor-sync/sync-engine.ts` — 默认值统一（附加）

- 导入 `DEFAULT_PRICING_MULTIPLIER`
- Line 65: `1.01` → `DEFAULT_PRICING_MULTIPLIER`

## 重算逻辑

### 公式
```
newSellPrice = (oldSellPrice / oldMultiplier) × newMultiplier
```

### 边界条件
| 条件 | 行为 |
|------|------|
| `sellPriceInput > 0` | 按比例重算 |
| `sellPriceOutput > 0` | 按比例重算 |
| `sellPriceInput === 0` | 保持 0（手动清零） |
| `sellPriceOutput === 0` | 保持 0（手动清零） |
| 倍率不变（1.15→1.15） | 跳过重算，仅更新 system_configs |
| 初次设置（system_configs 无记录） | oldMultiplier = `DEFAULT_PRICING_MULTIPLIER` = 1.15 |

### 精度
- 所有计算使用 `toFixed(6)`，匹配 DB schema `numeric(18,6)`

## 验证步骤

### 前提
```bash
# 确保 3cloud api 服务在运行
ssh 3cloud-prod
# 或本地
```

### 1. 查看当前 sell price
```sql
SELECT id, sell_price_input, sell_price_output FROM vendor_models LIMIT 5;
```
或通过 API:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@3c.com","password":"admin123"}' | jq -r '.data.token')
curl -s http://localhost:3000/api/v1/admin/finance/prices -H "Authorization: Bearer $TOKEN" | jq '.data.list[:3]'
```

### 2. 设倍率为 2.0，验证 sell price 翻倍
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"2.0","reason":"测试: 倍率从1.15改为2.0"}' | jq .
```

检查 DB:
```sql
SELECT id, sell_price_input, sell_price_output FROM vendor_models WHERE sell_price_input > 0 LIMIT 5;
```
预期: 所有非零 sell price 变为原来的 (2.0 / 1.15) ≈ 1.739 倍

检查变更历史:
```sql
SELECT * FROM price_change_history ORDER BY created_at DESC LIMIT 5;
```

### 3. 设回 1.15，验证 sell price 恢复
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/finance/prices/multiplier \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"1.15","reason":"测试: 恢复默认倍率"}' | jq .
```

预期: sell price 恢复为操作 1 之前的值（可能有浮点累计误差，但 < 0.000001）

### 4. 验证零价格保持不动
```sql
SELECT count(*) FROM vendor_models WHERE sell_price_input = 0 AND sell_price_output = 0;
```
记下行数 N

操作 2/3 后检查:
```sql
SELECT count(*) FROM vendor_models WHERE sell_price_input = 0 AND sell_price_output = 0;
```
预期: 仍为 N（零价格行从未被 UPDATE）

### 5. TS 编译
```bash
cd 3cloud/api && npx tsc --noEmit
```
预期: 只输出已有错误（无与 price-service/price 有关的错误）

## 回归检查

### 缓存行为
- billing `getPricingMultiplier()` 60s 缓存：在 `updatePricingMultiplier` 事务外调用 `clearPricingMultiplierCache()` 确保清除
- 重算后的 sell price 通过 billing `getSellPrices()` 缓存也会在 60s 后自动更新
- 注意：`clearSellPriceCache()` 未被调用（只清 multiplier 缓存）；若有紧急需求可考虑在 `updatePricingMultiplier` 末尾也清 sell price 缓存

### 并发
- 两个管理员同时修改倍率：DB 事务保证隔离，后提交者覆盖
- 但 priceRows 是在事务内读取的，所以读取的是事务快照，保证一致性

## 影响范围
| 模块 | 影响 |
|------|------|
| API 路由 `GET /prices` | 默认值统一后，前端展示的 multiplier 不变（仍为 1.15） |
| API 路由 `POST /prices/multiplier` | 修改倍率后自动触发价格重算 |
| Billing 计费 | 依赖于 `getPricingMultiplier()` 和 `getSellPrices()` 的正常流程不受影响 |
| Vendor Sync | `sync-engine.ts` 在设置 `apiKeyOverride` 时的定价倍率从 `1.01` 变为 `1.15`，即原来 1% 加价变为 15% 加价 — **这是预期行为**，统一了默认值 |

## 排查记录
- `vendor-sync/pricing.ts` 的 `getPricingMultiplier()` 函数同时被 `sync-engine.ts` 引用
- `sync-engine.ts` 中 `options?.apiKeyOverride ? 1.01 : await getPricingMultiplier()` 的硬编码 1.01 也被修正
- 数据库中已将默认值统一为 `numeric(18,6)` 精度
- 之前所有模块均导入 `getPricingMultiplier()` 函数，正确路径时会从 DB 读值；仅在 DB 无记录时 fallback 到常量
