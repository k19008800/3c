// Quick check: find admin users
import { createDb, closeDb } from './src/db/index.js';
import { users } from './src/db/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  const db = createDb();
  
  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    role: users.role,
    userType: users.userType,
    status: users.status,
  }).from(users);
  
  console.log('All users:');
  for (const u of allUsers) {
    console.log(`  [${u.id}] ${u.email} | role=${u.role} | type=${u.userType} | status=${u.status}`);
  }
  
  const adminUsers = allUsers.filter(u => u.role === 'super_admin' || u.role === 'admin');
  console.log(`\nAdmin users: ${adminUsers.length}`);
  
  await closeDb();
}

main().catch(console.error);
