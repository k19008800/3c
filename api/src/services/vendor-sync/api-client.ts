// ============================================================
//  3cloud (3C) — 供应商同步 API 客户端
// ============================================================

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendors, vendorModels } from "../../db/schema/index.js";
import { decryptApiKey } from "../encryption.js";

interface UpstreamModel { id: string; object?: string; owned_by?: string }

// ── Get API key for a vendor (decrypt from vendor_models) ──

export async function getVendorApiKey(vendorId: number): Promise<string | null> {
  const db = getDb();
  try {
    const [mapping] = await db
      .select({ encrypted: vendorModels.apiKeyEncrypted })
      .from(vendorModels)
      .where(and(eq(vendorModels.vendorId, vendorId), sql`length(${vendorModels.apiKeyEncrypted}) > 10`))
      .limit(1);
    if (!mapping) return null;
    return decryptApiKey(mapping.encrypted);
  } catch { return null; }
}

// ── Fetch upstream model list ──

export async function fetchUpstreamModels(baseUrl: string, apiKey: string | null): Promise<UpstreamModel[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/models';
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    console.log(`[VendorSync] → GET ${url}`);
    const resp = await fetch(url, { headers, signal: controller.signal });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '').then(t => t.slice(0, 300));
      throw new Error(`HTTP ${resp.status}: ${errText}`);
    }
    const data = await resp.json() as { data?: UpstreamModel[]; object?: string };
    const models = data?.data || [];
    console.log(`[VendorSync] ← ${models.length} models from ${url}`);
    return models;
  } finally { clearTimeout(timeout); }
}
