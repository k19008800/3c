// ============================================================
//  3cloud (3C) — 告警渠道服务 — 各渠道发送实现
// ============================================================

import { logger } from "../../logger.js";
import { sendEmail } from "../email-service.js";
import { loadChannelConfig, type ChannelConfig, clearAlertChannelCache } from "./config.js";

export type AlertChannelLevel = "info" | "warning" | "error" | "critical";

async function sendDingtalk(webhook: string, secret: string | undefined, title: string, content: string, level: AlertChannelLevel): Promise<boolean> {
  const emojiMap: Record<AlertChannelLevel, string> = { info: "🔵", warning: "🟡", error: "🟠", critical: "🔴" };
  const emoji = emojiMap[level] || "🔵";
  try {
    const body = { msgtype: "markdown", markdown: { title: `[${emoji}] ${title}`, text: `### ${emoji} ${title}\n\n${content}\n\n---\n> 3cloud 告警系统` } };
    let url = webhook;
    if (secret) {
      const timestamp = Date.now();
      const keyData = new TextEncoder().encode(secret);
      const msgData = new TextEncoder().encode(`${timestamp}\n${secret}`);
      const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      const signBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      url += `&timestamp=${timestamp}&sign=${encodeURIComponent(signBase64)}`;
    }
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { logger.error({ status: response.status, text: await response.text() }, "[AlertChannel] 钉钉推送失败"); return false; }
    return true;
  } catch (err) { logger.error({ err }, "[AlertChannel] 钉钉推送异常"); return false; }
}

async function sendWecom(webhook: string, title: string, content: string, level: AlertChannelLevel): Promise<boolean> {
  const levelLabel: Record<AlertChannelLevel, string> = { info: "INFO", warning: "WARNING", error: "ERROR", critical: "CRITICAL" };
  try {
    const body = { msgtype: "markdown", markdown: { content: `## [${levelLabel[level]}] ${title}\n\n${content}\n\n> 3cloud 告警系统` } };
    const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { logger.error({ status: response.status, text: await response.text() }, "[AlertChannel] 企微推送失败"); return false; }
    return true;
  } catch (err) { logger.error({ err }, "[AlertChannel] 企微推送异常"); return false; }
}

async function sendEmailAlert(to: string[], title: string, content: string): Promise<void> {
  for (const recipient of to) {
    try {
      await sendEmail({ to: recipient, subject: `[3cloud 告警] ${title}`, html: `<div style="font-family:sans-serif;padding:20px;max-width:600px"><h2 style="color:#e53e3e">⚠️ ${title}</h2><div style="white-space:pre-wrap;line-height:1.6">${content}</div><hr style="margin-top:20px;border:none;border-top:1px solid #eee"/><p style="color:#999;font-size:12px">3cloud 告警系统 · 自动发送</p></div>` });
    } catch (err) { logger.error({ err, recipient }, "[AlertChannel] 邮件告警发送失败"); }
  }
}

export async function pushAlertToChannels(title: string, content: string, level: AlertChannelLevel = "warning"): Promise<void> {
  try {
    const config = await loadChannelConfig();
    if (!config) return;
    const promises: Promise<any>[] = [];
    if (config.dingtalk?.length) for (const ch of config.dingtalk) promises.push(sendDingtalk(ch.webhook, ch.secret, title, content, level));
    if (config.wecom?.length) for (const ch of config.wecom) promises.push(sendWecom(ch.webhook, title, content, level));
    if (config.email?.length) for (const ch of config.email) if (ch.to?.length) promises.push(sendEmailAlert(ch.to, title, content));
    await Promise.allSettled(promises);
  } catch (err) { logger.error({ err }, "[AlertChannel] pushAlertToChannels 异常"); }
}

export async function pushSystemAlert(title: string, message: string, level: AlertChannelLevel = "error"): Promise<void> {
  logger.warn({ title, message, level }, "[SystemAlert] 系统告警");
  await pushAlertToChannels(title, message, level);
}
