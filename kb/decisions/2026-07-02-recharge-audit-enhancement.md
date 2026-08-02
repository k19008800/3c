# 充值对账审核增强方案

> 决策日期：2026-07-02 | 状态：已实施

## 背景

审核员在审核银行转账充值订单时，弹窗只显示订单号、金额、用户邮箱，看不到银行名称、账号、转账日期、用户备注、凭证图片等信息，属于"盲审"状态。

## 方案

分两层修复：

### 第一层（快速修复 — 已实施）
1. 管理端 `RechargeOrders.tsx` ReviewModal 展示：
   - 银行名称、账号（后4位掩码）、转账日期
   - 用户填写的备注信息
   - 凭证图片（可点击放大）
2. 后端 admin list API 从 `remark` 中解析 `bankName`/`accountNumber`/`transferDate` 返回
3. `balance_logs.description` 补充银行和账号信息

### 第二层（根本解决 — 待实施）
4. `submitBankTransfer` 写入独立字段（`payerAccountName`/`payerAccountNo`/`transferRemark`）
5. `second-confirm` 的 balance_logs 记录完整溯源信息

## 效果

改前：盲审，看不到任何银行转账信息
改后：审核弹窗展示完整银行转账信息 + 凭证图片，且 balance_logs 可追溯

## 涉及文件

- `admin/RechargeOrders.tsx` — 审核弹窗增强
- 后端 admin list API — 解析 remark 返回银行信息
- `balance_logs` — 描述改为 `对公转账到账 / 中国银行/66667777... / BANK_... / 凭证 VCH-...`
