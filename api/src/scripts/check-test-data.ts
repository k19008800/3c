import "dotenv/config";
import { createDb, getDb } from "../db/index.js";
import { createRedis } from "../redis.js";
import { eq, and, desc } from "drizzle-orm";
import { models, vendorModels, apiKeys } from "../db/schema.js";

async function main() {
  createDb();
  createRedis();
  const db = getDb();

  const m = await db
    .select()
    .from(models)
    .where(and(eq(models.name, "DeepSeek-V4-Pro"), eq(models.status, true)))
    .limit(1);
  console.log("Model:", JSON.stringify(m, null, 2));

  if (m.length > 0) {
    const vms = await db
      .select()
      .from(vendorModels)
      .where(eq(vendorModels.modelId, m[0].id))
      .limit(5);
    console.log("VMs:", JSON.stringify(vms, null, 2));
  }

  const k = await db
    .select({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix, userId: apiKeys.userId })
    .from(apiKeys)
    .orderBy(desc(apiKeys.id))
    .limit(3);
  console.log("Keys:", JSON.stringify(k, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
