// ============================================================
//  3cloud (3C) — 每日安全摘要 — 发送入口
// ============================================================

import { sendEmail } from "../email-service.js";
import { getDailySummaryData } from "./data.js";
import { buildSummaryHtml } from "./template.js";

export async function sendDailySecuritySummary(): Promise<boolean> {
  try {
    const data = await getDailySummaryData();
    if (!data.adminEmail) { console.log("[DailySummary] 未配置接收邮箱，跳过每日摘要"); return false; }

    const dateStr = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    const html = buildSummaryHtml(data);
    const result = await sendEmail({ to: data.adminEmail, subject: `🔒 3cloud 每日安全摘要 — ${dateStr}`, html });

    console.log(`[DailySummary] 每日摘要已发送到 ${data.adminEmail}（${data.totalEvents} 条事件）`);
    return result;
  } catch (err) {
    console.error("[DailySummary] 发送失败:", err);
    return false;
  }
}
