// ============================================================
//  3cloud (3C) — 支付通道适配器 — 接口定义
// ============================================================

export interface PaymentProvider {
  readonly channel: string;
  readonly name: string;
  createOrder(orderNo: string, amount: string, description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }>;
}
