// ============================================================
//  3cloud (3C) — 邮件发送服务 — SMTP 传输器
// ============================================================

import nodemailer from "nodemailer";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { eq } from "drizzle-orm";

let transporter: nodemailer.Transporter | null = null;
let transporterInitAttempted = false;

export async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter;
  if (transporterInitAttempted) return null;
  transporterInitAttempted = true;

  const { smtp } = config;
  let smtpHost = smtp.host && smtp.host !== "localhost" ? smtp.host : "";
  let smtpPort = smtp.port;
  let smtpSecure = smtp.secure;
  let smtpUser = smtp.user;
  let smtpPass = smtp.pass;

  if (!smtpHost) {
    try {
      const db = getDb();
      const [hostRow] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "smtp_host")).limit(1);
      const [portRow] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "smtp_port")).limit(1);
      const [userRow] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "smtp_user")).limit(1);
      const [passRow] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "smtp_pass")).limit(1);
      if (hostRow?.value) smtpHost = hostRow.value;
      if (portRow?.value) smtpPort = parseInt(portRow.value, 10) || 587;
      if (userRow?.value) smtpUser = userRow.value;
      if (passRow?.value) smtpPass = passRow.value;
    } catch {}
  }
  if (!smtpHost) return null;

  transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpSecure || smtpPort === 465, auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined });
  return transporter;
}
