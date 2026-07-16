#!/usr/bin/env tsx
console.log("=== 站点基础配置种子数据 ===");

import { getDb, createDb } from "../index.js";
import { systemConfigs } from "../schema.js";
import { sql } from "drizzle-orm";

const SITE_CONFIGS = [
  { key: "site_name",           value: "3Cloud AI",            description: "平台名称" },
  { key: "site_logo_url",       value: "",                     description: "Logo URL" },
  { key: "site_favicon_url",    value: "",                     description: "Favicon URL" },
  { key: "site_icp",            value: "",                     description: "ICP 备案号" },
  { key: "site_icp_link",       value: "https://beian.miit.gov.cn", description: "ICP 备案链接" },
  { key: "site_police_icp",     value: "",                     description: "公安备案号" },
  { key: "site_copyright",      value: "",                     description: "版权信息" },
  { key: "site_company_name",   value: "",                     description: "公司名称" },
  { key: "site_contact_email",  value: "",                     description: "联系邮箱" },
  { key: "site_contact_phone",  value: "",                     description: "联系电话" },
  { key: "site_wechat_qr_url",  value: "",                     description: "公众号二维码 URL" },
  { key: "site_footer_html",    value: "",                     description: "底部自定义 HTML" },
];

async function run() {
  await createDb();
  const db = getDb();

  for (const cfg of SITE_CONFIGS) {
    const [existing] = await db
      .select({ id: systemConfigs.id })
      .from(systemConfigs)
      .where(sql`${systemConfigs.key} = ${cfg.key}`)
      .limit(1);

    if (existing) {
      console.log(`  跳过 ${cfg.key}（已存在）`);
      continue;
    }

    await db.insert(systemConfigs).values({
      key: cfg.key,
      value: cfg.value,
      description: cfg.description,
    });
    console.log(`  插入 ${cfg.key}: ${cfg.value || "(空)"}`);
  }

  console.log("\n站点配置初始化完成");
  process.exit(0);
}

run().catch((err) => {
  console.error("种子数据失败:", err);
  process.exit(1);
});
