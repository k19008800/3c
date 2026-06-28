// ============================================================
//  3cloud (3C) — 种子数据
//  插入系统配置默认值 + 邮件模板
//  运行：npx tsx src/db/seed.ts
// ============================================================

import "dotenv/config";
import { createDb, closeDb } from "./index.js";
import { systemConfigs, emailTemplates, loginSecurityConfigs } from "./schema.js";
import { eq } from "drizzle-orm";

const defaultConfigs: { key: string; value: string; description: string }[] = [
  // ── 限流默认值 ──
  { key: "rate_limit_personal_rpm", value: "60", description: "个人用户默认 RPM" },
  { key: "rate_limit_personal_tpm", value: "100000", description: "个人用户默认 TPM" },
  { key: "rate_limit_enterprise_rpm", value: "300", description: "企业用户默认 RPM" },
  { key: "rate_limit_enterprise_tpm", value: "500000", description: "企业用户默认 TPM" },
  { key: "rate_limit_global_rpm", value: "30", description: "全局兜底 RPM" },
  { key: "rate_limit_global_tpm", value: "50000", description: "全局兜底 TPM" },

  // ── 告警阈值 ──
  { key: "alert_low_balance", value: JSON.stringify({ system: 50 }), description: "余额不足告警阈值" },
  { key: "alert_stop_balance", value: JSON.stringify({ system: 10 }), description: "余额禁止阈值" },

  // ── 定价 ──
  { key: "pricing_multiplier", value: "1.33", description: "定价倍率" },

  // ── 代理商 ──
  { key: "agent_daily_withdraw_limit", value: "3", description: "代理商每日提现次数上限" },

  // ── 免费体验 ──
  { key: "trial_token_quota", value: "50000", description: "新用户免费体验额度（Token）" },
  { key: "trial_duration_days", value: "7", description: "免费体验有效期（天）" },

  // ── 折扣 ──
  { key: "register_discount_rate", value: "1.0000", description: "新用户注册默认折扣率" },
  { key: "enterprise_discount_rate", value: "0.9500", description: "企业用户默认折扣率" },

  // ── 支付 ──
  { key: "wechat_pay_app_id", value: "", description: "微信支付 AppID（开发环境留空）" },
  { key: "wechat_pay_mch_id", value: "", description: "微信支付商户号" },
  { key: "wechat_pay_api_key", value: "", description: "微信支付 API Key" },
  { key: "alipay_app_id", value: "", description: "支付宝 AppID" },
  { key: "alipay_private_key", value: "", description: "支付宝私钥" },

  // ── 邮件 ──
  { key: "email_smtp_host", value: "", description: "备用 SMTP 主机" },
  { key: "email_smtp_port", value: "", description: "备用 SMTP 端口" },
  { key: "email_smtp_user", value: "", description: "备用 SMTP 用户名" },
  { key: "email_smtp_pass", value: "", description: "备用 SMTP 密码" },

  // ── 实名认证 ──
  { key: "real_name_auto_verify", value: "false", description: "是否启用第三方自动核验（true/false）" },
  { key: "real_name_verify_provider", value: "aliyun", description: "核验供应商（aliyun/none）" },
  { key: "aliyun_id_verify_app_code", value: "", description: "阿里云市场身份证核验 AppCode" },
  { key: "real_name_upload_max_size", value: "5242880", description: "证件上传最大字节（5MB）" },
  { key: "real_name_allowed_exts", value: "jpg,jpeg,png", description: "允许的证件文件扩展名" },

  // ── 管理员通知（V3.4） ──
  { key: "admin_notify_email", value: "", description: "管理员通知邮箱（实名/对公转账/代理商提现事件）" },

  // ── 充值风控（V3.4） ──
  { key: "recharge_personal_max_single", value: "5000", description: "个人单次充值上限（元）" },
  { key: "recharge_enterprise_max_single", value: "50000", description: "企业单次充值上限（元）" },
  { key: "recharge_personal_daily_limit", value: "20000", description: "个人单日累计触发风控值（元）" },
  { key: "recharge_enterprise_daily_limit", value: "200000", description: "企业单日累计触发风控值（元）" },
];

