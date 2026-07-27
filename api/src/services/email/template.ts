// ============================================================
//  3cloud (3C) — 邮件发送服务 — 模板加载与渲染
// ============================================================

import { getDb } from "../../db/index.js";
import { emailTemplates } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export interface EmailTemplate {
  subjectZh: string;
  subjectEn: string;
  bodyHtmlZh: string;
  bodyHtmlEn: string;
}

const templateCache = new Map<string, EmailTemplate>();
let templateCacheTime = 0;
const CACHE_TTL = 60_000;

export async function loadTemplate(name: string): Promise<EmailTemplate | null> {
  const now = Date.now();
  if (now - templateCacheTime > CACHE_TTL) { templateCache.clear(); templateCacheTime = now; }
  if (templateCache.has(name)) return templateCache.get(name)!;

  try {
    const db = getDb();
    const [tmpl] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name)).limit(1);
    if (!tmpl) return null;
    const result: EmailTemplate = { subjectZh: tmpl.subjectZh, subjectEn: tmpl.subjectEn, bodyHtmlZh: tmpl.bodyHtmlZh, bodyHtmlEn: tmpl.bodyHtmlEn };
    templateCache.set(name, result);
    return result;
  } catch { return null; }
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
