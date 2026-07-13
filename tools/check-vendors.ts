import { createDb, closeDb } from '../api/src/db/index.js';
import { vendors, models, vendorModels } from '../api/src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const db = createDb();
  
  console.log('=== VENDORS ===');
  const v = await db.select().from(vendors);
  console.log(JSON.stringify(v, null, 2));
  
  console.log('\n=== MODELS (all) ===');
  const m = await db.select({ id: models.id, name: models.name, type: models.type, displayName: models.displayName }).from(models).orderBy(models.id);
  console.log(JSON.stringify(m, null, 2));
  
  console.log('\n=== VENDOR_MODELS (count) ===');
  const [{ count }] = await db.select({ count: db.$count(vendorModels) }).from(vendorModels);
  console.log('Total vendor model mappings:', count);

  await closeDb();
}
main().catch(e => { console.error(e); process.exit(1); });
