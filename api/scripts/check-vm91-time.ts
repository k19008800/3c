import { createDb, getDb } from '../src/db/index.js';
import { vendorModels } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

await createDb();
const db = getDb();

const [vm] = await db.select().from(vendorModels).where(eq(vendorModels.id, 91)).limit(1);
console.log('createdAt:', vm.createdAt);
console.log('updatedAt:', vm.updatedAt);
console.log('upstreamModelName:', vm.upstreamModelName);
console.log('costPriceInput:', vm.costPriceInput);
console.log('sellPriceInput:', vm.sellPriceInput);
console.log('apiKeyEncrypted 长度:', vm.apiKeyEncrypted?.length || 0);

process.exit(0);