const defaultSecurityConfigs: { key: string; value: any; description: string }[] = [
  // ── IP 级风控 ──
  { key: "max_ip_fail_per_min", value: 5, description: "单个IP每分钟最大登录失败次数" },
  { key: "ip_ban_minutes", value: 5, description: "IP封禁时长（分钟）" },
  // ── 账号级风控 ──
  { key: "max_user_fail_per_min", value: 5, description: "单个账号每分钟最大登录失败次数" },
  { key: "user_captcha_after", value: 3, description: "连续失败N次后要求验证码" },
  { key: "user_ban_minutes", value: 15, description: "账号临时封禁时长（分钟）" },
  { key: "max_user_fail_24h", value: 10, description: "24小时内累计失败N次则封禁24小时" },
  // ── 异地检测 ──
  { key: "geo_check_enabled", value: true, description: "是否启用GeoIP异地登录检测" },
  { key: "geo_physical_impossible_kmh", value: 1000, description: "物理不可能移动速度阈值（km/h）" },
  { key: "high_risk_countries", value: ["US","RU","KP","IR"], description: "高风险国家/地区列表" },
  // ── 厂商熔断 ──
  { key: "circuit_breaker_trip", value: 3, description: "连续失败N次触发熔断" },
  { key: "circuit_breaker_open_ms", value: 30000, description: "熔断断开时长（毫秒）" },
  { key: "circuit_breaker_halfopen_ms", value: 120000, description: "半开状态下再失败延长断开时长" },
  // ── 会话管理 ──
  { key: "max_concurrent_sessions_default", value: 5, description: "默认最大并发会话数" },
  { key: "session_expire_hours", value: 168, description: "会话过期时间（小时），默认7天" },
];

