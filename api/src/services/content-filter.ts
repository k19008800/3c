// ============================================================
//  3cloud (3C) — 内容过滤检查服务
//  供 proxy route 调用：请求前/响应后过滤
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { contentFilters, filterLogs } from "../db/schema.js";
import { getRedis } from "../redis.js";

const FILTER_CACHE_TTL = 60; // 秒
const CACHE_KEY = "content_filters:active";

interface MatchResult {
  content: string
  start: number
  end: number
}

export interface FilterCheckResult {
  blocked: boolean
  message?: string
}

// ── 获取活跃规则（缓存 60 秒） ──

async function getActiveFilters(): Promise<any[]> {
  const redis = getRedis();
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const db = getDb();
  const rules = await db
    .select()
    .from(contentFilters)
    .where(eq(contentFilters.status, true))
    .orderBy(sql`${contentFilters.priority} ASC, ${contentFilters.id} ASC`);

  await redis.setex(CACHE_KEY, FILTER_CACHE_TTL, JSON.stringify(rules));
  return rules;
}

// ── 执行匹配 ──

function matchContent(content: string, rule: any): MatchResult[] {
  if (!content) return [];

  const checkLen = Math.min(content.length, 10240);
  const target = content.slice(0, checkLen);

  switch (rule.matchType) {
    case "keyword": {
      const keywords = rule.pattern.split("\n").map((s: string) => s.trim()).filter(Boolean);
      const results: MatchResult[] = [];
      for (const kw of keywords) {
        let pos = target.indexOf(kw);
        while (pos !== -1) {
          results.push({ content: kw, start: pos, end: pos + kw.length });
          pos = target.indexOf(kw, pos + 1);
        }
      }
      return results;
    }
    case "regex": {
      try {
        const regex = new RegExp(rule.pattern, "gi");
        const results: MatchResult[] = [];
        let match;
        while ((match = regex.exec(target)) !== null) {
          results.push({ content: match[0], start: match.index, end: match.index + match[0].length });
        }
        return results;
      } catch { return []; }
    }
    case "exact":
      return target === rule.pattern
        ? [{ content: rule.pattern, start: 0, end: rule.pattern.length }]
        : [];
    default:
      return [];
  }
}

// ── 主动清除缓存（管理员更新规则后调用） ──

export async function clearFilterCache(): Promise<void> {
  const redis = getRedis();
  await redis.del(CACHE_KEY);
}

// ── 检查请求/响应内容 ──

export async function checkContent(stage: "pre_request" | "post_response", content: string, modelName?: string): Promise<FilterCheckResult> {
  if (!content) return { blocked: false };

  const rules = await getActiveFilters();
  const db = getDb();

  for (const rule of rules) {
    // 阶段匹配
    if (rule.stage !== stage && rule.stage !== "both") continue;

    // 模型范围
    if (!rule.applyTo.includes("all") && modelName && !rule.applyTo.includes(modelName)) continue;

    const matches = matchContent(content, rule);
    if (matches.length === 0) continue;

    // 命中：更新计数器
    await db.update(contentFilters)
      .set({
        hitCount: sql`hit_count + ${matches.length}`,
        lastHitAt: new Date(),
      })
      .where(eq(contentFilters.id, rule.id));

    // 记录过滤日志
    await db.insert(filterLogs).values({
      filterId: rule.id,
      action: rule.action,
      matchContent: matches[0].content.slice(0, 200),
      matchedPattern: rule.pattern,
      stage,
      requestSummary: content.slice(0, 100),
    }).catch(() => {});

    switch (rule.action) {
      case "block":
        return { blocked: true, message: `请求被内容安全策略拦截（规则: ${rule.name}）` };
      case "log":
        continue; // 仅记录，不阻断
      case "mask":
      case "replace":
        // 返回标记，由调用方处理替换/脱敏
        return { blocked: false, message: `内容已${rule.action === 'mask' ? '脱敏' : '替换'}` };
      default:
        continue;
    }
  }

  return { blocked: false };
}
