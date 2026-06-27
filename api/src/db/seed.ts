// ============================================================
//  3cloud (3C) — 种子数据
//  插入系统配置默认值
//  运行：npx tsx src/db/seed.ts
// ============================================================

import "dotenv/config";
import { createDb, closeDb } from "./index.js";
import { systemConfigs } from "./schema.js";
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
];

async function seed() {
  const db = createDb();
  console.log("🌱 开始插入系统配置种子数据...\n");

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

  console.log(`\n📊 结果：插入 ${inserted} 条，跳过 ${skipped} 条（已存在）`);
  await closeDb();
}

seed().catch((err) => {
  console.error("❌ 种子数据插入失败:", err);
  process.exit(1);
});
