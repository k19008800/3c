// ============================================================
//  Key 分组选择器（round_robin / weighted / failover / priority）
//  支持 Key-Model 交叉价格：同一 Key 对不同模型有不同的折扣/定价
// ============================================================

/**
 * 从 Key 分组中选择一个 Key
 */
export async function selectKeyFromGroup(
  groupId: number,
  redis: any,
  vendorModelId?: number,
): Promise<{ apiKeyPlain: string; item: any } | null> {
  try {
    const { eq, and, asc } = await import("drizzle-orm");
    const { getDb } = await import("../../db/index.js");
    const {
      vendorKeyGroups: vkg,
      vendorKeyGroupItems: vkgi,
      vendorKeyGroupModelPrices: vkgmp,
    } = await import("../../db/schema.js");
    const { decryptApiKey } = await import("../encryption.js");
    const db = getDb();

    const [group] = await db.select().from(vkg).where(eq(vkg.id, groupId));
    if (!group || !group.status) return null;

    const items = await db
      .select()
      .from(vkgi)
      .where(and(eq(vkgi.groupId, groupId), eq(vkgi.status, true), eq(vkgi.isDown, false)))
      .orderBy(asc(vkgi.priority));

    if (items.length === 0) return null;

    let selected = items[0];
    switch (group.strategy) {
      case "round_robin": {
        const idx = await redis.incr(`keygroup:${groupId}:counter`);
        selected = items[idx % items.length];
        break;
      }
      case "weighted": {
        const totalWeight = items.reduce((s, i) => s + i.weight, 0);
        let r = Math.random() * totalWeight;
        for (const item of items) {
          r -= item.weight;
          if (r <= 0) { selected = item; break; }
        }
        break;
      }
      case "failover":
      case "priority":
      default:
        selected = items[0];
        break;
    }

    const apiKeyPlain = decryptApiKey(selected.apiKeyEncrypted);

    // 查询 Key-Model 交叉价格（若指定了 vendorModelId）
    let modelPrice: typeof vkgmp.$inferSelect | null = null;
    if (vendorModelId) {
      const [mp] = await db
        .select()
        .from(vkgmp)
        .where(
          and(
            eq(vkgmp.keyGroupItemId, selected.id),
            eq(vkgmp.vendorModelId, vendorModelId)
          )
        )
        .limit(1);
      modelPrice = mp ?? null;
    }

    // 构造返回结果，附带交叉价信息
    const result: any = { ...selected };

    // 如果有 Key-Model 交叉价，用它覆盖 Key 上的 sellPrice
    if (modelPrice) {
      result._modelPrice = modelPrice;
      // 标记价格源
      result._modelPriceType = modelPrice.type; // "percent" | "absolute"

      if (modelPrice.type === "absolute") {
        // 固定价模式 → 直接作为售价
        result.modelPriceInput = modelPrice.inputValue != null ? Number(modelPrice.inputValue) : null;
        result.modelPriceOutput = modelPrice.outputValue != null ? Number(modelPrice.outputValue) : null;
      } else if (modelPrice.type === "percent") {
        // 百分比模式 → 标记折扣率，由调用方结合 vendorModel 基价计算
        result.modelPriceInput = modelPrice.inputValue != null ? Number(modelPrice.inputValue) : null;
        result.modelPriceOutput = modelPrice.outputValue != null ? Number(modelPrice.outputValue) : null;
      }
    }

    await db.update(vkgi)
      .set({ lastUsedAt: new Date(), totalCalls: selected.totalCalls + 1 })
      .where(eq(vkgi.id, selected.id));

    return { apiKeyPlain, item: result };
  } catch (err) {
    console.warn("[Router] KeyGroup 选择失败，降级:", err);
    return null;
  }
}
