# 修复报告: Fallback Key 分组支持 + 熔断检查

## 修复时间
2026-07-18

## 修复人
Dispatch Agent (Subagent)

## 关联 Issue
- **HIGH-3**: `tryFallback` 直接 `decryptApiKey(r.apiKeyEncrypted)`，不调用 `resolveKeyGroup`
- **HIGH-4**: `tryFallback` 不检查 `shouldSkipVendor`，可能选到熔断中的路由

## 修改文件

### 1. `api/src/routes/proxy/forward.ts` — `tryFallback` 函数

#### Fix 1: 熔断检查（HIGH-4）
在 DB 查询 `rows` 之后、取 `rows[0]` 之前，插入熔断过滤逻辑：

```typescript
// 熔断过滤：跳过熔断中的路由
try {
  const { shouldSkipVendor } = await import("../../services/circuit-breaker.js");
  const filtered: typeof rows = [];
  for (const r of rows) {
    const skip = await shouldSkipVendor(r.vendorModelId);
    if (!skip) filtered.push(r);
  }
  // 如果全部被熔断，直接返回 null（不给 fallback）
  // 避免选到已被熔断的厂商
  if (filtered.length === 0) return null;
  rows.splice(0, rows.length, ...filtered);
} catch (err) {
  console.warn("[Fallback] 熔断检查异常，跳过:", err);
}
```

**行为变化**: fallback 不再选择已被熔断的厂商。如果所有候选都被熔断，直接返回 null 而非发送可能失败的请求。

#### Fix 2: KeyGroup 解析（HIGH-3）
在构造 `fallbackRoute` 对象之后、调用 `forwardRequest` 之前，插入 KeyGroup 解析：

```typescript
// 如果 fallback 路由配置了 Key 分组，解析实际 Key
let resolvedFallbackRoute = fallbackRoute;
if (resolvedFallbackRoute.keyGroupId) {
  try {
    const { resolveKeyGroup } = await import("../../services/router/route-selection.js");
    const redis = (await import("../../redis.js")).getRedis();
    resolvedFallbackRoute = await resolveKeyGroup(fallbackRoute, redis);
  } catch (err) {
    console.warn("[Fallback] KeyGroup 解析失败，使用 vendorModel 默认 Key:", err);
  }
}
```

所有后续使用 `fallbackRoute` 的地方（`log.info`、`forwardRequest`、`updateHealthAfterCall`、`charge`、`recordSchedulingStats`）均改为 `resolvedFallbackRoute`。

### 2. `api/src/services/router/route-selection.ts` — 导出 `resolveKeyGroup`

将 `resolveKeyGroup` 函数从内部函数改为导出函数，以便 `forward.ts` 中的 fallback 逻辑可以调用：

```diff
-async function resolveKeyGroup(
+export async function resolveKeyGroup(
```

## 验证结果

**TS 编译**: `npx tsc --noEmit` 确认无新增编译错误（所有报错均为已有问题，与本次修改无关）。

## 代码逻辑走读

### Fallback 熔断流程
```
DB 查询 -> 熔断过滤(shouldSkipVendor) -> 全熔断则 return null -> 取 rows[0]
```

### Fallback KeyGroup 流程
```
构造 fallbackRoute -> 有 keyGroupId? -> resolveKeyGroup(redis) -> resolvedFallbackRoute
                                                      \
                                                       -> 失败: 降级用 fallbackRoute 自身 Key
-> forwardRequest(resolvedFallbackRoute) -> 更新健康/计费均用 resolvedFallbackRoute
```

### 与新路由 `selectRoute` 的一致性
`selectRoute` 的流程:
```
queryAvailableRoutes -> 熔断过滤 -> pickByStrategy -> resolveKeyGroup
```

本次修复使 `tryFallback` 遵循相同模式:
```
DB query -> 熔断过滤 -> 取最低价 -> resolveKeyGroup
```

## 风险与注意事项

1. **熔断放宽策略**: `selectRoute` 在全被熔断时会降级使用熔断厂商（保证可用性），但 `tryFallback` 选择直接 `return null`。原因：fallback 是主厂商失败后的备选，如果连备选也在熔断中，不应强行使用，而是让上层返回原始错误或进一步 fallback。
2. **动态 import 异常**: 所有外部模块调用均包在 try-catch 中，异常不会影响主流程，仅降级到原始 `fallbackRoute`。
3. **Redis 连接**: `getRedis()` 在 `selectRoute` 中也是动态导入，模式一致，无新增风险。
