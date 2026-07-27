// ============================================================
//  3cloud (3C) — 支付通道适配器 — Mock 实现
// ============================================================

import crypto from "node:crypto";
import type { PaymentProvider } from "./interface.js";

interface MockChannelConfig { name: string; mockPayUrl: string; mockJsapiParams: Record<string, any> }

const MOCK_CHANNELS: Record<string, MockChannelConfig> = {
  wechat_scan: { name: "微信扫码", mockPayUrl: "https://pay.weixin.qq.com/qr/3cloud_mock", mockJsapiParams: {} },
  wechat_jsapi: { name: "微信 JSAPI", mockPayUrl: "", mockJsapiParams: { appId: "wx_mock", timeStamp: String(Math.floor(Date.now() / 1000)), nonceStr: crypto.randomBytes(8).toString("hex"), package: "prepay_id=mock", signType: "MD5", paySign: "mock_sign" } },
  alipay_scan: { name: "支付宝扫码", mockPayUrl: "https://qr.alipay.com/3cloud_mock", mockJsapiParams: {} },
  alipay_jsapi: { name: "支付宝 JSAPI", mockPayUrl: "", mockJsapiParams: { tradeNo: "mock_trade_no", qrCode: "https://qr.alipay.com/3cloud_mock" } },
};

export class MockPaymentProvider implements PaymentProvider {
  readonly channel: string;
  readonly name: string;
  constructor(channel: string) { this.channel = channel; this.name = MOCK_CHANNELS[channel]?.name ?? channel; }
  async createOrder(_orderNo: string, _amount: string, _description: string): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    const config = MOCK_CHANNELS[this.channel];
    if (!config) return {};
    const result: { payUrl?: string; payParams?: Record<string, any> } = {};
    if (config.mockPayUrl) result.payUrl = config.mockPayUrl;
    if (Object.keys(config.mockJsapiParams).length > 0) result.payParams = config.mockJsapiParams;
    return result;
  }
}
