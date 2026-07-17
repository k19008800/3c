// ============================================================
//  Key 分组选择器（round_robin / weighted / failover / priority）
// ============================================================

/**
 * 从 Key 分组中选择一个 Key
 */
export async function selectKeyFromGroup(
  groupId: number,
  redis: any,
): Promise<{ apiKeyPlain: string; item: any } | null> {
  try {
    const { eq, and, asc } = await import("drizzle-orm");
    const { getDb } = await import("../../db/index.js");
    const { vendorKeyGroups: vkg, vendorKeyGroupItems: vkgi } = await import("../../db/schema.js");
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
    await db.update(vkgi)
      .set({ lastUsedAt: new Date(), totalCalls: selected.totalCalls + 1 })
      .where(eq(vkgi.id, selected.id));

    return { apiKeyPlain, item: selected };
  } catch (err) {
    console.warn("[Router] KeyGroup 选择失败，降级:", err);
    return null;
  }
}
