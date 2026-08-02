# P3 低优先级问题批量修复报告

**日期**: 2026-07-18  
**执行人**: agent:dispatch-agent:subagent  
**文件根目录**: `3cloud/api/src/`

---

## L1: dall-e 模型类型误判

| 项目 | 内容 |
|------|------|
| **文件** | `routes/admin/vendors.ts` |
| **函数** | `guessModelType` (第 663 行) |
| **问题** | `typeHints` 中有 `dalle: "image"`，但上游返回的模型 ID 为 `dall-e-3`。由于 `guessModelType` 用 `lower.includes(kw)` 匹配，"dall-e-3" 不包含 "dalle"（存在连字符），导致被误判为 `chat` 类型。 |
| **修复** | 在 `typeHints` 中追加 `dall: "image"` 和 `dale: "image"`，覆盖 `dall-e-3` 及可能的变体。 |
| **改动行** | 663: `image: "image", dalle: "image",` → `image: "image", dalle: "image", dall: "image", dale: "image",` |

---

## L2: Key 前缀格式不一致

| 项目 | 内容 |
|------|------|
| **文件** | `routes/admin/vendor-key-groups.ts` |
| **路由** | `POST /api/v1/admin/key-groups/:groupId/items` |
| **问题** | 前缀截断逻辑使用 `slice(0, 7) + "..."`，与系统其他位置统一使用 `slice(0, 8)` 作为 `keyPrefix` 的惯例不一致。 |
| **修复** | 长 key（>8 字符）直接取前 8 位作为清晰前缀；短 key（≤8 字符）取前 4 位加 `"..."` 标识截断。 |
| **改动行** | 220-222: `body.apiKey.length > 7 ? body.apiKey.slice(0, 7) + "..."` → `body.apiKey.length > 8 ? body.apiKey.slice(0, 8)` |

---

## L3: sync 手动传 keyGroupId 时不添加 Key

| 项目 | 内容 |
|------|------|
| **文件** | `routes/admin/vendors.ts` |
| **路由** | `POST /api/v1/admin/vendors/:id/sync-models` |
| **问题** | Key 添加到分组的代码（`vendorKeyGroupItems` 插入）位于 `if (!resolvedKeyGroupId)` 块内，仅当用户**未**手动传 `keyGroupId` 时才执行。手动传了 `keyGroupId` 时跳过 Key 添加，导致 Key 未被纳入指定分组管理。 |
| **修复** | 将 Key 添加逻辑移到 `if (!resolvedKeyGroupId)` 块**之外**，无论手动指定还是自动创建分组都执行。保留了分组的自动创建/复用逻辑在 `if` 块内部。 |
| **改动** | 将 `vendorKeyGroupItems` 的查重 + 插入代码从原块的尾部移出，放在整个 `if (!resolvedKeyGroupId) { ... }` 块之后。 |

---

## L4: pickByStrategy default 分支加日志

| 项目 | 内容 |
|------|------|
| **文件** | `services/router/route-selection.ts` |
| **函数** | `pickByStrategy` |
| **问题** | `default` 分支静默使用 `candidates[0]`（按 lowest_price 排序后的第一个）作为 fallback，未记录日志，排查问题时难以追踪。 |
| **修复** | 在 `default` 分支添加 `console.warn`，输出未知策略名称及 fallback 行为。 |
| **改动行** | 114: 新增 `console.warn(\`[Router] 未知路由策略 "${strategy}"，使用最低价策略 fallback\`);` |

---

## L7: cost 接口加 modelIds 别名

| 项目 | 内容 |
|------|------|
| **文件** | `routes/admin/prices.ts` |
| **路由** | `POST /api/v1/admin/finance/prices/cost` |
| **问题** | `sell` 接口已兼容 `modelIds` / `vendorModelIds` 两种字段名（`const ids = body.vendorModelIds ?? body.modelIds`），但 `cost` 接口只接受 `vendorModelIds`。前端某些场景可能传 `modelIds` 导致接口报错。 |
| **修复** | 仿照 `sell` 接口：类型声明增加 `modelIds?: number[]`，增加 `const ids = body.vendorModelIds ?? body.modelIds` 兼容逻辑，将 `batchUpdateCostPrices` 调用参数从 `body.vendorModelIds` 改为 `ids`。 |
| **改动行** | 160-169: 类型声明 + 兼容逻辑 + 调用参数 |

---

## 编译验证

```
> npx tsc --noEmit --skipLibCheck
→ 未报告与修改文件相关的任何错误
```

所有四个修改文件（`vendors.ts`、`vendor-key-groups.ts`、`route-selection.ts`、`prices.ts`）均通过 TypeScript 编译检查。其余编译错误来自其他无关文件（`agent-cost.ts`、`agent-settlement-detail.ts`、`code-cost.ts`、`redemption-enhanced/*` 等），均为既有预存问题，与本批修复无关。

---

## 总结

| ID | 文件 | 类型 | 状态 |
|----|------|------|------|
| L1 | `vendors.ts` — typeHints 补充 | image 类型误判修正 | ✅ |
| L2 | `vendor-key-groups.ts` — 前缀截断 | 格式统一 | ✅ |
| L3 | `vendors.ts` — sync-models Key 添加 | 手动分组场景修复 | ✅ |
| L4 | `route-selection.ts` — 日志 | 可观测性增强 | ✅ |
| L7 | `prices.ts` — cost 兼容字段 | 接口稳健性 | ✅ |
