import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, users, userDiscounts, systemConfigs } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { DEFAULT_PRICING_MULTIPLIER } from "../price-service.js";
import type { SellPrices, BillingCacheStats } from "./types.js";

let pricingMultiplierCache: { value: number; expiresAt: number } | null = null;

export async function getPricingMultiplier(): Promise<number> {
  const now = Date.now();
  if (pricingMultiplierCache && now < pricingMultiplierCache.expiresAt) return pricingMultiplierCache.value;
  const db = getDb();
  const [cfg] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "pricing_multiplier")).limit(1);
  const value = cfg ? parseFloat(cfg.value) : DEFAULT_PRICING_MULTIPLIER;
  pricingMultiplierCache = { value, expiresAt: now + 60_000 };
  return value;
}

export function clearPricingMultiplierCache() { pricingMultiplierCache = null; }

const discountRateCache = new Map<number, { value: number; expiresAt: number }>();

export async function getDiscountRate(userId: number): Promise<number> {
  const now = Date.now();
  const cached = discountRateCache.get(userId);
  if (cached && now < cached.expiresAt) return cached.value;

  const db = getDb();
  const [discount] = await db.select({ discountRate: userDiscounts.discountRate }).from(userDiscounts)
    .where(sql`${eq(userDiscounts.userId, userId)} AND ${userDiscounts.effectiveFrom} <= NOW() AND (${userDiscounts.effectiveUntil} IS NULL OR ${userDiscounts.effectiveUntil} > NOW())`).limit(1);

  if (discount) { const value = Number(discount.discountRate); discountRateCache.set(userId, { value, expiresAt: now + 60_000 }); return value; }

  const [user] = await db.select({ discountRate: users.discountRate, userType: users.userType }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { discountRateCache.set(userId, { value: 1.0, expiresAt: now + 60_000 }); return 1.0; }
  if (user.discountRate) { const value = Number(user.discountRate); discountRateCache.set(userId, { value, expiresAt: now + 60_000 }); return value; }
  if (user.userType === "enterprise") {
    const [cfg] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "enterprise_discount_rate")).limit(1);
    const value = cfg ? parseFloat(cfg.value) : 0.95;
    discountRateCache.set(userId, { value, expiresAt: now + 60_000 }); return value;
  }
  discountRateCache.set(userId, { value: 1.0, expiresAt: now + 60_000 }); return 1.0;
}

export function clearDiscountRateCache(userId?: number) { if (userId !== undefined) discountRateCache.delete(userId); else discountRateCache.clear(); }

const sellPriceCache = new Map<number, { value: SellPrices; expiresAt: number }>();

export async function getSellPrices(vendorModelId: number): Promise<SellPrices> {
  const now = Date.now();
  const cached = sellPriceCache.get(vendorModelId);
  if (cached && now < cached.expiresAt) return cached.value;
  const db = getDb();
  const [vm] = await db.select({ sellPriceInput: vendorModels.sellPriceInput, sellPriceOutput: vendorModels.sellPriceOutput }).from(vendorModels).where(eq(vendorModels.id, vendorModelId)).limit(1);
  if (!vm) throw new AppError("VENDOR_MODEL_NOT_FOUND", `厂商模型关联 (ID ${vendorModelId}) 不存在`, 404);
  const value: SellPrices = { sellPriceInput: Number(vm.sellPriceInput), sellPriceOutput: Number(vm.sellPriceOutput) };
  sellPriceCache.set(vendorModelId, { value, expiresAt: now + 60_000 });
  return value;
}

export function clearSellPriceCache(vendorModelId?: number) { if (vendorModelId !== undefined) sellPriceCache.delete(vendorModelId); else sellPriceCache.clear(); }

export function getBillingCacheStats(): BillingCacheStats {
  return {
    pricingMultiplier: pricingMultiplierCache ? { cached: true, value: pricingMultiplierCache.value } : { cached: false, value: null },
    discountRateCount: discountRateCache.size,
    sellPriceCount: sellPriceCache.size,
  };
}