const defaultEmailTemplates: { name: string; subjectZh: string; subjectEn: string; bodyHtmlZh: string; bodyHtmlEn: string }[] = [
  {
    name: "login_alert",
    subjectZh: "【3cloud安全提醒】您的账号在{{city}}有新登录",
    subjectEn: "[3cloud Security Alert] New login from {{city}}",
    bodyHtmlZh: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:'Microsoft YaHei',sans-serif">
  <h2 style="color:#e65100">⚠️ 新设备登录提醒</h2>
  <p>尊敬的 {{nickname}}：</p>
  <p>您的 3cloud 账号在 <strong>{{time}}</strong> 通过以下方式登录：</p>
  <table style="width:100%;border-collapse:collapse;margin:15px 0">
    <tr><td style="padding:8px;color:#666">登录地点</td><td style="padding:8px"><strong>{{city}}{{country}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">IP 地址</td><td style="padding:8px"><strong>{{ip}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">设备/浏览器</td><td style="padding:8px"><strong>{{device}}</strong></td></tr>
  </table>
  <p>如非本人操作，请立即登录修改密码。</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">此邮件由系统自动发出，请勿回复。</p>
  <p style="color:#999;font-size:12px">3cloud 团队</p>
</div>`,
    bodyHtmlEn: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif">
  <h2 style="color:#e65100">⚠️ New Device Login Alert</h2>
  <p>Dear {{nickname}},</p>
  <p>Your 3cloud account was accessed from a new location at <strong>{{time}}</strong>:</p>
  <table style="width:100%;border-collapse:collapse;margin:15px 0">
    <tr><td style="padding:8px;color:#666">Location</td><td style="padding:8px"><strong>{{city}}{{country}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">IP Address</td><td style="padding:8px"><strong>{{ip}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">Device/Browser</td><td style="padding:8px"><strong>{{device}}</strong></td></tr>
  </table>
  <p>If this was not you, please change your password immediately.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">This is an automated email, please do not reply.</p>
  <p style="color:#999;font-size:12px">3cloud Team</p>
</div>`,
  },
  {
    name: "account_banned",
    subjectZh: "【3cloud安全提醒】您的账号已被临时封禁",
    subjectEn: "[3cloud Security Alert] Your account has been temporarily suspended",
    bodyHtmlZh: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:'Microsoft YaHei',sans-serif">
  <h2 style="color:#c62828">🔒 账号临时封禁</h2>
  <p>尊敬的 {{nickname}}：</p>
  <p>由于检测到异常登录行为，您的 3cloud 账号已被<strong>临时封禁</strong>。</p>
  <table style="width:100%;border-collapse:collapse;margin:15px 0">
    <tr><td style="padding:8px;color:#666">封禁原因</td><td style="padding:8px"><strong>{{reason}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">封禁时长</td><td style="padding:8px"><strong>{{duration}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">解封时间</td><td style="padding:8px"><strong>{{unbanAt}}</strong></td></tr>
  </table>
  <p>如果您认为这是误封，请联系客服处理。</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">此邮件由系统自动发出，请勿回复。</p>
  <p style="color:#999;font-size:12px">3cloud 团队</p>
</div>`,
    bodyHtmlEn: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif">
  <h2 style="color:#c62828">🔒 Account Temporarily Suspended</h2>
  <p>Dear {{nickname}},</p>
  <p>Your 3cloud account has been <strong>temporarily suspended</strong> due to suspicious login activity.</p>
  <table style="width:100%;border-collapse:collapse;margin:15px 0">
    <tr><td style="padding:8px;color:#666">Reason</td><td style="padding:8px"><strong>{{reason}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">Duration</td><td style="padding:8px"><strong>{{duration}}</strong></td></tr>
    <tr><td style="padding:8px;color:#666">Unban Time</td><td style="padding:8px"><strong>{{unbanAt}}</strong></td></tr>
  </table>
  <p>If you believe this is a mistake, please contact support.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">This is an automated email, please do not respond.</p>
  <p style="color:#999;font-size:12px">3cloud Team</p>
</div>`,
  },
  {
    name: "real_name_result",
    subjectZh: "3cloud 实名认证{{status}}通知",
    subjectEn: "3cloud Real-name Verification {{status}} Notice",
    bodyHtmlZh: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:'Microsoft YaHei',sans-serif">
  <h2 style="color:#333">实名认证{{status}}</h2>
  <p>尊敬的 {{nickname}}：</p>
  <p>您在 3cloud 平台提交的实名认证（{{realName}}）已{{status}}。</p>
  <p>{{extraInfo}}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">此邮件由系统自动发出，请勿回复。</p>
  <p style="color:#999;font-size:12px">3cloud 团队</p>
</div>`,
    bodyHtmlEn: `<div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif">
  <h2 style="color:#333">Real-name Verification {{status}}</h2>
  <p>Dear {{nickname}},</p>
  <p>Your real-name verification ({{realName}}) on 3cloud has been {{status}}.</p>
  <p>{{extraInfo}}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <p style="color:#999;font-size:12px">This is an automated email, please do not reply.</p>
  <p style="color:#999;font-size:12px">3cloud Team</p>
</div>`,
  },
];

async function seedConfigs(db: ReturnType<typeof createDb>) {
  console.log("📋 系统配置...");
  let inserted = 0;
  let skipped = 0;

  for (const cfg of defaultConfigs) {
    const existing = await db
      .select()
      .from(systemConfigs)
      .where(eq(systemConfigs.key, cfg.key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemConfigs).values(cfg);
      console.log(`  ✅ ${cfg.key} = ${cfg.value}`);
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`  📊 配置：插入 ${inserted} 条，跳过 ${skipped} 条\n`);
}

async function seedSecurityConfigs(db: ReturnType<typeof createDb>) {
  console.log("🛡️ 安全配置...");
  let inserted = 0;
  let skipped = 0;

  for (const cfg of defaultSecurityConfigs) {
    const existing = await db
      .select()
      .from(loginSecurityConfigs)
      .where(eq(loginSecurityConfigs.key, cfg.key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(loginSecurityConfigs).values({
        key: cfg.key,
        value: JSON.stringify(cfg.value),
        description: cfg.description,
      });
      console.log(`  ✅ ${cfg.key} = ${JSON.stringify(cfg.value)}`);
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`  📊 安全配置：插入 ${inserted} 条，跳过 ${skipped} 条\n`);
}

async function seedEmailTemplates(db: ReturnType<typeof createDb>) {
  console.log("📧 邮件模板...");
  let inserted = 0;
  let skipped = 0;

  for (const tpl of defaultEmailTemplates) {
    const existing = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, tpl.name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(emailTemplates).values({
        ...tpl,
      });
      console.log(`  ✅ ${tpl.name}`);
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`  📊 模板：插入 ${inserted} 条，跳过 ${skipped} 条\n`);
}

async function seed() {
  const db = createDb();
  console.log("🌱 3cloud 种子数据\n" + "═".repeat(30));

  await seedConfigs(db);
  await seedSecurityConfigs(db);
  await seedEmailTemplates(db);

  console.log("✅ 种子数据完成");
  await closeDb();
}

seed().catch((err) => {
  console.error("❌ 种子数据插入失败:", err);
  process.exit(1);
});
