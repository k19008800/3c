// Database check script
import { createDb, getDb, closeDb } from './src/db/index.js';
import { systemConfigs, users } from './src/db/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  createDb();
  const db = getDb();
  
  const configs = await db.select().from(systemConfigs);
  console.log('System configs count:', configs.length);
  
  const [userResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
  console.log('User count:', Number(userResult.count));
  
  await closeDb();
}

main().catch(console.error);
