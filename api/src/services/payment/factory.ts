// ============================================================
//  3cloud (3C) — 支付通道适配器 — 真实 Provider 实现 + 工厂
// ============================================================

import type { PaymentProvider } from "./interface.js";
import { MockPaymentProvider } from "./mock.js";

// ── 真实实现（待对接 SDK）──

export class WechatScanProvider implements PaymentProvider {
  readonly channel = "wechat_scan"; readonly name = "微信扫码";
  async createOrder(orderNo: string, amount: string, description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    throw new Error("WechatScanProvider: 真实 SDK 尚未对接");
  }
}

export class WechatJsapiProvider implements PaymentProvider {
  readonly channel = "wechat_jsapi"; readonly name = "微信 JSAPI";
  async createOrder(orderNo: string, amount: string, description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    throw new Error("WechatJsapiProvider: 真实 SDK 尚未对接");
  }
}

export class AlipayScanProvider implements PaymentProvider {
  readonly channel = "alipay_scan"; readonly name = "支付宝扫码";
  async createOrder(orderNo: string, amount: string, description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    throw new Error("AlipayScanProvider: 真实 SDK 尚未对接");
  }
}

export class AlipayJsapiProvider implements PaymentProvider {
  readonly channel = "alipay_jsapi"; readonly name = "支付宝 JSAPI";
  async createOrder(orderNo: string, amount: string, description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    throw new Error("AlipayJsapiProvider: 真实 SDK 尚未对接");
  }
}

// ── 工厂 ──

export function createPaymentProvider(channel: string): PaymentProvider {
  const isMock = process.env.PAYMENT_MODE !== "real";
  if (isMock) return new MockPaymentProvider(channel);
  switch (channel) {
    case "wechat_scan": return new WechatScanProvider();
    case "wechat_jsapi": return new WechatJsapiProvider();
    case "alipay_scan": return new AlipayScanProvider();
    case "alipay_jsapi": return new AlipayJsapiProvider();
    default: return new MockPaymentProvider(channel);
  }
}
