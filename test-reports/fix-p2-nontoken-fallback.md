# Fix Report: MED-1 — 非 Token 计费模型增加 Fallback

## 问题描述

`handleNonTokenBilling`（图片/音频/rerank）和 `handleVideoGeneration` 在上游返回 >= 400 的错误时不触发 fallback，直接返回错误给客户端。而 `handleNonStreaming` 已有完整的 fallback 逻辑（`result.status >= 500` 时调用 `tryFallback`）。

## 修复文件

`api/src/routes/proxy/forward.ts`

## 修改内容

### 1. `handleNonTokenBilling` — 增加 fallback

在 `if (result.status >= 400)` 分支中，`} catch {}` 之后、`await charge` 之前，增加条件判断：

```typescript
if (result.status >= 500) {
  const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);
  if (fallbackResult) return fallbackResult;
}
```

**位置：** 函数内第二个 `} catch {}`（归属于 `recordVendorModelFailure`），约第 845 行。

### 2. `handleVideoGeneration` — 增加 fallback

在 `if (result.status >= 400 || result.data?.code !== 0)` 分支中，`} catch {}` 之后、`await charge` 之前，增加条件判断：

```typescript
if (result.status >= 500) {
  const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);
  if (fallbackResult) return fallbackResult;
}
```

**位置：** 函数内第一个 `} catch {}`（归属于 `recordVendorModelFailure`），约第 1311 行。

### 设计决策

- **仅对 5xx 触发 fallback** — 与 `handleNonStreaming` 行为一致。400/422 等客户端错误不触发。
- **网络错误（catch 块）不触发 fallback** — 与 `handleNonStreaming` 一致，网络错误直接返回 502。
- **`tryFallback` 函数已存在** — 无需额外实现，直接调用既有的 fallback 路由选择、熔断检查、计费逻辑。

## 验证

| 检查项 | 结果 |
|--------|------|
| TS 编译 (`tsc --noEmit`) | 通过，`forward.ts` 无报错 |
| `tryFallback` 调用参数 | 与 `handleNonStreaming` 一致：`(model, request, route, userId, apiKeyId, startTime)` |
| `handleNonTokenBilling` 落盘检查 | ✅ Fallback block 出现在正确位置 |
| `handleVideoGeneration` 落盘检查 | ✅ Fallback block 出现在正确位置 |

### 代码走读确认

```
handleNonTokenBilling:
  result.status >= 400
    ├─ recordVendorModelFailure()
    ├─ if (result.status >= 500) → tryFallback()    ← 新增
    ├─ charge(failed) + reply.error()
    └─ (success path)

handleVideoGeneration:
  result.status >= 400 || result.data?.code !== 0
    ├─ updateHealthAfterCall(false)
    ├─ recordVendorModelFailure()
    ├─ if (result.status >= 500) → tryFallback()    ← 新增
    ├─ charge(failed) + reply.error()
    └─ (success path)
```

## Git Diff 摘要

```diff
--- a/api/src/routes/proxy/forward.ts
+++ b/api/src/routes/proxy/forward.ts

     } catch {}
+
+    if (result.status >= 500) {
+      const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);
+      if (fallbackResult) return fallbackResult;
+    }
+
     await charge({

... (handleNonTokenBilling)

      } catch {}
 
+
+      if (result.status >= 500) {
+        const fallbackResult = await tryFallback(model, request, route, userId, apiKeyId, startTime);
+        if (fallbackResult) return fallbackResult;
+      }
+
       await charge({

... (handleVideoGeneration)
```

## 结论

修复完成。非 Token 计费场景（图片生成、语音合成/转写、Rerank、视频生成）现在在上游 5xx 时会自动尝试 fallback 到次优厂商，提升了系统健壮性。
