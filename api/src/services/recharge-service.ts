// ============================================================
//  充值服务 — 重导出入口（兼容旧导入路径）
// ============================================================
//  代码已拆分到 services/recharge-service/ 目录
//  本文件保留仅为了兼容现有导入路径，不再包含业务逻辑

export type {
  CreateOrderInput,
  CreateOrderResult,
  BankTransferInput,
  BankTransferResult,
  RechargeOrderItem,
  RechargeOrderListResult,
} from "./recharge-service/types.js";

export {
  parseBankTransferRemark,
} from "./recharge-service/balance.js";

export {
  createRechargeOrder,
  submitBankTransfer,
  getSavedPayerInfo,
  getUserRechargeOrders,
  cancelOrder,
} from "./recharge-service/orders.js";

export {
  handlePaymentNotify,
  confirmBankTransfer,
} from "./recharge-service/payment.js";
