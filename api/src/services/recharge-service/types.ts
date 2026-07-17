// ============================================================
//  充值服务 — 类型定义
// ============================================================

export interface CreateOrderInput {
  userId: number;
  amount: string;   // DECIMAL(18,6) as string
  channel: "wechat_scan" | "wechat_jsapi" | "alipay_scan" | "alipay_jsapi";
}

export interface CreateOrderResult {
  orderNo: string;
  amount: string;
  channel: string;
  status: string;
  payUrl?: string;
  payParams?: object;
  expiresAt: string;
  createdAt: string;
}

export interface BankTransferInput {
  userId: number;
  amount: string;
  bankName: string;
  accountNumber: string;
  transferDate: string;  // YYYY-MM-DD
  voucherImage?: string; // 凭证图片 URL
  remark?: string;
}

export interface BankTransferResult {
  orderNo: string;
  amount: string;
  channel: "bank_transfer";
  status: string;
  remark?: string;
  createdAt: string;
}

export interface RechargeOrderItem {
  id: number;
  orderNo: string;
  amount: string;
  channel: string;
  status: string;
  remark: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface RechargeOrderListResult {
  list: RechargeOrderItem[];
  total: number;
  page: number;
  pageSize: number;
}
