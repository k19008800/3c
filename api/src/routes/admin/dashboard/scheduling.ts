// ============================================================
//  3cloud (3C) — Admin Dashboard 调度实时监控
//  GET /api/v1/admin/dashboard/scheduling-realtime
// ============================================================

import { FastifyInstance } from "fastify";
import { getRedis } from "../../../redis.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

export async function schedulingRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/dashboard/scheduling-realtime", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { minutes?: string };
    const minutes = Math.min(120, Math.max(5, parseInt(query.minutes ?? "30", 10) || 30));

    const cacheKey = `dashboard:scheduling-realtime:${minutes}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const now = new Date();
    const series: Array<{
      time: string;
      rpm: number;
      tpm: number;
      avgLatencyMs: number;
      models: Array<{ modelName: string; rpm: number; tpm: number }>;
      vendors: Array<{ vendorName: string; rpm: number; tpm: number }>;
    }> = [];

    let allModels = new Set<string>();
    let allVendors = new Set<string>();

    for (let i = minutes - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 60000);
      const bucket =
        `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}` +
        `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;

      let rpmHash: Record<string, string> = {};
      let tpmHash: Record<string, string> = {};
      let latHash: Record<string, string> = {};
      try {
        [rpmHash, tpmHash, latHash] = await Promise.all([
          redis.hgetall(`scheduling:rpm:${bucket}`),
          redis.hgetall(`scheduling:tpm:${bucket}`),
          redis.hgetall(`scheduling:lat:${bucket}`),
        ]);
      } catch {}

      const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;

      if (Object.keys(rpmHash).length === 0) {
        series.push({ time, rpm: 0, tpm: 0, avgLatencyMs: 0, models: [], vendors: [] });
        continue;
      }

      const modelMap = new Map<string, { rpm: number; tpm: number; latTotal: number; latCnt: number }>();
      const vendorMap = new Map<string, { rpm: number; tpm: number }>();

      for (const [field, val] of Object.entries(rpmHash)) {
        const sepIdx = field.lastIndexOf("::");
        if (sepIdx === -1) continue;
        const model = field.slice(0, sepIdx);
        const vendor = field.slice(sepIdx + 2);

        const rpm = parseInt(val) || 0;
        const tpm = parseInt(tpmHash[field] ?? "0") || 0;
        const latRaw = parseInt(latHash[`${field}::lat`] ?? "0") || 0;
        const latCnt = parseInt(latHash[`${field}::cnt`] ?? "0") || 0;
        const avgLat = latCnt > 0 ? Math.round(latRaw / latCnt) : 0;

        const m = modelMap.get(model) ?? { rpm: 0, tpm: 0, latTotal: 0, latCnt: 0 };
        m.rpm += rpm;
        m.tpm += tpm;
        m.latTotal += avgLat * rpm;
        m.latCnt += rpm;
        modelMap.set(model, m);

        const v = vendorMap.get(vendor) ?? { rpm: 0, tpm: 0 };
        v.rpm += rpm;
        v.tpm += tpm;
        vendorMap.set(vendor, v);

        allModels.add(model);
        allVendors.add(vendor);
      }

      const totalRpm = Array.from(modelMap.values()).reduce((a, m) => a + m.rpm, 0);
      const totalTpm = Array.from(modelMap.values()).reduce((a, m) => a + m.tpm, 0);
      const totalLatTotal = Array.from(modelMap.values()).reduce((a, m) => a + m.latTotal, 0);
      const avgLatencyMs = totalRpm > 0 ? Math.round(totalLatTotal / totalRpm) : 0;

      series.push({
        time,
        rpm: totalRpm,
        tpm: totalTpm,
        avgLatencyMs,
        models: Array.from(modelMap.entries()).map(([name, d]) => ({
          modelName: name,
          rpm: d.rpm,
          tpm: d.tpm,
        })),
        vendors: Array.from(vendorMap.entries()).map(([name, d]) => ({
          vendorName: name,
          rpm: d.rpm,
          tpm: d.tpm,
        })),
      });
    }

    const latest = series[series.length - 1] ?? null;
    const currentDistribution = latest
      ? Array.from(
          series[series.length - 1].vendors.reduce((acc, v) => {
            const existing = acc.get(v.vendorName);
            if (existing) {
              existing.rpm += v.rpm;
            } else {
              acc.set(v.vendorName, { vendorName: v.vendorName, rpm: v.rpm });
            }
            return acc;
          }, new Map<string, { vendorName: string; rpm: number }>())
        ).map(([vendorName, v]) => ({
          vendorName,
          rpm: v.rpm,
          percentage: latest.rpm > 0 ? Math.round((v.rpm / latest.rpm) * 100) : 0,
          avgLatencyMs: latest.avgLatencyMs,
          topModels: Array.from(
            series[series.length - 1].models
              .filter((m) => m.rpm > 0)
              .sort((a, b) => b.rpm - a.rpm)
              .slice(0, 3)
          ),
        }))
      : [];

    const allRpms = series.map((s) => s.rpm);
    const allTpms = series.map((s) => s.tpm);
    const allLats = series.filter((s) => s.avgLatencyMs > 0).map((s) => s.avgLatencyMs);
    const latestEntry = series[series.length - 1] ?? null;

    const result = {
      code: 0,
      data: {
        minutes,
        series,
        currentDistribution,
        lastUpdated: new Date().toISOString(),
        summary: {
          totalRpm: latestEntry?.rpm ?? 0,
          totalTpm: latestEntry?.tpm ?? 0,
          avgLatencyMs: latestEntry?.avgLatencyMs ?? 0,
          peakRpm: allRpms.length > 0 ? Math.max(...allRpms) : 0,
          peakTpm: allTpms.length > 0 ? Math.max(...allTpms) : 0,
          avgLatencyRecent: allLats.length > 0 ? Math.round(allLats.reduce((a, b) => a + b, 0) / allLats.length) : 0,
          vendorCount: allVendors.size,
          modelCount: allModels.size,
        },
      },
      message: "ok",
    };

    redis.setex(cacheKey, 10, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
