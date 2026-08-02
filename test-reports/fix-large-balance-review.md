# 修复报告: HIGH-5 大额余额调整二审

## 问题描述

`POST /api/v1/admin/users/:id/recharge` 直接更新余额 + 写 balance_logs + 审计日志，无双审。
对 >1000 元的余额调整应该增加二审流程。

## 修复范围

**文件**: `src/routes/admin/users/actions.ts`

## 修复内容

### 1. 新增导入

- `rechargeOrders` — 从 `db/schema.js` 导入充值订单表
- `crypto from "node:crypto"` — 用于生成唯一订单号

### 2. 大额阈值检查逻辑

在 recharge POST handler 中，解析 `amount` 后添加了阈值常量 `REVIEW_THRESHOLD = 1000`：

```typescript
const REVIEW_THRESHOLD = 1000;

if (Math.abs(amountNum) > REVIEW_THRESHOLD) {
  // 创建待审核 recharge_orders 记录
  // 写入 audit_logs
  // 返回提示 "金额超过 1000 元，需要审核确认"
  return;
}
```

#### 大额流程（|amount| > 1000 元）

| 步骤 | 操作 |
|------|------|
| 1 | 生成唯一订单号 `ADM<UUID>` 前缀 |
| 2 | 插入 `recharge_orders` 记录：`status: "pending"`, `channel: "bank_transfer"` |
| 3 | 写入 `audit_logs`：`action: "balance_adjust"`, `after: { pendingReview: true, ... }` |
| 4 | 返回 `200` + `{ code: 0, data: { orderNo }, message: "金额超过 1000 元，需要审核确认" }` |

#### 小额流程（|amount| ≤ 1000 元）

保持原有行为不变：直接更新余额 → 写 balance_logs → 写 audit_logs。

### 3. 与现有审核流程的兼容性

- 大额调整创建的 `recharge_orders` 记录会出现在 `GET /api/v1/admin/recharge-orders` 列表中
- 财务人员可通过现有的 `recharge_first_confirm` / `recharge_second_confirm` 接口完成双审
- 复审通过后自动更新用户余额、写入 balance_logs、处理续费佣金
- **没有破坏** Finance 模块中已有的充值审核流程

## 验证结果

### TypeScript 编译

```
> npx tsc --noEmit --pretty
```

`actions.ts` **零错误**。所有编译错误均为其他文件的已有问题（agent-cost.ts, agent-settlement-detail.ts 等），与本次修改无关。

### Curl 测试用例

#### 测试 1: 小额调整（< 1000 元）— 直接通过

```bash
curl -X POST http://localhost:3000/api/v1/admin/users/1/recharge \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": "500"}'
```

预期响应:
```json
{ "code": 0, "data": null, "message": "余额调整成功" }
```

#### 测试 2: 大额调整（> 1000 元）— 需要审核

```bash
curl -X POST http://localhost:3000/api/v1/admin/users/1/recharge \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": "2000"}'
```

预期响应:
```json
{ "code": 0, "data": { "orderNo": "ADM<UUID>" }, "message": "金额超过 1000 元，需要审核确认" }
```

#### 测试 3: 大额扣款（abs > 1000 元）— 也需要审核

```bash
curl -X POST http://localhost:3000/api/v1/admin/users/1/recharge \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": "-1500"}'
```

预期响应:
```json
{ "code": 0, "data": { "orderNo": "ADM<UUID>" }, "message": "金额超过 1000 元，需要审核确认" }
```

## 风险说明

| 风险 | 级别 | 说明 |
|------|------|------|
| 现有功能影响 | 低 | 小额路径完全不变；大额仅插入数据不涉及余额操作 |
| 审核未完成的记录 | 低 | 大额订单保持在 `pending` 状态，财务后台可见并可操作 |
| 重复提交 | 低 | 每次大额调整创建独立订单，管理员可通过审核流程管控 |
