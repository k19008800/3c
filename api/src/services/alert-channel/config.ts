// ============================================================
//  3cloud (3C) — 告警渠道服务 — 配置加载
// ============================================================

import { getDb } from "../../db/index.js";
import { systemConfigs } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../logger.js";

const CFG_PREFIX = "alert_channel";

interface DingtalkChannel { webhook: string; secret?: string }
interface WecomChannel { webhook: string }
interface EmailChannel { to: string[] }

export interface ChannelConfig {
  dingtalk?: DingtalkChannel[];
  wecom?: WecomChannel[];
  email?: EmailChannel[];
}

let cachedConfig: ChannelConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export async function loadChannelConfig(): Promise<ChannelConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL) return cachedConfig;

  try {
    const db = getDb();
    const [row] = await db.select({ key: systemConfigs.key, value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, CFG_PREFIX)).limit(1);
    cachedConfig = row ? JSON.parse(row.value) as ChannelConfig : {};
    cacheTime = now;
    return cachedConfig!;
  } catch (err) {
    logger.error({ err }, "[AlertChannel] 加载配置失败");
    return {};
  }
}

export function clearAlertChannelCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}
