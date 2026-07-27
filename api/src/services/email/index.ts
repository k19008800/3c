// ============================================================
//  3cloud (3C) — 邮件发送服务 barrel
// ============================================================
export { getTransporter } from "./transporter.js";
export { loadTemplate, renderTemplate, type EmailTemplate } from "./template.js";
export { sendEmail, type SendEmailParams } from "./sender.js";
export {
  sendRealNameResultEmail,
  sendLoginAlertEmail,
  sendAccountBannedEmail,
  type RealNameResultNotifParams,
  type LoginAlertEmailParams,
  type AccountBannedEmailParams,
} from "./notifications.js";
