// ============================================================
//  3cloud (3C) — 邮件发送服务 — 核心发送
// ============================================================

import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { getTransporter } from "./transporter.js";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const t = await getTransporter();
  if (!t) {
    logger.info({ to: params.to, subject: params.subject, bodyLength: params.html.length }, "[Email] (dev) 邮件已记录");
    return true;
  }
  try {
    await t.sendMail({ from: config.smtp.from || "noreply@unmisa.com", to: params.to, subject: params.subject, html: params.html });
    return true;
  } catch (err) {
    logger.error({ err, to: params.to }, "[Email] 发送失败");
    return false;
  }
}
