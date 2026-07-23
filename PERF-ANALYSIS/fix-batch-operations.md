# 批量SQL操作优化报告

## 概述
在3cloud API中发现多个循环单条数据库操作，这些操作可以优化为批量SQL操作以提高性能。

## 发现的问题

### 1. `src/services/agent-settlement/settlements.ts`
**问题位置**: 第193-195行
```typescript
// 批量更新凭证号
for (const [id, no] of voucherMap) {
  await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
}
```

**问题**: 循环中逐条更新凭证号，当voucherMap较大时性能低下。

### 2. `src/services/agent-settlement/settlements.ts`
**问题位置**: 第200-204行
```typescript
// 刷新 rollup（同步状态分布）
for (const [key, agentSet] of affectedRows) {
  const date = key.split("|")[1];
  for (const aid of agentSet) {
    await refreshRollupForAgentDate(aid, date);
  }
}
```

**问题**: 嵌套循环调用异步函数，可能导致性能瓶颈。

### 3. `src/services/agent-settlement/settlements.ts` (batchCancelCommissions函数)
**问题位置**: 第270-279行
```typescript
// 刷新 rollup
const seen = new Set<string>();
for (const r of affected) {
  const date = r.createdAt.toISOString().slice(0, 10);
  const key = `${r.agentId}|${date}`;
  if (seen.has(key)) continue;
  seen.add(key);
  await refreshRollupForAgentDate(r.agentId, date);
}
```

**问题**: 循环刷新rollup，可以优化为批量处理。

### 4. `src/services/agent-withdraw/review.ts`
**问题位置**: 第461-474行
```typescript
// 批量插入审计日志
for (const order of validOrders) {
  await tx.insert(auditLogs).values({
    operatorId,
    action: "withdraw_reject",
    targetType: "withdraw_orders",
    targetId: order.id,
    before: { status: "pending_first_review" },
    after: { status: "rejected", rejectReason },
    ip: null,
    description: `批量初审拒绝提现 #${order.id}: ${rejectReason ?? "无原因"}`,
  });
}
```

**问题**: 循环中逐条插入审计日志。

## 优化方案

### 1. 审计日志批量插入优化 ✅
**文件**: `src/services/agent-withdraw/review.ts`
**优化前**: 
```typescript
for (const order of validOrders) {
  await tx.insert(auditLogs).values({ ... });
}
```
**优化后**:
```typescript
const auditLogsData = validOrders.map(order => ({ ... }));
if (auditLogsData.length > 0) {
  await tx.insert(auditLogs).values(auditLogsData);
}
```
**效果**: 将N次单条插入合并为1次批量插入，性能提升显著

### 2. Rollup刷新并行化优化 ✅
**文件**: `src/services/agent-settlement/settlements.ts`
**优化前**: 
```typescript
for (const [key, agentSet] of affectedRows) {
  const date = key.split("|")[1];
  for (const aid of agentSet) {
    await refreshRollupForAgentDate(aid, date);
  }
}
```
**优化后**:
```typescript
const refreshPromises: Promise<void>[] = [];
for (const [key, agentSet] of affectedRows) {
  const date = key.split("|")[1];
  for (const aid of agentSet) {
    refreshPromises.push(refreshRollupForAgentDate(aid, date));
  }
}
await Promise.all(refreshPromises);
```
**效果**: 串行等待改为并行执行，减少总等待时间

### 3. BatchCancelCommissions并行优化 ✅
**文件**: `src/services/agent-settlement/settlements.ts`
**优化前**:
```typescript
const seen = new Set<string>();
for (const r of affected) {
  const date = r.createdAt.toISOString().slice(0, 10);
  const key = `${r.agentId}|${date}`;
  if (seen.has(key)) continue;
  seen.add(key);
  await refreshRollupForAgentDate(r.agentId, date);
}
```
**优化后**:
```typescript
const seen = new Set<string>();
const refreshPromises: Promise<void>[] = [];
for (const r of affected) {
  const date = r.createdAt.toISOString().slice(0, 10);
  const key = `${r.agentId}|${date}`;
  if (seen.has(key)) continue;
  seen.add(key);
  refreshPromises.push(refreshRollupForAgentDate(r.agentId, date));
}
await Promise.all(refreshPromises);
```

### 4. 凭证号批量更新（待优化）
**文件**: `src/services/agent-settlement/settlements.ts`
**当前状态**:
```typescript
for (const [id, no] of voucherMap) {
  await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
}
```
**难点**: Drizzle ORM不支持CASE WHEN批量更新，需要重构或使用原生SQL
**建议方案**: 使用PostgreSQL的UPDATE ... FROM VALUES语法或重构为事务中的单条更新

## 实施总结
已完成3处优化，1处待进一步优化。

## 性能预估

### 优化效果评估
1. **审计日志批量插入**: 
   - 优化前: N次数据库往返
   - 优化后: 1次数据库往返
   - 性能提升: 约N倍（N为订单数量）

2. **Rollup刷新并行化**:
   - 优化前: 串行等待，总时间 = Σ(每个刷新时间)
   - 优化后: 并行执行，总时间 ≈ max(刷新时间)
   - 性能提升: 约M倍（M为需要刷新的代理数量）

3. **批量去重并行执行**:
   - 避免重复刷新相同代理+日期组合
   - 并行执行进一步减少等待时间

### 待优化项建议
对于凭证号批量更新问题，建议方案：
1. 使用PostgreSQL的UPDATE ... FROM VALUES语法
2. 或重构业务逻辑，在事务中生成凭证号
3. 或使用Drizzle的raw SQL功能实现批量更新

## 后续建议
1. 建立代码审查机制，防止新的循环单条操作
2. 对批量操作添加性能监控
3. 考虑将refreshRollupForAgentDate进一步优化为批量刷新

## 验证结果
通过测试脚本验证，优化逻辑正确：
1. 审计日志插入: 3条记录从3次操作减少到1次操作
2. 并行刷新: 6次调用从串行改为并行，时间复杂度的优化

## 完成状态
✅ 任务完成：成功识别并优化了3处循环单条操作
⚠️ 遗留问题：凭证号批量更新需要进一步重构