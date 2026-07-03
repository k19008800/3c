// ============================================================
//  3cloud (3C) — 每日安全摘要邮件
//  每天 09:00 发送过去 24h 安全事件汇总
// ============================================================

import { getDb } from "../db/index.js";
import { securityEvents } from "../db/schema.js";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { sendEmail } from "./email-service.js";
import { loadSecurityConfig } from "./login-security.js";
import { getRedis } from "../redis.js";

const EVENT_TYPE_LABELS: Record<string, string> = {
  brute_force: "暴力破解",
  unusual_location: "异地登录",
  new_device: "新设备",
  ip_banned: "IP封禁",
  user_banned: "账号封禁",
  user_captcha: "验证码挑战",
  circuit_trip: "厂商熔断",
  circuit_recovery: "熔断恢复",
  vendor_failure: "厂商失败",
};

const RISK_LABELS: Record<string, string> = {
  critical: "严重",
  high: "高危",
  medium: "中危",
  low: "低危",
};

const RISK_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
};

/**
 * 发送每日安全摘要邮件
 */
export async function sendDailySecuritySummary(): Promise<boolean> {
  try {
    const cfg = await loadSecurityConfig();
    const adminEmail = cfg.alert_admin_email as string | undefined;

    // 未配置接收邮箱则不发送
    if (!adminEmail) {
      console.log("[DailySummary] 未配置接收邮箱，跳过每日摘要");
      return false;
    }

    const db = getDb();
    const redis = getRedis();

    // 过去 24 小时
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. 过去 24h 安全事件统计
    const [totalRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, since));

    const totalEvents = Number(totalRes?.count ?? 0);

    // 2. 按风险等级分布
    const riskDistribution = await db
      .select({
        riskLevel: securityEvents.riskLevel,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, since))
      .groupBy(securityEvents.riskLevel)
      .orderBy(securityEvents.riskLevel);

    // 3. 按事件类型分布
    const typeDistribution = await db
      .select({
        eventType: securityEvents.eventType,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, since))
      .groupBy(securityEvents.eventType)
      .orderBy(sql`count(*) desc`);

    // 4. 最近的 10 条未确认事件
    const recentEvents = await db
      .select()
      .from(securityEvents)
      .where(and(gte(securityEvents.createdAt, since), eq(securityEvents.acknowledged, false)))
      .orderBy(sql`created_at desc`)
      .limit(10);

    // 5. 当前封禁状态
    const [ipKeys, userKeys] = await Promise.all([
      redis.keys("risk:ban:ip:*"),
      redis.keys("risk:ban:user:*"),
    ]);

    // 构建邮件 HTML
    const dateStr = new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const riskRows = riskDistribution
      .map(
        (r) => `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;color:${RISK_COLORS[r.riskLevel] || '#666'}">
            <strong>${RISK_LABELS[r.riskLevel] || r.riskLevel}</strong>
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;font-size:18px;font-weight:bold">
            ${r.count}
          </td>
        </tr>`
      )
      .join("");

    const typeRows = typeDistribution
      .slice(0, 8)
      .map(
        (r) => `
        <tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f5f5f5;color:#555">${EVENT_TYPE_LABELS[r.eventType] || r.eventType}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f5f5f5;text-align:center;font-weight:bold">${r.count}</td>
        </tr>`
      )
      .join("");

    const recentRows = recentEvents
      .map(
        (ev) => `
        <tr>
          <td style="padding:4px 8px;font-size:12px;color:#999;white-space:nowrap">
            ${ev.createdAt.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </td>
          <td style="padding:4px 8px;font-size:12px">
            <span style="color:${RISK_COLORS[ev.riskLevel] || '#666'};font-weight:bold">${RISK_LABELS[ev.riskLevel]}</span>
          </td>
          <td style="padding:4px 8px;font-size:12px;color:#444">${EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}</td>
          <td style="padding:4px 8px;font-size:12px;color:#666">${ev.userId ? `#${ev.userId}` : "-"}</td>
          <td style="padding:4px 8px;font-size:12px;color:#666;font-family:monospace">${ev.ip ?? "-"}</td>
        </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Microsoft YaHei','Helvetica Neue',Arial,sans-serif">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px">🔒 每日安全摘要</h1>
      <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${dateStr}</p>
    </div>

    <div style="padding:24px 32px">

      <!-- 总览卡片 -->
      <div style="background:#f8fafc;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;border:1px solid #e2e8f0">
        <div style="font-size:36px;font-weight:bold;color:#1e293b">${totalEvents}</div>
        <div style="color:#64748b;font-size:13px;margin-top:2px">过去 24 小时安全事件</div>
      </div>

      <!-- 风险等级分布 -->
      <h2 style="font-size:15px;color:#1e293b;margin:16px 0 8px">📊 风险等级分布</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b">等级</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b">数量</th>
          </tr>
        </thead>
        <tbody>
          ${riskRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#999;font-size:13px">暂无事件</td></tr>'}
        </tbody>
      </table>

      <!-- 事件类型分布 -->
      <h2 style="font-size:15px;color:#1e293b;margin:16px 0 8px">📋 事件类型分布</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b">类型</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b">数量</th>
          </tr>
        </thead>
        <tbody>
          ${typeRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#999;font-size:13px">暂无数据</td></tr>'}
        </tbody>
      </table>

      <!-- 封禁状态 -->
      <h2 style="font-size:15px;color:#1e293b;margin:16px 0 8px">🚫 当前封禁</h2>
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#c2410c">${ipKeys.length}</div>
          <div style="font-size:11px;color:#9a3412">封禁 IP</div>
        </div>
        <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#dc2626">${userKeys.length}</div>
          <div style="font-size:11px;color:#991b1b">封禁用户</div>
        </div>
      </div>

      <!-- 最近未确认事件 -->
      <h2 style="font-size:15px;color:#1e293b;margin:16px 0 8px">⏰ 最近未确认事件</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">时间</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">风险</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">类型</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">用户</th>
            <th style="padding:6px 8px;text-align:left;font-size:11px;color:#64748b">IP</th>
          </tr>
        </thead>
        <tbody>
          ${recentRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;font-size:13px">全部已确认 ✅</td></tr>'}
        </tbody>
      </table>

      <!-- 处理建议 -->
      <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;margin-top:16px;border:1px solid #e2e8f0">
        <p style="margin:0;font-size:12px;color:#64748b">
          登录 <a href="https://unmisa.com/admin/security" style="color:#2563eb">管理后台</a>
          查看完整安全事件列表和处理详情。
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;color:#94a3b8">此邮件由 3cloud 系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendEmail({
      to: adminEmail,
      subject: `🔒 3cloud 每日安全摘要 — ${dateStr}`,
      html,
    });

    console.log(`[DailySummary] 每日摘要已发送到 ${adminEmail}（${totalEvents} 条事件）`);
    return result;
  } catch (err) {
    console.error("[DailySummary] 发送失败:", err);
    return false;
  }
}
