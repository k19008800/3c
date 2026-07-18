# CRIT-2 修复报告: 熔断器重复计数

## 问题描述

`recordVendorModelFailure` 已对 `circuitFailCount` 做 SQL `+1` 递增，但 `shouldSkipVendor` 的 Level1 降级分支在调用 `dbTransitionDegraded` 时，`dbTransitionDegraded` 内部又执行了一次 `circuitFailCount += 1`，导致同一波失败计数被翻倍。

## 触发路径

```
首次失败 → recordVendorModelFailure → circuitFailCount +1 (正确)
后续失败 → recordVendorModelFailure → circuitFailCount +1 (正确)
...
第5次失败 → shouldSkipVendor 被路由层调用
  → Redis failCount >= 5
  → 调用 dbTransitionDegraded
  → 内部 circuitFailCount +1 (重复! 已由 recordVendorModelFailure 计数过)
```

## 修复内容

**文件:** `src/services/circuit-breaker/persistence.ts`
**函数:** `dbTransitionDegraded`

移除了 `circuitFailCount: sql\`${vendorModels.circuitFailCount} + 1\`` 行，因为该计数已由 `recordVendorModelFailure` 全权负责。`dbTransitionDegraded` 只负责：
- 更新 `weight` 为降级后的值（10%）
- 记录历史转换事件

添加了注释说明计数归属，防止后续维护再引入重复。

## 计数职责划分（修复后）

| 操作 | 计数值 | 归属函数 |
|------|--------|----------|
| 每次失败计数 | `circuitFailCount +1` | `recordVendorModelFailure` |
| Redis 滑动窗口计数 | `incr KEY.failures` | `recordVendorModelFailure` |
| 软降级 (Level1) | 不计数 | `dbTransitionDegraded` |
| 硬熔断 (Level2) | 不计数 | `dbTransitionHalfOpen` |
| 永久关停 (Level3) | 不计数 | `dbTransitionDead` |
| 探测成功恢复 | `circuitFailCount = 0` | `recordVendorModelSuccess` / `dbTransitionClosed` |

## 验证

- TS 编译通过（无新增编译错误，已有错误均为无关文件）
- 逻辑确认：`recordVendorModelFailure` 始终在 `dbTransitionDegraded` 被调用之前执行，因此计数已完成
