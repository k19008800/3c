// ============================================================
//  3cloud (3C) — 支付通道适配器 barrel
// ============================================================
export { type PaymentProvider } from "./interface.js";
export { MockPaymentProvider } from "./mock.js";
export { WechatScanProvider, WechatJsapiProvider, AlipayScanProvider, AlipayJsapiProvider, createPaymentProvider } from "./factory.js";
