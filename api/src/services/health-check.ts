// ============================================================
//  3cloud (3C) — 厂商健康检查
//  被动检查（主要）：每次调用后更新健康评分
//  主动检查（辅助）：每 5 分钟对 down 厂商发轻量请求
// ============================================================

import { eq, lte, and, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { vendorModels, vendors } from "../db/schema.js";
import { decryptApiKey } from "./encryption.js";

// ── 常量 ──

const SAMPLE_WINDOW = 50;            // 滑动窗口采样次数
const DEGRADED_THRESHOLD = 0.70;     // 健康评分 < 0.70 → degraded
const DOWN_THRESHOLD = 0.30;         // 健康评分 < 0.30 → down
const RECOVERY_CONSECUTIVE = 3;      // 连续成功 3 次 → 恢复 active

// ── 被动健康检测：每次调用后更新 ──

export async function updateHealthAfterCall(
  vendorModelId: number,
  success: boolean,
  durationMs: number,
): Promise<void> {
  const db = getDb();

  // 获取当前健康状态
  const [vm] = await db
    .select({
      healthScore: vendorModels.healthScore,
      healthSamples: vendorModels.healthSamples,
      isDown: vendorModels.isDown,
    })
    .from(vendorModels)
    .where(eq(vendorModels.id, vendorModelId))
    .limit(1);

  if (!vm) return;

  const samples = (vm.healthSamples ?? 0) + 1;
  const limitedSamples = Math.min(samples, SAMPLE_WINDOW);
  const currentScore = Number(vm.healthScore ?? 1.0);

  // EWM A（指数加权移动平均）更新健康评分
  // 成功：向 1.0 收敛，失败：向 0.0 收敛
  const alpha = 1 / Math.max(limitedSamples, 10); // 动态学习率
  const newScore = success
    ? currentScore + alpha * (1.0 - currentScore)
    : currentScore - alpha * (currentScore - 0.0);

  // 取两位小数
  const roundedScore = Math.round(newScore * 100) / 100;

  // 判断是否 down/degraded
  let newIsDown = vm.isDown;
  if (!success && roundedScore < DOWN_THRESHOLD) {
    newIsDown = true;
  } else if (success && roundedScore > DEGRADED_THRESHOLD) {
    newIsDown = false;
  }

  // 同步熔断计数
  try {
    const { recordVendorModelFailure, recordVendorModelSuccess } = await import("./circuit-breaker.js");
    if (!success) {
      await recordVendorModelFailure(vendorModelId);
    } else {
      await recordVendorModelSuccess(vendorModelId);
    }
  } catch (err) {
    // 熔断服务异常，不影响主流程
  }

  await db
    .update(vendorModels)
    .set({
      healthScore: roundedScore.toFixed(2),
      healthSamples: limitedSamples,
      isDown: newIsDown,
      lastHealthCheckAt: new Date(),
    })
    .where(eq(vendorModels.id, vendorModelId));
}

// ── 主动健康检测：对 down 厂商发轻量请求 ──

export async function activeHealthCheck(): Promise<void> {
  const db = getDb();

  // 查询所有 isDown=true 的 vendor_models（状态为 active 的厂商）
  const downVms = await db
    .select({
      id: vendorModels.id,
      vendorId: vendorModels.vendorId,
      vendorName: vendors.name,
      apiEndpoint: vendorModels.apiEndpoint,
      apiKeyEncrypted: vendorModels.apiKeyEncrypted,
      upstreamModelName: vendorModels.upstreamModelName,
      consecutiveSuccess: vendorModels.consecutiveSuccess,
    })
    .from(vendorModels)
    .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
    .where(
      and(
        eq(vendorModels.isDown, true),
        eq(vendors.status, "active"),
      ),
    )
    .orderBy(asc(vendorModels.lastHealthCheckAt))
    .limit(10); // 每轮最多检查 10 个，避免瞬间并发过高

  if (downVms.length === 0) return;

  console.log(`[HealthCheck] 开始主动检查 ${downVms.length} 个 down 厂商...`);

  for (const vm of downVms) {
    await checkSingleVendor(vm);
  }
}

interface DownVendorInfo {
  id: number;
  vendorId: number;
  vendorName: string;
  apiEndpoint: string;
  apiKeyEncrypted: string;
  upstreamModelName: string;
  consecutiveSuccess: number | null;
}

async function checkSingleVendor(vm: DownVendorInfo): Promise<void> {
  const db = getDb();
  let success = false;

  try {
    // 对上游发轻量请求（GET /v1/models 或 /v1/models/:model）
    const apiKey = decryptApiKey(vm.apiKeyEncrypted);
    const modelsEndpoint = vm.apiEndpoint.replace(/\/chat\/completions\/?$/, "/models").replace(/\/completions\/?$/, "/models").replace(/\/v1\/.*$/, "/v1/models");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 秒超时

    const response = await fetch(modelsEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    success = response.ok;
  } catch (err: any) {
    success = false;
    console.log(`[HealthCheck] ${vm.vendorName} / ${vm.upstreamModelName} — 检查失败: ${err.message}`);
  }

  const consecutive = (vm.consecutiveSuccess ?? 0) + (success ? 1 : 0);

  if (success && consecutive >= RECOVERY_CONSECUTIVE) {
    // 连续成功恢复
    await db
      .update(vendorModels)
      .set({
        isDown: false,
        healthScore: "0.85",
        consecutiveSuccess: 0,
        lastHealthCheckAt: new Date(),
      })
      .where(eq(vendorModels.id, vm.id));

    console.log(`[HealthCheck] ✅ ${vm.vendorName} / ${vm.upstreamModelName} — 已恢复`);
  } else if (success) {
    // 成功但还未达到恢复阈值
    await db
      .update(vendorModels)
      .set({
        consecutiveSuccess: consecutive,
        healthScore: sql`LEAST(healthScore + 0.10, 1.00)`,
        lastHealthCheckAt: new Date(),
      })
      .where(eq(vendorModels.id, vm.id));

    console.log(`[HealthCheck] ⏳ ${vm.vendorName} / ${vm.upstreamModelName} — 连续成功 ${consecutive}/${RECOVERY_CONSECUTIVE}`);
  } else {
    // 失败，重置连续计数
    await db
      .update(vendorModels)
      .set({
        consecutiveSuccess: 0,
        healthScore: sql`GREATEST(healthScore - 0.10, 0.00)`,
        lastHealthCheckAt: new Date(),
      })
      .where(eq(vendorModels.id, vm.id));
  }
}
