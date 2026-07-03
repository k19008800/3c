// ============================================================
//  3cloud (3C) — 支付回调签名校验
// ============================================================

import { createHmac } from "node:crypto";

/**
 * 允许跳过签名校验的本地 IP（仅开发测试环境）
 */
const MOCK_ALLOWED_IPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];

/**
 * 验证支付回调签名
 * @param orderNo 订单号
 * @param amount 金额
 * @param channelOrderNo 通道订单号
 * @param channel 支付通道
 * @param sign 签名
 * @param requestIp 回调来源 IP（用于 mock 模式 IP 白名单）
 * @returns 签名是否有效
 */
export function verifyPaySign(
  orderNo: string,
  amount: string,
  channelOrderNo: string,
  channel: string,
  sign?: string,
  requestIp?: string,
): boolean {
  // 缺少签名：仅允许本地 IP 来源跳过校验（开发测试用）
  if (!sign) {
    if (requestIp && MOCK_ALLOWED_IPS.includes(requestIp)) {
      console.warn("[Payment] \u26a0\ufe0f 支付回调签名校验跳过（本地 mock，来源: " + requestIp + "）");
      return true;
    }
    console.error("[Payment] \u26a0\ufe0f 支付回调缺少签名，且非本地来源: " + (requestIp || "unknown"));
    return false;
  }

  const paySignKey = process.env.PAY_SIGN_KEY || "dev-pay-sign-key";

  // 根据通道选择签名算法
  if (channel.startsWith("wechat")) {
    return verifyWechatSign(orderNo, amount, channelOrderNo, paySignKey, sign);
  }
  if (channel.startsWith("alipay")) {
    return verifyAlipaySign(orderNo, amount, channelOrderNo, paySignKey, sign);
  }

  // 未知通道，拒绝
  return false;
}

function verifyWechatSign(
  orderNo: string,
  amount: string,
  channelOrderNo: string,
  key: string,
  sign: string,
): boolean {
  // 微信 HMAC-SHA256 签名（金额统一转 6 位小数）
  const str = `orderNo=${orderNo}&amount=${normalizeAmount(amount)}&channelOrderNo=${channelOrderNo}&key=${key}`;
  const expected = createHmac("sha256", key).update(str).digest("hex").toUpperCase();
  return expected === sign.toUpperCase();
}

/**
 * 统一金额精度（转为 6 位小数字符串），确保签名比较一致性
 */
function normalizeAmount(amount: string): string {
  const num = parseFloat(amount);
  return isNaN(num) ? amount : num.toFixed(6);
}

function verifyAlipaySign(
  orderNo: string,
  amount: string,
  channelOrderNo: string,
  key: string,
  sign: string,
): boolean {
  // 支付宝 RSA2 签名验证（简化版 HMAC，金额统一转 6 位小数）
  const str = `order_no=${orderNo}&amount=${normalizeAmount(amount)}&trade_no=${channelOrderNo}`;
  const expected = createHmac("sha256", key).update(str).digest("hex").toUpperCase();
  return expected === sign.toUpperCase();
}
