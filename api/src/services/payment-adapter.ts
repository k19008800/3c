// ============================================================
//  3cloud (3C) — 支付通道适配器模式
//  统一支付通道接口 + Mock/生产实现 + 工厂
// ============================================================

import crypto from "node:crypto";

// ──────────────────────────────────────────────
//  支付通道接口
// ──────────────────────────────────────────────

export interface PaymentProvider {
  /** 通道标识：wechat_scan / wechat_jsapi / alipay_scan / alipay_jsapi */
  readonly channel: string;
  /** 通道展示名称 */
  readonly name: string;

  /**
   * 创建支付订单
   * @param orderNo  业务订单号
   * @param amount   金额（字符串）
   * @param description 描述
   */
  createOrder(
    orderNo: string,
    amount: string,
    description: string,
  ): Promise<{
    payUrl?: string;
    payParams?: Record<string, any>;
  }>;
}

// ──────────────────────────────────────────────
//  Mock 支付通道（当前开发/测试环境使用）
// ──────────────────────────────────────────────

class MockPaymentProvider implements PaymentProvider {
  readonly channel: string;
  readonly name: string;

  constructor(channel: string) {
    this.channel = channel;
    this.name = MOCK_CHANNELS[channel]?.name ?? channel;
  }

  async createOrder(
    _orderNo: string,
    _amount: string,
    _description: string,
  ): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    const config = MOCK_CHANNELS[this.channel];
    if (!config) {
      return {};
    }

    const result: { payUrl?: string; payParams?: Record<string, any> } = {};

    if (config.mockPayUrl) {
      result.payUrl = config.mockPayUrl;
    }

    if (Object.keys(config.mockJsapiParams).length > 0) {
      result.payParams = config.mockJsapiParams;
    }

    return result;
  }
}

interface MockChannelConfig {
  name: string;
  mockPayUrl: string;
  mockJsapiParams: Record<string, any>;
}

const MOCK_CHANNELS: Record<string, MockChannelConfig> = {
  wechat_scan: {
    name: "微信扫码",
    mockPayUrl: "https://pay.weixin.qq.com/qr/3cloud_mock",
    mockJsapiParams: {},
  },
  wechat_jsapi: {
    name: "微信 JSAPI",
    mockPayUrl: "",
    mockJsapiParams: {
      appId: "wx_mock",
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: crypto.randomBytes(8).toString("hex"),
      package: "prepay_id=mock",
      signType: "MD5",
      paySign: "mock_sign",
    },
  },
  alipay_scan: {
    name: "支付宝扫码",
    mockPayUrl: "https://qr.alipay.com/3cloud_mock",
    mockJsapiParams: {},
  },
  alipay_jsapi: {
    name: "支付宝 JSAPI",
    mockPayUrl: "",
    mockJsapiParams: {
      tradeNo: "mock_trade_no",
      qrCode: "https://qr.alipay.com/3cloud_mock",
    },
  },
};

// ──────────────────────────────────────────────
//  微信扫码支付（真实实现待对接）
// ──────────────────────────────────────────────

export class WechatScanProvider implements PaymentProvider {
  readonly channel = "wechat_scan";
  readonly name = "微信扫码";

  async createOrder(
    orderNo: string,
    amount: string,
    description: string,
  ): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    // TODO: 接入微信 Native 支付 SDK
    // 1. 调用统一下单 API
    // 2. 返回 code_url 作为 payUrl
    throw new Error("WechatScanProvider: 真实 SDK 尚未对接");
  }
}

// ──────────────────────────────────────────────
//  微信 JSAPI 支付（真实实现待对接）
// ──────────────────────────────────────────────

export class WechatJsapiProvider implements PaymentProvider {
  readonly channel = "wechat_jsapi";
  readonly name = "微信 JSAPI";

  async createOrder(
    orderNo: string,
    amount: string,
    description: string,
  ): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    // TODO: 接入微信 JSAPI 支付 SDK
    // 1. 获取用户 openid
    // 2. 调用 JSAPI 统一下单
    // 3. 返回 prepay_id 签名参数
    throw new Error("WechatJsapiProvider: 真实 SDK 尚未对接");
  }
}

// ──────────────────────────────────────────────
//  支付宝扫码支付（真实实现待对接）
// ──────────────────────────────────────────────

export class AlipayScanProvider implements PaymentProvider {
  readonly channel = "alipay_scan";
  readonly name = "支付宝扫码";

  async createOrder(
    orderNo: string,
    amount: string,
    description: string,
  ): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    // TODO: 接入支付宝当面付 SDK
    // 1. 调用 alipay.trade.precreate
    // 2. 返回 qr_code 作为 payUrl
    throw new Error("AlipayScanProvider: 真实 SDK 尚未对接");
  }
}

// ──────────────────────────────────────────────
//  支付宝 JSAPI 支付（真实实现待对接）
// ──────────────────────────────────────────────

export class AlipayJsapiProvider implements PaymentProvider {
  readonly channel = "alipay_jsapi";
  readonly name = "支付宝 JSAPI";

  async createOrder(
    orderNo: string,
    amount: string,
    description: string,
  ): Promise<{ payUrl?: string; payParams?: Record<string, any> }> {
    // TODO: 接入支付宝 JSAPI 支付
    // 1. 调用 alipay.trade.create
    // 2. 返回 trade_no 等调起参数
    throw new Error("AlipayJsapiProvider: 真实 SDK 尚未对接");
  }
}

// ──────────────────────────────────────────────
//  工厂函数
// ──────────────────────────────────────────────

/**
 * 创建支付通道 Provider
 *
 * 生产环境通过 system_configs.payment_mode = 'real' 切换真实 SDK 实现。
 * 默认为 mock 模式，返回与之前 `PAY_CHANNELS` 常量相同的 mock 数据。
 */
export function createPaymentProvider(channel: string): PaymentProvider {
  const isMock = process.env.PAYMENT_MODE !== "real";

  if (isMock) {
    return new MockPaymentProvider(channel);
  }

  switch (channel) {
    case "wechat_scan":
      return new WechatScanProvider();
    case "wechat_jsapi":
      return new WechatJsapiProvider();
    case "alipay_scan":
      return new AlipayScanProvider();
    case "alipay_jsapi":
      return new AlipayJsapiProvider();
    default:
      // 未知通道回退到 mock（不抛错，返回空结果）
      return new MockPaymentProvider(channel);
  }
}
