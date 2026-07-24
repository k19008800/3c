import { createDb, getDb } from '../src/db/index.js';
import { vendorModels, vendors } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

createDb();
const db = getDb();

const rows = await db
  .select({
    id: vendorModels.id,
    vendor: vendors.name,
    model: vendorModels.model,
    upstream: vendorModels.upstreamModel,
    costIn: vendorModels.costPriceInput,
    costOut: vendorModels.costPriceOutput,
    sellIn: vendorModels.sellPriceInput,
    sellOut: vendorModels.sellPriceOutput,
  })
  .from(vendorModels)
  .leftJoin(vendors, eq(vendorModels.vendorId, vendors.id))
  .orderBy(vendorModels.id);

console.log(JSON.stringify(rows, null, 2));
process.exit(0);