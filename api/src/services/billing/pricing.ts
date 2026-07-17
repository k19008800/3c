import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getPricingMultiplier, getDiscountRate, getSellPrices } from "./cache.js";
import type { CostBreakdown } from "./types.js";

export async function getUserBalance(userId: number): Promise<number> {
  const db = getDb();
  const [user] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  return Number(user.balance);
}

export async function calculateCost(promptTokens: number, completionTokens: number, vendorModelId: number, userId: number): Promise<CostBreakdown> {
  const prices = await getSellPrices(vendorModelId);
  const multiplier = await getPricingMultiplier();
  const discountRate = await getDiscountRate(userId);
  const rawCost = promptTokens * prices.sellPriceInput + completionTokens * prices.sellPriceOutput;
  const discountedCost = rawCost * multiplier * discountRate;
  return { rawCost, discountedCost, pricingMultiplier: multiplier, discountRate, sellPriceInput: prices.sellPriceInput, sellPriceOutput: prices.sellPriceOutput };
}
